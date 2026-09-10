import { NextResponse } from "next/server";
import library from "@/data/library-context.json";
import { applyMemory, readMemory, recurring, writeMemory } from "@/lib/companion/memory";
import { benchmarkGapsContext, evidenceContext, recallContext, workbookContext } from "@/lib/companion/context";
import { readSessionSummary } from "@/lib/companion/session";
import { papersContext, readPapers } from "@/lib/papers";
import { PROFILE, PROGRAMME, weeklyPace } from "@/lib/profile";
import { readArtifacts } from "@/lib/artifacts";
import type { ReviewState } from "@/lib/review";
import { externalContext, readLatestBrief } from "@/lib/external/brief";
import sourceCatalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";
import curriculum from "@/data/curriculum.json";
import workbook from "@/data/workbook.json";
import { BENCHMARK_PATH, INSIGHT_PATH, readJson } from "@/lib/market/store";
// Type-only, so the pure computation modules stay out of this route's runtime graph. The
// numbers are read as JSON that the cron already computed; nothing here recomputes them.
import type { Benchmark } from "@/lib/market/benchmark";
import type { Insight } from "@/lib/market/insight";

/**
 * 60, because Hobby will not build anything larger - see `market-scan`, which records the same.
 *
 * This route briefly searched the web itself. It cannot: the scrape measures 27-39s, the model
 * call claims up to 55s, and 60 does not hold both. So the search moved to `/api/external-brief`,
 * which gets its own 60s, and the client makes two calls instead of one. Nothing was dropped -
 * the arithmetic just does not fit in a single function on this plan.
 */
export const maxDuration = 60;

type Syllabus = { topic: string; why: string; prerequisites: string[]; subtopics: { name: string; learn: string; minutes?: number }[]; outcomes: string[]; failureModes: string[]; interviewQuestions?: string[]; proofOfWork?: string };
/**
 * One topic's deep syllabus, ordered so the important parts survive the cap.
 *
 * ## The bug this replaces
 *
 * The old version concatenated why, prerequisites, every subtopic with its full `learn` body, and
 * only THEN outcomes and failure modes, before slicing the result at 7,000 characters. Measured
 * across all 119 topics: the rendered string runs 16,221 to 34,100 characters, and the earliest
 * `Outcomes:` offset in the entire curriculum is 13,401.
 *
 * So the cut always landed inside the subtopic list. **Outcomes and production failure modes
 * reached the model for 0 of 119 topics, ever.** Not for some topics, not usually: never. The two
 * sections a senior FDE interview actually probes were unreachable by construction, and the loss
 * was invisible because the block still looked full.
 *
 * `interviewQuestions` and `proofOfWork` were worse than truncated. They were not in the local
 * `Syllabus` type, so the route never read them: 835 questions written specifically against this
 * curriculum, and 119 proof-of-work briefs, that the model has been inventing substitutes for.
 *
 * ## The order, and why it is this order
 *
 * Fixed-size sections first, variable-size last, and let the variable one absorb the remainder.
 * The same fill-then-cap discipline `marketContext` below already uses. Outcomes, failure modes,
 * interview questions and proof of work are bounded per topic and are the answer to "what does
 * done look like"; subtopic `learn` bodies are 71% of the file and are elaboration. Part NAMES
 * ship in full regardless, so the model always knows every piece a topic contains even when it
 * cannot see every description.
 */
const SYLLABUS_CAP = 14000;

