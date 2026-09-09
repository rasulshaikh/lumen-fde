/**
 * The external brief: what is happening outside this repository.
 *
 * Everything else Lumen knows is a file it can show you. This module is the one exception, and it
 * is built so that it stays checkable anyway: nothing is stored without a source URL and the day
 * it was fetched, and nothing reaches the model that does not carry both.
 *
 * ## Why a stored brief rather than live search by default
 *
 * A question answered from a live search is not reproducible — ask it twice and you can get two
 * different answers with no way to tell which was right. A brief fetched on a schedule and
 * committed to the repo is a file, exactly like the market scan: diffable, dated, and the same
 * for every reader of it until the next fetch. Live search still exists for when currency matters
 * more than reproducibility, but it is opt-in per question rather than the default.
 *
 * ## The rule that keeps the numbers trustworthy
 *
 * **External text is context. It never overrides an internal number.** The plan's hours, the
 * benchmark's shares and the readiness figure come from files in this repo and are the things the
 * product stakes its credibility on. A blog post claiming a different market share does not
 * change `benchmark.json`; it is an outside opinion sitting next to a measurement, and the prompt
 * says so in those words.
 */
import { readJson, writeJson } from "@/lib/market/store";

export const EXTERNAL_DIR = "reports/external";
export const LATEST_PATH = `${EXTERNAL_DIR}/latest.json`;
export const externalPath = (day: string) => `${EXTERNAL_DIR}/${day}.json`;

/** Items kept per brief. Small on purpose — five cited lines beat forty diluted ones. */
export const MAX_ITEMS = 6;

/** How old a brief may be before the UI must say so rather than presenting it as current. */
export const STALE_AFTER_DAYS = 3;

/**
 * Two timeouts, both derived from measurement, both bounded by Vercel Hobby.
 *
 * This endpoint runs a live Google scrape and is genuinely slow. Timed against the live API,
 * twice: **38.6s** (21.5KB) and **27.3s** (7.9KB). Those two numbers killed the first version of
 * this file, which gave live search 18s and the scheduled fetch 45s. 18s would have aborted every
 * single live search; three *sequential* 45s calls could not fit a 120s function. Both constants
 * were written before the endpoint was timed and both would have failed in the only way that
 * matters — silently, while looking configured.
 *
 * The second constraint is the plan. Hobby caps a function at 60s, so 120s was never available
 * either, and both numbers below are subtraction from 60 rather than round figures:
 *
 *   45s  the slowest call plus margin, leaving ~15s for the GitHub reads and the two writes
 *   45s  the same, in a function that does nothing else — the search IS the request
 *
 * They are equal today and kept separate anyway, because they are bounded by different things:
 * one shares its function with two commits, the other does not. Collapsing them into one constant
 * would lose the reason either can move.
 */
export const LIVE_TIMEOUT_MS = 45_000;
export const REFRESH_TIMEOUT_MS = 45_000;

export type BriefItem = {
  title: string;
  /** Absolute URL. An item without one is dropped — an uncited claim is worse than no claim. */
  url: string;
  /** The engine's snippet, trimmed. Never rewritten by a model before storage. */
  snippet: string;
  /** The query that surfaced it, so a strange item can be traced to what asked for it. */
  query: string;
};

export type ExternalBrief = {
  version: 1;
  /** UTC day this brief was fetched. */
  day: string;
  queries: string[];
  items: BriefItem[];
  /** Set when the fetch partly failed, so the reader knows this is a short brief, not a quiet one. */
  note: string | null;
};

export const emptyBrief = (day: string): ExternalBrief => ({ version: 1, day, queries: [], items: [], note: null });

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * One SurfSense Google-Search call.
 *
 * The path carries `/api/v1`, which `mcp/server.js` omitted. That omission made every SurfSense
 * search 404 and fall through to a GitHub code search of this repo — so `semantic_search` has
 * been answering web questions with repository matches since it shipped, and saying so only in an
 * audit line nobody reads. Verified against the live spec: the endpoint is
 * /api/v1/workspaces/{id}/scrapers/google_search/scrape, and it returns 200. Throws rather than
 * returning empty, because "configured but failing" and "returned nothing" are different facts
 * and only one of them is worth retrying.
 */
