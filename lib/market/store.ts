/**
 * Persistence for the job-market benchmark: five files in the repo, each read whole and
 * written whole with its sha, exactly as `app/api/review/route.ts` does it.
 *
 * The same rationale applies here as there, for the same reason: this is mutable state
 * rewritten on every scan, not an append-only history. It is deliberately NOT modelled on
 * `app/api/progress/route.ts`, which lists a directory and then re-fetches every file
 * individually — an N+1 against the GitHub API, capped at the newest 100. That shape is
 * right for a history; it would be ruinous for an inventory the cron rewrites daily.
 *
 * Nothing in here throws on a GitHub failure and nothing here is fatal. A missing
 * GITHUB_TOKEN degrades to `synced: false` with null data, so the cron can still run a scan
 * and the digest can still send its study brief. The one rule the callers must honour is
 * that `synced: false` means "we do not know", never "the file is empty" — writing a
 * benchmark computed from a failed read would silently reset the seen-set and report every
 * requisition in the corpus as new the following day.
 */

// Type-only: reach.ts is pure and importing it for a value would be harmless, but nothing in
// this file classifies anything — the scan hands the tier in already computed.
import type { ReachTier } from "./reach";

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";

export const INDEX_PATH = "reports/market/index.json";
export const BENCHMARK_PATH = "reports/market/benchmark.json";
export const TREND_PATH = "reports/market/trend.json";
/**
 * The personal reading of the benchmark. Separate file, not a key inside benchmark.json,
 * because benchmark.json is impersonal and publishable and this one is neither — and because
 * a scan that fails to write this one must still leave a correct benchmark behind.
 */
export const INSIGHT_PATH = "reports/market/insight.json";
/** Write-only archive. Nothing in a request path ever lists or reads this directory. */
export const historyPath = (day: string) => `reports/market/history/${day}.json`;

/** Board outcome for one company for one run. `ok: false` is what protects the seen-set. */
export type BoardStatus = {
  ok: boolean;
  total: number;
  matched: number;
  bytes: number;
  fetchedAt: string;
  error: string | null;
};

/** Only these three classes are ever persisted — see `markSeen`. */
export type ReqClass = "core" | "adjacent" | "leadership";

export type ReqRecord = {
  company: string;
  title: string;
  /** Dedupe key from classify.ts: company + "::" + normalized title, collapsing city clones. */
  key: string;
  location: string;
  url: string;
  class: ReqClass;
  publishedAt: string;
  firstSeen: string;
  lastSeen: string;
  missingSince: string | null;
  /**
   * The skill fingerprint, and the ONLY thing kept from the job description.
   *
   * The JD text itself is fetched, stripped, matched and discarded in memory. Storing it
   * would turn this file from ~500 KB into ~40 MB (the measured decompressed corpus is
   * 47 MB/day, 38 MB of it Ashby descriptions), which makes read-whole/write-whole
   * untenable against the GitHub contents API. The fingerprint is also what lets the
   * benchmark be recomputed with no network at all when the skill map's phrasing or
   * plan-row mapping changes.
   *
   * `null` means the JD fetch failed and will be retried; such a req is excluded from every
   * benchmark denominator, so a failure understates a count rather than corrupting it.
   */
  skills: string[] | null;
  /**
   * The reachability tier, and the second thing reduced out of the JD before it is discarded.
   *
   * `location` alone gets three of the five tiers, so this field exists only for the two it
   * cannot: the US-person clause and the active-clearance clause live in the JD body and
   * nowhere else. Same treatment as `skills` for the same reason — the body is matched to a
   * small value in memory and never stored.
   *
   * Optional, and absent on every requisition scanned before the field existed. A missing
   * value is unknown, not `relocate-sponsor`: consumers re-derive from `location` and say so,
   * and the next scan of that board fills it in. Making it required would mean re-scanning
   * 47 MB to backfill a field that arrives free on the next cycle.
   *
   * `null` means "no body this run" — see `markSeen`, which keeps the stored tier instead.
   */
  reach?: ReachTier | null;
};

