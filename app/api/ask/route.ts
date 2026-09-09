import { NextResponse } from "next/server";
import library from "@/data/library-context.json";
import { applyMemory, readMemory, recurring, writeMemory } from "@/lib/companion/memory";
import { benchmarkGapsContext, evidenceContext, recallContext, workbookContext } from "@/lib/companion/context";
import { readSessionSummary } from "@/lib/companion/session";
import { readArtifacts } from "@/lib/artifacts";
import type { ReviewState } from "@/lib/review";
import sourceCatalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";
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
 *
 * Two things this got wrong for as long as it existed, both of which only bite because the
 * market digest lands in the SAME user message:
 *
 * 1. It listed only the active rows and numbered them 0-based over that filtered list, while
 *    every other citation of a plan row in this codebase is 1-based over all of workbook.Plan
 *    (`PlanRowRef.row`, `page.tsx`'s `planRows[row - 1]`) — and MARKET_RULE tells the model to
 *    quote those numbers verbatim. The offset was not even constant: -1 before the first
 *    skipped row and -3 after it, so "row 59" named one topic in the digest and a different
 *    one in the list, and the model had no way to tell which was meant.
 * 2. It then declared "This is the complete plan; nothing is hidden from you" over a list with
 *    two topics missing. That is the exact failure the function was written to fix — the fix
 *    moved the truncation from 8-of-119 to 117-of-119 rather than removing it, so "does my plan
 *    cover PySpark?" still answers no.
 *
 * So: every row, numbered as workbook.Plan numbers them, and a skipped row says Skipped in its
 * own status field rather than being deleted. The track totals stay over the active rows, since
 * they are a workload figure and skipped hours are not work — labelled as such.
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
  const lines = rows.map((r, i) => `${i + 1}. [M${r[1]}] ${r[0]} :: ${r[2]} (${r[13]}h) — ${r[15]}`).join("\n");
  const skipped = rows.length - active.length;
  return `THE FULL PLAN — all ${rows.length} topics, of which ${active.length} are active (${active.reduce((n, r) => n + Number(r[13] || 0), 0)}h across ${byTrack.size} tracks)`
    + `${skipped ? ` and ${skipped} are marked Skipped — those are listed below too, with Skipped as their status` : ""}.`
    + `\nEvery topic in the plan is in this list; nothing is hidden from you.`
    + `\n\nTracks, counting active topics only:\n${tracks}`
    + `\n\nEvery topic. The number is the plan row number, the same numbering any market benchmark below uses:\n${lines}`;
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
 * Nothing is ever cut mid-statement, on either path: the coverage fill stops on a whole
 * statement, and the cap below it drops whole lines. A wrong measured number in the model's
 * context is strictly worse than one fewer skill in the list. The header is written after the fill for the
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
  if (text.length <= MARKET_CAP) return text;
  // The last resort, and it drops whole lines rather than characters. Only the coverage block
  // is fill-checked above, so the cap is reachable from in front of it — `insight.segments` is
  // mapped with no slice, and a sixth SEGMENT_LABEL would push the pre-coverage block towards
  // 7,000 on its own with `kept` already empty. A character slice there would bisect a
  // statement — "189 distinct requisitions" ending as "18" — and a wrong measured number in the
  // model's context is strictly worse than a shorter digest. Trimming by line keeps the
  // never-cut-mid-statement invariant whichever block grows, rather than depending on the
  // arithmetic in front of it staying true.
  const trimmed: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > MARKET_CAP) break;
    used += line.length + 1;
    trimmed.push(line);
  }
  return trimmed.join("\n");
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

    /**
     * What the companion already knows about this reader.
     *
     * `history` is the current conversation and dies with the panel; this is the part that
     * survives it. Only two things are handed to the model — what it has already explained, so it
     * can stop re-teaching, and what keeps coming back, which is the signal worth acting on. Both
     * are short by construction (the digest is capped at 40 entries a list) so this cannot grow
     * into a context-window problem the way a transcript store would.
     *
     * Best-effort and never fatal: an unreadable digest costs continuity for one answer, and
     * failing the question over it would be a far larger loss than the memory itself.
     */
    let memoryBlock = "";
    let memoryState: Awaited<ReturnType<typeof readMemory>> | null = null;
    try {
      memoryState = await readMemory();
      if (memoryState.synced) {
        const explained = memoryState.memory.explained.slice(0, 8).map((n) => n.key);
        const repeats = recurring(memoryState.memory).slice(0, 5).map((n) => `${n.key} (asked ${n.count} times)`);
        const parts: string[] = [];
        if (explained.length) parts.push(`Already explained to this learner before: ${explained.join("; ")}. Do not re-explain from scratch unless asked.`);
        if (repeats.length) parts.push(`Questions this learner has come back to: ${repeats.join("; ")}. A topic asked repeatedly has not landed; try a different angle.`);
        if (memoryState.memory.sessions > 0) parts.push(`Study sessions recorded so far: ${memoryState.memory.sessions}.`);
        if (parts.length) memoryBlock = `\n\nWhat you already know about this learner:\n${parts.join("\n")}`;
      }
    } catch { /* continuity is not worth failing an answer over */ }
    if (!body.prompt?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    /**
     * Everything else Lumen already knows.
     *
     * These four reads run together rather than in sequence: they are independent, they are all
     * network-bound, and the route already has a 55s ceiling it shares with the model call. Any
     * one of them failing degrades that block to "unknown" rather than failing the question —
     * `Promise.allSettled`, not `all`, for exactly that reason.
     */
    const [artifactsR, sessionsR, reviewR] = await Promise.allSettled([
      readArtifacts(),
      readSessionSummary(),
      readJson<ReviewState>("reports/review/state.json"),
    ]);
    const artifacts = artifactsR.status === "fulfilled" ? artifactsR.value : { artifacts: [], unreadable: 0, synced: false, error: null };
    const sessions = sessionsR.status === "fulfilled" ? sessionsR.value : { count: 0, latest: null, synced: false };
    const review = reviewR.status === "fulfilled"
      ? { state: (reviewR.value.data ?? {}) as ReviewState, synced: reviewR.value.synced }
      : null;

    const deep = syllabusContext(body.topicIndex);
    // Two reads, one budget. Neither can fail the request: `readMarket` resolves null on every
    // path, and `marketContext` returns "" for a pair of nulls, which leaves the prompt exactly
    // as it was before the market existed.
    const [benchmark, insight] = await Promise.all([readMarket<Benchmark>(BENCHMARK_PATH), readMarket<Insight>(INSIGHT_PATH)]);
    const market = marketContext(benchmark, insight);
    const extra = [
      workbookContext(),
      benchmarkGapsContext(benchmark),
      evidenceContext({ artifacts: artifacts.artifacts, synced: artifacts.synced }, sessions),
      recallContext(review, new Date()),
    ].filter(Boolean).join("\n\n");

    const messages = [
      { role: "system", content: `You are Quaere, the study guide inside Lumen. Lumen is the dashboard; you are the guide within it. Explain every idea in fifth-grade reading language while keeping the technical meaning exact. Use short sentences, define jargon immediately, give one concrete technical example, connect it to production systems and FDE interviews, and finish with one practical next step. Use the plan, library map, and repository map as supporting context; do not invent progress. The user message contains the COMPLETE plan — every topic across every track. Never tell the learner a subject is missing from the plan without checking that full list first. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. NEVER state how many recall cards are due, even if you can infer it: say whether recall is waiting. A backlog number is what makes people abandon a spaced-repetition system, and this learner has 23 months left. The learner's indexed learning map is:\n${JSON.stringify(library)}\n\nThe local source catalog (metadata and chapter map only) is:\n${JSON.stringify(sourceCatalog)}\n\nThe public repository map is:\n${JSON.stringify(repositories)}${market ? MARKET_RULE : ""}${memoryBlock}` },
      // Picked field by field, not spread. The client stores an assistant turn as
      // `{role, content, reportUrl?}`, and forwarding a turn that saved a report shipped a
      // `reportUrl` key into an OpenAI-shaped messages array. The declared type hid it from
      // tsc, so only the wire showed it.
      ...(body.history || []).slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `${planMap()}\n\nCurrently visible in the dashboard:\n${body.context || "No topic filter is active."}${deep ? `\n\n${deep}` : ""}${market ? `\n\n${market}` : ""}${extra ? `\n\n${extra}` : ""}\n\nQuestion:\n${body.prompt}` },
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
    /**
     * Remember the exchange — only now, and only because it succeeded.
     *
     * Recorded after the answer, never before: a question that errored was not explained, and a
     * digest that claims otherwise would make Quaere skip an explanation it never gave. What is
     * stored is the question text, normalised and capped, and the topic when one is in view —
     * study facts, not the transcript. `applyMemory` returns the same object when nothing
     * changed, so a repeat within the same day costs no write.
     *
     * Best-effort by construction. The answer is already on its way back; failing the request
     * because a digest write did not land would trade the thing the reader asked for against
     * bookkeeping.
     */
    if (memoryState?.synced && body.prompt) {
      try {
        const topic = typeof body.topicIndex === "number" ? String((workbook.Plan as unknown[][])[body.topicIndex + 1]?.[2] ?? "") : "";
        const next = applyMemory(memoryState.memory, {
          asked: [body.prompt],
          explained: topic ? [topic] : [],
        }, new Date());
        if (next !== memoryState.memory) await writeMemory(next, memoryState.sha);
      } catch { /* the answer matters more than the bookkeeping */ }
    }

    return NextResponse.json({ answer, reportUrl });
  } catch (error) { const message = String(error); console.error("[api/ask] request failed", { error: message }); if (message.includes("TimeoutError") || message.includes("timed out")) return NextResponse.json({ error: "Lumen is taking longer than expected. Try the question again with a shorter prompt." }, { status: 504 }); return NextResponse.json({ error: "Lumen could not reach the learning guide. Try again in a moment." }, { status: 500 }); }
}
