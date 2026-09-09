const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const MAX_BODY = 128 * 1024;
const PROTOCOL_VERSION = "2025-03-26";
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map();
const auditEvents = [];
/**
 * Parsed once per process. data/curriculum.json is 3.8 MB and data/workbook.json is 124 KB, and
 * both are immutable between deploys — Render redeploys on any data/** change, which is the only
 * way their contents can move. Re-parsing 3.8 MB synchronously per get_syllabus call blocked the
 * event loop of the single free-tier instance for every other request in flight.
 *
 * The same object is handed back every time, so nothing downstream may mutate it.
 */
const jsonCache = new Map();
const readJson = (file) => { if (!jsonCache.has(file)) jsonCache.set(file, JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))); return jsonCache.get(file); };
const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/**
 * Two numberings, and they are off by one from each other.
 *
 * `workbook.Plan[N]` is plan row N with the header at index 0, and N is what every market
 * sentence cites: "NEXT - row 28". `data/curriculum.json` is keyed 0-118 and `get_plan`'s
 * `index` is a position in `Plan.slice(1)`, so both are row minus one. Hand a market row to
 * get_syllabus unconverted and it returns a different topic than the sentence named, which is
 * why every market tool below returns `row` and `syllabus_index` together rather than one number
 * the caller has to guess the base of.
 */
const planRows = () => readJson("data/workbook.json").Plan;
const planRow = (row) => (Number.isInteger(row) && row >= 1 && row < planRows().length ? planRows()[row] : null);
const ACTIVE_HOURS = 1588; // Σ hours of the 117 rows the workbook does not mark Skipped; the denominator benchmark.overInvestedTotal uses.
const tools = [
  { name: "get_plan", description: "Read Rasul's Senior FDE plan: 119 rows over 23 months, 1588 active hours, with the read/watch/do resources and hours of each. Returns 30 rows per call unless you raise limit; pass row, month, track or query to narrow. The `status` field is the frozen workbook baseline (Not started on 117 rows, Skipped on 2) and never advances — for what is actually done use get_progress_analytics, and for what to do next use get_market_priorities.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Case-insensitive substring of the topic." }, month: { type: "number", description: "Plan month, 1-23." }, track: { type: "string", description: "Case-insensitive substring of the track, e.g. \"Backend\"." }, row: { type: "integer", minimum: 1, maximum: 119, description: "One 1-based plan row, as market statements cite it." }, limit: { type: "integer", minimum: 1, maximum: 119, description: "Rows to return. Default 30; the whole plan is roughly 131 KB." } } } },
  { name: "get_learning_context", description: "Read the indexed books, the repository references, and the one hardcoded lesson context. The lesson is currently Shell Mastery and Scripting and is not selectable — there is one lesson file, not one per topic.", inputSchema: { type: "object", properties: {} } },
  { name: "get_syllabus", description: "Read the deep syllabus for a plan topic: prerequisites, 12-20 parts with what to learn and a public resource each, outcomes, production failure modes, interview questions, and proof of work. Pass row (1-based plan row, the number market statements cite) or index (row minus 1, the key the syllabus is stored under); query matches a topic or track substring; no args lists every topic that has one.", inputSchema: { type: "object", properties: { index: { type: "number", description: "0-based syllabus index. Equals plan row minus 1." }, row: { type: "integer", minimum: 1, maximum: 119, description: "1-based plan row. Preferred when you got the number from a market statement." }, query: { type: "string" } } } },
  { name: "ask_lumen", description: "Ask Lumen for a fifth-grade-language technical explanation using the full indexed Senior FDE context. Prose only: it is handed a 7000-character digest of the market scan, so for measured market numbers call get_market_priorities, get_market_reach, get_market_skill or get_market_plan_risk instead, which return the stored sentences unchanged.", inputSchema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" }, context: { type: "string" } } } },
  { name: "list_ask_reports", description: "List Markdown Ask Lumen reports saved in GitHub.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "read_ask_report", description: "Read one saved Ask Lumen report from GitHub by path.", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } } },
  { name: "save_study_note", description: "Write a durable study note to reports/notes in GitHub. Use only when the user explicitly asks to save it.", inputSchema: { type: "object", required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" } } } },
  { name: "record_progress", description: "Record a durable study-progress event in GitHub when the user explicitly says they completed or updated a topic. `topic` must be the verbatim plan topic string: readiness matches events to plan rows by exact topic, so a near-miss saves a file that counts toward nothing. The response reports which row it matched, or that it matched none.", inputSchema: { type: "object", required: ["topic", "status"], properties: { topic: { type: "string", description: "The plan topic, verbatim. Confirm it with get_plan first." }, status: { type: "string", enum: ["not_started", "in_progress", "done", "skipped"] }, notes: { type: "string" } } } },
  { name: "get_progress_history", description: "List durable study-progress events saved in GitHub, newest first, with the topic, status and plan row parsed out of each filename.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_progress_analytics", description: "Summarize progress from GitHub history: hours done against the 1588 active plan hours, per-topic status counts (the newest event per topic, not one count per event), the recent events, and any event whose topic matches no plan row and therefore counts toward nothing.", inputSchema: { type: "object", properties: {} } },
  { name: "score_assessment", description: "Score a rubric-based weekly, monthly or quarterly self-assessment (one 0-4 rating per criterion) and explain the result. weekly and monthly share one 4-criterion rubric; quarterly has 5. quick_check is retired — the four-question static quiz it graded was replaced by the recall strip, so that branch refuses rather than grading against a key with no questions.", inputSchema: { type: "object", required: ["assessment", "answers"], properties: { assessment: { type: "string", enum: ["quick_check", "weekly", "monthly", "quarterly"] }, answers: { type: "array", description: "One rating per rubric criterion: 4 for weekly/monthly, 5 for quarterly.", items: { type: "number", minimum: 0, maximum: 4 } } } } },
  { name: "semantic_search", description: "Search with SurfSense Google Search or Web Crawl when configured, or search the Lumen GitHub repository as a safe fallback.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, provider: { type: "string", enum: ["surfsense", "github"] }, limit: { type: "number" }, country_code: { type: "string" } } } },
  { name: "get_audit_log", description: "View recent MCP actions and their success or failure without exposing secrets. In-process events do not survive a Render free-tier sleep; the durable list, written to reports/audit in GitHub for the two tools that write to the repo, does.", inputSchema: { type: "object", properties: { limit: { type: "number" }, durable: { type: "boolean", description: "Also list the durable reports/audit entries from GitHub. Default true." } } } },
  { name: "get_connection_map", description: "Return the precise Lumen, GitHub, Vercel, Render, SurfSense, and MCP connection map.", inputSchema: { type: "object", properties: {} } },
  { name: "get_market_priorities", description: "What to study next, given what the market actually asks for: the incomplete plan rows ranked by the readiness points finishing each one buys, plus where readiness stands today and which of the five market segments the work moves toward. Every row carries both `row` (1-based, as the statements cite it) and `syllabus_index` (row - 1, what get_syllabus and get_plan take).", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 27, default: 8, description: "How many ranked rows to return, best first." }, max_month: { type: "integer", minimum: 1, maximum: 23, description: "Only rows scheduled in this month or earlier. The plan runs months 1-23." }, track: { type: "string", description: "Case-insensitive substring of the plan track, e.g. \"Backend\" or \"E.\"." }, include_segments: { type: "boolean", default: true, description: "Append the five ranked segment-fit lines." } } } },
  { name: "get_market_reach", description: "Which of the measured requisitions are takeable without leaving India, at which named companies, and whether that slice asks for something different from the market at large. Returns the tier distribution, the named roles with their URLs, the per-skill whole-market versus reachable share, and derivedCount — how many requisitions were tiered from the location string alone, which overstates reach.", inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["india-remote", "emea-apac-remote", "india-office", "relocate-sponsor", "out-of-reach"], description: "Restrict the named roles to one tier. Omit for every role takeable without leaving India." }, skills_limit: { type: "integer", minimum: 0, maximum: 34, default: 10, description: "Skills to return, ranked by share of the reachable slice. 0 omits them." } } } },
  { name: "get_market_skill", description: "Does the market ask for what a plan row teaches, and what does finishing it buy? Joins the measured coverage of a skill (whole-market share, the plan rows that teach it, the quoted JD evidence) with its share of the reachable slice and the readiness gain if its row is unfinished. With no arguments it returns the compact 34-skill index — id, label, market share, reachable share, primary row — which is the routing table for the other market tools.", inputSchema: { type: "object", properties: { skill: { type: "string", description: "Skill id (e.g. \"python\", \"rag\") or a case-insensitive substring of its label." }, row: { type: "integer", minimum: 1, maximum: 119, description: "A 1-based workbook plan row, as market statements cite it (\"row 28\"). This is get_syllabus's index + 1." } } } },
  { name: "get_market_plan_risk", description: "Which of the 1588 planned hours the market is not paying for, and what it asks for that the plan never teaches: the audited gaps with their nearest plan row, and the over-invested tracks with their measured JD frequency and combined hour cost. The answer to \"should I cut something\".", inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["gaps", "over_invested", "both"], default: "both", description: "gaps = market asks, plan does not teach. over_invested = plan teaches, market rarely asks." }, limit: { type: "integer", minimum: 1, maximum: 13, default: 13 } } } }
];

