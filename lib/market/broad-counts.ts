import { broadFeedConfig, broadFeedEnabled, fetchBroadFeed, summarizeBroad } from "./fetch";

/**
 * Counts-only read of the private broad market feed, for the card on /market.
 *
 * Behind the proxy's session gate like /api/market: proxy.ts exempts only /api/cron, so an
 * unauthenticated call gets 401 JSON. Even signed in, nothing row-level leaves the server:
 * the response is totals, lane counts and region counts. No company names, titles, links,
 * board names or error text, because the feed lives in a private repo and this app is public.
 *
 * Cached in module memory for an hour per warm instance. The feed changes once a day, and a
 * cold start costs one GitHub read, so the tab never fetches the feed on every request.
 */
export const BROAD_LANES = ["fde", "gtm_engineer", "applied_ai", "founding", "revops"] as const;
export const BROAD_REGIONS = ["india", "worldwide", "unstated", "check", "no"] as const;
const TTL_MS = 60 * 60 * 1000;

export type BroadCounts =
  | { enabled: false }
  | { enabled: true; ok: false }
  | {
      enabled: true;
      ok: true;
      day: string;
      rows: number;
      sources: number;
      sourcesOk: number;
      companies: number;
      byLane: Record<(typeof BROAD_LANES)[number] | "other", number>;
      byRegion: Record<(typeof BROAD_REGIONS)[number], number>;
    };

let cached: { at: number; value: BroadCounts } | null = null;

/** Test hook: drop the memo so each case starts cold. */
export function resetBroadCache() { cached = null; }

export async function readBroadCounts(now = Date.now()): Promise<BroadCounts> {
  if (!broadFeedEnabled(broadFeedConfig())) return { enabled: false };
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const summary = summarizeBroad(await fetchBroadFeed());
  let value: BroadCounts;
  if (!summary.ok || !summary.day || summary.rows === 0) {
    value = { enabled: true, ok: false };
  } else {
    // Whitelisted keys only, so a producer tag can never carry a name through to the page.
    const byLane = Object.fromEntries([...BROAD_LANES, "other"].map((k) => [k, 0])) as Record<(typeof BROAD_LANES)[number] | "other", number>;
    for (const [lane, n] of Object.entries(summary.byLane)) {
      const key = (BROAD_LANES as readonly string[]).includes(lane) ? (lane as (typeof BROAD_LANES)[number]) : "other";
      byLane[key] += n;
    }
    const byRegion = Object.fromEntries(BROAD_REGIONS.map((k) => [k, summary.byRegion[k] ?? 0])) as Record<(typeof BROAD_REGIONS)[number], number>;
    value = { enabled: true, ok: true, day: summary.day, rows: summary.rows, sources: summary.sources, sourcesOk: summary.sourcesOk, companies: summary.companies, byLane, byRegion };
  }
  // A failed read is cached for 10 minutes rather than an hour, so a fixed token shows up soon.
  cached = { at: value.enabled && !value.ok ? now - TTL_MS + 10 * 60 * 1000 : now, value };
  return value;
}
