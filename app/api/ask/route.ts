import { NextResponse } from "next/server";
import library from "@/data/library-context.json";
import sourceCatalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";
import lesson from "@/data/lesson-context.json";
import curriculum from "@/data/curriculum.json";
import workbook from "@/data/workbook.json";
import { BENCHMARK_PATH, INSIGHT_PATH, readJson } from "@/lib/market/store";
// Type-only, so the pure computation modules stay out of this route's runtime graph. The
// numbers are read as JSON that the cron already computed; nothing here recomputes them.
import type { Benchmark } from "@/lib/market/benchmark";
import type { Insight } from "@/lib/market/insight";

export const maxDuration = 60;

type Syllabus = { topic: string; why: string; prerequisites: string[]; subtopics: { name: string; learn: string }[]; outcomes: string[]; failureModes: string[] };
// A compact rendering of one topic's deep syllabus, so answers are grounded in what the plan
// actually asks the learner to know. Capped so it cannot crowd out the question.
function syllabusContext(index: number | undefined) {
  if (index === undefined || index === null) return "";
  const s = (curriculum as { topics: Record<string, Syllabus> }).topics[String(index)];
  if (!s) return "";
  const parts = s.subtopics.map((x, i) => `${i + 1}. ${x.name}: ${x.learn}`).join("\n");
  const text = `Deep syllabus for "${s.topic}":\nWhy: ${s.why}\nPrerequisites: ${s.prerequisites.join("; ")}\nParts:\n${parts}\nOutcomes: ${s.outcomes.join(" | ")}\nProduction failure modes: ${s.failureModes.join(" | ")}`;
  return text.length > 7000 ? `${text.slice(0, 7000)}…` : text;
}


/**
 * The whole plan, compactly, built HERE rather than trusted from the client.
 *
 * This is the fix for a real failure: the client sent `filtered.slice(0, 8)`, so Lumen only
 * ever saw 8 of 119 topics — unfiltered, that is tracks A and B. Asked about a machine
 * learning book it correctly answered "there is no ML topic in the visible plan", because
 * tracks M, N and O (192h of maths, ML systems and deep learning) were never in the prompt.
 * The model reasoned correctly from a plan we had truncated to 6%.
 *
 * One line per topic keeps all 119 well inside the context window, and grounding is built
 * server-side so no caller can silently narrow it again.
 */
type PlanRow = (string | number | null)[];
function planMap() {
  const rows = (workbook.Plan as PlanRow[]).slice(1);
  const active = rows.filter((r) => String(r[15]).trim().toLowerCase() !== "skipped");
  const byTrack = new Map<string, { n: number; h: number }>();
  for (const r of active) {
    const t = String(r[0]);
    const cur = byTrack.get(t) ?? { n: 0, h: 0 };
    byTrack.set(t, { n: cur.n + 1, h: cur.h + Number(r[13] || 0) });
  }
  const tracks = [...byTrack.entries()].map(([t, v]) => `${t} — ${v.n} topics, ${v.h}h`).join("\n");
  const lines = active.map((r, i) => `${i}. [M${r[1]}] ${r[0]} :: ${r[2]} (${r[13]}h) — ${r[15]}`).join("\n");
  return `THE FULL PLAN — ${active.length} active topics, ${active.reduce((n, r) => n + Number(r[13] || 0), 0)}h across ${byTrack.size} tracks.\nThis is the complete plan; nothing is hidden from you.\n\nTracks:\n${tracks}\n\nEvery topic:\n${lines}`;
}

/**
 * The market injection's own ceiling, the same 7000 `syllabusContext` uses.
 *
 * The two blocks are never both at their limit in practice — a syllabus is only built when a
 * topic filter is active — but the reason for the number is identical in both places: a
 * question arriving at the bottom of fifteen thousand characters of grounding is a question the
 * model reads last and weights least. The market is context for the question, never the subject
 * of it unless the learner made it so.
 */
const MARKET_CAP = 7000;

/** Enough of the coverage table to answer "what does the market ask for" without being it. */
const COVERAGE_LINES = 10;
/** Spec section 1: the marginal table is the deliverable, and its head is where the answer is. */
const MARGINAL_LINES = 5;

/**
 * How long the two market reads may take before the question goes on without them.
 *
 * `readJson` passes no signal to `fetch`, so on its own it inherits the platform default and
 * can outlive this function. The budget it has to fit inside is exact: `maxDuration` is 60 s
 * and the MiniMax call below already claims 55 of them, so everything in front of the model has
 * about five seconds. A GitHub that hangs must cost the market block, not the answer.
 */
const MARKET_READ_MS = 4000;

