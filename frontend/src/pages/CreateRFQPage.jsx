import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  FilePlus2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import { createRfq } from "../lib/api.js";
import { localDateTimeToIso } from "../lib/format.js";

const initialForm = {
  rfq_name: "",
  reference_id: "",
  start_time: "",
  original_close_time: "",
  forced_close_time: "",
  pickup_date: "",
  trigger_window_minutes: "",
  extension_duration_minutes: "",
  trigger_type: "ANY_BID",
};

function validateForm(form) {
  const errors = {};
  if (!form.rfq_name.trim()) {
    errors.rfq_name = "Enter an RFQ name.";
  }
  if (!form.reference_id.trim()) {
    errors.reference_id = "Enter a unique reference ID.";
  }
  if (!form.start_time) {
    errors.start_time = "Choose a start date and time.";
  }
  if (!form.original_close_time) {
    errors.original_close_time = "Choose an original close date and time.";
  }
  if (!form.forced_close_time) {
    errors.forced_close_time = "Choose a forced close date and time.";
  }
  if (
    form.start_time &&
    form.original_close_time &&
    new Date(form.start_time).getTime() >=
      new Date(form.original_close_time).getTime()
  ) {
    errors.original_close_time =
      "The original close must be later than the start.";
  }
  if (form.forced_close_time && form.original_close_time) {
    if (
      new Date(form.forced_close_time).getTime() <=
      new Date(form.original_close_time).getTime()
    ) {
      errors.forced_close_time =
        "The forced close must be later than the original close.";
    }
  }
  if (!form.pickup_date) {
    errors.pickup_date = "Choose a pickup/service date.";
  }
  if (!Number.isInteger(Number(form.trigger_window_minutes)) ||
      Number(form.trigger_window_minutes) <= 0) {
    errors.trigger_window_minutes =
      "Enter a trigger window greater than zero.";
  }
  if (!Number.isInteger(Number(form.extension_duration_minutes)) ||
      Number(form.extension_duration_minutes) <= 0) {
    errors.extension_duration_minutes =
      "Enter an extension duration greater than zero.";
  }
  return errors;
}

