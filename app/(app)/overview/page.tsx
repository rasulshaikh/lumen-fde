"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Overview, type HomeFeed } from "@/components/Overview";
import { NAV } from "@/components/Nav";
import { useAppState } from "@/components/AppState";
import { planRows } from "@/components/shared";
import { computeEvidence, computeStreak } from "@/lib/motivation";
import { buildBrief, type Brief } from "@/lib/companion/brief";
import type { ReviewState } from "@/lib/review";
import type { Benchmark } from "@/lib/market/benchmark";
import type { Insight, Progress } from "@/lib/market/insight";
import type { StoredArtifact } from "@/lib/artifacts";

/**
 * The homepage route: the tab adapter it already was, plus the one fetch the motivation layer
 * needs.
 *
 * Everything imported from lib/ here is either a type (erased) or a pure function. `computeStreak`
 * and `computeEvidence` touch no network, no filesystem and no `Date.now()` - `now` is a
 * parameter - which is exactly why they can run in the browser against three JSON responses
 * instead of needing a fourth endpoint that would compute them a second way.
 */

type Loaded = {
  progress: Progress | null;
  benchmark: Benchmark | null;
  insight: Insight | null;
  marketSynced: boolean;
  marketError: string | null;
  artifacts: { artifacts: StoredArtifact[]; unreadable: number; synced: boolean; error: string | null };
};

const json = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

/**
 * One load per session, held at module scope.
 *
 * `/api/progress` lists a GitHub directory and then fetches every file in it, so it is the most
 * expensive read in the app. The provider already pays for it once on mount; this page must not
 * pay for it again on every return to `/`. A module-level promise is the smallest thing that
 * makes a client component's fetch survive its own unmount, and a failed load stays cached
 * deliberately - the three panels below all render "unknown" honestly, and a retry storm behind
 * a rate-limited API would turn a blip into an outage.
 */
let loading: Promise<Loaded> | null = null;

function loadHome(): Promise<Loaded> {
  loading ??= (async () => {
    // Settled independently: a market outage must not blank the wall, and a missing artifacts
    // directory must not cost the streak. Each panel states its own absence.
    const [progress, market, artifacts] = await Promise.allSettled([
      json("/api/progress"),
      json("/api/market"),
      json("/api/artifacts"),
    ]);

    const feed = market.status === "fulfilled" ? market.value : null;
    const shipped = artifacts.status === "fulfilled" ? artifacts.value : null;

    return {
      // A 502 here means the history could not be read. Null, not `{ events: [] }`: an empty
      // history renders as "no progress event yet", which is a different and wrong claim.
      progress: progress.status === "fulfilled" && Array.isArray(progress.value?.events) ? progress.value as Progress : null,
      benchmark: feed?.benchmark ?? null,
      insight: feed?.insight ?? null,
      marketSynced: Boolean(feed?.synced),
      marketError: feed?.error ?? (market.status === "rejected" ? String(market.reason?.message || market.reason) : null),
      artifacts: {
        artifacts: Array.isArray(shipped?.artifacts) ? shipped.artifacts : [],
        unreadable: Number(shipped?.unreadable || 0),
        synced: Boolean(shipped?.synced),
        error: shipped?.error ?? (artifacts.status === "rejected" ? String(artifacts.reason?.message || artifacts.reason) : null),
      },
    };
  })();
  return loading;
}

/**
 * The external brief's daily refresh.
 *
 * Nothing on this page shows the brief. Quaere reads it when you ask a question, and this is the
 * only thing that keeps it current, so removing the trigger with the panel would have left the
 * brief frozen on whatever day it was last written.
 *
 * Fired once per session and never awaited. The route is a cheap no-op when today's brief already
 * exists, so only the first visit of a day pays for the fetch, and making the home page wait
 * 30-40 seconds on a web scrape would trade the whole paint for something it does not render.
 */
let briefRefresh: Promise<unknown> | null = null;
function refreshBrief() {
  briefRefresh ??= fetch("/api/external-brief").catch(() => null);
}