/**
 * benchmark.json and insight.json, read from the repo at request time.
 *
 * Deliberately not `import`ed the way curriculum.json and workbook.json are. Those are
 * committed inputs and bundling them is correct; these two are rewritten by the daily cron, so
 * a bundled copy would pin every number Quaere quotes to whenever the dashboard was last
 * deployed and present a stale market as the live one.
 *
 * Both reads run in parallel against one budget rather than two, and every failure — no
 * GITHUB_TOKEN, a 404 before the first scan, an outage, the timeout — resolves to null and the
 * market block is simply absent. `readJson` catches its own errors and reports `synced: false`
 * for "we do not know", which is exactly the case where the honest move is to omit: a question
 * answered without market context is a far smaller loss than one answered from a report that
 * did not load.
 */
async function readMarket<T>(path: string): Promise<T | null> {
  const lapsed = new Promise<null>((resolve) => setTimeout(resolve, MARKET_READ_MS, null));
  return Promise.race([readJson<T>(path).then((file) => file.data), lapsed]);
}

/**
 * The measured market, as a digest rather than as the two JSON files.
 *
 * benchmark.json and insight.json are about 180 KB together. Pasted in, they would bury the
 * question, spend the whole context window on `hits`/`reqs` pairs the model would then have to
 * re-derive percentages from, and hand it every intermediate number as though each were a
 * finding. Both modules already render a `statement` for every row precisely so that the tab,
 * the weekly email and this prompt say the identical sentence; quoting those statements is
 * what keeps a wording or arithmetic fix in one place.
 *
 * Sections are laid down in priority order and coverage goes LAST, which is the opposite of how
 * a human would order them and is the point: coverage is the block that gets trimmed when the
 * budget runs out, and it is the one that degrades gracefully — eight most-asked skills instead
 * of ten still answers "what does the market want", whereas losing the segment ranking or the
 * reachability distribution loses a whole analysis. The trim is not hypothetical: on the first
 * real corpus the personal blocks alone come to 4,192 characters and the assembled digest
 * renders 6,740, holding eight coverage statements and dropping the ninth and tenth skills.
 *
 * Nothing is ever cut mid-statement. A blunt tail slice at 7000 can bisect a numeral — "189
 * distinct requisitions" ending as "18" — and a wrong measured number in the model's context is
 * strictly worse than one fewer skill in the list. The header is written after the fill for the
 * same reason: it states how many entries are actually present rather than how many were asked
 * for, so it cannot describe a list the budget shortened.
 */
function marketContext(benchmark: Benchmark | null, insight: Insight | null) {
  const lines: string[] = [];
  if (benchmark) {
    lines.push(
      `MEASURED MARKET BENCHMARK - scanned ${benchmark.day}, ${benchmark.boardsOk} of ${benchmark.boardsTotal} first-party job boards.`,
      benchmark.coreStatement,
      benchmark.adjacentStatement,
    );
  }
  if (insight) {
    lines.push(
      "",
      insight.reachability.statement,
      insight.reachability.tiers.map((tier) => `${tier.tier} ${tier.count} (${tier.pct}%)`).join(" | "),
      "",
      insight.readiness.statement,
      ...insight.readiness.marginal.slice(0, MARGINAL_LINES).map((entry) => entry.statement),
      "",
      "SEGMENT FIT - ranked by how many requisitions in each segment are reachable today, readiness breaking ties:",
      ...insight.segments.map((segment) => `${segment.rank}. ${segment.statement}`),
      "",
      insight.velocity.statement,
    );
  }
  if (!lines.length) return "";

  const kept: string[] = [];
  if (benchmark) {
    const header = (n: number) => `MOST-ASKED SKILLS - the ${n} most-asked of ${benchmark.coverage.length} mapped skills, by share of core requisitions:`;
    // One character per line for the join, plus the header and its blank line, which are
    // written after the fill and so cannot be part of the running total. Reserved at
    // COVERAGE_LINES because that is the longest the count can render; a round-number reserve
    // was ten characters short of the real header and put the total back over MARKET_CAP,
    // which is exactly the tail slice this whole shape exists to avoid.
    let used = lines.reduce((n, line) => n + line.length + 1, 0) + header(COVERAGE_LINES).length + 2;
    for (const entry of benchmark.coverage.slice(0, COVERAGE_LINES)) {
      if (used + entry.statement.length + 1 > MARKET_CAP) break;
      used += entry.statement.length + 1;
      kept.push(entry.statement);
    }
    if (kept.length) lines.push("", header(kept.length), ...kept);
  }
  const text = lines.join("\n");
  return text.length > MARKET_CAP ? `${text.slice(0, MARKET_CAP)}…` : text;
}

/**
 * The rule that makes the block above safe to inject.
 *
 * Stated only when there is a block to state it about: telling the model to quote a benchmark
 * that failed to load is an invitation to reconstruct one. The separation it names is the whole
 * design — every number in the digest was counted by a scan, and a model-written number sitting
 * among audited ones discredits the audited ones too, which is the same reasoning that makes
 * the weekly email drop any framing paragraph containing a digit.
 */