function FormField({
  children,
  error,
  hint,
  id,
  label,
  required = false,
}) {
  return (
    <div className={`form-field ${error ? "form-field-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required-mark"> *</span>}
      </label>
      {children}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

function CreateRFQPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setSubmitError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitError("Review the highlighted fields before creating the RFQ.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        rfq_name: form.rfq_name.trim(),
        reference_id: form.reference_id.trim(),
        start_time: localDateTimeToIso(form.start_time),
        original_close_time: localDateTimeToIso(form.original_close_time),
        current_close_time: localDateTimeToIso(form.original_close_time),
        forced_close_time: localDateTimeToIso(form.forced_close_time),
        pickup_date: form.pickup_date,
        trigger_window_minutes: Number(form.trigger_window_minutes),
        extension_duration_minutes: Number(form.extension_duration_minutes),
        trigger_type: form.trigger_type,
      };
      const created = await createRfq(payload);
      if (!created?.id) {
        throw new Error("The API created the RFQ but did not return its ID.");
      }
      navigate(`/rfqs/${created.id}`);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack page-stack-narrow">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Back to overview
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">RFQ setup</p>
          <h1>Create a request for quotation</h1>
          <p className="page-description">
            Set the procurement schedule and reverse-auction extension rules.
          </p>
        </div>
      </div>

      {submitError && <Alert>{submitError}</Alert>}

      <form className="rfq-form" onSubmit={handleSubmit} noValidate>
        <section className="surface-card form-section">
          <div className="form-section-heading">
            <span className="section-icon">
              <FilePlus2 size={19} />
            </span>
            <div>
              <h2>RFQ details</h2>
              <p>Identify the sourcing event for your suppliers.</p>
            </div>
          </div>
          <div className="form-grid">
            <FormField
              id="rfq_name"
              label="RFQ name"
              required
              error={fieldErrors.rfq_name}
            >
              <input
                id="rfq_name"
                name="rfq_name"
                value={form.rfq_name}
                onChange={updateField}
                placeholder="e.g. Regional freight services"
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.rfq_name)}
                aria-describedby={fieldErrors.rfq_name ? "rfq_name-error" : undefined}
              />
            </FormField>
            <FormField
              id="reference_id"
              label="Reference ID"
              required
              error={fieldErrors.reference_id}
              hint="Must be unique across RFQs."
            >
              <input
                id="reference_id"
                name="reference_id"
                value={form.reference_id}
                onChange={updateField}
                placeholder="e.g. RFQ-2026-001"
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.reference_id)}
                aria-describedby={
                  fieldErrors.reference_id ? "reference_id-error" : undefined
                }
              />
            </FormField>
            <FormField
              id="pickup_date"
              label="Pickup / service date"
              required
              error={fieldErrors.pickup_date}
            >
              <div className="input-with-icon">
                <CalendarDays size={17} aria-hidden="true" />
                <input
                  id="pickup_date"
                  name="pickup_date"
                  type="date"
                  value={form.pickup_date}
                  onChange={updateField}
                  aria-invalid={Boolean(fieldErrors.pickup_date)}
                  aria-describedby={
                    fieldErrors.pickup_date ? "pickup_date-error" : undefined
                  }
                />
              </div>
            </FormField>
          </div>
        </section>

        <section className="surface-card form-section">
          <div className="form-section-heading">
            <span className="section-icon section-icon-teal">
              <Clock3 size={19} />
            </span>
            <div>
              <h2>Auction schedule</h2>
              <p>All times are entered in your local timezone and sent as UTC.</p>
            </div>
          </div>
          <div className="form-grid">
            <FormField
              id="start_time"
              label="Start date and time"
              required
              error={fieldErrors.start_time}
            >
              <input
                id="start_time"
                name="start_time"
                type="datetime-local"
                value={form.start_time}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.start_time)}
                aria-describedby={
                  fieldErrors.start_time ? "start_time-error" : undefined
                }
              />
            </FormField>
            <FormField
              id="original_close_time"
              label="Original close date and time"
              required
              error={fieldErrors.original_close_time}
            >
              <input
                id="original_close_time"
                name="original_close_time"
                type="datetime-local"
                value={form.original_close_time}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.original_close_time)}
                aria-describedby={
                  fieldErrors.original_close_time
                    ? "original_close_time-error"
                    : undefined
                }
              />
            </FormField>
            <FormField
              id="forced_close_time"
              label="Forced close date and time"
              required
              error={fieldErrors.forced_close_time}
              hint="Must be later than the original close; extensions cannot pass it."
            >
              <input
                id="forced_close_time"
                name="forced_close_time"
                type="datetime-local"
                required
                value={form.forced_close_time}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.forced_close_time)}
                aria-describedby={
                  fieldErrors.forced_close_time
                    ? "forced_close_time-error"
                    : undefined
                }
              />
            </FormField>
          </div>
        </section>

        <section className="surface-card form-section">
          <div className="form-section-heading">
            <span className="section-icon section-icon-orange">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2>Extension rules</h2>
              <p>Choose when a late bid can extend the current close time.</p>
            </div>
          </div>
          <div className="form-grid">
            <FormField
              id="trigger_type"
              label="Extension trigger"
              required
              hint="The selected trigger applies during the final X minutes."
            >
              <select
                id="trigger_type"
                name="trigger_type"
                value={form.trigger_type}
                onChange={updateField}
              >
                <option value="ANY_BID">Any valid bid</option>
                <option value="ANY_RANK_CHANGE">Any supplier rank changes</option>
                <option value="L1_RANK_CHANGE">L1 supplier changes</option>
              </select>
            </FormField>
            <FormField
              id="trigger_window_minutes"
              label="Trigger window (X minutes)"
              required
              error={fieldErrors.trigger_window_minutes}
              hint="How close to the current close a bid must arrive."
            >
              <input
                id="trigger_window_minutes"
                name="trigger_window_minutes"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.trigger_window_minutes}
                onChange={updateField}
                placeholder="Minutes"
                aria-invalid={Boolean(fieldErrors.trigger_window_minutes)}
                aria-describedby={
                  fieldErrors.trigger_window_minutes
                    ? "trigger_window_minutes-error"
                    : undefined
                }
              />
            </FormField>
            <FormField
              id="extension_duration_minutes"
              label="Extension duration (Y minutes)"
              required
              error={fieldErrors.extension_duration_minutes}
              hint="Added to the current close time when triggered."
            >
              <input
                id="extension_duration_minutes"
                name="extension_duration_minutes"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.extension_duration_minutes}
                onChange={updateField}
                placeholder="Minutes"
                aria-invalid={Boolean(fieldErrors.extension_duration_minutes)}
                aria-describedby={
                  fieldErrors.extension_duration_minutes
                    ? "extension_duration_minutes-error"
                    : undefined
                }
              />
            </FormField>
          </div>
        </section>

        <div className="form-submit-row">
          <Link to="/" className="button button-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="button button-primary"
            disabled={submitting}
          >
            {submitting ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <FilePlus2 size={17} />
            )}
            {submitting ? "Creating RFQ…" : "Create RFQ"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateRFQPage;