const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * The newest progress event that marks a plan row done, and what that row covers.
 *
 * Matched by topic string exactly as AppState and lib/market/insight.ts match it - one matcher,
 * or this panel and the readiness number beside it disagree about which rows are done. The row
 * number is 1-based over `workbook.Plan`, which is how the market modules, lib/artifacts.ts and
 * every citation in the app number a row.
 *
 * It is priced from `benchmark.coverage` rather than from `computeEvidence`, and that is not a
 * shortcut. `computeEvidence` requires the insight computed BEFORE the row moved; the feed
 * carries the one computed after, in which a finished row has no marginal entry at all. Called
 * with it anyway it would report "readiness unchanged" about a row that had just moved
 * readiness, which is the one kind of lie this layer cannot afford. Coverage sentences are
 * rendered by benchmark.ts, are true regardless of when they are read, and say the thing the
 * row actually bought: the skill, its share, and both denominators.
 */
function lastFinished(progress: Progress | null, benchmark: Benchmark | null): HomeFeed["last"] {
  for (const event of progress?.events ?? []) {
    if (norm(event?.status).replace(/\s+/g, "_") !== "done") continue;
    const index = planRows.findIndex((row) => norm(row[2]) === norm(event?.topic));
    if (index < 0) continue;
    const row = index + 1;
    return {
      row,
      topic: String(planRows[index][2]),
      day: String(event?.at ?? event?.date ?? "").slice(0, 10),
      shares: (benchmark?.coverage ?? [])
        .filter((entry) => entry.primaryRow === row && entry.pct > 0)
        .map((entry) => entry.statement.split("\n")[0]),
    };
  }
  return null;
}

const EMPTY: HomeFeed = {
  loading: true,
  streak: null,
  next: null,
  nextShare: null,
  readiness: null,
  marketSynced: false,
  marketError: null,
  last: null,
  artifacts: { loading: true, artifacts: [], unreadable: 0, synced: false, error: null },
};

