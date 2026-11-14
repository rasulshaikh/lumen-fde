/**
 * The three ATS adapters, normalised to one `Posting`. No classification happens here -
 * this module only knows how to talk to Ashby, Greenhouse and Lever and how to make their
 * three different JSON shapes look the same. Title patterns, field guards and skill
 * extraction all live downstream, in `classify.ts` and `skills.ts`.
 *
 * Nothing in here throws. The scan runs `Promise.allSettled` over 27 boards and the
 * critical rule from the design is that the missing-sweep only runs for boards that
 * returned `ok` - a board that throws instead of returning `{ ok: false }` would either
 * reject the settled entry (losing the error string the tab prints) or, worse, let one
 * Ashby 500 be read as "all 55 Sierra reqs disappeared", which reports 55 phantom new
 * roles on the next successful run.
 */

/** One board from `data/market-sources.json`. That file is the asset; this is just its shape. */
export type Source = {
  company: string;
  enabled: boolean;
  /** Pinned per company, never inferred from the slug: `api.lever.co/v0/postings/anyscale`
   *  returns 200 with a single tombstone posting, and Mistral's Lever board returns `[]`.
   *  Kept as `string` rather than a union so the JSON import assigns without a cast; an
   *  unrecognised value is a board error, not a compile error. */
  ats: string;
  token: string;
  listUrl: string;
  /** `{id}` template. For Greenhouse this is the stage-2 API endpoint, not a human URL. */
  jobUrl: string;
  tier: string;
  core: string[];
  adjacent: string[];
  exclude: string[];
  fieldGuards?: FieldGuard[];
  boilerplate: string[];
  verifiedMatches: number;
  /** Board total from the audit. The truncation floor is 60% of THIS, not of the match count. */
  verifiedTotal: number;
  verifiedBytes: number;
  verifiedAt: string;
  why: string;
};

/** Structured-field rules for the two companies a substring cannot get right (Sierra, Baseten). */
export type FieldGuard = {
  type: string;
  when: { titleContains?: string; teamContainsAny?: string[] };
  require?: { department?: string; team?: string };
  effect?: string;
  why: string;
};

export type Posting = {
  company: string;
  ats: string;
  /** Ashby `job.id` | Greenhouse `job.id` | Lever `posting.id`. Half the seen-set key. */
  sourceId: string;
  /** Trimmed. Case is preserved - `normalizeTitle` owns lowercasing. */
  title: string;
  /** The string exactly as the board shipped it, kept so a bad match can be diagnosed. */
  titleRaw: string;
  location: string | null;
  department: string | null;
  team: string | null;
  url: string;
  /** Display only. The seen-set decides what is new; see the note on Greenhouse below. */
  publishedAt: string | null;
  /**
   * Ashby and Lever ship the body in the listing, so it is free. Greenhouse does not, and
   * `null` here is what triggers the stage-2 `fetchJd`.
   *
   * Not uniformly plain text: Greenhouse `content` is entity-escaped HTML, and Lever's
   * requirement bullets are `<li>` fragments (see the adapter). Run `htmlToText` over any
   * `jd` before matching - it is a no-op on tag-free text.
   */
  jd: string | null;
};

export type BoardResult = { ok: boolean; postings: Posting[]; error: string | null; bytes: number };

/** Section 1's per-board budget. Ashby's largest board is 12.9 MB and has to parse inside this. */
const BOARD_TIMEOUT_MS = 45_000;
/** Stage 2 is 0-15 requests in steady state, so a tighter deadline costs nothing. */
const JD_TIMEOUT_MS = 20_000;
const JD_CONCURRENCY = 4;

/** Gem's undocumented GraphQL and Workable's widget were cut in section 8, but the config
 *  still carries those boards (disabled) with their reasons, so an ats with no adapter is a
 *  config mistake worth naming rather than a crash. */