function syllabusContext(index: number | undefined) {
  if (index === undefined || index === null) return "";
  const s = (curriculum as { topics: Record<string, Syllabus> }).topics[String(index)];
  if (!s) return "";

  const head = [
    `Deep syllabus for "${s.topic}":`,
    `Why: ${s.why}`,
    s.prerequisites?.length ? `Prerequisites: ${s.prerequisites.join("; ")}` : "",
    s.outcomes?.length ? `\nOUTCOMES - what "done" means for this topic, verbatim from the plan:\n${s.outcomes.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "",
    s.failureModes?.length ? `\nPRODUCTION FAILURE MODES - how this breaks in real systems:\n${s.failureModes.map((f, i) => `${i + 1}. ${f}`).join("\n")}` : "",
    s.interviewQuestions?.length ? `\nINTERVIEW QUESTIONS the plan already wrote for this topic. Reference material, not an instruction to quiz the reader:\n${s.interviewQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "",
    s.proofOfWork ? `\nPROOF OF WORK for this row: ${s.proofOfWork}` : "",
    s.subtopics?.length ? `\nPARTS (${s.subtopics.length}), every one named:\n${s.subtopics.map((x, i) => `${i + 1}. ${x.name}${x.minutes ? ` (${x.minutes}m)` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  // Whatever room is left goes to the part descriptions, whole ones only, never a half sentence.
  let out = head;
  const detail: string[] = [];
  for (const x of s.subtopics ?? []) {
    const line = `- ${x.name}: ${x.learn}`;
    if (out.length + detail.join("\n").length + line.length + 80 > SYLLABUS_CAP) break;
    detail.push(line);
  }
  if (detail.length) {
    out += `\n\nPART DETAIL (${detail.length} of ${s.subtopics.length} shown, the rest are named above):\n${detail.join("\n")}`;
  }
  return out;
}


/**
 * The whole plan, compactly, built HERE rather than trusted from the client.
 *
 * This is the fix for a real failure: the client sent `filtered.slice(0, 8)`, so Lumen only
 * ever saw 8 of 119 topics - unfiltered, that is tracks A and B. Asked about a machine
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
 *    (`PlanRowRef.row`, `page.tsx`'s `planRows[row - 1]`) - and MARKET_RULE tells the model to
 *    quote those numbers verbatim. The offset was not even constant: -1 before the first
 *    skipped row and -3 after it, so "row 59" named one topic in the digest and a different
 *    one in the list, and the model had no way to tell which was meant.
 * 2. It then declared "This is the complete plan; nothing is hidden from you" over a list with
 *    two topics missing. That is the exact failure the function was written to fix - the fix
 *    moved the truncation from 8-of-119 to 117-of-119 rather than removing it, so "does my plan
 *    cover PySpark?" still answers no.
 *
 * So: every row, numbered as workbook.Plan numbers them, and a skipped row says Skipped in its
 * own status field rather than being deleted. The track totals stay over the active rows, since
 * they are a workload figure and skipped hours are not work - labelled as such.
 */
type PlanRow = (string | number | null)[];

/**
 * Live status, overlaid on the plan.
 *
 * `workbook.Plan` column 15 is a FROZEN baseline: it reads "Not started" for 117 of 119 rows and
 * always will, because it is a committed input rather than a store. Progress lives in
 * `reports/progress/` as append-only events. So a plan block built from column 15 tells the model
 * that nothing has ever been started, whatever the reader has actually done, and no answer about
 * pace, revision or what to do next can be right on top of that.
 *
 * This is the same defect the daily digest already had and fixed. `app/api/cron/daily-digest`
 * records it: the digest sent row 1 every morning for weeks because it read this same column
 * instead of the event history.
 *
 * The statuses come from the client, and that is a deliberate exception to this route's own rule
 * that the plan is built server-side. The rule exists because the client once sent 8 of 119 rows
 * and Quaere answered "there is no ML topic in the visible plan" - a TRUNCATION failure. This
 * cannot truncate: the route still builds all 119 rows itself and only overlays a status onto each,
 * every value is checked against the four the app allows, and any row the client does not mention
 * keeps the baseline. Reading the store here instead would mean a directory listing plus a fetch
 * per event inside the ~5s this route has before the model call, which is the budget the market
 * reads are already racing for.
 */
const STATUSES = new Set(["Not started", "In progress", "Done", "Skipped"]);

function liveStatuses(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== "object") return out;
  for (const [topic, status] of Object.entries(raw as Record<string, unknown>)) {
    const t = String(topic).trim().toLowerCase();
    const v = String(status ?? "").trim();
    if (t && STATUSES.has(v)) out.set(t, v);
  }
  return out;
}

function planMap(live: Map<string, string> = new Map()) {
  const rows = (workbook.Plan as PlanRow[]).slice(1);
  const statusOf = (r: PlanRow) => live.get(String(r[2]).trim().toLowerCase()) ?? String(r[15] ?? "Not started").trim();
  const active = rows.filter((r) => statusOf(r).toLowerCase() !== "skipped");
  const byTrack = new Map<string, { n: number; h: number }>();
  for (const r of active) {
    const t = String(r[0]);
    const cur = byTrack.get(t) ?? { n: 0, h: 0 };
    byTrack.set(t, { n: cur.n + 1, h: cur.h + Number(r[13] || 0) });
  }
  const tracks = [...byTrack.entries()].map(([t, v]) => `${t} - ${v.n} topics, ${v.h}h`).join("\n");
  const lines = rows.map((r, i) => `${i + 1}. [M${r[1]}] ${r[0]} :: ${r[2]} (${r[13]}h) - ${statusOf(r)}`).join("\n");
  const skipped = rows.length - active.length;
  const done = rows.filter((r) => statusOf(r) === "Done").length;
  const started = rows.filter((r) => statusOf(r) === "In progress").length;
  return `THE FULL PLAN - all ${rows.length} topics, of which ${active.length} are active (${active.reduce((n, r) => n + Number(r[13] || 0), 0)}h across ${byTrack.size} tracks)`
    + `${skipped ? ` and ${skipped} are marked Skipped - those are listed below too, with Skipped as their status` : ""}.`
    + `\nEvery topic in the plan is in this list; nothing is hidden from you.`
    + (live.size
        ? `\nStatuses below are the learner's CURRENT recorded progress: ${done} done, ${started} in progress.`
        : `\nStatuses below are the workbook's frozen baseline, not live progress - it could not be read, so do not tell the learner they have started nothing.`)
    + `\n\nTracks, counting active topics only:\n${tracks}`
    + `\n\nEvery topic. The number is the plan row number, the same numbering any market benchmark below uses:\n${lines}`;
}

/**
 * The plan at part resolution, matched to the question.
 *
 * `syllabusContext` only builds when a topic filter is active, so on Overview, Market, Paths or an
 * unexpanded Plan the model's entire view of the curriculum is `planMap`: one line per topic, 119
 * lines, titles only. The 2,236 subtopic names underneath those titles never ship.
 *
 * That is the same failure `planMap`'s own header describes and only half-fixed. The plan was once
 * truncated to 8 of 119 topics, so the model answered "there is no ML topic in the visible plan"
 * about a plan containing 192 hours of it. The fix raised the resolution from 8 topics to 119
 * titles, and stopped one level above where answers actually live: the topic is called "Kafka and
 * event-driven design", and the part called "Idempotent consumers: dedupe keys and the
 * processed-events table" is invisible.
 *
 * The whole index is 152,960 characters, so it cannot ship. This selects instead: a plain
 * lowercase term match over the names, ranked by how many of the question's terms each hit, ties
 * broken by plan row so the output is stable. No scoring model, no embedding, nothing invented.
 *
 * The header states how many of the 2,236 are shown, and the block says a miss is not proof of
 * absence, so an empty result cannot become "your plan does not cover that".
 */
const PARTS_LINES = 30;
const PARTS_CAP = 6000;

function partsIndexContext(question: string) {
  const terms = question.toLowerCase().match(/[a-z0-9+#]+/g)?.filter((t) => (t.length >= 3 || t === "go") && !STOP.has(t)) ?? [];
  if (!terms.length) return "";

  const topics = (curriculum as { topics: Record<string, Syllabus> }).topics;
  const hits: { row: number; topic: string; part: string; minutes: number; score: number }[] = [];
  for (const [key, topic] of Object.entries(topics)) {
    const row = Number(key) + 1;
    for (const part of topic.subtopics ?? []) {
      const name = part.name.toLowerCase();
      const score = terms.reduce((n, t) => (name.includes(t) ? n + 1 : n), 0);
      if (score > 0) hits.push({ row, topic: topic.topic, part: part.name, minutes: part.minutes ?? 0, score });
    }
  }
  if (!hits.length) return "";

  hits.sort((a, b) => b.score - a.score || a.row - b.row);
  const lines: string[] = [];
  let used = 0;
  for (const h of hits.slice(0, PARTS_LINES)) {
    const line = `- row ${h.row}. ${h.topic} / ${h.part}${h.minutes ? ` (${h.minutes}m)` : ""}`;
    // Whole lines only. A half-named part is worse than one fewer.
    if (used + line.length > PARTS_CAP) break;
    used += line.length;
    lines.push(line);
  }
  return `PARTS OF THE PLAN MATCHING THIS QUESTION - ${lines.length} of 2,236 subtopics, selected by keyword:\n${lines.join("\n")}\nThese are plan rows at part resolution. A part not listed here was not matched by these words; that is NOT evidence the plan omits it, and you must not say the plan lacks something on the strength of this list alone.`;
}

/**
 * Words that match everything and therefore select nothing.
 *
 * Tuned against real output rather than copied from a list. "Does my plan cover idempotent
 * consumers" correctly returned row 36's "Idempotent consumers: dedupe keys and the
 * processed-events table"; but "something entirely unrelated like knitting" returned 11 parts,
 * because `like` matched "read like a reviewer" and `something` matched "Health endpoints that
 * mean something". Filler words in a question produce confident-looking irrelevance, which is
 * worse here than returning nothing.
 */
const STOP = new Set([
  "the", "and", "for", "with", "how", "what", "why", "should", "does", "did", "are", "was", "were",
  "can", "you", "your", "his", "her", "its", "this", "that", "these", "those", "from", "into",
  "about", "when", "where", "which", "who", "will", "would", "could", "have", "has", "had", "not",
  "but", "all", "any", "got", "make", "made", "need", "want", "plan", "topic", "learn",
  "study", "like", "something", "anything", "nothing", "really", "actually", "just", "also",
  "more", "most", "some", "other", "than", "then", "them", "there", "their", "here", "well",
  "good", "best", "help", "please", "give", "tell", "show", "know", "think",
  "thing", "things", "stuff", "way", "ways", "much", "many", "look", "looks", "see", "seen", "answer", "answers", "question", "questions", "explain", "explains", "ask", "asking",
  "entirely", "completely", "unrelated", "related", "does", "doing", "done", "next", "first",
  "last", "new", "old", "own", "out", "off", "over", "under", "again", "still", "even", "ever",
]);

/**
 * The market injection's own ceiling, the same 7000 `syllabusContext` uses.
 *
 * The two blocks are never both at their limit in practice - a syllabus is only built when a
 * topic filter is active - but the reason for the number is identical in both places: a
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
 * Named, linked requisitions the reader could apply to from Pune today.
 *
 * The reachability tiers already said how many; they never said which. This is the one part of
 * the market analysis that is an action rather than a measurement, and it was the only part not
 * reaching the prompt.
 */
const REACHABLE_ROLES = 8;

/**
 * How long the two market reads may take before the question goes on without them.
 *
 * `readJson` passes no signal to `fetch`, so on its own it inherits the platform default and
 * can outlive this function. The budget it has to fit inside is exact: `maxDuration` is 60 s
 * and the MiniMax call below already claims 55 of them, so everything in front of the model has
 * about five seconds. A GitHub that hangs must cost the market block, not the answer.
 */
const MARKET_READ_MS = 4000;
const BOOKKEEPING_TIMEOUT_MS = 1500;
const MODEL_TIMEOUT_MS = 50000;

function deadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * How many live web results may enter a prompt, whatever the client sends.
 *
 * `/api/external-brief` already caps its own response at five. This is the same cap enforced
 * again on the receiving side, because the two are different guarantees: that one bounds what a
 * well-behaved caller gets back, and this one bounds what this route will put in front of the
 * model regardless of what arrives in the body.
 */
const WEB_ITEM_CAP = 5;

/**
 * Longest highlighted passage carried into a prompt.
 *
 * The dock caps at the same number before sending. Enforced again here for the reason every cap in
 * this file is duplicated: that one bounds a well-behaved caller, this one bounds what reaches the
 * model whatever arrives in the body.
 */
const SELECTION_CAP = 2000;

/**
 * How long an answer may be, and why this moved.
 *
 * It was 1,600, chosen when Quaere could see the plan, the library and a readiness slice. It now
 * also carries the compensation sheet, the audited gaps, the over-investment analysis, the
 * shipped artifacts, the session history, the recall state and an outside brief, and it answers
 * questions like "build a practical study sequence connecting AI Engineering to my plan". A real
 * answer to that is longer than 1,600 tokens, and the cap did not shorten it: the model wrote a
 * five-part answer and the response was cut mid-heading, ending at a bare "## 5.".
 *
 * 3,600 is bounded by the clock rather than by taste. The model call has 55s inside a 60s
 * function, and generation is the slow part of that; doubling the cap again would start trading
 * truncation for timeouts, which is the same failure wearing a different message.
 *
 * The prompt is told this number in words as well, so the model can size its plan to it instead
 * of starting a section it has no budget to finish.
 */
const MAX_ANSWER_TOKENS = 3600;

/**
 * benchmark.json and insight.json, read from the repo at request time.
 *
 * Deliberately not `import`ed the way curriculum.json and workbook.json are. Those are
 * committed inputs and bundling them is correct; these two are rewritten by the daily cron, so
 * a bundled copy would pin every number Quaere quotes to whenever the dashboard was last
 * deployed and present a stale market as the live one.
 *
 * Both reads run in parallel against one budget rather than two, and every failure - no
 * GITHUB_TOKEN, a 404 before the first scan, an outage, the timeout - resolves to null and the
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
 * budget runs out, and it is the one that degrades gracefully - eight most-asked skills instead
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
      /*
       * The named requisitions, which are the only part of the whole market analysis a reader can
       * act on this afternoon. The tiers say eleven roles are takeable from Pune; this says which
       * eleven, at which companies, with the link.
       *
       * `roles` is the in-India slice only and is already capped upstream by how few there are.
       * Capped again here because a good scan week is not a reason to spend the market budget on
       * a job list, and the URL ships because a role without one is a rumour.
       */
      insight.reachability.roles?.length
        ? `TAKEABLE WITHOUT LEAVING INDIA - ${insight.reachability.roles.length} named requisitions from the last scan:\n`
          + insight.reachability.roles.slice(0, REACHABLE_ROLES).map((r) => `- ${r.company} - ${r.title} - ${r.location} - ${r.url}`).join("\n")
          + (insight.reachability.roles.length > REACHABLE_ROLES ? `\n(${insight.reachability.roles.length - REACHABLE_ROLES} more not shown)` : "")
        : "",
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
  // is fill-checked above, so the cap is reachable from in front of it - `insight.segments` is
  // mapped with no slice, and a sixth SEGMENT_LABEL would push the pre-coverage block towards
  // 7,000 on its own with `kept` already empty. A character slice there would bisect a
  // statement - "189 distinct requisitions" ending as "18" - and a wrong measured number in the
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
 * design - every number in the digest was counted by a scan, and a model-written number sitting
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
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/[–—]/g, " - ").replace(/\n{3,}/g, "\n\n").trim();
}

async function saveAskReport(prompt: string, context: string, answer: string) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
  if (!token) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ask";
  const path = `reports/asks/${stamp}-${slug}.md`;
  const markdown = `# Lumen Ask\n\nDate: ${new Date().toISOString()}\n\n## Question\n\n${prompt}\n\n## Plan context\n\n${context || "No topic filter was active."}\n\n## Answer\n\n${answer}\n`;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "lumen-fde" }, body: JSON.stringify({ message: `docs: save Lumen ask ${stamp}`, content: Buffer.from(markdown, "utf8").toString("base64"), branch: process.env.GITHUB_BRANCH || "main" }), signal: AbortSignal.timeout(BOOKKEEPING_TIMEOUT_MS) });
  if (!response.ok) { const error = await response.json().catch(() => ({})) as { message?: string }; console.error("[api/ask] GitHub report save failed", { status: response.status, message: error.message, repo, path }); return null; }
  const data = await response.json() as { content?: { html_url?: string } };
  return data.content?.html_url || `https://github.com/${repo}/blob/${process.env.GITHUB_BRANCH || "main"}/${path}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MiniMax is not configured yet. Add MINIMAX_API_KEY in Vercel project settings." }, { status: 503 });
  try {
    const body = await request.json() as { prompt?: string; context?: string; topicIndex?: number; web?: boolean; webItems?: { title?: unknown; url?: unknown; snippet?: unknown }[]; selection?: unknown; statuses?: unknown; history?: { role: "user" | "assistant"; content: string }[] };

    /**
     * What the companion already knows about this reader.
     *
     * `history` is the current conversation and dies with the panel; this is the part that
     * survives it. Only two things are handed to the model - what it has already explained, so it
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
      memoryState = await deadline(readMemory(), BOOKKEEPING_TIMEOUT_MS, null);
      if (memoryState?.synced) {
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
     * one of them failing degrades that block to "unknown" rather than failing the question -
     * `Promise.allSettled`, not `all`, for exactly that reason.
     */
    const [artifactsR, sessionsR, reviewR, papersR] = await Promise.allSettled([
      readArtifacts(),
      readSessionSummary(),
      readJson<ReviewState>("reports/review/state.json"),
      readPapers(),
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
    /**
     * Outside context, in two forms, and both of them cited.
     *
     * The stored brief is the default: fetched on a schedule, committed to the repo, identical
     * for every reading until the next fetch - so an answer built on it is reproducible. Live
     * search is opt-in per question, for when currency matters more than reproducibility, and it
     * is disclosed in the block itself so the answer can say which it used.
     *
     * Neither can fail the question. A live search that errors degrades to the stored brief; a
     * missing brief degrades to no outside context at all, which is where this route was a day ago.
     */
    let outside = "";
    try {
      // Raced, for the same reason the two market reads above are raced: `readJson` passes no
      // AbortSignal to fetch, so on its own this inherits the platform default and can outlive the
      // whole function. It was added here unbounded, which put an unbounded GitHub read inside the
      // ~5s this route has before the 55s model call - a slow contents API would have cost the
      // ANSWER, not just the brief. Losing the brief is cheap; losing the answer is the failure.
      const brief = await Promise.race([
        readLatestBrief().then((r) => r.brief),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), MARKET_READ_MS)),
      ]);
      outside = externalContext(brief, new Date());
    } catch { /* no brief is the pre-existing state, not an error worth failing on */ }

    /*
     * Live results, searched by `/api/external-brief` and handed here by the client.
     *
     * This route does not fetch them itself, and the reason is the 60s ceiling above - the scrape
     * measures 27-39s and the model claims 55, so the two cannot share one function on this plan.
     * Splitting them gives each its own.
     *
     * The cost of that split is that these strings arrive from the browser rather than from the
     * engine, so **nothing here is trusted**. Every field is re-cleaned, re-capped and re-checked
     * for an absolute http(s) URL before it can reach a prompt, and the count is capped too. The
     * single-user session gate makes this a small risk; the block is still built as if it were
     * not, because "only one person can reach it" is a property of today's deployment and this
     * is a property of the code.
     */
    if (Array.isArray(body.webItems) && body.webItems.length) {
      const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
      const live = body.webItems
        .slice(0, WEB_ITEM_CAP)
        .map((i) => ({ title: clean(i?.title, 200), url: clean(i?.url, 500), snippet: clean(i?.snippet, 320) }))
        .filter((i) => i.title && /^https?:\/\//i.test(i.url));
      if (live.length) {
        outside += `${outside ? "\n\n" : ""}LIVE WEB RESULTS, fetched just now for this question. Cite the URL for anything you take from them, and say that you searched the web:\n` +
          live.map((i) => `- ${i.title} - ${i.url}${i.snippet ? `\n  ${i.snippet}` : ""}`).join("\n") +
          `\nThese are outside sources. They NEVER override a number measured in this repository.`;
      }
    } else if (body.web) {
      // The toggle was on and the search came back with nothing - it timed out, it failed, or it
      // genuinely found nothing. The model is told, because an answer that quietly omits the web
      // reads exactly like one that searched and found nothing worth saying.
      outside += `${outside ? "\n\n" : ""}A live web search was requested for this question and returned no usable results. Answer from the plan and say the search did not come back - do not imply you searched.`;
    }

    /*
     * What the reader had highlighted when they asked.
     *
     * This is the strongest signal in the whole prompt about what the question is about, and the
     * one thing the model could never infer. A page context says "you are on /curriculum"; a
     * selection says "this sentence, this term, this line of a market statement".
     *
     * Capped and cleaned like every other caller-supplied string, and labelled as the reader
     * pointing rather than as fact, because a selection can be Quaere's own previous answer.
     */
    const selection = String(body.selection ?? "").replace(/\s+/g, " ").trim().slice(0, SELECTION_CAP);
    const selectionBlock = selection
      ? `HIGHLIGHTED BY THE READER on the page, at the moment they asked:\n<<<\n${selection}\n>>>\nThis is what the question is about unless the question says otherwise. It is text they pointed at, not a claim: if it contradicts a number measured in this repository, the measured number wins and you say so.`
      : "";

    // Occupies the slot the syllabus vacates rather than competing with it.
    const partsBlock = deep ? "" : partsIndexContext(String(body.prompt ?? ""));

    /*
     * Who is asking.
     *
     * data/profile.json has carried this since it was created and none of it reached the prompt.
     * The companion advises on relocation paths without being told the reader is in Pune, and
     * reasons about pace without the weekly commitment every other surface derives from. Sixty
     * tokens, and it is the difference between generic advice and advice for one person.
     */
    const who = `WHO YOU ARE TALKING TO: ${PROFILE.name}, based in ${PROFILE.location}, working toward ${PROFILE.targetRole}. This is ${PROGRAMME}: ${(PROFILE as { premise?: string }).premise ?? ""} The committed pace is ${weeklyPace()}, which is editable in the app, so use it rather than assuming a figure.`;

    const extra = [
      who,
      selectionBlock,
      partsBlock,
      workbookContext(),
      benchmarkGapsContext(benchmark),
      evidenceContext({ artifacts: artifacts.artifacts, synced: artifacts.synced }, sessions),
      recallContext(review, new Date()),
      papersContext(
        papersR.status === "fulfilled" ? papersR.value : { papers: [], synced: false },
        (row) => String((workbook.Plan as PlanRow[])[row + 1]?.[2] ?? `row ${row + 1}`),
      ),
      outside,
    ].filter(Boolean).join("\n\n");

    const messages = [
      { role: "system", content: `You are Quaere, the study guide inside Lumen. Lumen is the dashboard; you are the guide within it. Explain every idea in fifth-grade reading language while keeping the technical meaning exact. Use short sentences, define jargon immediately, give one concrete technical example, connect it to production systems and FDE interviews, and finish with one practical next step. Use the plan, library map, and repository map as supporting context; do not invent progress. The user message contains the COMPLETE plan - every topic across every track. Never tell the learner a subject is missing from the plan without checking that full list first. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. NEVER state how many recall cards are due, even if you can infer it: say whether recall is waiting. A backlog number is what makes people abandon a spaced-repetition system, and this learner has 23 months left. The learner's indexed learning map is:\n${JSON.stringify(library)}\n\nThe local source catalog (metadata and chapter map only) is:\n${JSON.stringify(sourceCatalog)}\n\nBOOKS RULE: you have titles, page counts and chapter names for these books. You do NOT have their text. Nothing in this repository holds a single page of any of them; the files live on the learner's own machine. Never quote, summarise or paraphrase a passage as though you had read their copy, and never attribute a claim to a specific page. Name the book and the chapter and say what to look for in it. This is the same rule the market numbers follow: cite what is in a file, invent nothing.\n\nThe public repository map is:\n${JSON.stringify(repositories)}${market ? MARKET_RULE : ""}${memoryBlock}` },
      // Picked field by field, not spread. The client stores an assistant turn as
      // `{role, content, reportUrl?}`, and forwarding a turn that saved a report shipped a
      // `reportUrl` key into an OpenAI-shaped messages array. The declared type hid it from
      // tsc, so only the wire showed it.
      // The budget, in the model's own terms. Without it the model plans an answer it cannot
      // finish, which is how a five-part reply ended on an empty "## 5." heading.
      { role: "system", content: `LENGTH: you have about ${MAX_ANSWER_TOKENS} tokens, roughly ${Math.round(MAX_ANSWER_TOKENS * 0.7)} words. Plan the answer to fit. Cover fewer things completely rather than starting a section you cannot finish, and never end on a heading with nothing under it. If the question is bigger than the budget, say what you are leaving out and offer to continue.` },
      ...(body.history || []).slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `${planMap(liveStatuses(body.statuses))}\n\nCurrently visible in the dashboard:\n${body.context || "No topic filter is active."}${deep ? `\n\n${deep}` : ""}${market ? `\n\n${market}` : ""}${extra ? `\n\n${extra}` : ""}\n\nQuestion:\n${body.prompt}` },
    ];
    const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, messages, temperature: 0.4, max_completion_tokens: MAX_ANSWER_TOKENS, stream: false }), signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
    const raw = await response.text();
    let data: { choices?: { message?: { content?: string }; finish_reason?: string }[]; base_resp?: { status_msg?: string } } = {};
    try { data = JSON.parse(raw); } catch { console.error("[api/ask] MiniMax returned non-JSON", { status: response.status }); }
    if (!response.ok) { console.error("[api/ask] MiniMax rejected request", { status: response.status, message: data.base_resp?.status_msg }); return NextResponse.json({ error: "The learning guide is temporarily unavailable. Try again in a moment." }, { status: 502 }); }
    /*
     * `finish_reason: "length"` means the cap stopped it, not the model. Nothing read this before,
     * so a truncated answer was returned to the reader and committed to reports/asks/ as though it
     * were complete: one of them ends on a bare "## 5." heading with no section under it.
     *
     * The answer is still shown, because most of it is useful and discarding it would waste the
     * whole request. It is labelled instead, so the reader knows to ask for the rest rather than
     * assuming the guide had nothing more to say.
     */
    const cut = data.choices?.[0]?.finish_reason === "length";
    let answer = cleanAnswer(data.choices?.[0]?.message?.content || "");
    if (answer && cut) {
      answer += "\n\n---\n\n**This answer hit the length limit and stops here.** Ask me to continue from where it broke off and I will pick up from that point.";
    }
    if (!answer) { console.error("[api/ask] MiniMax returned an empty answer", { status: response.status }); return NextResponse.json({ error: "The learning guide returned an empty answer. Try asking again." }, { status: 502 }); }
    let reportUrl: string | null = null;
    try { reportUrl = await saveAskReport(body.prompt, body.context || "", answer); } catch (error) { console.error("[api/ask] GitHub report save exception", { error: String(error) }); }
    /**
     * Remember the exchange - only now, and only because it succeeded.
     *
     * Recorded after the answer, never before: a question that errored was not explained, and a
     * digest that claims otherwise would make Quaere skip an explanation it never gave. What is
     * stored is the question text, normalised and capped, and the topic when one is in view -
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
        if (next !== memoryState.memory) await deadline(writeMemory(next, memoryState.sha), BOOKKEEPING_TIMEOUT_MS, null);
      } catch { /* the answer matters more than the bookkeeping */ }
    }

    return NextResponse.json({ answer, reportUrl });
  } catch (error) { const message = String(error); console.error("[api/ask] request failed", { error: message }); if (message.includes("TimeoutError") || message.includes("timed out")) return NextResponse.json({ error: "Lumen is taking longer than expected. Try the question again with a shorter prompt." }, { status: 504 }); return NextResponse.json({ error: "Lumen could not reach the learning guide. Try again in a moment." }, { status: 500 }); }
}
