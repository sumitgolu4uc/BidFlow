# BidFlow High-Level Design

## 1. Purpose and scope

BidFlow is a prototype RFQ and reverse-auction application. It lets procurement
users create an RFQ, review supplier bids, see the current supplier ranking,
and inspect activity and auction extensions. The browser provides the
operator-facing interface; the FastAPI service validates and persists data and
is authoritative for bid acceptance and auction timing.

## 2. Technology stack

| Layer | Technology |
| --- | --- |
| Web client | React, Vite, React Router, Lucide React, CSS |
| API | Python, FastAPI, Pydantic |
| Persistence | SQLAlchemy ORM, PostgreSQL |
| PostgreSQL driver | Psycopg 3 |
| Configuration | Project-root `.env` loaded by `python-dotenv` |

## 3. Component architecture

```text
Browser
  React pages and components
       |
       | HTTP/JSON, /api/*
       v
FastAPI application
  CORS middleware
  RFQ router
  Pydantic request/response validation
  Auction service
       |
       | SQLAlchemy Session / transaction
       v
PostgreSQL
  rfqs
  bids
  activity_logs
```

The frontend uses `fetch` to call the existing API. The Vite development
server normally runs at `http://localhost:5173`; the API defaults to
`http://localhost:8000`. `VITE_API_BASE_URL` can override the frontend API
base URL.

The backend reads `DATABASE_URL` from the process environment or the
project-root `.env`. The application raises a startup configuration error
when it is missing. There is no application-level SQLite fallback. The health
route checks only that FastAPI is responding, not database readiness.

## 4. Request flows

### RFQ creation

1. The frontend validates the required fields and sends `POST /api/rfqs`.
2. Pydantic validates field types and time ordering.
3. The route creates the RFQ and its `rfq_created` activity entry in one
   SQLAlchemy session and commits them.
4. The response is serialized using `RFQResponse`.

### Bid submission

1. The frontend sends the supplier name, charge breakdown, transit time,
   quote validity, and `bid_amount` to `POST /api/rfqs/{rfq_id}/bids`.
2. The API validates the bid body.
3. The auction service locks the RFQ row with `SELECT ... FOR UPDATE` where
   the database supports row locks.
4. It checks backend UTC time against the start, current close, and forced
   close. The browser countdown is informational only.
5. In the same transaction, it adds the bid and `bid_submitted` activity,
   compares the ranking before and after the bid, and applies an eligible
   extension.
6. If an extension occurs, `current_close_time` and an
   `auction_extended` activity entry are committed with the bid. The entry
   description contains the reason and previous/new close timestamps.

### Ranking and history

The ranking route derives a current bid for each supplier from stored bid
history; earlier bids remain in `bids`. The history route returns every bid.
The frontend refreshes the RFQ, bids, ranking, and activity after a successful
bid submission.

## 5. Auction extension algorithm

Let `C` be the current close, `X` the trigger-window length, `Y` the extension
length, and `F` the required forced close.

1. A bid is eligible only when server time is at or after `start_time` and
   strictly before both `C` and `F`.
2. The trigger window is `[C - X, C)`. A bid exactly at the start of this
   window is included.
3. The engine compares supplier rank positions before and after applying the
   new bid:
   - `ANY_BID`: any valid bid in the window triggers.
   - `ANY_RANK_CHANGE`: a change in any supplier's position triggers.
   - `L1_RANK_CHANGE`: a change in the identity of the lowest-bid supplier
     triggers.
4. If triggered, the candidate close is `C + Y`; the new close is
   `min(C + Y, F)`.
5. A close-time change and its activity record are committed in the same
   transaction as the accepted bid.

## 6. Supplier ranking

Supplier grouping is case-insensitive (`casefold`). The most recent bid for
each supplier is selected by `created_at`, with the larger bid ID breaking
timestamp ties. Those current supplier bids are sorted by ascending
`bid_amount`; equal amounts are ordered by supplier name
case-insensitively. The first, second, and third rows are L1, L2, and L3.

## 7. API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | API process health |
| `POST` | `/api/rfqs` | Create an RFQ |
| `GET` | `/api/rfqs` | List RFQs |
| `GET` | `/api/rfqs/{rfq_id}` | Retrieve an RFQ |
| `POST` | `/api/rfqs/{rfq_id}/bids` | Submit a supplier bid |
| `GET` | `/api/rfqs/{rfq_id}/bids` | Retrieve all accepted bids |
| `GET` | `/api/rfqs/{rfq_id}/ranking` | Retrieve current supplier ranking |
| `GET` | `/api/rfqs/{rfq_id}/activity` | Retrieve activity entries |

## 8. Transaction and concurrency notes

The RFQ row lock serializes submissions for the same RFQ in PostgreSQL, so
each transaction bases its ranking and extension decision on the latest
committed state after acquiring the lock. SQLite does not implement this
row-lock behavior. The current unit tests use an isolated in-memory SQLite
database, so PostgreSQL-specific concurrency behavior still requires testing
against a configured PostgreSQL instance.

## 9. Security and operational boundaries

- Keep `.env` local; `.gitignore` excludes it. `.env.example` contains only a
  placeholder URL.
- CORS is configured for the two local Vite development origins. Production
  origins and deployment policy must be configured before deployment.
- Authentication, authorization, rate limiting, and production secrets
  management are not implemented in this prototype.
- `Base.metadata.create_all()` creates missing tables at application startup.
  It is not a schema migration system and does not modify existing columns.

## 10. Run and test

See the root [README](../README.md) for PostgreSQL configuration, PowerShell
commands to run the backend and frontend, and the current test commands.
