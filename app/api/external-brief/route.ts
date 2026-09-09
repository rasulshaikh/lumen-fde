import { NextResponse } from "next/server";
import { BENCHMARK_PATH, readJson } from "@/lib/market/store";
import type { Benchmark } from "@/lib/market/benchmark";
import {
  LIVE_TIMEOUT_MS,
  MAX_ITEMS,
  REFRESH_TIMEOUT_MS,
  STALE_AFTER_DAYS,
  briefAgeDays,
  briefQueries,
  emptyBrief,
  extractItems,
  LATEST_PATH,
  readLatestBrief,
  searchWeb,
  writeBrief,
  type BriefItem,
} from "@/lib/external/brief";

/**
 * 60, and it is a ceiling rather than a preference.
 *
 * This project is on Vercel Hobby, which rejects a build that asks for more — `market-scan`
 * records the same constraint at the top of its own file. Every budget below is therefore
 * subtraction from 60, not a number chosen because it felt roomy.
 */
export const maxDuration = 60;

/**
 * The external brief: what is happening outside this repository.
 *
 * ## Why this is not a cron, when "nightly" is exactly what it wants to be
 *
 * It wanted to be `/api/cron/external-brief` on a `15 3 * * *` schedule, and it was, for about an
 * hour. Vercel Hobby allows **two** cron jobs per project and both slots are spent — 03:00 the
 * market scan, 03:30 the digest — so a third entry in `vercel.json` fails the deploy while
 * building perfectly on this machine. `architecture.md` already records the same limit as the
 * reason the Monday market email is folded into the scan behind a weekday check rather than
 * getting its own schedule. Neither fold works here: the scan already runs to its own deadline
 * with a cursor precisely because it does not fit in 60s, and the digest sends email.
 *
 * So the brief refreshes on the first visit of the day instead. For a dashboard opened every
 * morning that is the same freshness a 03:15 cron would give, and it skips the scrape entirely on
 * days nobody studies. The route keeps its `CRON_SECRET` path so it becomes a real cron the day a
 * slot exists — but it lives OUTSIDE `/api/cron/`, because `proxy.ts` gates that prefix on the
 * secret and a browser cannot present one.
 *
 * ## Two verbs, two budgets
 *
 * **GET** is the stored brief: dated, committed, identical for every reader until the next fetch,
 * so an answer built on it is reproducible. It refreshes only when stale, which makes opening the
 * dashboard twice free.
 *
 * **POST** is one live search for one question. It does not write anything — a per-question
 * search is not the brief, and storing it would make tomorrow's "what is happening outside"
 * depend on what someone happened to ask today.
 *
 * The reason POST exists at all is arithmetic. The measured latency of this scrape is 27-39s and
 * `/api/ask` spends up to 55s on the model; on a 60s function they cannot both happen inside one
 * request. As its own function the search gets its own 60s, the client makes two calls, and both
 * fit. That is the whole design.
 */

/** Live searches are the reader waiting on a spinner, so cap the work rather than the patience. */
const LIVE_ITEMS = 5;

