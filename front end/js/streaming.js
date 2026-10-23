import { ApiError, request, assertOk, normalizeResult } from "./api.js";

/**
 * Incremental SSE parser. Chunks may end mid-event or hold several events,
 * so we buffer and only dispatch on blank-line boundaries.
 */
export function createSSEParser(onEvent) {
  const decoder = new TextDecoder();
  let buffer = "";

  function dispatch(frame) {
    let event = "message";
    const data = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue; // comment / keep-alive
      const i = line.indexOf(":");
      const field = i < 0 ? line : line.slice(0, i);
      let value = i < 0 ? "" : line.slice(i + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length || event !== "message") onEvent(event, data.join("\n"));
  }

  function drain(final) {
    // Normalise CRLF/CR, but hold back a trailing CR that may pair with the next chunk's LF.
    const keep = !final && buffer.endsWith("\r") ? "\r" : "";
    buffer = (keep ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n") + keep;
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatch(frame);
    }
    if (final && buffer.trim()) {
      const rest = buffer;
      buffer = "";
      dispatch(rest);
    }
  }

  return {
    push(bytes) { buffer += decoder.decode(bytes, { stream: true }); drain(false); },
    end() { buffer += decoder.decode(); drain(true); }, // flush decoder
  };
}

export async function runStreaming(topic, { signal, onProgress }) {
  const res = await request("/api/v1/research/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ topic }),
    signal,
  });
  await assertOk(res);

  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/event-stream") || !res.body) {
    throw new ApiError("stream", "The backend didn’t return an event stream.", "Try standard mode, or check the server logs.");
  }

  let result = null;
  let failure = null;
  const parser = createSSEParser((event, raw) => {
    if (event === "ping") return;
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      throw new ApiError("parse", "The stream contained malformed data.", "Retry. If it keeps happening, check the server logs.");
    }
    if (event === "progress") onProgress(payload);
    else if (event === "result") result = payload;
    else if (event === "error") {
      failure = new ApiError(
        "backend",
        typeof payload.message === "string" ? payload.message : "The research workflow failed.",
        "Check the server terminal and your API keys, then retry."
      );
    }
  });

  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
      if (result || failure) break;
    }
    parser.end();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") throw new ApiError("aborted", "Request cancelled.");
    throw new ApiError("stream", "The connection dropped before the result arrived.", "Retry. The server may still be working on the previous run.");
  } finally {
    reader.cancel().catch(() => {});
  }

  if (failure) throw failure;
  if (!result) throw new ApiError("stream", "The stream ended before a result arrived.", "Retry. The server may still be working on the previous run.");
  return normalizeResult(result);
}
