function parseBackendDateTime(value) {
  if (!value) {
    return new Date(Number.NaN);
  }
  const timestamp = String(value);
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  return new Date(hasTimezone ? timestamp : `${timestamp}Z`);
}

export function getAuctionStatus(rfq, now = Date.now()) {
  const start = parseBackendDateTime(rfq.start_time).getTime();
  const close = parseBackendDateTime(rfq.current_close_time).getTime();
  const forcedClose = rfq.forced_close_time
    ? parseBackendDateTime(rfq.forced_close_time).getTime()
    : null;

  if (!Number.isFinite(start) || !Number.isFinite(close)) {
    return "unknown";
  }
  if (now < start) {
    return "upcoming";
  }
  if (
    forcedClose !== null &&
    now >= forcedClose &&
    close >= forcedClose
  ) {
    return "force-closed";
  }
  if (now >= close) {
    return "closed";
  }
  if (forcedClose !== null && now >= forcedClose) {
    return "force-closed";
  }
  return "active";
}

export function getStatusLabel(status) {
  return {
    active: "Active",
    upcoming: "Scheduled",
    closed: "Closed",
    "force-closed": "Force closed",
  }[status] || "Unknown";
}

export function formatAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function sortBidsByPrice(bids) {
  return [...bids].sort(
    (left, right) =>
      Number(left.bid_amount) - Number(right.bid_amount) ||
      left.supplier_name.localeCompare(right.supplier_name, undefined, {
        sensitivity: "base",
      }) ||
      left.id - right.id,
  );
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  const date = parseBackendDateTime(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function formatCountdown(closeTime, now = Date.now()) {
  const close = parseBackendDateTime(closeTime).getTime();
  if (!Number.isFinite(close)) {
    return "Unavailable";
  }
  const secondsRemaining = Math.max(0, Math.floor((close - now) / 1000));
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  const time = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${time}` : time;
}

export function localDateTimeToIso(value) {
  return new Date(value).toISOString();
}

export function activityLabel(activityType) {
  return (activityType || "activity")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