async function refresh(): Promise<{ ok: boolean; note: string | null; items: number }> {
  const { data: benchmark } = await readJson<Benchmark>(BENCHMARK_PATH);
  const skills = (benchmark?.coverage ?? []).slice(0, 2).map((c) => String(c.label ?? c.id ?? "")).filter(Boolean);
  const queries = briefQueries(skills);

  // Parallel, and not by preference — by arithmetic. At 27-39s per call, three sequential queries
  // need ~116s and this function has 60. In parallel the wall clock is the slowest single call.
  // `allSettled`, so one failing query costs its own items and is disclosed rather than the run.
  const settled = await Promise.allSettled(queries.map((q) => searchWeb(q, 1, REFRESH_TIMEOUT_MS)));
  const failures: string[] = [];
  const collected: BriefItem[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") collected.push(...extractItems(result.value, queries[i]));
    else failures.push(`${queries[i]}: ${String((result.reason as Error)?.message || result.reason)}`);
  });

  // One item per URL, and a round-robin across queries so a single loud query cannot fill the
  // whole brief with its own results.
  const byQuery = new Map<string, BriefItem[]>();
  for (const item of collected) {
    const list = byQuery.get(item.query) ?? [];
    if (!list.some((x) => x.url === item.url)) list.push(item);
    byQuery.set(item.query, list);
  }
  const items: BriefItem[] = [];
  const seen = new Set<string>();
  for (let round = 0; items.length < MAX_ITEMS; round++) {
    let added = false;
    for (const list of byQuery.values()) {
      const candidate = list[round];
      if (!candidate || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      items.push(candidate);
      added = true;
      if (items.length >= MAX_ITEMS) break;
    }
    if (!added) break;
  }

  const brief = {
    ...emptyBrief(new Date().toISOString().slice(0, 10)),
    queries,
    items,
    note: failures.length ? `${failures.length} of ${queries.length} queries failed: ${failures.join(" | ")}` : null,
  };

  // latest.json is REWRITTEN, so it needs the sha it was read with. Without it the contents API
  // refuses the update; with a stale one, two runs silently clobber each other.
  const { sha } = await readJson(LATEST_PATH);
  const written = await writeBrief(brief, sha);
  return { ok: written.latest.ok, note: brief.note, items: items.length };
}

/**
 * GET — the stored brief, refreshed if it has gone stale.
 *
 * `?force=1` refreshes regardless, which is how this gets tested without waiting a day.
 * A refresh that fails returns the brief that is already there: yesterday's cited lines, honestly
 * dated, beat an empty response, and `externalContext` states the age itself.
 */
export async function GET(request: Request) {
  if (!process.env.SURFSENSE_API_KEY || !process.env.SURFSENSE_WORKSPACE_ID) {
    return NextResponse.json({ ok: false, brief: null, error: "SurfSense is not configured." }, { status: 503 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const before = await readLatestBrief();
  const age = before.brief ? briefAgeDays(before.brief.day, new Date()) : null;
  // `age === null` on an unparseable or future-dated day. Refreshing is the right answer there:
  // a brief nobody can date is not one to keep serving.
  const stale = force || !before.brief || age === null || age >= 1;
  if (!stale) return NextResponse.json({ ok: true, refreshed: false, brief: before.brief, age });

  try {
    const result = await refresh();
    const after = await readLatestBrief();
    return NextResponse.json({ ok: result.ok, refreshed: true, items: result.items, note: result.note, brief: after.brief ?? before.brief });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      refreshed: false,
      error: String((error as Error).message || error),
      brief: before.brief,
      age,
      stale: age !== null && age > STALE_AFTER_DAYS,
    });
  }
}

/**
 * POST — one live search, for one question, stored nowhere.
 *
 * The items go back to the client and the client hands them to `/api/ask`, which re-cleans and
 * re-caps every field before any of it reaches a prompt. That round trip is what buys each half
 * its own 60s function; the ask route does not trust what comes back from it, and says so.
 */
export async function POST(request: Request) {
  if (!process.env.SURFSENSE_API_KEY || !process.env.SURFSENSE_WORKSPACE_ID) {
    return NextResponse.json({ ok: false, items: [], error: "SurfSense is not configured." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { q?: unknown };
  const q = String(body.q ?? "").trim().slice(0, 400);
  if (!q) return NextResponse.json({ ok: false, items: [], error: "A question is required." }, { status: 400 });

  try {
    const items = extractItems(await searchWeb(q, 1, LIVE_TIMEOUT_MS), q).slice(0, LIVE_ITEMS);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    // 200 with `ok:false`, deliberately. A failed search is not a failed request: the client's
    // next move is to ask the question anyway and let the answer say the search did not run.
    return NextResponse.json({ ok: false, items: [], error: String((error as Error).message || error) });
  }
}
