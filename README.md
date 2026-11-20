# BidFlow

BidFlow is a prototype RFQ and reverse auction management system. It provides
a React + Vite procurement interface and a FastAPI API backed by SQLAlchemy
and PostgreSQL. Suppliers can submit bids, review rankings and bid history,
and view auction extensions and activity.

## Project structure

```text
BidFlow/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── auction.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── rfqs.py
│   ├── tests/
│   │   └── test_auction.py
│   └── requirements.txt
├── docs/
│   ├── DATABASE_SCHEMA.md
│   └── HIGH_LEVEL_DESIGN.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── style.css
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   └── vite.config.js
├── .env.example
├── .gitignore
└── README.md
```

For the component architecture and request flows, see
[High-Level Design](docs/HIGH_LEVEL_DESIGN.md). For tables, columns,
relationships, and persistence behavior, see
[Database Schema](docs/DATABASE_SCHEMA.md).

## Prerequisites

- Node.js and npm
- Python 3.10 or newer
- PostgreSQL

## Configure PostgreSQL

From the project root, copy the example environment file and update the
connection string with your local PostgreSQL username and password:

```powershell
Copy-Item .env.example .env
```

Create a PostgreSQL database named `bidflow` (or change the database name in
`DATABASE_URL`). The API loads this connection string from the project-root `.env`. The
application requires `DATABASE_URL` and does not fall back to SQLite. On
startup, SQLAlchemy creates missing prototype tables. This uses `create_all`;
it does not alter existing tables or replace a future migration system.

## Run the backend

Open a terminal in the project root and run:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at <http://localhost:8000>. The health check is
<http://localhost:8000/api/health>, and interactive API documentation is at
<http://localhost:8000/docs>.

## Phase 2 API

Open <http://localhost:8000/docs> after starting the backend. Expand an
endpoint, choose **Try it out**, enter the path parameters or JSON body, and
select **Execute**. Use the response code and body shown below the form.

- `POST /api/rfqs` — create an RFQ. `reference_id` must be unique;
  `forced_close_time` is required and must be later than
  `original_close_time`; `current_close_time` defaults to
  `original_close_time`; `status` defaults to `draft`.
- `GET /api/rfqs` — list RFQs.
- `GET /api/rfqs/{rfq_id}` — get one RFQ.
- `POST /api/rfqs/{rfq_id}/bids` — submit a bid. Every successful submission
  is stored as a separate bid.
- `GET /api/rfqs/{rfq_id}/bids` — list bids in submission order.
- `GET /api/rfqs/{rfq_id}/ranking` — list each supplier's latest bid, from
  lowest to highest `bid_amount`.
- `GET /api/rfqs/{rfq_id}/activity` — view RFQ creation, bid submission, and
  auction-extension activity entries.

For a quick Swagger walkthrough, first use **Try it out** on
`POST /api/rfqs` with:

```json
{
  "rfq_name": "Office supplies",
  "reference_id": "RFQ-2026-001",
  "start_time": "2026-11-21T09:00:00Z",
  "original_close_time": "2026-11-22T09:00:00Z",
  "forced_close_time": "2026-11-22T09:30:00Z",
  "pickup_date": "2026-11-25",
  "trigger_window_minutes": 5,
  "extension_duration_minutes": 10,
  "trigger_type": "ANY_BID"
}
```

Copy the returned `id` into the `{rfq_id}` path parameter for the single-RFQ,
bids, ranking, and activity endpoints. To test `POST /api/rfqs/{rfq_id}/bids`,
submit a body like:

```json
{
  "supplier_name": "Example Supplier",
  "freight_charges": 100.00,
  "origin_charges": 10.00,
  "destination_charges": 15.00,
  "transit_time": 4,
  "quote_validity": 30,
  "bid_amount": 125.00
}
```

Submit it more than once to verify each bid is retained. The list endpoint
returns submission order, ranking returns the latest bid per supplier in
ascending bid amount, and activity shows RFQ creation, bid submissions, and
extensions.

