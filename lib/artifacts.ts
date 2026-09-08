/**
 * The shipped-artifact store: the record that something was actually BUILT.
 *
 * data/curriculum.json carries a `proofOfWork` deliverable for all 119 plan rows and nothing
 * in this repo recorded that one of them existed. reports/ held asks, audit, market, notes and
 * progress — five kinds of evidence about studying, none about shipping. So the system could
 * report hours, pace and readiness and could not answer the one question an interviewer opens
 * with: what have you built. That is what this file stores.
 *
 * Storage follows the shape `app/api/progress/route.ts` already uses, and for the reason
 * `lib/market/store.ts` sets out at its head: one small markdown file per event, listed and
 * read back, is the right shape for an append-only history and the wrong one for an inventory
 * that gets rewritten. An artifact is a history entry in the strongest sense — it is a record
 * that a thing happened on a date, so nothing here edits one and nothing here deletes one.
 * `writeArtifact` never sends a `sha`, which is not a stylistic choice: without it the GitHub
 * contents API refuses to overwrite an existing path, so append-only is enforced by the
 * protocol rather than by everyone remembering.
 *
 * VALIDATION IS THE POINT, not a formality. The same weakness has now bitten twice: POST
 * /api/progress accepted any `topic` string, so a caller typo committed a permanent file that
 * readiness matched to no plan row and silently skipped — the event looked recorded and
 * counted toward nothing. An artifact keyed by a free-text topic would fail identically and
 * worse, because the failure is invisible in exactly the moment it matters. So the join key
 * here is the PLAN ROW NUMBER, validated against data/workbook.json, and the topic string is
 * derived from the workbook rather than accepted from the caller. A row that does not exist
 * cannot be written at all.
 *
 * Nothing in here throws on a GitHub failure. A missing GITHUB_TOKEN degrades to
 * `synced: false` with an empty list, same as every other reader in this codebase, and the one
 * rule a caller must honour is the one store.ts states: `synced: false` means "we do not
 * know", never "nothing has been built".
 */

import workbook from "@/data/workbook.json";

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";

/** One markdown file per artifact. Sibling of reports/progress, same listing discipline. */
export const ARTIFACTS_DIR = "reports/artifacts";

/**
 * Plan rows, counted the way every other citation in this codebase counts them: 1-based over
 * `workbook.Plan`, whose index 0 is the header. Derived, never typed — the row count is a
 * number that describes the plan, and each of those that was ever hand-written here was wrong
 * within a month.
 */
export const PLAN_ROWS = (workbook.Plan as unknown[]).length - 1;

/**
 * Newest artifacts read back per request.
 *
 * Deliberately not the 100 that /api/progress uses. 100 is below the 119 rows in the plan, so
 * a complete run of proof-of-work would start truncating itself before it finished — and
 * truncation on THIS list does not merely lose an old event, it reports that work which
 * exists was never done. 400 leaves room for several artifacts per row and still sits inside
 * one GitHub directory page.
 */
export const MAX_ARTIFACTS = 400;

/**
 * One shipped deliverable.
 *
 * `row` is the join key and the only field that is authoritative. `topic` is denormalised from
 * the workbook at write time so the committed file reads as English to a human opening it in
 * GitHub; if a topic string is ever reworded, stored copies go stale and the row still
 * resolves. Read the row, display the topic.
 */
export type ArtifactRecord = {
  /** 1-based against workbook.Plan. Guaranteed 1..PLAN_ROWS by `validateArtifact`. */
  row: number;
  /** Derived from workbook.Plan[row][2] at write time. Never accepted from the caller. */
  topic: string;
  title: string;
  /** Absolute http(s) URL: repo, write-up or demo. Guaranteed parseable. */
  url: string;
  /** ISO 8601 instant the artifact was recorded for. */
  date: string;
  notes: string | null;
};

/** A record as served by GET: the stored fields plus where the file itself lives. */
export type StoredArtifact = ArtifactRecord & { path: string; fileUrl: string | null };

export type ArtifactInput = {
  row?: unknown;
  title?: unknown;
  url?: unknown;
  date?: unknown;
  notes?: unknown;
};

export type Validated = { ok: true; value: ArtifactRecord } | { ok: false; error: string };