function repoConfig() { return { repo: process.env.GITHUB_REPO || "rasulshaikh/lumen-fde", branch: process.env.GITHUB_BRANCH || "main", token: process.env.GITHUB_TOKEN }; }
async function github(pathname, options = {}) {
  const { token } = repoConfig();
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  const response = await fetch(`https://api.github.com/repos/${repoConfig().repo}/contents/${pathname}`, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lumen-mcp", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `GitHub request failed with ${response.status}`);
  return data;
}
function slug(value, fallback) { return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || fallback; }
function audit(action, ok, detail = "") { auditEvents.unshift({ action, ok, detail: String(detail).slice(0, 180), at: new Date().toISOString() }); if (auditEvents.length > 500) auditEvents.pop(); }
async function durableAudit(action, detail) { try { const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const file = `reports/audit/${stamp}-${slug(action, "event")}.json`; await github(file, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `audit: ${action}`, content: Buffer.from(JSON.stringify({ action, detail, at: new Date().toISOString() }, null, 2)).toString("base64"), branch: repoConfig().branch }) }); } catch (error) { audit("durable_audit", false, error.message); } }
function cleanAnswer(value) { return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*/g, "").replace(/[—–]/g, " - ").replace(/\n{3,}/g, "\n\n").trim(); }

/**
 * Everything below to the end of `marketContext` is a port of app/api/ask/route.ts, and the two
 * copies must stay identical.
 *
 * Not imported, because it cannot be: that file is TypeScript inside the Next bundle on Vercel
 * and this is a CommonJS process on Render, with no build step between them. The same
 * reasoning, and the same duty to keep the copies in step, as the cron route's copy of the
 * digest's `clean`.
 *
 * It has to exist at all because `askLumen` has two paths and only one of them is a proxy. With
 * LUMEN_ASK_URL and LUMEN_INTERNAL_API_KEY set, the tool posts to /api/ask and inherits the
 * market context for free. Without them it assembles its own context and calls MiniMax
 * directly, and that path would answer a market question from nothing at all — which is worse
 * than not answering it, because the model has no way to know the numbers are missing.
 */
const MARKET_CAP = 7000;
const COVERAGE_LINES = 10;
const MARGINAL_LINES = 5;
/** Bounded for the same reason the route bounds it: `github()` passes no signal to fetch, and
 *  the MiniMax call downstream already claims 25 s. A hung GitHub costs the market block only. */
const MARKET_READ_MS = 4000;

/** Read live from GitHub rather than from the checkout on disk. `readJson` would serve whatever
 *  reports/market held at deploy time, so Claude Code and the dashboard would quote different
 *  markets — and the whole point of this port is that the two answer identically. Every failure
 *  path resolves null and the block is simply absent. */
async function readMarketReport(file) {
  const read = github(file).then((result) => JSON.parse(Buffer.from(result.content, "base64").toString("utf8"))).catch(() => null);
  return Promise.race([read, new Promise((resolve) => setTimeout(resolve, MARKET_READ_MS, null))]);
}

/**
 * The measured market as a digest, not as 180 KB of JSON.
 *
 * Coverage is laid down last so that it, and not the segment ranking or the reachability
 * distribution, is what the budget trims. Statements are appended whole and never sliced: a
 * blunt cut at MARKET_CAP can bisect a numeral, and "189 distinct requisitions" arriving as
 * "18" puts a wrong measured number in front of the model, which is worse than one fewer skill.
 */