const adapters: Record<string, (payload: unknown, source: Source) => Posting[]> = {
  ashby: fromAshby,
  greenhouse: fromGreenhouse,
  lever: fromLever,
};

const str = (value: unknown): string | null => {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
};

/** `AbortSignal.timeout` rejects with a bare "This operation was aborted", which reads as a
 *  bug rather than as the board being slow. The error string is displayed on the Market tab. */
function describe(error: unknown, ms: number) {
  const e = error as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return `timeout after ${ms / 1000}s`;
  return String(e?.message || error);
}

/**
 * Fetch a board's listing. One request, whatever the tier.
 *
 * `bytes` is the decompressed size. Node's `fetch` sends `Accept-Encoding` and inflates
 * transparently, so the wire cost is roughly 5-8x smaller and is not observable from here;
 * what this number is comparable to is `verifiedBytes` in the config (measured with curl,
 * which sends no `Accept-Encoding`) and to the parse-time and heap budget, which is the
 * figure that actually constrains the 300 s function.
 */
export async function fetchBoard(source: Source): Promise<BoardResult> {
  const empty = { ok: false, postings: [], bytes: 0 };
  const adapter = adapters[source.ats];
  if (!adapter) return { ...empty, error: `unsupported ats: ${source.ats}` };
  try {
    const response = await fetch(source.listUrl, {
      signal: AbortSignal.timeout(BOARD_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "lumen-dashboard" },
    });
    const text = await response.text();
    const bytes = Buffer.byteLength(text, "utf8");
    // A token change 404s and a board outage 5xxs; both must keep their previous lastSeen.
    if (!response.ok) return { ok: false, postings: [], error: `HTTP ${response.status}`, bytes };

    const postings = adapter(JSON.parse(text) as unknown, source);

    /**
     * Truncation guard. The worst failure mode in this system is a false negative that
     * looks like success: the Decagon audit had a fetch return 10 of 139 jobs, which
     * produced 2 matches instead of 34 and would have been written to the index as truth.
     *
     * Checked against the board TOTAL, not the match count. Comparing against matches was
     * the same bug wearing the guard's clothes: Databricks matched 97 of 870 rows, so a
     * match-based floor was 58 and a truncated fetch returning 100 of 870 sailed through
     * as healthy. Against the total the floor is 522, and the Decagon case (10 of 139)
     * fails a floor of 83 by design rather than by luck.
     */
    const floor = Math.floor(source.verifiedTotal * 0.6);
    if (postings.length < floor) {
      return { ok: false, postings: [], bytes, error: `suspiciously small: ${postings.length} of ${source.verifiedTotal} verified postings, under 60%` };
    }
    return { ok: true, postings, error: null, bytes };
  } catch (error) {
    return { ...empty, error: describe(error, BOARD_TIMEOUT_MS) };
  }
}

/**
 * Stage 2. Greenhouse only: its bare listing carries no body, and requesting `?content=true`
 * on the listing is precisely what Tier B exists to avoid (Databricks' listing is 745 KB
 * bare and would be tens of megabytes with content). Ashby and Lever already have their JD
 * from stage 1, so calling this for them is a caller mistake and returns null rather than
 * spending a request.
 *
 * Returns null on any failure. The req is then stored with `skills: null`, excluded from
 * every benchmark denominator, and retried next run - a failed fetch understates a count by
 * one rather than corrupting it.
 */
export async function fetchJd(source: Source, sourceId: string): Promise<string | null> {
  if (source.ats !== "greenhouse") return null;
  return gate(async () => {
    try {
      const response = await fetch(source.jobUrl.replace("{id}", encodeURIComponent(sourceId)), {
        signal: AbortSignal.timeout(JD_TIMEOUT_MS),
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "lumen-dashboard" },
      });
      if (!response.ok) return null;
      const job = (await response.json()) as { content?: unknown };
      return str(job.content);
    } catch {
      return null;
    }
  });
}

