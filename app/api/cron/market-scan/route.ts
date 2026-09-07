import { NextResponse } from "next/server";
import sources from "@/data/market-sources.json";
import skillMap from "@/data/market-skill-map.json";
import workbook from "@/data/workbook.json";
import { classify, dedupeKey, type RoleClass } from "@/lib/market/classify";
import { fetchBoard, fetchJd, type Posting, type Source } from "@/lib/market/fetch";
import { htmlToText, matchSkills, stripBoilerplate } from "@/lib/market/skills";
import { computeBenchmark, type Benchmark, type Workbook } from "@/lib/market/benchmark";
import {
  BENCHMARK_PATH,
  INDEX_PATH,
  TREND_PATH,
  appendTrend,
  capReqs,
  emptyIndex,
  historyPath,
  markSeen,
  readJson,
  sweepMissing,
  writeJson,
  type BoardStatus,
  type MarketIndex,
  type SeenReq,
  type TrendPoint,
} from "@/lib/market/store";

/**
 * The daily market scan: 27 first-party ATS boards in, one benchmark out.
 *
 * `maxDuration` is deliberately NOT declared. Hobby caps a function at 60 s and rejects a
 * build that asks for more, so hardcoding the 300 s the budget fits inside would make the
 * design plan-specific — and the whole point of the cursor below is that it is not. The knob
 * is `SCAN_DEADLINE_MS`: leave it at 220_000 on a 300 s function, set it to 50_000 on a 60 s
 * one and the same code completes a cycle over 3-4 daily invocations instead of one.
 */

/** Six boards in flight. The measured corpus is ~47 MB decompressed per full cycle and the
 *  largest single board (OpenAI, 12.9 MB) has to parse inside its own 45 s timeout, so this
 *  is bounded by heap and parse time rather than by the remote hosts. */
const BOARD_CONCURRENCY = 6;

/** Wall-clock budget for *starting* boards, not for finishing them: a board dispatched at
 *  219 s still gets its full 45 s. 220_000 + 45_000 leaves headroom under a 300 s function. */
const DEADLINE_MS = Number(process.env.SCAN_DEADLINE_MS) || 220_000;

const day = (now: Date) => now.toISOString().slice(0, 10);

/** The board token prefixes every req id from that board, so a req always knows its owner. */
const boardOf = (id: string) => id.slice(0, id.indexOf("::"));

type BoardOutcome = { token: string; status: BoardStatus; reqs: { id: string; seen: SeenReq }[] };

/**
 * Scan one board: listing, title filter, selective JD fetch, skill fingerprints.
 *
 * Never throws and never touches the index. It returns what it found and the caller applies
 * it, so a board that blows up mid-classification cannot leave the seen-set half-written —
 * a partially applied board looks exactly like a board whose roles disappeared, which is the
 * failure the no-sweep-on-failure rule exists to prevent.
 */