export type MarketIndex = {
  version: number;
  updatedAt: string;
  /** Index of the next board to start; a full cycle has completed only when it wraps to 0. */
  cursor: number;
  boardsOk: number;
  /** Keyed by the board token, which is also the prefix of every req id from that board. */
  boards: Record<string, BoardStatus>;
  /** Keyed by `${token}::${sourceId}`. Presence here — not `updated_at` — defines "new". */
  reqs: Record<string, ReqRecord>;
};

export type TrendPoint = { d: string; core: number; companies: number; s: Record<string, number> };

/** Cold start. `reqs` empty is the signal for `baseline: true` and no new-roles list. */
export const emptyIndex = (): MarketIndex => ({
  version: 1,
  updatedAt: "",
  cursor: 0,
  boardsOk: 0,
  boards: {},
  reqs: {},
});

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lumen-dashboard",
  };
}

/**
 * Read one file whole.
 *
 * A 404 is not an error — it is the cold start, and every one of these files is absent on
 * the first run. It returns `synced: true` with null data so the caller can tell "the file
 * does not exist yet" (safe to create) apart from "GitHub did not answer" (never overwrite).
 */
export async function readJson<T>(path: string): Promise<{ data: T | null; sha: string | null; synced: boolean; error: string | null }> {
  if (!process.env.GITHUB_TOKEN) return { data: null, sha: null, synced: false, error: null };
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, { headers: headers(), cache: "no-store" });
    if (response.status === 404) return { data: null, sha: null, synced: true, error: null };
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `GitHub returned ${response.status}`);
    return { data: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) as T, sha: body.sha, synced: true, error: null };
  } catch (error) {
    return { data: null, sha: null, synced: false, error: String((error as Error).message || error) };
  }
}

/**
 * Write one file whole.
 *
 * Serialized with indent 1, as the review route does: diffable in GitHub's UI without
 * paying pretty-print bytes on a file that is already the largest thing this repo commits.
 * index.json is ~500 KB, roughly 700 KB once base64'd — inside the contents API's practical
 * ceiling, which is the other reason JD text is never stored.
 */
export async function writeJson(path: string, data: unknown, sha: string | null): Promise<{ ok: boolean; sha: string | null; synced: boolean; error: string | null }> {
  if (!process.env.GITHUB_TOKEN) return { ok: false, sha: null, synced: false, error: null };
  try {
    const payload: Record<string, unknown> = {
      message: `market: update ${path}`,
      content: Buffer.from(JSON.stringify(data, null, 1)).toString("base64"),
      branch,
    };
    // Without the sha GitHub rejects an update to an existing file, and sending a stale one
    // is how two runs silently clobber each other. History files are new every day and
    // correctly pass null.
    if (sha) payload.sha = sha;
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `GitHub returned ${response.status}`);
    return { ok: true, sha: body.content?.sha ?? null, synced: true, error: null };
  } catch (error) {
    return { ok: false, sha: null, synced: false, error: String((error as Error).message || error) };
  }
}

/** The study-progress history: one markdown file per event, as POST /api/progress writes it. */
export const PROGRESS_DIR = "reports/progress";

/**
 * Newest first, and structurally exactly what `computeInsight` reads.
 *
 * Declared here rather than imported from insight.ts, which already imports types from this
 * file: a four-field record is cheaper than a type cycle between the pure module and the
 * network one, and the compiler still holds the two shapes together at the call site.
 */
export type ProgressEntry = { topic: string; status: string; date: string };

