import { API_BASE_URL, MAX_TOPIC_LENGTH, MIN_TOPIC_LENGTH } from "./config.js";
import { ApiError, checkHealth, runStandard } from "./api.js";
import { runStreaming } from "./streaming.js";
import { renderMarkdown, renderCritic, renderSources, extractUrls } from "./render.js";

const $ = (id) => document.getElementById(id);
const ui = {
  form: $("form"), topic: $("topic"), counter: $("counter"), topicError: $("topic-error"),
  submit: $("submit"), submitLabel: $("submit-label"), cancel: $("cancel"), chips: $("chips"),
  empty: $("empty"), progress: $("progress"), stages: $("stages"), bar: $("bar"), note: $("progress-note"),
  error: $("error"), errorTitle: $("error-title"), errorMsg: $("error-msg"), errorHint: $("error-hint"), retry: $("retry"),
  results: $("results"), resultTitle: $("result-title"), report: $("report"), critic: $("critic"),
  search: $("search"), scraped: $("scraped"), sources: $("sources"), sourcesCount: $("sources-count"),
  status: $("status"), statusText: $("status-text"), toast: $("toast"),
};
const STAGE_LABELS = { waiting: "Waiting", active: "In progress", done: "Completed", failed: "Not completed" };
const ERROR_TITLES = {
  network: "Backend unreachable", http: "The backend returned an error", parse: "Unexpected response",
  stream: "Stream interrupted", backend: "Research failed", empty: "No report returned",
};

let controller = null;      // AbortController of the running request
let last = null;            // { topic, mode } for Retry
let current = null;         // last successful result (for copy/download)
let toastTimer = 0;

/* ---------- helpers ---------- */
const mode = () => document.querySelector('input[name="mode"]:checked').value;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2400);
}
function setStage(name, state) {
  const li = ui.stages.querySelector(`[data-stage="${name}"]`);
  if (!li) return;
  li.dataset.state = state;
  li.querySelector(".s-state").textContent = STAGE_LABELS[state];
}
const allStages = (state, onlyIncomplete = false) =>
  ui.stages.querySelectorAll("li").forEach((li) => {
    if (!onlyIncomplete || li.dataset.state !== "done") setStage(li.dataset.stage, state);
  });

function setBusy(busy) {
  ui.topic.disabled = busy;
  ui.submit.disabled = busy;
  ui.submit.classList.toggle("loading", busy);
  ui.submitLabel.textContent = busy ? "Researching…" : "Generate research";
  ui.cancel.hidden = !busy;
  ui.chips.querySelectorAll("button").forEach((b) => (b.disabled = busy));
  document.querySelectorAll('input[name="mode"]').forEach((r) => (r.disabled = busy));
  ui.bar.classList.toggle("on", busy);
}

/* ---------- backend status ---------- */
async function refreshStatus() {
  ui.status.dataset.state = "checking";
  ui.statusText.textContent = "Checking backend…";
  const ok = await checkHealth();
  ui.status.dataset.state = ok ? "ok" : "down";
  ui.statusText.textContent = ok ? "Backend connected" : "Backend unavailable";
}

/* ---------- validation ---------- */
function validate() {
  const value = ui.topic.value.trim();
  let msg = "";
  if (!value) msg = "Enter a research topic to continue.";
  else if (value.length < MIN_TOPIC_LENGTH) msg = `Use at least ${MIN_TOPIC_LENGTH} characters so the agents have something to search for.`;
  else if (value.length > MAX_TOPIC_LENGTH) msg = `Shorten the topic to ${MAX_TOPIC_LENGTH} characters or fewer.`;
  ui.topicError.hidden = !msg;
  ui.topicError.textContent = msg;
  ui.topic.closest(".field").classList.toggle("invalid", !!msg);
  return msg ? null : value;
}

/* ---------- views ---------- */
function showError(err) {
  const known = err instanceof ApiError;
  ui.errorTitle.textContent = ERROR_TITLES[err.kind] || "Something went wrong";
  ui.errorMsg.textContent = known ? err.message : "An unexpected error occurred in the browser.";
  ui.errorHint.textContent = known ? err.hint : "Reload the page and try again.";
  ui.error.hidden = false;
  allStages("failed", true);
  ui.progress.hidden = false;
  ui.note.textContent = "";
  ui.error.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (err.kind === "network") refreshStatus();
}

