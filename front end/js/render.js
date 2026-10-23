// Safe renderers: everything is built with createElement/textContent, never innerHTML.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Returns a normalised http(s) URL or null. */
export function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function link(parent, href, label) {
  const a = el("a", "", label);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  parent.appendChild(a);
}

const INLINE = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|https?:\/\/[^\s<>\]]+)/g;

/** Handles **bold**, [text](url) and bare URLs. Everything else is plain text. */
export function renderInline(parent, text) {
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    let m;
    if ((m = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/))) {
      const href = safeUrl(m[2]);
      href ? link(parent, href, m[1]) : parent.append(part);
    } else if (/^\*\*[^*]+\*\*$/.test(part)) {
      parent.appendChild(el("strong", "", part.slice(2, -2)));
    } else if (/^https?:\/\//.test(part)) {
      const trail = part.match(/[.,;:!?)]+$/)?.[0] ?? "";
      const url = trail ? part.slice(0, -trail.length) : part;
      const href = safeUrl(url);
      href ? link(parent, href, url) : parent.append(url);
      if (trail) parent.append(trail);
    } else {
      parent.append(part);
    }
  }
}

/** Limited Markdown: headings, bullet/numbered lists, rules, paragraphs. */
export function renderMarkdown(container, text) {
  container.replaceChildren();
  let para = [];
  let list = null;
  const flushPara = () => {
    if (!para.length) return;
    const p = el("p");
    renderInline(p, para.join(" "));
    container.appendChild(p);
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    let m;
    if (!t) { flushPara(); list = null; continue; }
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); list = null;
      const h = el("h" + m[1].length);
      renderInline(h, m[2].replace(/\*\*/g, ""));
      container.appendChild(h);
    } else if (/^([-*_])\1{2,}$/.test(t)) {
      flushPara(); list = null;
      container.appendChild(el("hr"));
    } else if ((m = t.match(/^([-*•]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const ordered = /\d/.test(m[1]);
      if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
        list = el(ordered ? "ol" : "ul");
        container.appendChild(list);
      }
      const li = el("li");
      renderInline(li, m[2]);
      list.appendChild(li);
    } else {
      list = null;
      para.push(t);
    }
  }
  flushPara();
}

/** Unique, valid http(s) URLs found in the given texts. */
export function extractUrls(...texts) {
  const found = new Set();
  for (const text of texts) {
    for (const raw of text.match(/https?:\/\/[^\s<>"'\])]+/g) ?? []) {
      const href = safeUrl(raw.replace(/[.,;:!?]+$/, ""));
      if (href) found.add(href);
    }
  }
  return [...found];
}

function sectionOf(text, label) {
  const others = ["Score", "Strengths", "Areas to Improve", "One line verdict"].filter((l) => l !== label);
  const re = new RegExp(`${label}\\s*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${others.join("|")})\\s*:|$)`, "i");
  return text.match(re)?.[1].trim() ?? "";
}
const bullets = (s) => [...s.matchAll(/^\s*[-*•]\s+(.+)$/gm)].map((m) => m[1].trim()).filter((b) => b && b !== "...");

/** Extracts score, strengths, improvements and verdict only when reliably present. */
export function parseCritic(text) {
  const m = text.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const score = m && Number(m[1]) >= 0 && Number(m[1]) <= 10 ? Number(m[1]) : null;
  return {
    score,
    strengths: bullets(sectionOf(text, "Strengths")),
    improve: bullets(sectionOf(text, "Areas to Improve")),
    verdict: sectionOf(text, "One line verdict").replace(/^\s*[-*]\s*/, ""),
  };
}

export function renderCritic(container, text) {
  container.replaceChildren();
  if (!text.trim()) {
    container.appendChild(el("p", "muted", "The backend returned no critic feedback."));
    return;
  }
  const c = parseCritic(text);
  if (c.score == null && !c.strengths.length && !c.improve.length && !c.verdict) {
    container.appendChild(el("pre", "raw", text)); // parsing failed: show original text
    return;
  }
  if (c.score != null) {
    const s = el("div", "score");
    s.append(el("b", "", String(c.score)), el("span", "", "/ 10"));
    const meter = el("div", "meter");
    const bar = el("i");
    bar.style.width = `${c.score * 10}%`;
    meter.appendChild(bar);
    container.append(s, meter);
  }
  const group = (title, items) => {
    if (!items.length) return;
    container.appendChild(el("h4", "", title));
    const ul = el("ul");
    items.forEach((i) => { const li = el("li"); renderInline(li, i); ul.appendChild(li); });
    container.appendChild(ul);
  };
  group("Strengths", c.strengths);
  group("Areas to improve", c.improve);
  if (c.verdict) {
    container.appendChild(el("h4", "", "Verdict"));
    const p = el("p", "verdict");
    renderInline(p, c.verdict);
    container.appendChild(p);
  }
}

export function renderSources(listEl, countEl, urls) {
  listEl.replaceChildren();
  countEl.textContent = urls.length ? `(${urls.length})` : "";
  if (!urls.length) {
    const li = el("li", "muted", "No valid links were found in the backend response.");
    listEl.appendChild(li);
    return;
  }
  urls.forEach((u) => { const li = el("li"); link(li, u, u); listEl.appendChild(li); });
}