/**
 * Read the study-progress history: list the directory, then fetch every file.
 *
 * This is the N+1 the header above refuses for the index, and it is right here for the reason
 * stated there — an append-only history of small markdown files is exactly the shape that
 * listing suits. It is deliberately the same listing, the same newest-100 slice and the same
 * three regexes as GET /api/progress: readiness matches events to plan rows by topic string,
 * and a second parser would let the tab and the tab's own readiness number disagree about
 * which rows are done.
 *
 * Newest 100, not oldest. Ascending is what GitHub returns and slicing it was a live bug in
 * the route: past a hundred events a topic's status could never advance again.
 *
 * `null` means "we do not know", never "no progress", and it is all-or-nothing on purpose. A
 * partial set — one file's fetch failing inside a Promise.all that kept the rest — would drop
 * a `done` event, lower readiness by that skill's whole market share and raise a readiness
 * flag out of a network blip. With null, the insight reports zero matched events in its own
 * statement, which reads as missing data instead of as regression.
 */
export async function readProgress(): Promise<{ events: ProgressEntry[] } | null> {
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const listing = await fetch(`https://api.github.com/repos/${repo}/contents/${PROGRESS_DIR}?ref=${branch}`, { headers: headers(), cache: "no-store" });
    // 404 is a history that has not started yet, which is genuinely empty rather than unknown.
    if (listing.status === 404) return { events: [] };
    const files = await listing.json();
    if (!listing.ok) throw new Error(files.message || `GitHub returned ${listing.status}`);

    // Filenames start with an ISO stamp, so name order is chronological.
    const newest = (files as { name: string; path: string }[])
      .filter((file) => file?.name?.endsWith(".md"))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 100);

    const events = await Promise.all(
      newest.map(async (file) => {
        const response = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}?ref=${branch}`, { headers: headers(), cache: "no-store" });
        const item = await response.json();
        if (!response.ok) throw new Error(item.message || `GitHub returned ${response.status}`);
        const body = Buffer.from(item.content ?? "", "base64").toString("utf8");
        // The filename fallback is intentionally not a plan topic: an unparseable file matches
        // no row and is counted as unmatched, rather than guessed onto one.
        return {
          topic: body.match(/^Topic:\s*(.+)$/m)?.[1] || file.name,
          status: body.match(/^Status:\s*(.+)$/m)?.[1] || "Not started",
          date: body.match(/^Date:\s*(.+)$/m)?.[1] || "",
        };
      }),
    );
    return { events };
  } catch {
    return null;
  }
}

/** A req absent from an OK board this long is treated as closed and deleted. */
export const MISSING_DAYS = 14;
/** Hard ceiling on stored requisitions, evicting oldest `lastSeen` first. */
export const MAX_REQS = 3000;
/** Trend points kept, one per full cycle — about six months, ~40 KB at cap. */
export const TREND_POINTS = 180;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

/** The board token is the id prefix, so a req always knows which board owns it. */
const boardOf = (id: string) => id.slice(0, id.indexOf("::"));

export type SeenReq = Omit<ReqRecord, "firstSeen" | "lastSeen" | "missingSince" | "class"> & {
  class: ReqClass | "junior" | null;
};

/**
 * Record a requisition seen on this run. Returns false when it was deliberately not stored.
 *
 * Junior and unmatched postings are never written at all — that is the first of the three
 * bounding mechanisms, and it is the cheapest: Palantir alone ships 34 Intern / New Grad /
 * "Year at Palantir" variants that would otherwise decay through the seen-set for a
 * fortnight each and never contribute to a number.
 *
 * `firstSeen` is preserved on an existing entry because it is the only durable record of
 * when a role appeared; everything else is refreshed from the live posting, since titles and
 * locations do get edited in place.
 */
export function markSeen(index: MarketIndex, id: string, seen: SeenReq, day: string): boolean {
  if (seen.class === null || seen.class === "junior") return false;
  const previous = index.reqs[id];
  index.reqs[id] = {
    company: seen.company,
    title: seen.title,
    key: seen.key,
    location: seen.location,
    url: seen.url,
    class: seen.class,
    publishedAt: seen.publishedAt,
    firstSeen: previous?.firstSeen ?? day,
    lastSeen: day,
    // Stage 2 only fetches a JD for a req that is new or whose skills are null, so on every
    // other run `seen.skills` is null for Greenhouse. Assigning it straight through would
    // wipe the fingerprint of every already-known Greenhouse req and drop it out of the
    // denominators — the counts would fall each run for no reason in the market.
    skills: seen.skills ?? previous?.skills ?? null,
    // Same rule as `skills`, and here it is not merely a lost value but a wrong one. Without a
    // body the scan can only tier from `location`, and that pass is an upper bound: the body is
    // the only thing that ever moves a req INTO `out-of-reach`. Assigning a bodyless tier
    // through would quietly promote every cleared Palantir and Anduril req back into the
    // reachable slice on the second run — the denominator of "the market you can actually
    // take" would grow while the market did nothing.
    reach: seen.reach ?? previous?.reach ?? null,
    // Seen again clears the decay clock; a req that flickers must not accumulate absence.
    missingSince: null,
  };
  return true;
}

/**
 * Age out requisitions that have vanished from their board.
 *
 * `seenIds` must contain every id recorded this run, and the sweep only touches reqs whose
 * board reported `ok: true` this run. That restriction is the single most important rule in
 * the file: without it one Ashby 500 marks all 55 Sierra reqs missing, and the next
 * successful run reports 55 phantom new roles into the digest. A failed board's entries keep
 * their previous `lastSeen` and `missingSince` untouched.
 *
 * Call this only on a full cycle. A cursor-truncated partial run has not visited every
 * board, so its `seenIds` is incomplete by construction.
 */
export function sweepMissing(index: MarketIndex, seenIds: Set<string>, day: string): { missing: number; deleted: number } {
  let missing = 0;
  let deleted = 0;
  for (const [id, req] of Object.entries(index.reqs)) {
    if (seenIds.has(id)) continue;
    if (!index.boards[boardOf(id)]?.ok) continue;
    const since = req.missingSince ?? day;
    // Board absence means the req closed. 14 days is slack for a board that briefly serves a
    // truncated list without failing outright — the truncation guard catches the big cases,
    // this catches the small ones without resurrecting a role as "new" the next morning.
    if (daysBetween(since, day) >= MISSING_DAYS) {
      delete index.reqs[id];
      deleted += 1;
      continue;
    }
    req.missingSince = since;
    missing += 1;
  }
  return { missing, deleted };
}

/**
 * Hard-cap the seen-set, evicting the stalest entries first.
 *
 * Steady state is ~420 live reqs plus up to two weeks of decay, so this never fires in
 * normal operation. It exists for the failure it cannot otherwise survive: a board token
 * that starts resolving to somebody else's careers page returns a couple of thousand
 * unrelated roles, and every one of them would be written, permanently inflating both the
 * file and the denominators.
 */
export function capReqs(index: MarketIndex, max = MAX_REQS): number {
  const ids = Object.keys(index.reqs);
  if (ids.length <= max) return 0;
  ids.sort((a, b) => {
    const al = index.reqs[a].lastSeen;
    const bl = index.reqs[b].lastSeen;
    if (al !== bl) return al < bl ? -1 : 1;
    return a < b ? -1 : 1; // deterministic on ties, so two runs evict the same rows
  });
  const evict = ids.slice(0, ids.length - max);
  for (const id of evict) delete index.reqs[id];
  return evict.length;
}

/**
 * Append one point to the trend and truncate to the tail.
 *
 * Replaces same-day points rather than appending them, so a re-run of the cron on a day it
 * already completed does not put two points on the sparkline and misreport the interval
 * between them as movement.
 */
export function appendTrend(points: TrendPoint[] | null, point: TrendPoint, cap = TREND_POINTS): TrendPoint[] {
  const kept = (points ?? []).filter((p) => p.d !== point.d);
  kept.push(point);
  return kept.slice(-cap);
}
