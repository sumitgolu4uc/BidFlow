# BidFlow Database Schema

## Overview

The SQLAlchemy models define three PostgreSQL tables. One RFQ has many bids
and many activity entries. Bids and activity entries are removed when their
parent RFQ is deleted (`ON DELETE CASCADE`).

```mermaid
erDiagram
    RFQS ||--o{ BIDS : has
    RFQS ||--o{ ACTIVITY_LOGS : records

    RFQS {
        integer id PK
        varchar rfq_name
        varchar reference_id UK
        timestamptz start_time
        timestamptz original_close_time
        timestamptz current_close_time
        timestamptz forced_close_time
        date pickup_date
        integer trigger_window_minutes
        integer extension_duration_minutes
        varchar trigger_type
        varchar status
        timestamptz created_at
    }

    BIDS {
        integer id PK
        integer rfq_id FK
        varchar supplier_name
        numeric freight_charges
        numeric origin_charges
        numeric destination_charges
        integer transit_time
        integer quote_validity
        numeric bid_amount
        timestamptz created_at
    }

    ACTIVITY_LOGS {
        integer id PK
        integer rfq_id FK
        varchar activity_type
        text description
        timestamptz created_at
    }
```

## `rfqs`

| Column | SQLAlchemy/PostgreSQL type | Constraints and behavior |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `rfq_name` | `VARCHAR(200)` | Required |
| `reference_id` | `VARCHAR(100)` | Required, unique |
| `start_time` | `TIMESTAMP WITH TIME ZONE` | Required |
| `original_close_time` | `TIMESTAMP WITH TIME ZONE` | Required |
| `current_close_time` | `TIMESTAMP WITH TIME ZONE` | Required; initialized from original close when omitted by API |
| `forced_close_time` | `TIMESTAMP WITH TIME ZONE` | Required; must be later than original close |
| `pickup_date` | `DATE` | Required |
| `trigger_window_minutes` | Integer | Required, positive |
| `extension_duration_minutes` | Integer | Required, positive |
| `trigger_type` | `VARCHAR(50)` | Required; `ANY_BID`, `ANY_RANK_CHANGE`, or `L1_RANK_CHANGE` |
| `status` | `VARCHAR(30)` | Required; API default is `draft` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Required; server default `CURRENT_TIMESTAMP` |

`origin` and `destination` are not currently columns in the model or fields in
the RFQ response schema.

## `bids`

| Column | SQLAlchemy/PostgreSQL type | Constraints and behavior |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `rfq_id` | Integer | Required foreign key to `rfqs.id`, indexed, cascade delete |
| `supplier_name` | `VARCHAR(200)` | Required |
| `freight_charges` | `NUMERIC(12, 2)` | Required, non-negative |
| `origin_charges` | `NUMERIC(12, 2)` | Required, non-negative |
| `destination_charges` | `NUMERIC(12, 2)` | Required, non-negative |
| `transit_time` | Integer | Required, positive number of days |
| `quote_validity` | Integer | Required, positive number of days |
| `bid_amount` | `NUMERIC(12, 2)` | Required, non-negative total/ranking amount |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Required; server default `CURRENT_TIMESTAMP` |

`bid_amount` is supplied separately from the three charge fields; the API does
not calculate it from their sum. Each accepted submission is retained. The
ranking endpoint selects only the latest accepted bid per supplier.

## `activity_logs`

| Column | SQLAlchemy/PostgreSQL type | Constraints and behavior |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `rfq_id` | Integer | Required foreign key to `rfqs.id`, indexed, cascade delete |
| `activity_type` | `VARCHAR(50)` | Required; current types include `rfq_created`, `bid_submitted`, and `auction_extended` |
| `description` | Text | Required; extension reason and previous/new close timestamps are recorded in the description |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Required; server default `CURRENT_TIMESTAMP` |

The current engine does not create a separate `supplier_rank_changed` event.
Rank changes are evaluated during bid submission for trigger decisions.

## Validation boundary

Date ordering, allowed trigger values, positive trigger durations, non-negative
bid amounts, and positive bid day counts are validated by the Pydantic request
schemas. The SQLAlchemy models do not declare database `CHECK` constraints for
these rules, so direct SQL writes would not receive all of the API validation.

## Relationships and indexes

- `RFQ.bids` and `Bid.rfq` form a bidirectional one-to-many relationship.
- `RFQ.activity_logs` and `ActivityLog.rfq` form a bidirectional one-to-many
  relationship.
- ORM relationships use `cascade="all, delete-orphan"`.
- `rfqs.reference_id` has a unique constraint.
- Both child tables index `rfq_id`.

## Schema initialization and migration status

At FastAPI startup, `Base.metadata.create_all(bind=engine)` creates missing
tables. It does not alter existing tables or apply migrations. Use a migration
tool before evolving a deployed schema.

The RFQ schema now requires `forced_close_time`. A database created by an
earlier version may still allow null values; before using that database,
backfill any null values with valid forced-close times and apply a migration
that makes the column non-null. `create_all()` will not perform this change.

## Connection configuration

The application requires `DATABASE_URL` in the process environment or in the
project-root `.env`. The expected driver format is
`postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE`. There is no
application fallback to SQLite. Never place real credentials in this
document; use the ignored `.env` file for local configuration.
