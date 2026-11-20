import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  RefreshCw,
  Send,
  Timer,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  createBid,
  getActivity,
  getBids,
  getRanking,
  getRfq,
} from "../lib/api.js";
import {
  activityLabel,
  formatAmount,
  formatCountdown,
  formatDate,
  formatDateTime,
  getAuctionStatus,
  sortBidsByPrice,
} from "../lib/format.js";

const initialBidForm = {
  supplier_name: "",
  freight_charges: "",
  origin_charges: "",
  destination_charges: "",
  transit_time: "",
  quote_validity: "",
  bid_amount: "",
};

const moneyFields = [
  "freight_charges",
  "origin_charges",
  "destination_charges",
  "bid_amount",
];

function validateBid(form) {
  const errors = {};
  if (!form.supplier_name.trim()) {
    errors.supplier_name = "Enter the supplier name.";
  }
  for (const field of moneyFields) {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(form[field])) {
      errors[field] = "Enter a non-negative amount with up to 2 decimals.";
    }
  }
  for (const field of ["transit_time", "quote_validity"]) {
    if (!Number.isInteger(Number(form[field])) || Number(form[field]) <= 0) {
      errors[field] = "Enter a whole number greater than zero.";
    }
  }
  return errors;
}

function getActivityTitle(activityType) {
  const titles = {
    auction_extended: "Auction extended",
    bid_submitted: "Bid submitted",
    rfq_created: "RFQ created",
    supplier_rank_changed: "Supplier rank changed",
  };
  return titles[activityType] || activityLabel(activityType);
}

function getExtensionDetails(description) {
  const match = description.match(
    /^(.*?) Close time extended from (.+) to (.+)\.$/,
  );
  if (!match) {
    return null;
  }
  return {
    reason: match[1],
    previousClose: match[2],
    newClose: match[3],
  };
}

