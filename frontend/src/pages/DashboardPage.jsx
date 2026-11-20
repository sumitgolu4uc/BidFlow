import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { getRanking, getRfqs } from "../lib/api.js";
import {
  formatAmount,
  formatDateTime,
  getAuctionStatus,
} from "../lib/format.js";

function DashboardPage() {
  const [rfqs, setRfqs] = useState([]);
  const [rankings, setRankings] = useState({});
  const [rankingErrors, setRankingErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [now, setNow] = useState(Date.now());

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const currentRfqs = await getRfqs();
      setRfqs(currentRfqs);

      const results = await Promise.all(
        currentRfqs.map(async (rfq) => {
          try {
            return { id: rfq.id, ranking: await getRanking(rfq.id) };
          } catch (requestError) {
            return { id: rfq.id, error: requestError.message };
          }
        }),
      );
      const nextRankings = {};
      const nextErrors = {};
      for (const result of results) {
        if (result.error) {
          nextErrors[result.id] = result.error;
        } else {
          nextRankings[result.id] = result.ranking;
        }
      }
      setRankings(nextRankings);
      setRankingErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        setWarning(
          `Could not load current rankings for ${Object.keys(nextErrors).length} RFQ(s).`,
        );
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const statuses = useMemo(
    () =>
      rfqs.reduce((counts, rfq) => {
        const status = getAuctionStatus(rfq, now);
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
    [rfqs, now],
  );

  const visibleRfqs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rfqs.filter((rfq) => {
      const status = getAuctionStatus(rfq, now);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesSearch =
        !query ||
        rfq.rfq_name.toLocaleLowerCase().includes(query) ||
        rfq.reference_id.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [now, rfqs, search, statusFilter]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Procurement overview</h1>
          <p className="page-description">
            Monitor requests for quotation and live reverse auctions.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button button-secondary refresh-button"
            onClick={() => void loadDashboard()}
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <Link to="/rfqs/create" className="button button-primary">
            <Plus size={18} />
            Create RFQ
          </Link>
        </div>
      </div>

      {error && (
        <Alert>
          <div className="alert-content">
            <strong>Could not load RFQs.</strong>
            <span>{error}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => void loadDashboard()}
            >
              Try again
            </button>
          </div>
        </Alert>
      )}
      {warning && <Alert tone="info">{warning}</Alert>}

      <section className="metric-grid" aria-label="RFQ summary">
        <article className="metric-card">
          <div className="metric-icon metric-icon-blue">
            <ClipboardList size={19} />
          </div>
          <p className="metric-label">Total RFQs</p>
          <strong className="metric-value">{loading ? "—" : rfqs.length}</strong>
          <span className="metric-caption">All procurement events</span>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-green">
            <CircleDollarSign size={19} />
          </div>
          <p className="metric-label">Active auctions</p>
          <strong className="metric-value">{loading ? "—" : statuses.active || 0}</strong>
          <span className="metric-caption">Accepting supplier bids</span>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-orange">
            <Clock3 size={19} />
          </div>
          <p className="metric-label">Closed auctions</p>
          <strong className="metric-value">
            {loading
              ? "—"
              : (statuses.closed || 0) + (statuses["force-closed"] || 0)}
          </strong>
          <span className="metric-caption">
            {statuses["force-closed"] || 0} force closed
          </span>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-violet">
            <Clock3 size={19} />
          </div>
          <p className="metric-label">Scheduled</p>
          <strong className="metric-value">
            {loading ? "—" : statuses.upcoming || 0}
          </strong>
          <span className="metric-caption">Not started yet</span>
        </article>
      </section>

      <section className="surface-card rfq-list-card">
        <div className="section-heading table-heading">
          <div>
            <h2>RFQ register</h2>
            <p>Current auction status and lowest supplier bid.</p>
          </div>
          <span className="record-count">
            {loading ? "Loading" : `${visibleRfqs.length} shown`}
          </span>
        </div>

        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <span className="visually-hidden">Search RFQs</span>
            <input
              type="search"
              placeholder="Search by RFQ name or reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-field">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="visually-hidden">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="upcoming">Scheduled</option>
              <option value="closed">Closed</option>
              <option value="force-closed">Force closed</option>
            </select>
          </label>
        </div>

        <div className="table-scroll">
          <table className="data-table rfq-table">
            <thead>
              <tr>
                <th scope="col">RFQ</th>
                <th scope="col">Current lowest bid</th>
                <th scope="col">Current close</th>
                <th scope="col">Forced close</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Open RFQ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">
                    <div className="table-message">
                      <span className="spinner" />
                      Loading RFQs from the API…
                    </div>
                  </td>
                </tr>
              ) : visibleRfqs.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state table-empty-state">
                      <span className="empty-state-icon">
                        <ClipboardList size={22} />
                      </span>
                      <strong>
                        {rfqs.length === 0
                          ? "No RFQs have been created"
                          : "No RFQs match these filters"}
                      </strong>
                      <span>
                        {rfqs.length === 0
                          ? "Create an RFQ to begin managing supplier bids."
                          : "Try another search term or status."}
                      </span>
                      {rfqs.length === 0 && (
                        <Link to="/rfqs/create" className="button button-primary">
                          <Plus size={17} />
                          Create RFQ
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRfqs.map((rfq) => {
                  const status = getAuctionStatus(rfq, now);
                  const currentLowBid = rankings[rfq.id]?.[0];
                  return (
                    <tr key={rfq.id}>
                      <td>
                        <Link
                          className="rfq-name-link"
                          to={`/rfqs/${rfq.id}`}
                        >
                          {rfq.rfq_name}
                        </Link>
                        <span className="table-secondary mono-text">
                          {rfq.reference_id}
                        </span>
                      </td>
                      <td>
                        {rankingErrors[rfq.id] ? (
                          <span className="muted-text">Unavailable</span>
                        ) : currentLowBid ? (
                          <span className="amount-cell">
                            {formatAmount(currentLowBid.bid_amount)}
                          </span>
                        ) : (
                          <span className="muted-text">No bids yet</span>
                        )}
                      </td>
                      <td>
                        <span className="date-cell">
                          {formatDateTime(rfq.current_close_time)}
                        </span>
                      </td>
                      <td>
                        <span className="date-cell">
                          {formatDateTime(rfq.forced_close_time)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td>
                        <Link
                          to={`/rfqs/${rfq.id}`}
                          className="icon-link"
                          aria-label={`Open ${rfq.rfq_name}`}
                        >
                          <ArrowUpRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