export async function searchWeb(query: string, pages = 1, timeoutMs = LIVE_TIMEOUT_MS): Promise<unknown> {
  const key = process.env.SURFSENSE_API_KEY;
  const workspace = process.env.SURFSENSE_WORKSPACE_ID;
  if (!key || !workspace) throw new Error("SurfSense is not configured (SURFSENSE_API_KEY, SURFSENSE_WORKSPACE_ID).");
  const base = (process.env.SURFSENSE_API_URL || "https://api.surfsense.com").replace(/\/$/, "");
  const response = await fetch(`${base}/api/v1/workspaces/${encodeURIComponent(workspace)}/scrapers/google_search/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: [String(query)],
      country_code: "in",
      language_code: "en",
      max_pages_per_query: Math.min(Math.max(pages, 1), 3),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message || `SurfSense failed with ${response.status}`);
  return data;
}

/**
 * Pull cited items out of whatever shape the engine returned.
 *
 * Deliberately tolerant about the envelope and strict about the item: the response shape is
 * someone else's and may change, but an item without an absolute http(s) URL is dropped whatever
 * the envelope looked like. That is the one property this module exists to guarantee.
 */
export function extractItems(payload: unknown, query: string): BriefItem[] {
  const out: BriefItem[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    const url = clean(o.url ?? o.link ?? o.href, 500);
    const title = clean(o.title ?? o.name ?? o.heading, 200);
    if (/^https?:\/\//i.test(url) && title && !seen.has(url)) {
      seen.add(url);
      out.push({ title, url, snippet: clean(o.snippet ?? o.description ?? o.text ?? o.content, 320), query });
    }
    Object.values(o).forEach(visit);
  };
  visit(payload);
  return out;
}

/**
 * The queries, derived rather than typed.
 *
 * They follow the market the scan actually measured, so the brief tracks the plan instead of a
 * list someone wrote once. `skills` are the highest-share skill names from the benchmark.
 */
export function briefQueries(skills: string[]): string[] {
  // Trimmed before the truthiness test, because `Boolean("  ")` is true and a whitespace label —
  // which the benchmark's coverage rows can carry — would otherwise spend one of three nightly
  // queries on the string " industry adoption news".
  const top = skills.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 2);
  return [
    "forward deployed engineer hiring trends",
    ...top.map((s) => `${s} industry adoption news`),
  ].slice(0, 3);
}

export async function readLatestBrief(): Promise<{ brief: ExternalBrief | null; synced: boolean }> {
  const { data, synced } = await readJson<ExternalBrief>(LATEST_PATH);
  if (!synced) return { brief: null, synced: false };
  return { brief: data ?? null, synced: true };
}

export async function writeBrief(brief: ExternalBrief, latestSha: string | null) {
  // The dated file is a new path every day and correctly passes no sha; `latest.json` is
  // rewritten and needs the one it was read with, or two runs silently clobber each other.
  const dated = await writeJson(externalPath(brief.day), brief, null, `external: brief ${brief.day}`);
  const latest = await writeJson(LATEST_PATH, brief, latestSha, `external: update ${LATEST_PATH}`);
  return { dated, latest };
}

/** Whole days between the brief's day and now; null when unparseable or dated ahead. */
export function briefAgeDays(day: string, now: Date): number | null {
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) return null;
  return Math.round((b - a) / 864e5);
}

/**
 * The brief as prompt text.
 *
 * Every line carries its URL, the block states its own date and age, and the last sentence is the
 * rule that keeps the rest of the product honest: this is outside context and it does not
 * override anything measured in the repository.
 */
export function externalContext(brief: ExternalBrief | null, now: Date): string {
  if (!brief || !brief.items.length) return "";
  const age = briefAgeDays(brief.day, now);
  const stale = age !== null && age > STALE_AFTER_DAYS;
  const head = `OUTSIDE CONTEXT — a stored web brief fetched on ${brief.day}${age !== null ? ` (${age} day${age === 1 ? "" : "s"} old)` : ""}${stale ? ", WHICH IS STALE — say so if you use it" : ""}.`;
  const lines = brief.items.slice(0, MAX_ITEMS).map((i) => `- ${i.title} — ${i.url}${i.snippet ? `\n  ${i.snippet}` : ""}`);
  return [
    head,
    ...lines,
    "Cite the URL whenever you use one of these. This is outside opinion: it NEVER overrides a number measured in this repository (the plan's hours, the benchmark's shares, the readiness figure). If it disagrees with a measured number, say both and say which one is measured.",
  ].join("\n");
}