async function scanBoard(source: Source, index: MarketIndex): Promise<BoardOutcome> {
  const result = await fetchBoard(source);
  const fetchedAt = new Date().toISOString();
  const token = source.token;

  if (!result.ok) {
    // A failed board is recorded, not skipped. `ok: false` is what keeps its requisitions out
    // of the missing-sweep; dropping the entry entirely would leave a stale `ok: true` from
    // yesterday and sweep them anyway.
    return { token, status: { ok: false, total: 0, matched: 0, bytes: result.bytes, fetchedAt, error: result.error }, reqs: [] };
  }

  // Stage 1.5. Per-company patterns, never a global list — `Applied AI` is core FDE at Mistral
  // and Anthropic and a false positive at Databricks and Perplexity.
  const matched: { posting: Posting; cls: RoleClass }[] = [];
  for (const posting of result.postings) {
    const cls = classify(posting, source);
    if (cls) matched.push({ posting, cls });
  }

  /**
   * Stage 2. Greenhouse only, and only for a posting whose fingerprint we do not already hold.
   *
   * "Absent from the seen-set" is the spec's condition; `skills === null` is the documented
   * retry of a per-job fetch that failed on an earlier run (such a req is excluded from every
   * denominator until it succeeds, so a failure understates a count rather than corrupting
   * it). Together they take a cold start's 291 fetches down to 0-15 in steady state, which is
   * the entire reason Greenhouse is fetched in two stages instead of with `?content=true`.
   *
   * Concurrency is enforced inside `fetchJd`, so `Promise.all` here cannot open 291 sockets.
   */
  const bodies = new Map<string, string>();
  await Promise.all(
    matched
      .filter(({ posting }) => posting.jd === null && (index.reqs[`${token}::${posting.sourceId}`]?.skills ?? null) === null)
      .map(async ({ posting }) => {
        const jd = await fetchJd(source, posting.sourceId);
        if (jd) bodies.set(posting.sourceId, jd);
      }),
  );

  const textOf = ({ posting }: { posting: Posting }) => {
    const raw = posting.jd ?? bodies.get(posting.sourceId) ?? null;
    return raw ? htmlToText(raw) : null;
  };

  // The 60%-frequency boilerplate detector needs this company's matched postings and only
  // this company's: a shared EEO paragraph counted across companies would clear 60% nowhere
  // and survive in all of them. Built once and passed by reference, because stripBoilerplate
  // caches its frequent-line set against the array identity.
  const corpus = [...new Set(matched.map(textOf).filter((t): t is string => Boolean(t)))];

  const reqs: BoardOutcome["reqs"] = [];
  for (const entry of matched) {
    const { posting, cls } = entry;
    const text = textOf(entry);
    reqs.push({
      id: `${token}::${posting.sourceId}`,
      seen: {
        company: source.company,
        title: posting.title,
        key: dedupeKey(source.company, posting.title),
        location: posting.location ?? "",
        url: posting.url,
        class: cls,
        publishedAt: posting.publishedAt ?? "",
        // null means "no body this run", which markSeen reads as "keep the stored
        // fingerprint" rather than "this req has no skills". Assigning it through would wipe
        // every known Greenhouse req's fingerprint and deflate every percentage each run.
        skills: text ? matchSkills(stripBoilerplate(text, source.company, corpus, source), skillMap) : null,
      },
    });
  }

  return {
    token,
    // `matched` counts what passed the title filter, including the junior reqs markSeen
    // refuses to store, so it stays comparable with the audited `verifiedMatches` in the config.
    status: { ok: true, total: result.postings.length, matched: matched.length, bytes: result.bytes, fetchedAt, error: null },
    reqs,
  };
}

/**
 * The ids the missing-sweep is allowed to treat as still-present.
 *
 * NOT simply this run's seen ids. Under the cursor a cycle can span several invocations, so
 * the run that completes the cycle has only visited the boards after the cursor; passing its
 * own seen set alone would mark every requisition on every board visited by an *earlier* run
 * as missing and report them all as new the following day — the same bug the
 * no-sweep-on-failure rule prevents for failed boards, reintroduced for successful ones.
 *
 * So the answer is per board. A board this run visited is authoritative: the run's own seen
 * set says exactly what is on it. A board an earlier run visited is judged on whether the req
 * survived that board's last fetch, which is what `lastSeen >= board.fetchedAt` says.
 *
 * The two cannot be collapsed into the second rule alone. Both dates are days, so on a second
 * cycle in the same day every req still carries today's `lastSeen` from the first cycle and
 * every one of them reads as present — a role that closed between the two runs would never be
 * swept. Rare in production at one cycle a day, and silent when it happens.
 */
function confirmedIds(index: MarketIndex, visited: Set<string>, seenThisRun: Set<string>): Set<string> {
  const confirmed = new Set<string>();
  for (const [id, req] of Object.entries(index.reqs)) {
    const token = boardOf(id);
    if (visited.has(token)) {
      if (seenThisRun.has(id)) confirmed.add(id);
      continue;
    }
    const board = index.boards[token];
    if (board && req.lastSeen >= board.fetchedAt.slice(0, 10)) confirmed.add(id);
  }
  return confirmed;
}

/**
 * Copied from daily-digest/route.ts rather than imported.
 *
 * A route module is an HTTP entry point, not a library: importing one from another drags a
 * second `export async function GET` into this file's module graph for the sake of six lines,
 * and Next has no guarantee about what it does with a route that another route imports. The
 * honest fix is a shared lib module, which is a change to a file this task does not own. The
 * two copies must stay identical — the reasoning below is why the shape is what it is.
 *
 * MiniMax-M3 does not reliably honour thinking:disabled, so reasoning has to be stripped.
 * Two failure modes, both seen in a real delivered email:
 *   - the reply is ENTIRELY a <think> block, so stripping leaves "" and the email arrived
 *     blank. The old `|| "Lumen could not generate…"` fallback ran BEFORE cleaning against
 *     a non-empty string, so it could never fire.
 *   - the tag is never closed, so the pair regex misses and raw reasoning ships to the inbox.
 */
