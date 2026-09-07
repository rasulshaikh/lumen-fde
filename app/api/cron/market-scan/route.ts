import { NextResponse } from "next/server";
import sources from "@/data/market-sources.json";
import skillMap from "@/data/market-skill-map.json";
import workbook from "@/data/workbook.json";
import { classify, dedupeKey, type RoleClass } from "@/lib/market/classify";
import { fetchBoard, fetchJd, type Posting, type Source } from "@/lib/market/fetch";
import { htmlToText, matchSkills, stripBoilerplate } from "@/lib/market/skills";
import { computeBenchmark, type Workbook } from "@/lib/market/benchmark";
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
