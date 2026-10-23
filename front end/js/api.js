import { API_BASE_URL } from "./config.js";

export class ApiError extends Error {
  constructor(kind, message, hint = "") {
    super(message);
    this.kind = kind; // network | http | parse | stream | backend | empty | aborted
    this.hint = hint;
  }
}

/** fetch wrapper that converts network failures and aborts into ApiError. */
export async function request(path, options = {}) {
  try {
    return await fetch(API_BASE_URL + path, options);
  } catch (err) {
    if (err.name === "AbortError") throw new ApiError("aborted", "Request cancelled.");
    throw new ApiError(
      "network",
      "Can’t reach the research backend.",
      `Make sure FastAPI is running at ${API_BASE_URL} and that its CORS settings allow this page’s origin, then retry.`
    );
  }
}

export async function assertOk(res) {
  if (res.ok) return;
  if (res.status === 422) {
    throw new ApiError("http", "The backend rejected the topic.", "Topics must be 3–500 characters long.");
  }
  let detail = "";
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
  } catch { /* body was not JSON */ }
  throw new ApiError(
    "http",
    detail || `The backend returned HTTP ${res.status}.`,
    res.status >= 500
      ? "Check the server terminal and your API keys, then retry."
      : "Check the request and try again."
  );
}

/** Returns true when GET /health answers {"status":"ok"} within 5 seconds. */
export async function checkHealth() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(API_BASE_URL + "/health", { signal: ctl.signal });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Validates the backend payload and keeps only known string fields. */
export function normalizeResult(data) {
  if (!data || typeof data !== "object" || data.success === false) {
    throw new ApiError("parse", "The backend response wasn’t in the expected format.", "Retry. If it keeps happening, check the server logs.");
  }
  const str = (v) => (typeof v === "string" ? v : "");
  const result = {
    topic: str(data.topic),
    search_results: str(data.search_results),
    scraped_content: str(data.scraped_content),
    report: str(data.report),
    critic_feedback: str(data.critic_feedback),
  };
  if (!result.report.trim() && !result.critic_feedback.trim()) {
    throw new ApiError("empty", "The workflow finished but returned no report.", "Retry, or try a more specific topic.");
  }
  return result;
}

export async function runStandard(topic, signal) {
  const res = await request("/api/v1/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
    signal,
  });
  await assertOk(res);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError("parse", "The backend sent a response that isn’t valid JSON.", "Retry. If it keeps happening, check the server logs.");
  }
  return normalizeResult(data);
}