/** Single-line fields live in a `Key: value` markdown line, so a newline in one would split it. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const shown = (value: unknown) =>
  value === undefined ? "nothing" : typeof value === "string" ? `"${oneLine(value).slice(0, 80)}"` : JSON.stringify(value);

function slug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "artifact";
}

/**
 * Validate one artifact submission and resolve its plan row.
 *
 * Every rejection names the field and echoes what arrived. A 400 that says "invalid input" is
 * how a caller ends up retrying the same broken payload; a 400 that says which of five fields
 * was wrong and what it received is fixable without reading this file.
 *
 * Numeric strings are accepted for `row` because the MCP server hands JSON-schema arguments
 * through as the model produced them and `"12"` is the common shape. `Number()` alone would
 * also accept `""` (0), `" "` (0) and `"1e2"`, so the parse is explicitly digits-only.
 */
export function validateArtifact(input: ArtifactInput, now: Date = new Date()): Validated {
  const rawRow = input.row;
  const row =
    typeof rawRow === "number" ? rawRow : typeof rawRow === "string" && /^\d+$/.test(rawRow.trim()) ? Number(rawRow.trim()) : NaN;
  if (!Number.isInteger(row) || row < 1 || row > PLAN_ROWS) {
    return {
      ok: false,
      error: `Plan row must be a whole number from 1 to ${PLAN_ROWS}, numbered as data/workbook.json numbers the plan. Received ${shown(rawRow)}.`,
    };
  }

  // Resolved here rather than trusted from the caller: this is the check that a topic string
  // could never make, and the reason the row is the key.
  const topic = oneLine(String((workbook.Plan as unknown as (string | number | null)[][])[row]?.[2] ?? ""));
  if (!topic) return { ok: false, error: `Plan row ${row} has no topic in data/workbook.json.` };

  const title = typeof input.title === "string" ? oneLine(input.title) : "";
  if (!title) return { ok: false, error: `Title is required — what was built. Received ${shown(input.title)}.` };

  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!rawUrl) return { ok: false, error: `URL is required — the repo, write-up or demo that proves it. Received ${shown(input.url)}.` };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `URL must be absolute and parseable, e.g. https://github.com/you/repo. Received ${shown(rawUrl)}.` };
  }
  // `new URL` happily parses `javascript:` and `data:`, and this value is rendered as a link.
  // A scheme allowlist is the difference between a validator and a formality.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: `URL must use http or https. Received scheme "${parsed.protocol.replace(":", "")}".` };
  }

  let date = now.toISOString();
  if (input.date !== undefined && input.date !== null && input.date !== "") {
    if (typeof input.date !== "string" || Number.isNaN(Date.parse(input.date))) {
      return { ok: false, error: `Date must be an ISO 8601 date such as 2026-09-08. Received ${shown(input.date)}.` };
    }
    date = new Date(input.date).toISOString();
  }

  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;

  return { ok: true, value: { row, topic, title, url: rawUrl, date, notes } };
}

/**
 * The committed path. The ISO stamp leads so that name order is chronological — the same
 * property /api/progress and lib/market/store.ts both rely on to sort without opening files —
 * and it carries milliseconds, which is what keeps two artifacts recorded in the same second
 * from colliding on a path that, being append-only, cannot be overwritten.
 */
export function artifactPath(record: ArtifactRecord, at: Date = new Date()) {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `${ARTIFACTS_DIR}/${stamp}-row-${String(record.row).padStart(3, "0")}-${slug(record.title)}.md`;
}

/** The file body. Line-oriented on purpose: `parseArtifact` is the inverse and both are here. */
export function renderArtifact(record: ArtifactRecord) {
  return (
    `# Shipped artifact\n\n` +
    `Row: ${record.row}\n` +
    `Topic: ${record.topic}\n` +
    `Title: ${record.title}\n` +
    `URL: ${record.url}\n` +
    `Date: ${record.date}\n` +
    (record.notes ? `\nNotes:\n${record.notes}\n` : "")
  );
}

/**
 * Read one file back.
 *
 * Returns null rather than a partial record when the three load-bearing fields are not all
 * present. A record with no row joins to nothing and a record with no URL proves nothing, so
 * either would be a row in the UI that says work exists while linking to nowhere. The caller
 * counts these instead, and says so.
 */