function showResults(r) {
  current = r;
  ui.resultTitle.textContent = r.topic || last.topic;
  if (r.report.trim()) renderMarkdown(ui.report, r.report);
  else ui.report.textContent = "The backend returned no report text.";
  renderCritic(ui.critic, r.critic_feedback);
  ui.search.textContent = r.search_results || "No search results were returned.";
  ui.scraped.textContent = r.scraped_content || "No scraped content was returned.";
  renderSources(ui.sources, ui.sourcesCount, extractUrls(r.search_results, r.scraped_content, r.report));
  $("copy-report").disabled = !r.report.trim();
  $("download-report").disabled = !r.report.trim();
  $("copy-critic").disabled = !r.critic_feedback.trim();
  ui.results.hidden = false;
  ui.empty.hidden = true;
  ui.resultTitle.focus({ preventScroll: true });
  ui.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetWorkspace() {
  current = null;
  ui.results.hidden = ui.error.hidden = ui.progress.hidden = true;
  ui.empty.hidden = false;
  ui.topic.value = "";
  updateCounter();
  ui.topic.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- run research ---------- */
async function run(topic, selectedMode) {
  if (controller) return; // duplicate-submission guard
  last = { topic, mode: selectedMode };
  controller = new AbortController();
  const { signal } = controller;

  ui.error.hidden = ui.results.hidden = true;
  ui.empty.hidden = true;
  allStages("waiting");
  ui.progress.hidden = false;
  ui.note.textContent = selectedMode === "stream"
    ? "Connecting to the stream…"
    : "Running the full workflow. Standard mode shows no stage updates until the response arrives.";
  setBusy(true);

  try {
    const result = selectedMode === "stream"
      ? await runStreaming(topic, {
          signal,
          onProgress: (p) => {
            if (p?.stage && p.status === "completed") setStage(p.stage, "done");
            else if (p?.stage === "research" && p.status === "started") {
              ui.note.textContent = "Workflow started. The backend reports each stage after the pipeline finishes, so stages may complete together.";
            }
          },
        })
      : await runStandard(topic, signal);
    allStages("done"); // a complete result means every stage ran
    ui.note.textContent = "Research complete.";
    showResults(result);
  } catch (err) {
    if (err.kind === "aborted") {
      ui.progress.hidden = true;
      ui.empty.hidden = !!current;
      toast("Cancelled. The server may still finish this run in the background.");
    } else {
      showError(err);
    }
  } finally {
    controller = null;
    setBusy(false);
  }
}

/* ---------- clipboard / download ---------- */
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied.`);
  } catch {
    toast("Copy failed. Select the text and copy it manually.");
  }
}
function downloadReport() {
  const slug = (current.topic || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "report";
  const blob = new Blob([`# ${current.topic}\n\n${current.report}\n`], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${slug}.md` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- wiring (each listener registered once) ---------- */
function updateCounter() { ui.counter.textContent = `${ui.topic.value.length} / ${MAX_TOPIC_LENGTH}`; }

ui.topic.addEventListener("input", () => { updateCounter(); if (!ui.topicError.hidden) validate(); });
ui.topic.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ui.form.requestSubmit(); }
});
ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const topic = validate();
  if (topic) run(topic, mode());
  else ui.topic.focus();
});
ui.chips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip || controller) return;
  ui.topic.value = chip.textContent.trim();
  updateCounter();
  validate();
  ui.topic.focus();
});
ui.cancel.addEventListener("click", () => controller?.abort());
ui.retry.addEventListener("click", () => last && run(last.topic, last.mode));
$("reset").addEventListener("click", resetWorkspace);
$("copy-report").addEventListener("click", () => copyText(current.report, "Report"));
$("copy-critic").addEventListener("click", () => copyText(current.critic_feedback, "Critic feedback"));
$("download-report").addEventListener("click", downloadReport);
ui.status.addEventListener("click", refreshStatus);
$("docs-link").href = `${API_BASE_URL}/docs`;

updateCounter();
refreshStatus();