export default function OverviewPage() {
  const router = useRouter();
  const state = useAppState();
  const [feed, setFeed] = useState<HomeFeed>(EMPTY);
  // The review schedule, read for one bit of information: is anything waiting. Never a count -
  // lib/review.ts and app/recall.tsx both record why ("'37 due', close it forever").
  const [review, setReview] = useState<{ state: ReviewState; synced: boolean } | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);

  // `new Date()` lives inside the effect, never in render: the streak's sentences are text, and
  // text derived from the clock during a server render is a hydration mismatch waiting for the
  // one page load that straddles midnight.
  useEffect(() => {
    let live = true;
    refreshBrief();
    loadHome().then((data) => {
      if (!live) return;
      const now = new Date();
      const { benchmark, insight } = data;
      const top = insight?.readiness.marginal[0] ?? null;
      // The row is not done - that is what put it in the marginal table - so the insight in
      // hand is the "before" insight computeEvidence documents. `index` is null: the 450 KB
      // market index is not served to the browser, so no role is named and none is invented.
      const next = benchmark && insight && top
        ? computeEvidence(benchmark, insight, {
            row: top.row,
            track: String(planRows[top.row - 1]?.[0] ?? ""),
            topic: top.topic,
            month: top.month,
            hours: top.hours,
            status: top.status,
          }, null, now)
        : null;
      const cover = next?.skill ? benchmark?.coverage.find((entry) => entry.id === next.skill!.id) ?? null : null;

      setFeed({
        loading: false,
        streak: data.progress ? computeStreak(data.progress, now) : null,
        next,
        nextShare: cover ? cover.statement.split("\n")[0] : null,
        readiness: insight
          ? {
              pct: insight.readiness.pct,
              deltaPoints: insight.readiness.deltaPoints,
              evidenced: insight.readiness.evidenced.length,
              skillCount: insight.readiness.skillCount,
            }
          : null,
        marketSynced: data.marketSynced,
        marketError: data.marketError,
        last: lastFinished(data.progress, benchmark),
        artifacts: { loading: false, ...data.artifacts },
      });
    });
    return () => { live = false; };
  }, []);

  // Same shape the recall strip uses. A failure leaves `review` null, which `recallState` reads
  // as "unknown" rather than "nothing due" - telling a returning reader nothing is waiting when
  // the store was simply unreadable is the one sentence this panel must never produce.
  useEffect(() => {
    let live = true;
    fetch("/api/review")
      .then((r) => r.json())
      .then((data) => { if (live) setReview({ state: (data?.state ?? {}) as ReviewState, synced: !!data?.synced }); })
      .catch(() => { if (live) setReview(null); });
    return () => { live = false; };
  }, []);

  // The syllabus for today's row, so the brief can name what the topic is actually made of.
  // Cached in the provider and shared with /plan and /curriculum, so this costs one request the
  // first time and none after it.
  // Read off the two fields rather than the whole context. `state` is a memoised object that gets a
  // new identity whenever any of its two dozen members changes, so depending on it would re-fire
  // this fetch on every status toggle and every theme flip. The lint rule wants `state` because it
  // cannot see that; pulling the fields out tells it the truth and keeps the effect firing once.
  const { nextIndex, requestSyllabus } = state;
  useEffect(() => { if (nextIndex >= 0) requestSyllabus([nextIndex]); }, [nextIndex, requestSyllabus]);

  // `new Date()` stays inside the effect for the reason the feed effect states: a brief is text
  // derived from the clock, and deriving it during render is a hydration mismatch waiting for
  // the one load that straddles midnight.
  useEffect(() => {
    if (feed.loading) return;
    const row = state.nextRow;
    const syllabus = state.nextIndex >= 0 ? state.syllabusFor(state.nextIndex) : null;
    setBrief(buildBrief({
      focus: row ? {
        row: state.nextIndex + 1,
        topic: String(row[2]),
        status: state.statusOf(row),
        description: String(row[3] ?? ""),
        month: Number(row[1]),
        hours: Number(row[13] || 0),
      } : null,
      parts: (syllabus?.subtopics ?? []).slice(0, 6).map((part) => part.name),
      review,
      evidence: feed.next,
      streak: feed.streak,
      // Consumed from the streak rather than recomputed: it already owns the newest dated event.
      lastEventDay: feed.streak?.lastDay ?? null,
      shipped: feed.artifacts.artifacts.length,
    }, new Date()));
  }, [feed, review, state]);

  // Overview still speaks in tab names, because it is a shared component and its API is not
  // this migration's to rewrite. One adapter, here, turns the two calls it makes into routes.
  //
  // The ref is load-bearing: "By track" fires `setTrack(name)` and then `setView("Plan")` in the
  // same handler, and a filter that is now a query parameter would be thrown away by the push
  // that follows it. Holding the track until setView runs keeps both halves of that click.
  const pendingTrack = useRef<string | null>(null);
  const setTrack = (name: string) => { pendingTrack.current = name; };
  // The pace map's 23 bars each open their own month. No pending-ref dance like `setTrack` needs,
  // because a bar carries everything the jump requires in one click.
  const openMonth = (month: number) => router.push(`/plan?month=${month}`);
  const setView = (name: string) => {
    const href = NAV.find((item) => item.label === name)?.href ?? "/";
    const track = pendingTrack.current;
    pendingTrack.current = null;
    router.push(href === "/plan" && track ? `/plan?track=${encodeURIComponent(track)}` : href);
  };

  // The old single-page URL was /?tab=Market. Nobody is known to hold one, but the mapping is
  // six lines and a dead bookmark landing silently on Overview is the kind of thing nobody
  // reports. Read off `window.location` rather than useSearchParams so this route keeps its
  // static prerender and needs no Suspense boundary for a parameter that should never arrive.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const href = tab && NAV.find((item) => item.label === tab)?.href;
    if (href && href !== "/") router.replace(href);
  }, [router]);

  return <Overview
    done={state.done}
    activeRows={state.activeRows}
    skipped={state.skipped}
    hours={state.hours}
    doneHours={state.doneHours}
    skippedHours={state.skippedHours}
    weeklyHours={state.weeklyHours}
    setWeekly={state.setWeekly}
    monthHours={state.monthHours}
    maxMonthHours={state.maxMonthHours}
    peakMonth={state.peakMonth}
    nextRow={state.nextRow}
    nextIndex={state.nextIndex}
    setView={setView}
    openMonth={openMonth}
    aim={state.aim}
    trackTotals={state.trackTotals}
    setTrack={setTrack}
    marketTiers={state.marketTiers}
    brief={brief}
    // The provider's own setter: same validation, same hydration write-guard, same append-only
    // POST the Plan page uses. The session loop must not acquire a second way to write progress.
    setFocusStatus={(status) => { if (state.nextRow) state.setStatus(state.nextRow, status); }}
    readingUrl={state.nextRow ? String(state.nextRow[5] ?? "") || null : null}
    feed={feed}
  />;
}