RFQ timestamps must be chronological: `start_time` precedes
`original_close_time`, the current close cannot precede the original close,
and the required forced close must be later than the original close and
cannot be earlier than the current close. Bid monetary amounts must be non-negative
and fit within two decimal places. `transit_time` and `quote_validity` are
positive durations in days.

Successful creates return `201`. Invalid input returns `422`, missing RFQs
return `404`, duplicate references return `409`, and database write failures
return a generic `500` response.

## Phase 3 reverse-auction behavior

- Ranking uses each supplier's latest accepted bid; prior bids remain stored
  and visible through the bids endpoint. Supplier names are treated
  case-insensitively for grouping. When timestamps match, the higher bid ID is
  the latest submission.
- Current ranking is recalculated from bid history. Lower `bid_amount` ranks
  first (the first list entry is L1, followed by L2, L3, and so on). Equal
  amounts are ordered by supplier name alphabetically, case-insensitively.
- `trigger_type` accepts `ANY_BID`, `ANY_RANK_CHANGE`, or `L1_RANK_CHANGE`.
  The final trigger window starts at
  `current_close_time - trigger_window_minutes`, including the boundary.
- `ANY_BID` extends for any accepted bid in that window;
  `ANY_RANK_CHANGE` extends when any supplier's position changes, including a
  new supplier receiving a first rank; `L1_RANK_CHANGE` extends only when the
  lowest-bid supplier identity changes.
- Each extension adds `extension_duration_minutes` to the current close time,
  capped at the required `forced_close_time`. An extension activity entry
  records its trigger reason and both close times. No bid is accepted at or
  after the current or forced close time.
- Bid start/close checks use backend UTC time, not the browser countdown. Bid
  insertion, ranking comparison, activity logging, and any extension run in
  one transaction. PostgreSQL serializes submissions for the same RFQ with a
  row lock; SQLite ignores row-lock requests.
- RFQ timestamps without an explicit timezone are interpreted as UTC; sending
  ISO timestamps with `Z` or an explicit offset is recommended.
- A bid submitted before `start_time` or at/after either closing time receives
  `409 Conflict`.

Run the automated auction tests from the backend folder:

```powershell
python -m unittest discover -s tests -v
```

## Run the frontend

Open a second terminal in the project root and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually <http://localhost:5173>).

## Phase 4 frontend

The React app uses React Router for the overview (`/`), RFQ creation
(`/rfqs/create`), and auction details (`/rfqs/:id`). It calls the existing
FastAPI routes directly using `fetch`; no demo RFQs or bids are bundled.
The default API base is `http://localhost:8000`. To use another backend URL,
set `VITE_API_BASE_URL` in `frontend/.env` before starting Vite.

The dashboard loads RFQs and their current rankings; auction details load the
RFQ, full bid history, current ranking, and activity. Bid submission refreshes
those details. The displayed countdown is informational: FastAPI determines
whether a bid is accepted. Bid history displays every accepted bid ordered by
ascending bid amount; equal amounts are ordered by supplier name and then bid
ID.

## Quality checks

Run the backend unit tests and Python compilation check:

```powershell
Set-Location D:\BidFlow\backend
python -m unittest discover -s tests -v
python -m compileall -q app tests
```

Run the frontend production build:

```powershell
Set-Location D:\BidFlow\frontend
npm run build
```

The backend auction tests use an isolated in-memory SQLite database. They
verify auction logic but do not verify PostgreSQL connectivity, PostgreSQL
row-lock behavior, or persistence across a PostgreSQL restart.

## Current prototype limitations

- The RFQ API does not include origin or destination fields.
- The activity log records RFQ creation, bid submissions, and auction
  extensions. It does not currently emit a separate supplier-rank-change
  event.
- Authentication and authorization are not implemented. Do not expose the
  prototype API publicly without adding appropriate access controls.
- `GET /api/health` reports API process health only; it does not check the
  database connection.

- CORS allows the default Vite development origins on port `5173`.
- Database schema evolution is not managed by a migration tool yet.