export function parseArtifact(body: string): ArtifactRecord | null {
  const row = Number(body.match(/^Row:\s*(\d+)\s*$/m)?.[1]);
  const title = body.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const url = body.match(/^URL:\s*(\S+)\s*$/m)?.[1];
  if (!Number.isInteger(row) || row < 1 || row > PLAN_ROWS || !title || !url) return null;
  return {
    row,
    topic: body.match(/^Topic:\s*(.+)$/m)?.[1]?.trim() || "",
    title,
    url,
    date: body.match(/^Date:\s*(.+)$/m)?.[1]?.trim() || "",
    notes: body.match(/\nNotes:\n([\s\S]+)$/)?.[1]?.trim() || null,
  };
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lumen-dashboard",
  };
}

/**
 * Bounded fan-out. Reading the list is an N+1 by construction — the contents API returns
 * names, not bodies — which store.ts calls ruinous for the market index and correct for a
 * history of small files. At 119 rows the history is the second case, but `Promise.all` over
 * every file at once is how a burst of a hundred-odd requests trips GitHub's secondary rate
 * limit and turns a good read into a 403.
 */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    }),
  );
  return out;
}

export type ArtifactsRead = {
  artifacts: StoredArtifact[];
  /** Files present in the directory that could not be parsed into a record. Never hidden. */
  unreadable: number;
  synced: boolean;
  error: string | null;
};

/**
 * Every recorded artifact, newest first.
 *
 * All-or-nothing on a network failure, for the reason `readProgress` gives: a partial set — one
 * file's fetch failing inside a fan-out that kept the rest — would drop a shipped artifact and
 * render as "you have not built this yet" out of a blip. `synced: false` with an empty list
 * reads as missing data. A silently short list reads as a smaller body of work, which is the
 * one lie this file exists to prevent.
 *
 * A 404 on the directory is not a failure: it is the cold start, before the first artifact,
 * and it is genuinely empty rather than unknown — so it returns `synced: true`.
 */
export async function readArtifacts(): Promise<ArtifactsRead> {
  if (!process.env.GITHUB_TOKEN) return { artifacts: [], unreadable: 0, synced: false, error: null };
  try {
    const listing = await fetch(`https://api.github.com/repos/${repo}/contents/${ARTIFACTS_DIR}?ref=${branch}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (listing.status === 404) return { artifacts: [], unreadable: 0, synced: true, error: null };
    const files = await listing.json();
    if (!listing.ok) throw new Error(files.message || `GitHub returned ${listing.status}`);

    const newest = (files as { name: string; path: string; html_url?: string }[])
      .filter((file) => file?.name?.endsWith(".md"))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, MAX_ARTIFACTS);

    const parsed = await mapPool(newest, 8, async (file) => {
      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}?ref=${branch}`, {
        headers: headers(),
        cache: "no-store",
      });
      const item = await response.json();
      if (!response.ok) throw new Error(item.message || `GitHub returned ${response.status}`);
      const record = parseArtifact(Buffer.from(item.content ?? "", "base64").toString("utf8"));
      return record ? { ...record, path: file.path, fileUrl: file.html_url ?? null } : null;
    });

    const artifacts = parsed.filter((x): x is StoredArtifact => x !== null);
    return { artifacts, unreadable: parsed.length - artifacts.length, synced: true, error: null };
  } catch (error) {
    return { artifacts: [], unreadable: 0, synced: false, error: String((error as Error).message || error) };
  }
}

/**
 * Commit one artifact. No `sha` is sent and none ever should be — that omission is what makes
 * the store append-only at the API level rather than by convention.
 */
export async function writeArtifact(
  record: ArtifactRecord,
  at: Date = new Date(),
): Promise<{ ok: boolean; path: string; url: string | null; synced: boolean; error: string | null }> {
  const path = artifactPath(record, at);
  if (!process.env.GITHUB_TOKEN) {
    return { ok: false, path, url: null, synced: false, error: "GitHub artifact sync is not configured." };
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `build: record artifact for plan row ${record.row} — ${record.title}`,
        content: Buffer.from(renderArtifact(record)).toString("base64"),
        branch,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `GitHub returned ${response.status}`);
    return { ok: true, path, url: body.content?.html_url ?? null, synced: true, error: null };
  } catch (error) {
    return { ok: false, path, url: null, synced: false, error: String((error as Error).message || error) };
  }
}