function Field({
  error,
  id,
  label,
  name,
  onChange,
  step,
  type = "text",
  value,
  ...inputProps
}) {
  return (
    <div className={`form-field ${error ? "form-field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        step={step}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

function AuctionDetailsPage() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [bids, setBids] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [form, setForm] = useState(initialBidForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadAuction = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setPageError("");
      try {
        const [rfqData, bidData, rankingData, activityData] = await Promise.all([
          getRfq(id),
          getBids(id),
          getRanking(id),
          getActivity(id),
        ]);
        setRfq(rfqData);
        setBids(bidData);
        setRanking(rankingData);
        setActivity(activityData);
      } catch (error) {
        setPageError(error.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setSubmitError("");
    setSubmitSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validateBid(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitError("Review the highlighted fields before submitting your bid.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      await createBid(id, {
        supplier_name: form.supplier_name.trim(),
        freight_charges: form.freight_charges,
        origin_charges: form.origin_charges,
        destination_charges: form.destination_charges,
        transit_time: Number(form.transit_time),
        quote_validity: Number(form.quote_validity),
        bid_amount: form.bid_amount,
      });
      setForm(initialBidForm);
      setFieldErrors({});
      setSubmitSuccess("Bid submitted. Ranking and auction activity refreshed.");
      await loadAuction(true);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
        Loading auction details…
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="page-stack">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} />
          Back to overview
        </Link>
        <Alert>
          <div className="alert-content">
            <strong>Could not load this RFQ.</strong>
            <span>{pageError || "The API did not return this RFQ."}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => void loadAuction()}
            >
              Try again
            </button>
          </div>
        </Alert>
      </div>
    );
  }

  const auctionStatus = getAuctionStatus(rfq, now);
  const currentLowBid = ranking[0];
  const canBid = auctionStatus === "active";

  return (
    <div className="page-stack auction-page">
      <div className="details-navigation">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} />
          RFQ overview
        </Link>
        <button
          type="button"
          className="button button-secondary refresh-button"
          onClick={() => void loadAuction(true)}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          Refresh data
        </button>
      </div>

      {pageError && <Alert>{pageError}</Alert>}

      <header className="auction-header">
        <div className="auction-title-block">
          <p className="eyebrow">Reverse auction</p>
          <h1>{rfq.rfq_name}</h1>
          <div className="auction-header-meta">
            <span>
              Reference <span className="mono-text">{rfq.reference_id}</span>
            </span>
            <span>
              Start time <strong>{formatDateTime(rfq.start_time)}</strong>
            </span>
          </div>
        </div>
        <StatusBadge status={auctionStatus} />
      </header>

      <section className="surface-card shipment-card" aria-labelledby="shipment-heading">
        <div className="section-heading shipment-heading">
          <div>
            <h2 id="shipment-heading">Shipment information</h2>
            <p>Route and service details for this RFQ</p>
          </div>
        </div>
        <dl className="shipment-grid">
          <div>
            <dt>Origin</dt>
            <dd>{rfq.origin || "Not provided by the RFQ API"}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{rfq.destination || "Not provided by the RFQ API"}</dd>
          </div>
          <div>
            <dt>Pickup / service date</dt>
            <dd>{formatDate(rfq.pickup_date)}</dd>
          </div>
        </dl>
        <div className="extension-rules">
          <h3>Extension rules</h3>
          <dl className="extension-rule-grid">
            <div>
              <dt>Trigger</dt>
              <dd>{rfq.trigger_type.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Trigger window</dt>
              <dd>{rfq.trigger_window_minutes} minutes</dd>
            </div>
            <div>
              <dt>Extension duration</dt>
              <dd>{rfq.extension_duration_minutes} minutes</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="auction-summary" aria-label="Auction summary">
        <article className="auction-summary-card lowest-bid-summary">
          <span className="summary-label">Current lowest bid</span>
          <strong className="summary-value">
            {currentLowBid ? formatAmount(currentLowBid.bid_amount) : "No bids yet"}
          </strong>
          <span className="summary-caption">
            {currentLowBid ? currentLowBid.supplier_name : "Awaiting supplier bids"}
          </span>
        </article>
        <article className="auction-summary-card countdown-summary">
          <span className="summary-label">Current closing time</span>
          <strong className="countdown-value">
            <Timer size={17} aria-hidden="true" />
            {formatCountdown(rfq.current_close_time, now)}
          </strong>
          <span className="summary-caption">
            {formatDateTime(rfq.current_close_time)}
          </span>
        </article>
        <article className="auction-summary-card">
          <span className="summary-label">Original closing time</span>
          <strong className="summary-date">
            {formatDateTime(rfq.original_close_time)}
          </strong>
          <span className="summary-caption">Scheduled close</span>
        </article>
        <article className="auction-summary-card">
          <span className="summary-label">Forced closing time</span>
          <strong className="summary-date">
            {rfq.forced_close_time
              ? formatDateTime(rfq.forced_close_time)
              : "Not configured"}
          </strong>
          <span className="summary-caption">Maximum auction close</span>
        </article>
        <article className="auction-summary-card">
          <span className="summary-label">Participating suppliers</span>
          <strong className="summary-value">{ranking.length}</strong>
          <span className="summary-caption">With an accepted bid</span>
        </article>
      </section>

      {!canBid && (
        <Alert tone="info">
          {auctionStatus === "upcoming"
            ? "Bidding is not available until the scheduled start time."
            : auctionStatus === "force-closed"
              ? "This auction has reached its forced close time."
              : "This auction has closed. The backend is authoritative for bid acceptance."}
        </Alert>
      )}
      {submitError && <Alert>{submitError}</Alert>}
      {submitSuccess && <Alert tone="success">{submitSuccess}</Alert>}

      <section className="surface-card detail-card" aria-labelledby="ranking-heading">
        <div className="section-heading detail-section-heading">
          <div>
            <h2 id="ranking-heading">Supplier ranking</h2>
            <p>Latest accepted bid per supplier, ordered by total bid amount.</p>
          </div>
          <span className="record-count">
            {ranking.length} {ranking.length === 1 ? "supplier" : "suppliers"}
          </span>
        </div>
        {ranking.length === 0 ? (
          <div className="empty-table-message detail-empty-state">
            No supplier bids have been received.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table ranking-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Latest bid (total)</th>
                  <th scope="col">Freight</th>
                  <th scope="col">Origin</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Transit time</th>
                  <th scope="col">Quote validity</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((bid, index) => (
                  <tr
                    key={bid.id}
                    className={index === 0 ? "ranking-row-l1" : ""}
                  >
                    <td data-label="Rank">
                      <span
                        className={`rank-label ${index < 3 ? `rank-label-${index + 1}` : ""}`}
                      >
                        L{index + 1}
                      </span>
                    </td>
                    <td data-label="Supplier" className="strong-cell">
                      {bid.supplier_name}
                    </td>
                    <td data-label="Latest bid (total)" className="amount-cell">
                      {formatAmount(bid.bid_amount)}
                    </td>
                    <td data-label="Freight">
                      {formatAmount(bid.freight_charges)}
                    </td>
                    <td data-label="Origin">
                      {formatAmount(bid.origin_charges)}
                    </td>
                    <td data-label="Destination">
                      {formatAmount(bid.destination_charges)}
                    </td>
                    <td data-label="Transit time">{bid.transit_time} days</td>
                    <td data-label="Quote validity">{bid.quote_validity} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card bid-form-card" aria-labelledby="bid-form-heading">
        <div className="section-heading detail-section-heading">
          <div>
            <h2 id="bid-form-heading">Submit a bid</h2>
            <p>Enter the supplier quote details. The server validates the auction window.</p>
          </div>
        </div>
        <form className="bid-form" onSubmit={handleSubmit} noValidate>
          <Field
            id="supplier_name"
            name="supplier_name"
            label="Supplier name"
            value={form.supplier_name}
            onChange={updateField}
            error={fieldErrors.supplier_name}
            placeholder="Supplier or company name"
          />
          <div className="bid-charge-grid">
            <Field
              id="freight_charges"
              name="freight_charges"
              label="Freight charges"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.freight_charges}
              onChange={updateField}
              error={fieldErrors.freight_charges}
              placeholder="0.00"
            />
            <Field
              id="origin_charges"
              name="origin_charges"
              label="Origin charges"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.origin_charges}
              onChange={updateField}
              error={fieldErrors.origin_charges}
              placeholder="0.00"
            />
            <Field
              id="destination_charges"
              name="destination_charges"
              label="Destination charges"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.destination_charges}
              onChange={updateField}
              error={fieldErrors.destination_charges}
              placeholder="0.00"
            />
          </div>
          <div className="bid-terms-grid">
            <Field
              id="transit_time"
              name="transit_time"
              label="Transit time (days)"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={form.transit_time}
              onChange={updateField}
              error={fieldErrors.transit_time}
              placeholder="Days"
            />
            <Field
              id="quote_validity"
              name="quote_validity"
              label="Quote validity (days)"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={form.quote_validity}
              onChange={updateField}
              error={fieldErrors.quote_validity}
              placeholder="Days"
            />
          </div>
          <div className="bid-total-row">
            <div className="bid-total-field">
              <Field
                id="bid_amount"
                name="bid_amount"
                label="Total bid amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.bid_amount}
                onChange={updateField}
                error={fieldErrors.bid_amount}
                placeholder="0.00"
              />
            </div>
            <div className="bid-total-preview" aria-live="polite">
              <span>Bid total to submit</span>
              <strong>{formatAmount(form.bid_amount)}</strong>
              <small>Charge breakdown is submitted separately.</small>
            </div>
          </div>
          <div className="bid-submit-row">
            <span className="form-footnote">
              Bid acceptance is decided by the server, not this countdown.
            </span>
            <button
              type="submit"
              className="button button-primary bid-submit-button"
              disabled={submitting}
            >
              {submitting ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Send size={16} />
              )}
              {submitting ? "Submitting…" : "Submit bid"}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-card detail-card" aria-labelledby="history-heading">
        <div className="section-heading detail-section-heading">
          <div>
            <h2 id="history-heading">Bid history</h2>
            <p>All accepted bids, including earlier supplier submissions.</p>
          </div>
          <span className="record-count">
            {bids.length} {bids.length === 1 ? "bid" : "bids"}
          </span>
        </div>
        {bids.length === 0 ? (
          <div className="empty-table-message detail-empty-state">
            Bid submissions will appear here.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Bid amount</th>
                  <th scope="col">Freight</th>
                  <th scope="col">Origin</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Transit time</th>
                  <th scope="col">Quote validity</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {sortBidsByPrice(bids).map((bid) => (
                  <tr key={bid.id}>
                    <td data-label="Supplier" className="strong-cell">
                      {bid.supplier_name}
                    </td>
                    <td data-label="Bid amount" className="amount-cell">
                      {formatAmount(bid.bid_amount)}
                    </td>
                    <td data-label="Freight">
                      {formatAmount(bid.freight_charges)}
                    </td>
                    <td data-label="Origin">
                      {formatAmount(bid.origin_charges)}
                    </td>
                    <td data-label="Destination">
                      {formatAmount(bid.destination_charges)}
                    </td>
                    <td data-label="Transit time">{bid.transit_time} days</td>
                    <td data-label="Quote validity">{bid.quote_validity} days</td>
                    <td data-label="Submitted" className="date-cell">
                      {formatDateTime(bid.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card activity-card" aria-labelledby="activity-heading">
        <div className="section-heading detail-section-heading">
          <div>
            <h2 id="activity-heading">Auction activity</h2>
            <p>Recorded bid submissions and auction extensions from the activity log.</p>
          </div>
          <span className="record-count">
            {activity.length} {activity.length === 1 ? "event" : "events"}
          </span>
        </div>
        {activity.length === 0 ? (
          <div className="empty-table-message">No activity has been recorded.</div>
        ) : (
          <ol className="activity-list">
            {activity.map((entry) => {
              const extension =
                entry.activity_type === "auction_extended"
                  ? getExtensionDetails(entry.description)
                  : null;
              return (
                <li
                  key={entry.id}
                  className={`activity-item activity-item-${entry.activity_type}`}
                >
                  <div className="activity-content">
                    <div className="activity-title-row">
                      <strong>{getActivityTitle(entry.activity_type)}</strong>
                      <time dateTime={entry.created_at}>
                        {formatDateTime(entry.created_at)}
                      </time>
                    </div>
                    {extension ? (
                      <div className="extension-event">
                        <p>
                          <span>Reason</span>
                          {extension.reason}
                        </p>
                        <dl>
                          <div>
                            <dt>Previous close</dt>
                            <dd>{formatDateTime(extension.previousClose)}</dd>
                          </div>
                          <div>
                            <dt>New close</dt>
                            <dd>{formatDateTime(extension.newClose)}</dd>
                          </div>
                        </dl>
                      </div>
                    ) : (
                      <p className="activity-description">{entry.description}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

export default AuctionDetailsPage;
