const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function formatApiError(data, fallback) {
  const detail = data?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join(" ");
  }
  return fallback;
}

export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(
      `Could not connect to the BidFlow API at ${API_BASE_URL}. Check that the backend is running.`,
      { cause: error },
    );
  }

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      if (response.ok) {
        throw new Error("The API returned an unreadable response.", {
          cause: error,
        });
      }
      data = { detail: responseText };
    }
  }

  if (!response.ok) {
    throw new Error(
      formatApiError(data, `Request failed with status ${response.status}.`),
    );
  }
  return data;
}

export const getRfqs = () => apiRequest("/api/rfqs");
export const getRfq = (id) => apiRequest(`/api/rfqs/${id}`);
export const createRfq = (payload) =>
  apiRequest("/api/rfqs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const getBids = (id) => apiRequest(`/api/rfqs/${id}/bids`);
export const getRanking = (id) => apiRequest(`/api/rfqs/${id}/ranking`);
export const getActivity = (id) => apiRequest(`/api/rfqs/${id}/activity`);
export const createBid = (id, payload) =>
  apiRequest(`/api/rfqs/${id}/bids`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