function clean(value: string) {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/\*/g, "")
    .replace(/[—–]/g, " - ")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Every rendered statement is multi-line by construction; HTML would otherwise run them together. */
const escLines = (s: string) => esc(s).replace(/\n/g, "<br />");

/** Any run of digits, with an optional decimal tail — the token the post-check compares on. */
const NUMBERS = /\d+(?:\.\d+)?/g;

/**
 * The one model paragraph: what to do about these numbers this week.
 *
 * Returns "" on every failure path — no key, non-200, timeout, empty after cleaning, or a
 * number the model invented. The caller sends the deterministic body either way, because the
 * substance of this email is 40 audited measurements and the paragraph is a framing line on
 * top of them.
 */
async function weeklyFraming(facts: string): Promise<string> {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) return "";

  const prompt =
    `Here is this week's measured Forward-Deployed Engineer job-market benchmark. In 60 words or fewer,` +
    ` say what to DO about it this week - what to study, what to defer. Write no numbers at all: no digits,` +
    ` no percentages, no counts, no years. The numbers are already printed above your paragraph and repeating` +
    ` them is the one thing that makes this paragraph worse than nothing. Do not restate the data or pad.\n\n${facts}`;

  let text = "";
  try {
    const r = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "MiniMax-M3", thinking: { type: "disabled" }, temperature: 0.5, max_completion_tokens: 260, stream: false,
        messages: [
          { role: "system", content: "You are Quaere, a candid Senior FDE study guide. Plain language, exact technical meaning. No hidden reasoning, no asterisks, no em dashes. Never invent a measurement." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (r.ok) text = clean((await r.json())?.choices?.[0]?.message?.content || "");
  } catch { /* the benchmark does not depend on this */ }
  if (!text) return "";

  /**
   * The post-check the prompt cannot enforce on its own.
   *
   * The allowed set is derived from the prompt string itself rather than hand-listed, so it
   * cannot drift out of step with whatever `facts` the caller decides to supply. A model that
   * writes "coverage sits near sixty percent" is fine; one that writes "58%" beside a
   * deterministic block saying 61% has invented a market measurement, and an invented number
   * sitting among audited ones discredits the audited ones too. Drop the paragraph.
   */
  const supplied = new Set(prompt.match(NUMBERS) ?? []);
  const invented = (text.match(NUMBERS) ?? []).filter((n) => !supplied.has(n));
  if (invented.length) {
    console.error("[cron/market-scan] framing invented numbers, dropping it", { invented: invented.slice(0, 5) });
    return "";
  }
  return text;
}

/**
 * The Monday email: the full benchmark, deterministic, plus at most one model paragraph.
 *
 * Every sentence here comes from `benchmark.*.statement`. Nothing is re-phrased locally, so
 * the Market tab and this email say the identical thing and there is exactly one place to fix
 * a wording or an arithmetic bug. Movement included: `boardsOk < DELTA_MIN_BOARDS` is already
 * resolved inside `computeBenchmark`, which either suppresses the changes or explains why, so
 * re-deciding it here would be a second copy of the threshold to keep in sync.
 *
 * Never throws. The scan's deliverable is the index and the benchmark, both already committed
 * by the time this runs; a Resend outage on a Monday must cost the email and nothing else.
 */
async function sendWeekly(benchmark: Benchmark): Promise<{ sent: boolean; framing: boolean; error: string | null }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  // `||`, not `??`: an env var set to the empty string in the dashboard is absent in every way
  // that matters, and `??` would hand Resend a "" recipient and take a 422.
  const to = process.env.MARKET_TO_EMAIL || process.env.DIGEST_TO_EMAIL;
  if (!resendKey || !from || !to) return { sent: false, framing: false, error: "Missing RESEND_API_KEY, RESEND_FROM_EMAIL or a recipient." };

  const coverage = benchmark.coverage.map((c) => c.statement);
  const gaps = benchmark.gaps.map((g) => g.statement);
  const over = [...benchmark.overInvested.map((o) => o.statement), benchmark.overInvestedTotal.statement];
  const movement = benchmark.movement.statement;
  const newReqs = benchmark.newSinceLastRun.map((r) => r.statement);
  const overflow = benchmark.newSinceLastRunOverflow;

  // The model sees the headline and the shape, not the whole block: a 40-statement prompt buys
  // no better a 60-word answer and every extra number widens the set the post-check permits.
  const framing = await weeklyFraming([
    benchmark.coreStatement,
    `Top coverage: ${coverage.slice(0, 5).join(" | ")}`,
    `Gaps with no plan row: ${benchmark.gaps.map((g) => g.label).join(", ") || "none"}`,
    benchmark.overInvestedTotal.statement,
    movement || "No skill moved enough to report this week.",
  ].join("\n"));
  if (!framing) console.error("[cron/market-scan] no framing from the model; sending the deterministic benchmark alone");

  const section = (label: string, body: string[]) => (body.length ? [label, ...body, ""] : []);
  const text = [
    `MARKET BENCHMARK - ${benchmark.day}`,
    benchmark.coreStatement,
    benchmark.adjacentStatement,
    ``,
    ...(benchmark.baselineStatement ? [benchmark.baselineStatement, ``] : []),
    ...(framing ? [framing, ``] : []),
    ...section("COVERAGE", coverage),
    ...section("GAPS", gaps),
    ...section("OVER-INVESTED", over),
    ...section("MOVEMENT", movement ? [movement] : []),
    ...section("NEW CORE REQS", newReqs.length ? [...newReqs, ...(overflow ? [`+${overflow} more`] : [])] : []),
    `Scanned ${benchmark.boardsOk} of ${benchmark.boardsTotal} boards. Computed ${benchmark.computedAt}.`,
    `https://lumenfde.com`,
  ].join("\n");

  const block = (label: string, body: string[]) =>
    body.length
      ? `<tr><td style="padding:14px 0;border-top:1px solid #23252a"><div style="font:500 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8a8f98;margin-bottom:8px">${esc(label)}</div>${body
          .map((s) => `<div style="color:#f7f8f8;font-size:14px;line-height:1.6;margin-bottom:10px">${escLines(s)}</div>`)
          .join("")}</td></tr>`
      : "";
  const html = `<div style="background:#010102;padding:28px;font-family:ui-sans-serif,system-ui,sans-serif">
<table style="max-width:620px;margin:auto;background:#0f1011;border:1px solid #23252a;border-radius:12px;padding:24px;border-collapse:separate">
<tr><td style="padding-bottom:4px"><div style="font:500 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#828fff">Lumen market benchmark</div>
<div style="font-size:22px;font-weight:600;color:#f7f8f8;letter-spacing:-.02em;margin-top:6px">${esc(benchmark.coreStatement)}</div>
<div style="color:#8a8f98;font-size:13px;margin-top:4px">${esc(benchmark.adjacentStatement)}</div></td></tr>
${benchmark.baselineStatement ? block("Baseline", [benchmark.baselineStatement]) : ""}
${framing ? block("What to do this week", [framing]) : ""}
${block("Coverage", coverage)}
${block("Gaps", gaps)}
${block("Over-invested", over)}
${block("Movement", movement ? [movement] : [])}
${block("New core reqs", newReqs.length ? [...newReqs, ...(overflow ? [`+${overflow} more`] : [])] : [])}
${block("Scan", [`${benchmark.boardsOk} of ${benchmark.boardsTotal} boards. Computed ${benchmark.computedAt}.`])}
<tr><td style="padding-top:16px"><a href="https://lumenfde.com" style="color:#828fff;font-size:13px">Open the Market tab</a></td></tr>
</table></div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Lumen market · ${benchmark.day}`, text, html }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error("[cron/market-scan] Resend rejected", { status: response.status, err: err.slice(0, 200) });
      return { sent: false, framing: Boolean(framing), error: `Resend ${response.status}` };
    }
    return { sent: true, framing: Boolean(framing), error: null };
  } catch (error) {
    console.error("[cron/market-scan] weekly email failed", { error: String(error) });
    return { sent: false, framing: Boolean(framing), error: String(error) };
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  try {
    const now = new Date();
    const today = day(now);

    /**
     * Read before scanning, and refuse to scan if the read did not succeed.
     *
     * `synced: false` from store.ts means "we do not know", never "the file is empty". Falling
     * through to an empty index would rebuild the seen-set from scratch and stamp every one of
     * ~420 requisitions with today's `firstSeen`, so tomorrow's digest would announce 420 new
     * roles. A GitHub outage must cost a day of freshness, not the seen-set. Both exits happen
     * before a single board is fetched, because a scan that cannot be persisted is 47 MB of
     * egress spent on nothing.
     */
    const stored = await readJson<MarketIndex>(INDEX_PATH);
    if (!stored.synced) {
      if (!stored.error) return NextResponse.json({ ok: false, error: "Missing GITHUB_TOKEN." }, { status: 503 });
      console.error("[cron/market-scan] index read failed", { error: stored.error });
      return NextResponse.json({ ok: false, error: "Could not read the market index." }, { status: 502 });
    }

    // A 404 here is the cold start, not a failure. Merging over `emptyIndex()` also repairs a
    // file written by an older version that is missing a key.
    const index: MarketIndex = { ...emptyIndex(), ...(stored.data ?? {}) };
    const coldStart = Object.keys(index.reqs).length === 0;

    const boards = (sources.boards as unknown as Source[]).filter((b) => b.enabled);
    // A cursor past the end means the config shrank between runs; restarting the cycle is the
    // only safe reading, since the boards it pointed at no longer exist.
    let next = Number.isInteger(index.cursor) && index.cursor > 0 && index.cursor < boards.length ? index.cursor : 0;

    /**
     * The 60-second escape hatch.
     *
     * Workers pull boards in config order and stop pulling once the deadline passes, so `next`
     * ends as the first board never dispatched — the resume point. A run that runs out of time
     * therefore makes progress instead of restarting, and the boards it did not reach keep
     * yesterday's data untouched rather than looking closed.
     *
     * `allSettled` over the workers, and a `catch` per board inside them: the design's rule is
     * failure isolation per board, and a single rejection escaping here would abort the run
     * with several boards' results already fetched and none of them recorded.
     */
    const startedAt = Date.now();
    const outcomes: BoardOutcome[] = [];
    const worker = async () => {
      while (next < boards.length && Date.now() - startedAt < DEADLINE_MS) {
        const source = boards[next++];
        const outcome = await scanBoard(source, index).catch((error) => ({
          token: source.token,
          status: { ok: false, total: 0, matched: 0, bytes: 0, fetchedAt: new Date().toISOString(), error: String((error as Error)?.message || error) },
          reqs: [],
        }));
        outcomes.push(outcome);
      }
    };
    await Promise.allSettled(Array.from({ length: BOARD_CONCURRENCY }, worker));

    const visited = new Set<string>();
    const seenThisRun = new Set<string>();
    for (const outcome of outcomes) {
      index.boards[outcome.token] = outcome.status;
      visited.add(outcome.token);
      for (const { id, seen } of outcome.reqs) {
        // Only ids markSeen actually stored: junior and unmatched postings are never written,
        // so recording them here would confirm requisitions the index does not contain.
        if (markSeen(index, id, seen, today)) seenThisRun.add(id);
      }
    }
    // Counted across the config rather than across this run's outcomes, so a partial run does
    // not report `boardsOk: 6` and suppress deltas that a completed cycle earned.
    index.boardsOk = boards.filter((b) => index.boards[b.token]?.ok).length;
    index.updatedAt = now.toISOString();

    /**
     * A full cycle has completed only when the cursor wraps to 0. Everything below this line
     * depends on having looked at every board: the sweep needs the complete picture to call a
     * req closed, and a benchmark computed over a truncated corpus would print a percentage
     * whose denominator is "the boards that happened to fit in this invocation".
     */
    const complete = next >= boards.length;
    index.cursor = complete ? 0 : next;

    let summary: Record<string, unknown> = {};
    if (complete) {
      const swept = sweepMissing(index, confirmedIds(index, visited, seenThisRun), today);
      const evicted = capReqs(index);

      // benchmark.json is read only for its sha — the contents API rejects an update without
      // one, and the file is rewritten whole on every cycle regardless of what it held.
      const [benchmarkFile, trendFile] = await Promise.all([readJson<unknown>(BENCHMARK_PATH), readJson<TrendPoint[]>(TREND_PATH)]);
      const points = trendFile.data ?? [];
      // The last point that is not today's. A same-day re-run would otherwise compare the
      // benchmark against itself and report every skill as having moved zero points, silently
      // erasing a real week-over-week movement from the email and the tab.
      const previous = [...points].reverse().find((p) => p.d !== today) ?? null;

      const benchmark = computeBenchmark(index, skillMap, workbook as unknown as Workbook, now, previous);
      const trend = appendTrend(points, { d: today, core: benchmark.coreCount, companies: benchmark.companyCount, s: benchmark.skillShares });

      // index.json first and alone: it is the only file that cannot be recomputed. benchmark
      // and trend are both pure functions of it, so a failure after this point costs a day of
      // freshness on the tab and nothing at all in the seen-set.
      const wroteIndex = await writeJson(INDEX_PATH, index, stored.sha);
      if (!wroteIndex.ok) {
        console.error("[cron/market-scan] index write failed", { error: wroteIndex.error });
        return NextResponse.json({ ok: false, error: "Could not persist the market index." }, { status: 502 });
      }

      const [wroteBenchmark, wroteTrend, wroteHistory] = await Promise.all([
        writeJson(BENCHMARK_PATH, benchmark, benchmarkFile.sha),
        writeJson(TREND_PATH, trend, trendFile.sha),
        // The archive is write-only — nothing lists or reads that directory in a request path,
        // so a null sha is correct (the path is new every day) and a rejected same-day rewrite
        // is logged rather than failing a scan whose real output is already committed.
        writeJson(historyPath(today), benchmark, null),
      ]);
      if (!wroteBenchmark.ok || !wroteTrend.ok) {
        console.error("[cron/market-scan] snapshot write failed", { benchmark: wroteBenchmark.error, trend: wroteTrend.error });
        return NextResponse.json({ ok: false, error: "Could not persist the benchmark." }, { status: 502 });
      }
      if (!wroteHistory.ok) console.error("[cron/market-scan] history archive not written", { day: today, error: wroteHistory.error });

      summary = {
        baseline: benchmark.baseline,
        core: benchmark.coreCount,
        companies: benchmark.companyCount,
        // Empty on a cold start and on a partial-board run, by computeBenchmark's own rule:
        // on day one every req is new, and printing 420 of them trains you to skip the digest.
        newRoles: benchmark.newSinceLastRun.length,
        missing: swept.missing,
        deleted: swept.deleted,
        evicted,
      };

      /**
       * The weekly email, Monday only, and last on purpose.
       *
       * Vercel Hobby caps at two crons, so this is folded in behind a day check rather than
       * given its own entry — see spec section 6. It sits after all four writes and outside
       * the branches that return 502, so the ordering is: the index is committed, then the
       * benchmark and the trend, and only then does anything talk to Resend or MiniMax. That
       * order is the whole point. The scan's deliverable is the benchmark; an email is a
       * notification about it. Sending first and then failing to persist would mean an inbox
       * asserting numbers the tab cannot show, and a Monday send that threw before the writes
       * would lose a full cycle of scanning to a third party's outage.
       */
      if (now.getUTCDay() === 1) {
        // `sendWeekly` catches its own network failures, so this catch only fires on a bug in
        // the rendering. It is here anyway: an exception escaping to the outer handler would
        // return 500 for a cycle whose four files are already committed, and Vercel retrying a
        // "failed" cron would spend another 47 MB re-scanning a market that was already scanned.
        const weekly = await sendWeekly(benchmark).catch((error) => {
          console.error("[cron/market-scan] weekly email render failed", { error: String(error) });
          return { sent: false, framing: false, error: String(error) };
        });
        summary = { ...summary, emailed: weekly.sent, emailFraming: weekly.framing, emailError: weekly.error };
      }
    } else {
      const wroteIndex = await writeJson(INDEX_PATH, index, stored.sha);
      if (!wroteIndex.ok) {
        console.error("[cron/market-scan] index write failed", { error: wroteIndex.error });
        return NextResponse.json({ ok: false, error: "Could not persist the market index." }, { status: 502 });
      }
    }

    return NextResponse.json({
      ok: true,
      day: today,
      // A partial run is a normal state, not an error: the unreached boards keep yesterday's
      // data and their new roles arrive a day late.
      partial: !complete,
      cursor: index.cursor,
      coldStart,
      scanned: outcomes.length,
      boards: boards.length,
      boardsOk: index.boardsOk,
      reqs: Object.keys(index.reqs).length,
      ...summary,
    });
  } catch (error) {
    console.error("[cron/market-scan] failed", { error: String(error) });
    return NextResponse.json({ ok: false, error: "Market scan failed." }, { status: 500 });
  }
}