function marketContext(benchmark, insight) {
  const lines = [];
  if (benchmark) lines.push(`MEASURED MARKET BENCHMARK - scanned ${benchmark.day}, ${benchmark.boardsOk} of ${benchmark.boardsTotal} first-party job boards.`, benchmark.coreStatement, benchmark.adjacentStatement);
  if (insight) {
    lines.push("", insight.reachability.statement, insight.reachability.tiers.map((tier) => `${tier.tier} ${tier.count} (${tier.pct}%)`).join(" | "), "",
      insight.readiness.statement, ...insight.readiness.marginal.slice(0, MARGINAL_LINES).map((entry) => entry.statement), "",
      "SEGMENT FIT - ranked by how many requisitions in each segment are reachable today, readiness breaking ties:",
      ...insight.segments.map((segment) => `${segment.rank}. ${segment.statement}`), "", insight.velocity.statement);
  }
  if (!lines.length) return "";
  const kept = [];
  if (benchmark) {
    const header = (n) => `MOST-ASKED SKILLS - the ${n} most-asked of ${benchmark.coverage.length} mapped skills, by share of core requisitions:`;
    // The header and its blank line are written after the fill, so they are reserved here at
    // the longest the count can render rather than estimated.
    let used = lines.reduce((n, line) => n + line.length + 1, 0) + header(COVERAGE_LINES).length + 2;
    for (const entry of benchmark.coverage.slice(0, COVERAGE_LINES)) {
      if (used + entry.statement.length + 1 > MARKET_CAP) break;
      used += entry.statement.length + 1;
      kept.push(entry.statement);
    }
    if (kept.length) lines.push("", header(kept.length), ...kept);
  }
  const text = lines.join("\n");
  if (text.length <= MARKET_CAP) return text;
  // The last resort, and it drops whole LINES rather than characters — the same shape
  // app/api/ask/route.ts uses, so both surfaces answer from a byte-comparable digest.
  //
  // This function used to end `text.slice(0, MARKET_CAP)`, which is precisely the bisected
  // numeral the header comment above warns about: only the coverage block is fill-checked, so
  // the cap is reachable from in front of it — `insight.segments` is mapped with no slice — and
  // a character cut there would deliver "189 distinct requisitions" to a model as "18". A wrong
  // measured number in the context is strictly worse than a shorter digest. The dashboard route
  // was fixed and this copy was not, so Claude Code was the surface still exposed to it.
  const trimmed = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > MARKET_CAP) break;
    used += line.length + 1;
    trimmed.push(line);
  }
  return trimmed.join("\n");
}

/** Stated only when there is a block to state it about; telling the model to quote a benchmark
 *  that failed to load is an invitation to reconstruct one. Identical wording to the route. */
const MARKET_RULE =
  `\n\nThe MEASURED MARKET BENCHMARK block in the user message is measured, not estimated: a daily scan of first-party job boards` +
  ` counted every requisition and every skill in it. You quote those numbers; you do not produce them. Never compute, adjust, average,` +
  ` project, rescale or round a market number, and never state one that is not written in that block. If you are asked for a market number` +
  ` the block does not contain, say plainly that you do not have it and say what the block does cover. Percentages there are already` +
  ` rounded whole numbers over a stated denominator, so quote the denominator with them.`;

async function askLumen(prompt, context = "") {
  if (process.env.LUMEN_ASK_URL && process.env.LUMEN_INTERNAL_API_KEY) {
    const response = await fetch(process.env.LUMEN_ASK_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-lumen-internal-key": process.env.LUMEN_INTERNAL_API_KEY }, body: JSON.stringify({ prompt, context }), signal: AbortSignal.timeout(30_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.answer) throw new Error(data.error || `Lumen Ask request failed with ${response.status}`);
    return data.answer;
  }
  if (!process.env.MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY is not configured on Render");
  const learning = { books: readJson("data/library-context.json"), repositories: readJson("data/repository-context.json"), lesson: readJson("data/lesson-context.json"), plan: readJson("data/workbook.json").Plan.slice(1).map((r) => ({ track: r[0], month: r[1], topic: r[2], hours: r[13] })) };
  // Two reads, one budget, and neither can fail the tool: both resolve null on every path and
  // `marketContext` returns "" for a pair of nulls, leaving this prompt as it was before.
  const [benchmark, insight] = await Promise.all([readMarketReport("reports/market/benchmark.json"), readMarketReport("reports/market/insight.json")]);
  const market = marketContext(benchmark, insight);
  const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, temperature: 0.4, max_completion_tokens: 1600, stream: false, messages: [{ role: "system", content: `You are Lumen, a Senior FDE learning guide. Explain in fifth-grade reading language while keeping technical meaning exact. Use short sentences, define jargon immediately, give one technical example, connect it to production and FDE interviews, and finish with one practical next step. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. Indexed context:\n${JSON.stringify(learning)}${market ? MARKET_RULE : ""}` }, { role: "user", content: `Active plan context:\n${context || "No active topic filter."}${market ? `\n\n${market}` : ""}\n\nQuestion:\n${prompt}` }] }), signal: AbortSignal.timeout(25_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.base_resp?.status_msg || `MiniMax request failed with ${response.status}`);
  const answer = cleanAnswer(data.choices?.[0]?.message?.content);
  if (!answer) throw new Error("MiniMax returned an empty answer");
  return answer;
}
/**
 * The `/api/v1` prefix is not optional and was missing.
 *
 * Without it every call returned 404, the catch below fell through to a GitHub code search of
 * this repository, and `semantic_search` answered web questions with repo matches — recorded only
 * in an audit line reading "surfsense unavailable, fell back to github". Confirmed against the
 * live OpenAPI spec: the endpoint is /api/v1/workspaces/{id}/scrapers/google_search/scrape, and
 * it returns 200 with organicResults.
 */
async function surfSenseSearch(query, limit, countryCode) {
  if (!process.env.SURFSENSE_API_KEY || !process.env.SURFSENSE_WORKSPACE_ID) throw new Error("SurfSense is not configured. Add SURFSENSE_API_KEY and SURFSENSE_WORKSPACE_ID on Render.");
  const base = (process.env.SURFSENSE_API_URL || "https://api.surfsense.com").replace(/\/$/, "");
  const response = await fetch(`${base}/api/v1/workspaces/${encodeURIComponent(process.env.SURFSENSE_WORKSPACE_ID)}/scrapers/google_search/scrape`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SURFSENSE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ queries: [String(query)], country_code: countryCode || "us", language_code: "en", max_pages_per_query: Math.min(Math.max(Number(limit) || 1, 1), 3) }), signal: AbortSignal.timeout(25_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `SurfSense request failed with ${response.status}`);
  return data;
}
/** `result.json()` alone returned GitHub's `{"message":"Bad credentials"}` as the search result,
 *  and the caller audited it as a success — a failure presented to the model as data. */