const MARKET_RULE =
  `\n\nThe MEASURED MARKET BENCHMARK block in the user message is measured, not estimated: a daily scan of first-party job boards` +
  ` counted every requisition and every skill in it. You quote those numbers; you do not produce them. Never compute, adjust, average,` +
  ` project, rescale or round a market number, and never state one that is not written in that block. If you are asked for a market number` +
  ` the block does not contain, say plainly that you do not have it and say what the block does cover. Percentages there are already` +
  ` rounded whole numbers over a stated denominator, so quote the denominator with them.`;

function cleanAnswer(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*/g, "").replace(/[—–]/g, " - ").replace(/\n{3,}/g, "\n\n").trim();
}

async function saveAskReport(prompt: string, context: string, answer: string) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
  if (!token) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ask";
  const path = `reports/asks/${stamp}-${slug}.md`;
  const markdown = `# Lumen Ask\n\nDate: ${new Date().toISOString()}\n\n## Question\n\n${prompt}\n\n## Plan context\n\n${context || "No topic filter was active."}\n\n## Answer\n\n${answer}\n`;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "lumen-fde" }, body: JSON.stringify({ message: `docs: save Lumen ask ${stamp}`, content: Buffer.from(markdown, "utf8").toString("base64"), branch: process.env.GITHUB_BRANCH || "main" }) });
  if (!response.ok) { const error = await response.json().catch(() => ({})) as { message?: string }; console.error("[api/ask] GitHub report save failed", { status: response.status, message: error.message, repo, path }); return null; }
  const data = await response.json() as { content?: { html_url?: string } };
  return data.content?.html_url || `https://github.com/${repo}/blob/${process.env.GITHUB_BRANCH || "main"}/${path}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MiniMax is not configured yet. Add MINIMAX_API_KEY in Vercel project settings." }, { status: 503 });
  try {
    const body = await request.json() as { prompt?: string; context?: string; topicIndex?: number; history?: { role: "user" | "assistant"; content: string }[] };
    if (!body.prompt?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const deep = syllabusContext(body.topicIndex);
    // Two reads, one budget. Neither can fail the request: `readMarket` resolves null on every
    // path, and `marketContext` returns "" for a pair of nulls, which leaves the prompt exactly
    // as it was before the market existed.
    const [benchmark, insight] = await Promise.all([readMarket<Benchmark>(BENCHMARK_PATH), readMarket<Insight>(INSIGHT_PATH)]);
    const market = marketContext(benchmark, insight);
    const messages = [
      { role: "system", content: `You are Quaere, the study guide inside Lumen. Lumen is the dashboard; you are the guide within it. Explain every idea in fifth-grade reading language while keeping the technical meaning exact. Use short sentences, define jargon immediately, give one concrete technical example, connect it to production systems and FDE interviews, and finish with one practical next step. Use the plan, library map, and repository map as supporting context; do not invent progress. The user message contains the COMPLETE plan — every topic across every track. Never tell the learner a subject is missing from the plan without checking that full list first. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. The learner's indexed learning map is:\n${JSON.stringify(library)}\n\nThe local source catalog (metadata and chapter map only) is:\n${JSON.stringify(sourceCatalog)}\n\nThe public repository map is:\n${JSON.stringify(repositories)}${market ? MARKET_RULE : ""}` },
      ...(body.history || []).slice(-8),
      { role: "user", content: `${planMap()}\n\nCurrently visible in the dashboard:\n${body.context || "No topic filter is active."}${deep ? `\n\n${deep}` : ""}${market ? `\n\n${market}` : ""}\n\nQuestion:\n${body.prompt}` },
    ];
    const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, messages, temperature: 0.4, max_completion_tokens: 1600, stream: false }), signal: AbortSignal.timeout(55000) });
    const raw = await response.text();
    let data: { choices?: { message?: { content?: string } }[]; base_resp?: { status_msg?: string } } = {};
    try { data = JSON.parse(raw); } catch { console.error("[api/ask] MiniMax returned non-JSON", { status: response.status }); }
    if (!response.ok) { console.error("[api/ask] MiniMax rejected request", { status: response.status, message: data.base_resp?.status_msg }); return NextResponse.json({ error: "The learning guide is temporarily unavailable. Try again in a moment." }, { status: 502 }); }
    const answer = cleanAnswer(data.choices?.[0]?.message?.content || "");
    if (!answer) { console.error("[api/ask] MiniMax returned an empty answer", { status: response.status }); return NextResponse.json({ error: "The learning guide returned an empty answer. Try asking again." }, { status: 502 }); }
    let reportUrl: string | null = null;
    try { reportUrl = await saveAskReport(body.prompt, body.context || "", answer); } catch (error) { console.error("[api/ask] GitHub report save exception", { error: String(error) }); }
    return NextResponse.json({ answer, reportUrl });
  } catch (error) { const message = String(error); console.error("[api/ask] request failed", { error: message }); if (message.includes("TimeoutError") || message.includes("timed out")) return NextResponse.json({ error: "Lumen is taking longer than expected. Try the question again with a shorter prompt." }, { status: 504 }); return NextResponse.json({ error: "Lumen could not reach the learning guide. Try again in a moment." }, { status: 500 }); }
}