/**
 * Concurrency lives here rather than in the caller because the contract exposes one JD at a
 * time: a cold start has 291 of these and `Promise.all` over that list would open 291
 * sockets to one host. Four in flight is the design's figure; the caller can batch however
 * it likes and still cannot exceed it.
 */
let inFlight = 0;
const waiting: (() => void)[] = [];
async function gate<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= JD_CONCURRENCY) await new Promise<void>((resume) => waiting.push(resume));
  inFlight += 1;
  try {
    return await run();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

/**
 * The one normalisation that must happen before anything else: `title.trim()`.
 *
 * Verified live on 2026-09-07 - Anyscale ships `"Head of Customer Engineering "`, Sierra
 * ships `"Deployed Infrastructure Engineer "`, Databricks ships leading tabs and
 * dbt/Fivetran ships `" Staff Product Manager - dbt v2"`. Untrimmed, every one of those
 * silently misses an exact-prefix pattern and produces a false negative that looks like the
 * role simply not existing. `trim()` covers tabs and NBSP, both of which appear in this
 * corpus.
 */
function build(source: Source, raw: Partial<Posting> & { titleRaw: string; sourceId: string; url: string }): Posting | null {
  const title = raw.titleRaw.trim();
  // No id or no title means nothing can key or match it; a placeholder row would only
  // pollute the seen-set. This is also what drops Lever's tombstone-style empty postings.
  if (!title || !raw.sourceId) return null;
  return {
    company: source.company,
    ats: source.ats,
    sourceId: raw.sourceId,
    title,
    titleRaw: raw.titleRaw,
    location: raw.location ?? null,
    department: raw.department ?? null,
    team: raw.team ?? null,
    url: raw.url,
    publishedAt: raw.publishedAt ?? null,
    jd: raw.jd ?? null,
  };
}

type Json = Record<string, unknown>;
const rows = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/** Ashby: `{ jobs: [...] }`, `descriptionPlain` inline. There is no per-job endpoint and no
 *  way to ask for a board without bodies, so the 38.4 MB across 15 Ashby boards is a hard
 *  floor, not something a smarter request shape can avoid. */
function fromAshby(payload: unknown, source: Source): Posting[] {
  const out: Posting[] = [];
  for (const job of rows((payload as Json | null)?.jobs)) {
    const posting = build(source, {
      sourceId: String(job.id ?? ""),
      titleRaw: typeof job.title === "string" ? job.title : "",
      location: str(job.location),
      department: str(job.department),
      team: str(job.team),
      // `jobUrl` is returned per job and already absolute; the config template is the fallback.
      url: str(job.jobUrl) ?? source.jobUrl.replace("{id}", String(job.id ?? "")),
      publishedAt: str(job.publishedAt),
      jd: str(job.descriptionPlain),
    });
    if (posting) out.push(posting);
  }
  return out;
}

/** Greenhouse: the bare listing, deliberately without `?content=true`. */
function fromGreenhouse(payload: unknown, source: Source): Posting[] {
  const out: Posting[] = [];
  for (const job of rows((payload as Json | null)?.jobs)) {
    const posting = build(source, {
      sourceId: String(job.id ?? ""),
      titleRaw: typeof job.title === "string" ? job.title : "",
      location: str((job.location as Json | null)?.name),
      // Greenhouse returns `departments`/`offices` only alongside `content`, so both are
      // null on this path. Nothing depends on them: the two structured-field guards in the
      // config (Sierra department+team, Baseten team) are on Ashby boards.
      department: str((rows(job.departments)[0] ?? {}).name),
      team: null,
      // `absolute_url` is the careers-site link; `source.jobUrl` is the API template that
      // `fetchJd` uses, and putting that in front of a human would be a broken link.
      url: str(job.absolute_url) ?? source.jobUrl.replace("{id}", String(job.id ?? "")),
      // Deliberately not falling back to `updated_at`: it churns on any edit including typo
      // fixes, so displaying it as a publish date would date reqs to their last spelling
      // correction. It is also why the seen-set, not a timestamp, decides what is new.
      publishedAt: str(job.first_published),
      jd: null,
    });
    if (posting) out.push(posting);
  }
  return out;
}

/** Lever: a bare array, `?mode=json`. No listing-only mode exists, so Palantir's 6 MB buys
 *  the densest board in the corpus (110 matches) in one request. */
function fromLever(payload: unknown, source: Source): Posting[] {
  const out: Posting[] = [];
  for (const job of rows(payload)) {
    const categories = (job.categories as Json | null) ?? {};
    // Measured against api.lever.co/v0/postings/palantir on 2026-09-07: `descriptionPlain`
    // is only the company blurb plus the role narrative - every requirement and qualification
    // bullet lives in `lists[].content`, and the string "What We Require" does not appear in
    // `descriptionPlain` at all. Dropping the lists would silently blank the requirements of
    // 110 reqs, which is the exact false-negative-that-looks-like-success this design is
    // most exposed to. They arrive as `<li>` fragments, hence the htmlToText note on `jd`.
    // `additionalPlain` is left out on purpose: it is the "Life at Palantir" perks tail,
    // which is what section scoping exists to cut.
    const lists = rows(job.lists)
      .map((list) => `${str(list.text) ?? ""}\n${str(list.content) ?? ""}`.trim())
      .filter(Boolean)
      .join("\n");
    const body = [str(job.descriptionPlain), lists || null].filter(Boolean).join("\n");
    const created = typeof job.createdAt === "number" ? new Date(job.createdAt).toISOString() : null;
    const posting = build(source, {
      sourceId: String(job.id ?? ""),
      // Lever calls the title `text`.
      titleRaw: typeof job.text === "string" ? job.text : "",
      location: str(categories.location),
      department: str(categories.department),
      team: str(categories.team),
      url: str(job.hostedUrl) ?? source.jobUrl.replace("{id}", String(job.id ?? "")),
      publishedAt: created,
      jd: body || null,
    });
    if (posting) out.push(posting);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ *
 * Broad market feed (external source, off by default).
 *
 * A second, wider view of the market produced outside this app: a daily JSON file written
 * by Rasul's own n8n jobs suite (about 600 ATS boards plus a niche board radar) into a
 * PRIVATE location. This repo is public, so the feed is read at request time with its own
 * token and is never written back here: not to reports/, not to data/, not to a commit.
 *
 * It is deliberately separate from the 27-board benchmark above. Nothing in this section is
 * used by `fetchBoard`, `fetchJd`, classify.ts or benchmark.ts, and the benchmark numbers
 * must not move when the flag is turned on.
 *
 * Contract (`lumen_broad_feed/v1`): metadata only. Company, title, lane, location, region,
 * ATS, board, url and posted date. No JD text, no pay text, no contact data. Unknown keys
 * are dropped on read, so a producer that starts shipping a `text` field cannot leak it
 * through this module.
 * ------------------------------------------------------------------------------------------ */

export const BROAD_FEED_SCHEMA = "lumen_broad_feed/v1";
/** Upper bounds that keep one bad producer run from blowing the function's heap or the UI. */
export const BROAD_FEED_MAX_ROWS = 20_000;
export const BROAD_FEED_MAX_AGE_DAYS = 3;
const BROAD_FEED_TIMEOUT_MS = 15_000;
const BROAD_TEXT_MAX = 200;

export type BroadRegion = "india" | "worldwide" | "unstated" | "check" | "no";

export type BroadRow = {
  /** Producer dedupe key, for example `ats:ashby:exa:<job id>`. */
  id: string;
  company: string;
  title: string;
  /** Producer lane: fde, gtm_engineer, revops, applied_ai, founding, or another short tag. */
  lane: string;
  location: string | null;
  remote: boolean;
  region: BroadRegion;
  /** ATS vendor or feed family: ashby, greenhouse, lever, workable, hn, niche and so on. */
  ats: string;
  board: string;
  url: string;
  /** YYYY-MM-DD or null when the board ships no date. */
  postedAt: string | null;
};

export type BroadSourceStatus = { source: string; ok: boolean; postings: number; matched: number; error: string | null };

export type BroadFeed = {
  schema: typeof BROAD_FEED_SCHEMA;
  generatedAt: string;
  day: string;
  /** True only on hand-made fixtures. A live read that says `example: true` is rejected. */
  example: boolean;
  sources: BroadSourceStatus[];
  rows: BroadRow[];
  /** Rows dropped on read for failing the contract. Non-zero is worth a look, not an outage. */
  dropped: number;
};

export type BroadFeedResult =
  | { enabled: false; ok: false; feed: null; error: null }
  | { enabled: true; ok: boolean; feed: BroadFeed | null; error: string | null };

export type BroadFeedConfig = { flag: string | undefined; repo: string | undefined; path: string; branch: string; token: string | undefined };

/** Read config from the environment. The flag must be exactly `on`; anything else is off. */
export function broadFeedConfig(env: Record<string, string | undefined> = process.env): BroadFeedConfig {
  return {
    flag: env.MARKET_BROAD_FEED,
    repo: env.MARKET_BROAD_FEED_REPO,
    path: env.MARKET_BROAD_FEED_PATH || "broad/latest.json",
    branch: env.MARKET_BROAD_FEED_BRANCH || "main",
    token: env.MARKET_BROAD_FEED_TOKEN,
  };
}

export const broadFeedEnabled = (config: BroadFeedConfig) => config.flag === "on";

const REGIONS = new Set<BroadRegion>(["india", "worldwide", "unstated", "check", "no"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const short = (value: unknown, max = BROAD_TEXT_MAX): string | null => {
  const s = str(value);
  return s ? s.slice(0, max) : null;
};
const tag = (value: unknown): string | null => {
  const s = str(value)?.toLowerCase().replace(/[^a-z0-9_:.-]/g, "_").slice(0, 60);
  return s || null;
};

/** One row in, one whitelisted row out, or null. Nothing outside the contract survives. */
function broadRow(raw: unknown): BroadRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  const id = short(r.id, 300);
  const company = short(r.company);
  const title = short(r.title);
  const url = str(r.url);
  const ats = tag(r.ats);
  if (!id || !company || !title || !url || !ats) return null;
  // Only absolute https links reach a human. Anything else is a producer bug, not a row.
  if (!/^https:\/\/[^\s]+$/i.test(url) || url.length > 1000) return null;
  const region = (str(r.region)?.toLowerCase() ?? "unstated") as BroadRegion;
  const posted = str(r.posted_at ?? r.postedAt);
  return {
    id,
    company,
    title,
    lane: tag(r.lane) ?? "other",
    location: short(r.location),
    remote: r.remote === true,
    region: REGIONS.has(region) ? region : "unstated",
    ats,
    board: tag(r.board) ?? ats,
    url,
    postedAt: posted && DAY.test(posted.slice(0, 10)) ? posted.slice(0, 10) : null,
  };
}

/**
 * Validate and normalise a parsed feed. Pure, so the contract is testable without a network.
 * `now` is injectable for the staleness check.
 */
export function parseBroadFeed(payload: unknown, now = new Date(), allowExample = false): { feed: BroadFeed | null; error: string | null } {
  if (!payload || typeof payload !== "object") return { feed: null, error: "feed is not an object" };
  const p = payload as Json;
  if (p.schema !== BROAD_FEED_SCHEMA) return { feed: null, error: `unexpected schema: ${String(p.schema).slice(0, 40)}` };
  const day = str(p.day);
  if (!day || !DAY.test(day)) return { feed: null, error: "feed has no valid day" };
  if (p.example === true && !allowExample) return { feed: null, error: "example feed refused outside tests" };
  const ageDays = Math.floor((now.getTime() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays > BROAD_FEED_MAX_AGE_DAYS) return { feed: null, error: `feed is stale: ${day}` };
  const rawRows = Array.isArray(p.rows) ? p.rows : null;
  if (!rawRows) return { feed: null, error: "feed has no rows array" };
  if (rawRows.length > BROAD_FEED_MAX_ROWS) return { feed: null, error: `feed too large: ${rawRows.length} rows` };

  const seen = new Set<string>();
  const kept: BroadRow[] = [];
  let dropped = 0;
  for (const raw of rawRows) {
    const row = broadRow(raw);
    if (!row || seen.has(row.id)) { dropped += 1; continue; }
    seen.add(row.id);
    kept.push(row);
  }
  const count = (value: unknown) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
  const sources: BroadSourceStatus[] = rows(p.sources).map((s) => ({
    source: tag(s.source) ?? "unknown",
    ok: s.ok === true,
    postings: count(s.postings),
    matched: count(s.matched),
    error: short(s.error),
  }));
  return {
    feed: { schema: BROAD_FEED_SCHEMA, generatedAt: str(p.generated_at ?? p.generatedAt) ?? `${day}T00:00:00Z`, day, example: p.example === true, sources, rows: kept, dropped },
    error: null,
  };
}

/**
 * Fetch the daily feed. Never throws. With the flag off this makes no request at all and
 * reports `enabled: false`, which is the default for every environment.
 *
 * Reads through the GitHub contents API with the raw media type (the base64 JSON form stops
 * at 1 MB; a full day is around 1 MB). The token is its own variable, scoped read-only to the
 * private feed repo, never the GITHUB_TOKEN that writes this public repo's reports.
 */
export async function fetchBroadFeed(config: BroadFeedConfig = broadFeedConfig(), now = new Date()): Promise<BroadFeedResult> {
  if (!broadFeedEnabled(config)) return { enabled: false, ok: false, feed: null, error: null };
  if (!config.repo || !config.token) return { enabled: true, ok: false, feed: null, error: "broad feed is on but MARKET_BROAD_FEED_REPO or MARKET_BROAD_FEED_TOKEN is missing" };
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) return { enabled: true, ok: false, feed: null, error: "MARKET_BROAD_FEED_REPO must be owner/name" };
  try {
    const url = `https://api.github.com/repos/${config.repo}/contents/${config.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(config.branch)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(BROAD_FEED_TIMEOUT_MS),
      cache: "no-store",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github.raw+json", "User-Agent": "lumen-dashboard", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) return { enabled: true, ok: false, feed: null, error: `HTTP ${response.status}` };
    const { feed, error } = parseBroadFeed(JSON.parse(await response.text()) as unknown, now);
    return { enabled: true, ok: Boolean(feed), feed, error };
  } catch (error) {
    return { enabled: true, ok: false, feed: null, error: describe(error, BROAD_FEED_TIMEOUT_MS) };
  }
}

/** Counts only. Safe to log or return from the cron: no company names, titles or links. */
export function summarizeBroad(result: BroadFeedResult) {
  const feed = result.feed;
  const count = (key: "lane" | "ats" | "region") => {
    const out: Record<string, number> = {};
    for (const row of feed?.rows ?? []) out[row[key]] = (out[row[key]] ?? 0) + 1;
    return out;
  };
  return {
    enabled: result.enabled,
    ok: result.ok,
    error: result.error,
    day: feed?.day ?? null,
    rows: feed?.rows.length ?? 0,
    dropped: feed?.dropped ?? 0,
    sources: feed?.sources.length ?? 0,
    sourcesOk: feed?.sources.filter((s) => s.ok).length ?? 0,
    companies: new Set(feed?.rows.map((r) => r.company.toLowerCase()) ?? []).size,
    byLane: count("lane"),
    byAts: count("ats"),
    byRegion: count("region"),
  };
}