async function githubSearch(query, limit) { const result = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(`${query} repo:${repoConfig().repo}`)}&per_page=${Math.min(Number(limit) || 5, 10)}`, { headers: { Authorization: `Bearer ${repoConfig().token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lumen-mcp" } }); const data = await result.json().catch(() => ({})); if (!result.ok) throw new Error(data.message || `GitHub code search failed with ${result.status}`); return data; }
/**
 * Rubric weights. `weekly` used to fall through to the monthly weights by accident while the
 * description advertised three rubrics; there are two, and now both the code and the description
 * say so. quick_check is refused rather than scored: the four-question quiz it graded was
 * replaced by the recall strip (app/recall.tsx, /api/recall), its key exists nowhere in the repo,
 * and the key hardcoded here disagreed with the one the architecture doc records — so any score
 * it returned would be an invented grade against questions the caller cannot have been asked.
 */
const RUBRICS = { weekly: [40, 25, 20, 15], monthly: [40, 25, 20, 15], quarterly: [20, 25, 25, 15, 15] };
async function assessmentScore(assessment, answers) {
  if (assessment === "quick_check") throw new Error("The four-question quick check is retired: it was replaced by the recall strip, and no question bank exists to grade against. Use assessment weekly, monthly or quarterly, or ask for a recall prompt.");
  const weights = RUBRICS[assessment];
  if (!weights) throw new Error(`Unknown assessment: ${assessment}. Use weekly, monthly or quarterly.`);
  if (!Array.isArray(answers) || answers.length < weights.length) throw new Error(`${assessment} needs ${weights.length} ratings of 0-4, one per rubric criterion.`);
  const values = weights.map((_, index) => Math.min(4, Math.max(0, Number(answers[index]) || 0))); const weighted = values.reduce((total, value, index) => total + value / 4 * weights[index], 0); return { assessment, score: Math.round(weighted), scale: 100, rubric: values.map((value, index) => ({ criterion: index + 1, rating: value, weight: weights[index] })), explanation: weighted >= 80 ? "Strong evidence. Explain your tradeoffs aloud and keep the artifact." : weighted >= 60 ? "Good foundation. Rework the weakest rubric area before advancing." : "Pause and rebuild the weakest area with a smaller hands-on exercise.", note: "Scored only, not saved. Record the outcome with record_progress if it changes a topic's status." };
}

/**
 * ---- The measured market, as structured data ----
 *
 * These four tools read the same two reports the dashboard tab reads, from GitHub for the reason
 * `readMarketReport` gives above: the checkout on disk holds whatever reports/market contained at
 * deploy time, and an MCP that quotes a different market than the tab is worse than one that
 * quotes none. They return the stored `statement` of every entry verbatim rather than rephrasing
 * the numbers, so MCP, the tab and the weekly digest say one sentence, not three.
 *
 * Separate from `readMarketReport` and deliberately not a refactor of it: everything from the
 * port banner down to `marketContext` must stay byte-comparable with app/api/ask/route.ts, which
 * this process cannot import and this file does not own. This one differs in the two ways that
 * matter here — it keeps the failure reason, because for these tools the market IS the answer and
 * a silently missing block reads as "no gaps found"; and it allows longer than the ask path's 4 s,
 * because there is no 25 s model call downstream to protect and the first request after a
 * free-tier spin-down is the one most likely to be slow.
 */
const MARKET_TOOL_READ_MS = 8000;
/** Scans are daily and a session chains several of these calls; re-fetching 130 KB per call
 *  spends the GitHub budget and the cold instance's time on a file that cannot have changed. */
const MARKET_TTL_MS = 300_000;
const marketCache = new Map();
async function readMarketFile(file) {
  const hit = marketCache.get(file);
  if (hit && Date.now() - hit.at < MARKET_TTL_MS) return { data: hit.data, reason: null };
  let reason = `${file} did not answer within ${MARKET_TOOL_READ_MS} ms`;
  const read = github(file).then((result) => JSON.parse(Buffer.from(result.content, "base64").toString("utf8"))).catch((error) => { reason = `${file}: ${error.message}`; return null; });
  const data = await Promise.race([read, new Promise((resolve) => setTimeout(resolve, MARKET_TOOL_READ_MS, null))]);
  if (data) marketCache.set(file, { data, at: Date.now() });
  return { data, reason: data ? null : reason };
}
async function marketReports() {
  const [benchmark, insight] = await Promise.all([readMarketFile("reports/market/benchmark.json"), readMarketFile("reports/market/insight.json")]);
  return { benchmark: benchmark.data, insight: insight.data, reason: [benchmark.reason, insight.reason].filter(Boolean).join(" | ") };
}
/** Every market response carries this. MARKET_RULE spends five lines forbidding the model to
 *  produce a market number; a number without its scan day and board coverage is how one gets
 *  quoted next week as though it were today's. Movement and velocity ride along here rather than
 *  in a tool of their own — with one scan recorded they are two sentences, not an answer. */
function scanHeader(benchmark, insight) {
  return {
    day: benchmark?.day ?? insight?.day ?? null,
    boardsOk: benchmark?.boardsOk ?? null, boardsTotal: benchmark?.boardsTotal ?? null,
    coreCount: benchmark?.coreCount ?? insight?.reachability?.coreCount ?? null,
    companyCount: benchmark?.companyCount ?? null,
    baseline: benchmark?.baseline ?? null,
    baselineStatement: benchmark?.baselineStatement ?? "",
    movement: benchmark?.movement?.statement ?? "",
    velocity: insight?.velocity?.statement ?? "",
    flagCount: Array.isArray(insight?.flags) ? insight.flags.length : 0
  };
}
/** Explicit, never an omitted block: "no gaps found" and "the scan did not load" are opposite
 *  answers and a caller cannot tell them apart from an absent field. */
const marketUnavailable = (reason) => text({ market: "unavailable", reason: "No completed market scan is readable right now. The daily cron writes reports/market; if it has not run yet, or GitHub was slow on this cold start, there is nothing to quote. Retry once, then say plainly that no scan is available rather than estimating any market number.", detail: reason || "" });
/** The market cites 1-based plan rows and carries no track; the workbook has both. */
function rowContext(row) { const entry = planRow(row); return { row, syllabus_index: row - 1, track: entry?.[0] ?? null }; }
/** Same matcher readiness uses (statusByRow in lib/market/insight.ts): topic trimmed and
 *  lowercased, first plan row wins. Two matchers is how the tab and the MCP end up disagreeing
 *  about which rows are done. */
let rowsByTopic = null;
function rowForTopic(topic) { if (!rowsByTopic) { rowsByTopic = new Map(); const plan = planRows(); for (let n = 1; n < plan.length; n++) { const key = String(plan[n]?.[2] ?? "").trim().toLowerCase(); if (key && !rowsByTopic.has(key)) rowsByTopic.set(key, n); } } return rowsByTopic.get(String(topic ?? "").trim().toLowerCase()) ?? null; }
let rowsByTopicSlug = null;
function rowForTopicSlug(value) { if (!rowsByTopicSlug) { rowsByTopicSlug = new Map(); const plan = planRows(); for (let n = 1; n < plan.length; n++) { const key = slug(plan[n]?.[2], ""); if (key && !rowsByTopicSlug.has(key)) rowsByTopicSlug.set(key, n); } } return rowsByTopicSlug.get(value) ?? null; }
/** Statuses readiness counts as done, mirrored from DONE_STATUSES in lib/market/insight.ts —
 *  this process cannot import that file. Analytics previously recognised none of
 *  complete/completed/finished, so one event could be done for readiness and nothing here. */
const DONE_STATUSES = new Set(["done", "complete", "completed", "finished"]);
/** Longest first, or "-completed" is truncated to "complete" and the topic keeps a stray "d". */
const STATUS_SLUGS = ["not-started", "in-progress", "completed", "complete", "finished", "skipped", "done"];
/**
 * Progress files are named `${isoStamp}-${slug(topic)}-${slug(status)}.md` by this server and by
 * app/api/progress. Parsing the name is what lets analytics report per-topic status and hours
 * without fetching all 100 files — 100 serialised GitHub reads on a sleeping free instance is not
 * a summary, it is a timeout.
 */
function parseProgressName(name) {
  const base = String(name).replace(/\.md$/, "");
  const stamp = base.match(/^(\d{4}-\d{2}-\d{2})T[\d-]+Z-(.+)$/);
  if (!stamp) return null;
  const statusSlug = STATUS_SLUGS.find((value) => stamp[2].endsWith(`-${value}`));
  const topicSlug = statusSlug ? stamp[2].slice(0, -(statusSlug.length + 1)) : stamp[2];
  const row = rowForTopicSlug(topicSlug);
  return { date: stamp[1], topicSlug, row, topic: row ? planRow(row)[2] : null, status: statusSlug ? statusSlug.replaceAll("-", "_") : "unknown" };
}
async function listProgress() { try { const items = await github("reports/progress"); return items.sort((a, b) => String(b.name).localeCompare(String(a.name))); } catch (error) { if (String(error.message).includes("Not Found")) return []; throw error; } }

async function callTool(name, args = {}) {
  if (name === "get_plan") {
    const plan = planRows(); const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 119); const matches = [];
    for (let n = 1; n < plan.length; n++) {
      const row = plan[n];
      if (args.row && Number(args.row) !== n) continue;
      if (args.query && !String(row[2]).toLowerCase().includes(String(args.query).toLowerCase())) continue;
      if (args.month && Number(row[1]) !== Number(args.month)) continue;
      if (args.track && !String(row[0]).toLowerCase().includes(String(args.track).toLowerCase())) continue;
      matches.push({ index: n - 1, row: n, track: row[0], month: row[1], topic: row[2], depth: row[3], hours: row[13], deliverable: row[14], status: row[15], read: { label: row[4], url: row[5] }, watch: { label: row[7], url: row[8] }, do: { label: row[10], url: row[11] } });
    }
    // Unfiltered, the whole plan is ~131 KB — roughly 33k tokens of a caller's context for "show
    // me the plan". Truncating silently would be worse than truncating loudly, hence total/returned.
    return text({ total: matches.length, returned: Math.min(matches.length, limit), note: "`row` is the 1-based plan row market statements cite; `index` is row - 1, what get_syllabus takes. `status` is the frozen workbook baseline, not progress - use get_progress_analytics for what is done.", rows: matches.slice(0, limit) });
  }
  if (name === "get_learning_context") return text({ books: readJson("data/library-context.json"), repositories: readJson("data/repository-context.json"), lesson: readJson("data/lesson-context.json"), note: "One lesson context file, currently Shell Mastery and Scripting. It is not selectable per topic; get_syllabus has the per-topic material." });
  if (name === "get_syllabus") {
    const all = readJson("data/curriculum.json").topics || {};
    // `row` is 1-based because every market statement is; `index` is the 0-based key the syllabus
    // is stored under. Accepting only the latter meant a caller handed "row 28" fetched row 29.
    const index = args.row !== undefined && args.row !== null ? Number(args.row) - 1 : args.index !== undefined && args.index !== null ? Number(args.index) : null;
    if (index !== null) { const one = all[String(index)]; return text(one ? { ...one, index, row: index + 1 } : { error: `No syllabus for syllabus index ${index} (plan row ${index + 1}).`, detailed: Object.keys(all).length }); }
    const q = String(args.query || "").trim().toLowerCase(); const hits = Object.values(all).filter((s) => !q || String(s.topic).toLowerCase().includes(q) || String(s.track).toLowerCase().includes(q));
    if (q && hits.length === 1) return text({ ...hits[0], index: hits[0].i, row: hits[0].i + 1 });
    return text(hits.map((s) => ({ index: s.i, row: s.i + 1, topic: s.topic, track: s.track, month: s.month, hours: s.hours, parts: s.subtopics.length })));
  }
  if (name === "ask_lumen") { const answer = await askLumen(args.prompt, args.context); audit("ask_lumen", true); return text({ answer, model: "MiniMax-M3" }); }
  if (name === "list_ask_reports") { let result; try { result = await github("reports/asks"); } catch (error) { if (String(error.message).includes("Not Found")) return text([]); throw error; } return text(result.slice(0, Math.min(Number(args.limit) || 20, 50)).map((item) => ({ name: item.name, path: item.path, url: item.html_url }))); }
  if (name === "read_ask_report") {
    const requested = String(args.path || "");
    // The prefix check alone did not hold: the value is interpolated into a URL, and WHATWG URL
    // parsing collapses `..` (and %2e%2e) before the request leaves the process, so
    // "reports/asks/../../data/workbook.json" resolved to data/workbook.json. Reject traversal
    // before the prefix is ever consulted.
    if (/\.\.|%2e/i.test(requested)) throw new Error("Path traversal is not allowed");
    if (!requested.startsWith("reports/asks/")) throw new Error("Only reports/asks paths can be read");
    const result = await github(requested); return text(Buffer.from(result.content, "base64").toString("utf8"));
  }
  if (name === "save_study_note") { if (!String(args.title || "").trim() || !String(args.body || "").trim()) throw new Error("title and body are both required and must not be empty"); const title = slug(args.title, "study-note"); const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const notePath = `reports/notes/${stamp}-${title}.md`; const markdown = `# ${args.title}\n\nDate: ${new Date().toISOString()}\n\n${args.body}\n`; const result = await github(notePath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `docs: save study note ${title}`, content: Buffer.from(markdown).toString("base64"), branch: repoConfig().branch }) }); audit("save_study_note", true); await durableAudit("save_study_note", { path: notePath }); return text({ saved: true, path: notePath, url: result.content?.html_url }); }
  if (name === "record_progress") {
    const topic = String(args.topic ?? "").trim(); if (!topic) throw new Error("topic is required");
    const status = String(args.status ?? "");
    // The schema declares the enum; nothing enforced it, so slug(undefined) wrote "Status:
    // undefined" into a durable file that no consumer can read back as a status.
    if (!["not_started", "in_progress", "done", "skipped"].includes(status)) throw new Error(`status must be one of not_started, in_progress, done, skipped (received ${JSON.stringify(args.status)})`);
    const row = rowForTopic(topic);
    const stampIso = new Date().toISOString(); const stamp = stampIso.replace(/[:.]/g, "-"); const progressPath = `reports/progress/${stamp}-${slug(topic, "topic")}-${slug(status, "status")}.md`; const markdown = `# Progress update\n\nTopic: ${topic}\nStatus: ${status}\nDate: ${stampIso}\n\n${args.notes ? `Notes:\n${args.notes}\n` : ""}`;
    const result = await github(progressPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `study: record ${status} progress`, content: Buffer.from(markdown).toString("base64"), branch: repoConfig().branch }) });
    audit("record_progress", true, `${topic} -> ${status}${row ? ` (row ${row})` : " (no plan row)"}`); await durableAudit("record_progress", { topic, status, row });
    // Readiness matches events to plan rows by exact topic string. A near-miss used to save
    // cleanly, report {saved:true}, and contribute nothing to readiness with no signal anywhere —
    // the one failure that looks exactly like success. Saved either way, said out loud either way.
    const near = row ? [] : planRows().slice(1).map((entry) => entry[2]).filter((value) => { const a = String(value).toLowerCase(); const b = topic.toLowerCase(); return a.includes(b) || b.includes(a); }).slice(0, 5);
    return text({ saved: true, path: progressPath, url: result.content?.html_url, matchedPlanRow: row, syllabus_index: row ? row - 1 : null, ...(row ? {} : { warning: "This topic matches no plan row, so readiness and get_progress_analytics will not count it. Re-record with the verbatim plan topic to make it count.", didYouMean: near }) });
  }
  if (name === "get_progress_history") { const items = await listProgress(); return text(items.slice(0, Math.min(Number(args.limit) || 30, 100)).map((item) => { const parsed = parseProgressName(item.name); return { name: item.name, path: item.path, url: item.html_url, date: parsed?.date ?? null, topic: parsed?.topic ?? parsed?.topicSlug ?? null, status: parsed?.status ?? null, row: parsed?.row ?? null, matchedPlanRow: Boolean(parsed?.row) }; })); }
  if (name === "get_progress_analytics") {
    const items = await listProgress();
    // Per topic, newest event wins — the same rule readiness applies. Counting per event called
    // one topic taken from in_progress to done two topics, under a heading labelled "status".
    const byTopic = new Map(); const unmatched = new Map();
    for (const item of items) {
      const parsed = parseProgressName(item.name); if (!parsed) continue;
      const bucket = parsed.row ? byTopic : unmatched; const key = parsed.row ?? parsed.topicSlug;
      if (!bucket.has(key)) bucket.set(key, { ...parsed, url: item.html_url });
    }
    const counts = { not_started: 0, in_progress: 0, done: 0, skipped: 0, unknown: 0 };
    let hours = 0;
    for (const entry of byTopic.values()) { const done = DONE_STATUSES.has(entry.status); if (done) { counts.done += 1; hours += Number(planRow(entry.row)?.[13]) || 0; } else if (counts[entry.status] === undefined) counts.unknown += 1; else counts[entry.status] += 1; }
    return text({
      events: items.length, topics: byTopic.size, counts,
      hours: { done: Math.round(hours * 10) / 10, activePlanHours: ACTIVE_HOURS, completionPct: Math.round(hours / ACTIVE_HOURS * 100) },
      rowsDone: [...byTopic.values()].filter((entry) => DONE_STATUSES.has(entry.status)).map((entry) => ({ row: entry.row, syllabus_index: entry.row - 1, topic: entry.topic, date: entry.date })),
      recent: [...items].slice(0, 10).map((item) => { const parsed = parseProgressName(item.name); return { date: parsed?.date ?? null, topic: parsed?.topic ?? parsed?.topicSlug ?? null, status: parsed?.status ?? null, row: parsed?.row ?? null, url: item.html_url }; }),
      unmatched: [...unmatched.values()].map((entry) => ({ topicSlug: entry.topicSlug, status: entry.status, date: entry.date, url: entry.url })),
      note: `History is append-only and counted per topic, newest event first. ${unmatched.size} event topic(s) match no plan row and count toward nothing, here or in readiness.${items.length >= 1000 ? " GitHub returned the 1000-file directory maximum; older events are not counted." : ""}`
    });
  }
  if (name === "score_assessment") { const result = await assessmentScore(args.assessment, args.answers); audit("score_assessment", true); return text(result); }
  if (name === "semantic_search") { const requested = args.provider; let provider = requested || (process.env.SURFSENSE_API_KEY ? "surfsense" : "github"); let result; if (provider === "surfsense") { try { result = await surfSenseSearch(args.query, args.limit, args.country_code); } catch (error) { if (requested === "surfsense") throw error; audit("semantic_search", false, `surfsense unavailable, fell back to github: ${error.message}`); provider = "github"; } } if (provider === "github") result = await githubSearch(args.query, args.limit); audit("semantic_search", true, provider); return text({ provider, result }); }
  if (name === "get_audit_log") {
    const limit = Math.min(Number(args.limit) || 50, 100);
    // The in-process array is emptied by every free-tier spin-down, and durableAudit has been
    // writing reports/audit since it was added with nothing on earth reading the directory back.
    let durable = [];
    if (args.durable !== false) { try { durable = (await github("reports/audit")).sort((a, b) => String(b.name).localeCompare(String(a.name))).slice(0, limit).map((item) => ({ name: item.name, url: item.html_url })); } catch (error) { if (!String(error.message).includes("Not Found")) audit("get_audit_log", false, error.message); } }
    return text({ inProcess: auditEvents.slice(0, limit), durable, note: "inProcess covers this instance only and is lost when Render sleeps. durable is reports/audit in GitHub, which the two repo-writing tools append to." });
  }
  if (name === "get_connection_map") { const { repo, branch } = repoConfig(); return text({ dashboard: process.env.LUMEN_DASHBOARD_URL || "https://lumen-fde.vercel.app", github: `https://github.com/${repo}/tree/${branch}`, mcp: process.env.PUBLIC_MCP_URL || "https://lumen-fde.onrender.com/mcp", durableSource: "GitHub reports/asks, reports/notes, reports/progress, reports/audit, and reports/market", semanticSearch: process.env.SURFSENSE_API_KEY ? "SurfSense Google Search enabled" : "GitHub repository fallback enabled; add SURFSENSE_API_KEY and SURFSENSE_WORKSPACE_ID for live search", uptime: "Render free tier may sleep after inactivity" }); }

  if (name === "get_market_priorities") {
    const { benchmark, insight, reason } = await marketReports();
    if (!insight) return marketUnavailable(reason);
    const readiness = insight.readiness;
    const rows = readiness.marginal
      .filter((entry) => (!args.max_month || Number(entry.month) <= Number(args.max_month)) && (!args.track || String(rowContext(entry.row).track ?? "").toLowerCase().includes(String(args.track).toLowerCase())))
      .map((entry) => ({ ...rowContext(entry.row), topic: entry.topic, hours: entry.hours, month: entry.month, status: entry.status, from: entry.from, to: entry.to, gainPoints: entry.gainPoints, skills: entry.skills, statement: entry.statement }));
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 27);
    return text({
      scan: scanHeader(benchmark, insight),
      readiness: { pct: readiness.pct, evidencedWeight: readiness.evidencedWeight, totalWeight: readiness.totalWeight, skillCount: readiness.skillCount, weekAgoPct: readiness.weekAgoPct, deltaPoints: readiness.deltaPoints, eventCount: readiness.eventCount, matchedCount: readiness.matchedCount, statement: readiness.statement },
      total: readiness.marginal.length, returned: Math.min(rows.length, limit), priorities: rows.slice(0, limit),
      ...(args.include_segments === false ? {} : { segments: insight.segments.map((segment) => ({ rank: segment.rank, id: segment.id, statement: segment.statement })) }),
      note: "Ranked by the readiness points finishing each row buys, weighted by how often the market asks for the skills it clears. `row` is 1-based as the statements cite it; `syllabus_index` is row - 1, what get_syllabus and get_plan take."
    });
  }
  if (name === "get_market_reach") {
    const { benchmark, insight, reason } = await marketReports();
    if (!insight) return marketUnavailable(reason);
    const reach = insight.reachability;
    // Default is the slice that needs no move: india-remote, india-office and emea-apac-remote,
    // which is exactly what inIndiaCount counts. `roles` only ever holds those, so a request for
    // relocate-sponsor or out-of-reach gets an honest empty list rather than a silent one.
    const inIndiaTiers = ["india-remote", "india-office", "emea-apac-remote"];
    const wanted = args.tier ? [String(args.tier)] : inIndiaTiers;
    const roles = reach.roles.filter((role) => wanted.includes(role.tier));
    const skillsLimit = args.skills_limit === undefined ? 10 : Math.min(Math.max(Number(args.skills_limit) || 0, 0), 34);
    return text({
      scan: scanHeader(benchmark, insight),
      statement: reach.statement,
      counts: { coreCount: reach.coreCount, reachableCount: reach.reachableCount, reachablePct: reach.reachablePct, reachableCompanies: reach.reachableCompanies, inIndiaCount: reach.inIndiaCount, inIndiaPct: reach.inIndiaPct, inIndiaCompanies: reach.inIndiaCompanies, derivedCount: reach.derivedCount },
      // Never drop this caveat: a requisition tiered from its location string alone never had its
      // body read, and the body pass only ever moves reqs OUT of reach. A derived corpus overstates.
      derivedCaveat: `${reach.derivedCount} of ${reach.coreCount} requisitions were tiered from the location string alone, without the visa, clearance or US-person clauses in the body. Those clauses only ever remove reach, so this is an upper bound.`,
      tiers: reach.tiers.map((tier) => ({ tier: tier.tier, count: tier.count, pct: tier.pct, companies: tier.companies, statement: tier.statement })),
      roles: roles.map((role) => ({ company: role.company, title: role.title, location: role.location, url: role.url, tier: role.tier, statement: role.statement })),
      ...(roles.length ? {} : { rolesNote: `No named roles in tier ${args.tier}. Named roles are stored only for the ${reach.inIndiaCount} requisitions takeable without leaving India; the tier counts above still cover all ${reach.coreCount}.` }),
      skills: skillsLimit ? reach.skills.slice(0, skillsLimit).map((skill) => ({ id: skill.id, label: skill.label, marketPct: skill.marketPct, reachablePct: skill.reachablePct, deltaPoints: skill.deltaPoints, statement: skill.statement })) : [],
      skillsTotal: reach.skills.length
    });
  }
  if (name === "get_market_skill") {
    const { benchmark, insight, reason } = await marketReports();
    if (!benchmark) return marketUnavailable(reason);
    const scan = scanHeader(benchmark, insight);
    const reachSkills = new Map((insight?.reachability?.skills ?? []).map((skill) => [skill.id, skill]));
    const marginal = new Map((insight?.readiness?.marginal ?? []).map((entry) => [entry.row, entry]));
    const detail = (entry) => ({ id: entry.id, label: entry.label, pct: entry.pct, hits: entry.hits, reqs: entry.reqs, companies: entry.companies, totalCompanies: entry.totalCompanies, ...rowContext(entry.primaryRow), rows: entry.rows.map((ref) => ({ ...rowContext(ref.row), topic: ref.topic, month: ref.month, hours: ref.hours, status: ref.status })), evidence: entry.evidence, statement: entry.statement, reachable: reachSkills.get(entry.id) ?? null, marginal: marginal.get(entry.primaryRow) ?? null });
    if (args.row !== undefined && args.row !== null) {
      const row = Number(args.row); const hits = benchmark.coverage.filter((entry) => entry.primaryRow === row || entry.rows.some((ref) => ref.row === row));
      return text({ scan, ...rowContext(row), topic: planRow(row)?.[2] ?? null, marginal: marginal.get(row) ?? null, skills: hits.map(detail), ...(hits.length ? {} : { note: `No mapped skill lists plan row ${row}. The market does not measurably ask for what that row teaches, which is the same finding get_market_plan_risk reports at track level.` }) });
    }
    if (args.skill) {
      const q = String(args.skill).trim().toLowerCase(); const hits = benchmark.coverage.filter((entry) => entry.id.toLowerCase() === q || entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q));
      if (!hits.length) return text({ scan, error: `No mapped skill matches ${JSON.stringify(args.skill)}. Call get_market_skill with no arguments for the 34-skill index.` });
      return text({ scan, matched: hits.length, skills: hits.map(detail) });
    }
    return text({ scan, total: benchmark.coverage.length, index: benchmark.coverage.map((entry) => ({ id: entry.id, label: entry.label, pct: entry.pct, reachablePct: reachSkills.get(entry.id)?.reachablePct ?? null, ...rowContext(entry.primaryRow) })), note: "The 34 mapped skills, ranked by share of core requisitions. Pass skill or row for the evidence, the plan rows that teach it, and the readiness gain." });
  }
  if (name === "get_market_plan_risk") {
    const { benchmark, insight, reason } = await marketReports();
    if (!benchmark) return marketUnavailable(reason);
    const kind = args.kind || "both"; const limit = Math.min(Math.max(Number(args.limit) || 13, 1), 13);
    return text({
      scan: scanHeader(benchmark, insight),
      ...(kind === "over_invested" ? {} : { gapsTotal: benchmark.gaps.length, gaps: benchmark.gaps.slice(0, limit).map((gap) => ({ id: gap.id, label: gap.label, ...rowContext(gap.nearestRow), rows: gap.rows.map((ref) => ({ ...rowContext(ref.row), topic: ref.topic, month: ref.month, hours: ref.hours })), statedFrequency: gap.statedFrequency, whyNotCovered: gap.whyNotCovered, statement: gap.statement })) }),
      ...(kind === "gaps" ? {} : { overInvestedTotal: benchmark.overInvestedTotal, overInvested: benchmark.overInvested.slice(0, limit).map((track) => ({ track: track.track, rowRange: track.rowRange, rowCount: track.rowCount, hours: track.hours, monthFrom: track.monthFrom, monthTo: track.monthTo, sharePct: track.sharePct, measuredJdFrequency: track.measuredJdFrequency, note: track.note, statement: track.statement })) })
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}
/**
 * Refuse by default. This returned true for every request whenever MCP_API_KEY was unset — a
 * fail-open guard in front of save_study_note and record_progress, which commit to the repo with
 * GITHUB_TOKEN. mcp/render.yaml declares no envVars, so nothing in this repo guarantees the
 * variable exists; the key is set on the live service and only that made it latent rather than
 * live. github() already refuses outright without a token, and this now behaves the same way.
 * Returns null when the request may proceed, otherwise the status and message to send.
 */
function authError(request) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return { status: 503, message: "MCP_API_KEY is not configured" };
  const given = Buffer.from(request.headers.authorization || ""); const wanted = Buffer.from(`Bearer ${expected}`);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return { status: 401, message: "Unauthorized" };
  return null;
}
function rateLimited(request) { const key = request.headers.authorization || request.socket.remoteAddress || "anonymous"; const now = Date.now(); const values = (rateBuckets.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS); values.push(now); rateBuckets.set(key, values); for (const [bucket, times] of rateBuckets) if (times.every((time) => now - time >= RATE_WINDOW_MS)) rateBuckets.delete(bucket); return values.length > RATE_LIMIT; }
function send(response, id, result, error) { response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Mcp-Protocol-Version": PROTOCOL_VERSION, "Access-Control-Allow-Origin": "*" }); response.end(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error: { code: -32000, message: error } } : { result }) })); }
const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") { response.writeHead(200, { "Content-Type": "application/json" }); return response.end(JSON.stringify({ ok: true, service: "lumen-mcp" })); }
  if (request.method === "OPTIONS" && request.url === "/mcp") { response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Allow-Methods": "POST, OPTIONS" }); return response.end(); }
  if (request.method !== "POST" || request.url !== "/mcp") { response.writeHead(404); return response.end("Not found"); }
  const denied = authError(request);
  if (denied) { audit("auth", false, denied.message); response.writeHead(denied.status); return response.end(denied.message); }
  if (rateLimited(request)) { audit("rate_limit", false, "request window exceeded"); response.writeHead(429, { "Retry-After": "60" }); return response.end("Rate limit exceeded"); }
  let raw = ""; let overflowed = false;
  // destroy() reset the socket, so an oversized body reached the client as a transport failure
  // with nothing to read. Answer it, then stop reading.
  request.on("data", (chunk) => { if (overflowed) return; raw += chunk; if (raw.length > MAX_BODY) { overflowed = true; send(response, null, null, `Request body exceeds ${MAX_BODY} bytes`); request.destroy(); } });
  request.on("end", async () => {
    if (overflowed) return;
    let body; try { body = JSON.parse(raw); } catch { return send(response, null, null, "Invalid JSON"); }
    if (body.method === "notifications/initialized") { response.writeHead(202); return response.end(); }
    // Echo the version the client asked for when it named one; replying with a hardcoded version
    // regardless of the request is how a client and server end up disagreeing about the wire.
    if (body.method === "initialize") return send(response, body.id, { protocolVersion: typeof body.params?.protocolVersion === "string" ? body.params.protocolVersion : PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "lumen-mcp", version: "1.2.0" } });
    if (body.method === "tools/list") return send(response, body.id, { tools });
    if (body.method === "tools/call") {
      const name = body.params?.name || "unknown";
      try {
        // Only five of the tools audited themselves, so "recent MCP actions" could not see a
        // single read. Handlers that logged their own line with detail are left alone.
        const before = auditEvents.length;
        const result = await callTool(name, body.params?.arguments);
        if (auditEvents.length === before) audit(name, true);
        return send(response, body.id, result);
      } catch (error) {
        audit(name, false, error.message);
        // A tool that fails is a result, not a protocol fault: -32000 arrives as a transport error
        // the model cannot read, so "GITHUB_TOKEN is not configured" never reaches it as text.
        return send(response, body.id, { ...text(`Tool ${name} failed: ${String(error.message || error)}`), isError: true });
      }
    }
    return send(response, body.id, null, `Unsupported method: ${body.method}`);
  });
});
server.listen(Number(process.env.PORT) || 10000, "0.0.0.0", () => console.log("lumen-mcp listening"));
