/**
 * The record that a study session happened.
 *
 * Consistency over 23 months does not come from a reminder; it comes from a loop that closes.
 * A session that starts and ends with no trace leaves the reader relying on memory for the one
 * question the system should be able to answer - did I actually sit down this week, and what
 * came of it.
 *
 * ## Two decisions carried from the design, both with teeth
 *
 * **This module never writes progress.** It records a session and nothing else. Marking a row
 * happens through the existing `/api/progress` path the dashboard already uses, with its own
 * validation and its own hydration write-guard - the guard that exists because a browser session
 * once wrote `not_started` over `in_progress` on a real row. A second server-side writer to the
 * same append-only store would be a second place to get that wrong, and the second place is
 * always the one nobody re-reads.
 *
 * **The row is the join key, validated against the workbook, and the topic is derived.** Straight
 * from `lib/artifacts.ts`, which records why: `/api/progress` once accepted any `topic` string,
 * so a typo committed a permanent file that matched no plan row and was silently skipped - the
 * event looked recorded and counted toward nothing. A session keyed on free text would fail the
 * same way and be just as invisible.
 *
 * Append-only, enforced by the protocol: `writeSession` sends no `sha`, so the GitHub contents
 * API itself refuses to overwrite an existing path. Nothing here edits a session and nothing
 * deletes one.
 */
import workbook from "@/data/workbook.json";
import { SESSIONS_DIR } from "./memory";

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";

const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
});

/** 1-based over `workbook.Plan`, whose index 0 is the header. Derived, never typed. */
export const PLAN_ROWS = (workbook.Plan as unknown[]).length - 1;

/** Longest stored free text. A session note is a paragraph, not an essay dump. */
export const MAX_TEXT = 2000;

/**
 * The longest a single session may claim.
 *
 * Not arbitrary: a tab left open overnight would otherwise record a nineteen-hour session and
 * quietly poison every average built on top of it. Twelve hours is far past any real sitting and
 * still refuses the abandoned-tab case.
 */
export const MAX_MINUTES = 720;

export type SessionRecord = {
  /** 1-based against workbook.Plan. Guaranteed 1..PLAN_ROWS by `validateSession`. */
  row: number;
  /** Derived from workbook.Plan[row][2] at write time. Never accepted from the caller. */
  topic: string;
  /** What the reader said they were going to do. May be empty. */
  intention: string;
  /** What they said they learned. May be empty - a session that happened still counts. */
  learned: string;
  /** Whole minutes, 0..MAX_MINUTES. */
  minutes: number;
  /** ISO 8601 instant the session was recorded. */
  date: string;
};

export type SessionInput = {
  row?: unknown;
  intention?: unknown;
  learned?: unknown;
  minutes?: unknown;
};

export type Validated = { ok: true; value: SessionRecord } | { ok: false; error: string };

const text = (value: unknown) => String(value ?? "").trim().slice(0, MAX_TEXT);

export function validateSession(input: SessionInput, now: Date = new Date()): Validated {
  // Digits-only. `Number("")` is 0 and `Number(" ")` is 0, so a missing row would otherwise
  // validate as row 0 and fail the range check for the wrong reason - or, one refactor later,
  // pass it. The same parse artifacts.ts uses, for the same reason.
  const raw = String(input.row ?? "").trim();
  if (!/^\d+$/.test(raw)) return { ok: false, error: "row must be a plan row number." };
  const row = Number(raw);
  if (row < 1 || row > PLAN_ROWS) return { ok: false, error: `row must be between 1 and ${PLAN_ROWS}.` };

  const planRow = (workbook.Plan as unknown[][])[row] as (string | number | null)[] | undefined;
  const topic = String(planRow?.[2] ?? "").trim();
  if (!topic) return { ok: false, error: `row ${row} has no topic in the workbook.` };

  const rawMinutes = String(input.minutes ?? "0").trim();
  if (!/^\d+$/.test(rawMinutes)) return { ok: false, error: "minutes must be a whole number." };
  const minutes = Number(rawMinutes);
  if (minutes > MAX_MINUTES) return { ok: false, error: `minutes must not exceed ${MAX_MINUTES}.` };

  return {
    ok: true,
    value: { row, topic, intention: text(input.intention), learned: text(input.learned), minutes, date: now.toISOString() },
  };
}

export function sessionPath(record: SessionRecord, at: Date = new Date()) {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `${SESSIONS_DIR}/${stamp}-row-${String(record.row).padStart(3, "0")}.md`;
}

/** The file body. Line-oriented on purpose: `parseSession` is the inverse and both live here. */
export function renderSession(record: SessionRecord) {
  return (
    `# Study session\n\n` +
    `Row: ${record.row}\n` +
    `Topic: ${record.topic}\n` +
    `Minutes: ${record.minutes}\n` +
    `Date: ${record.date}\n` +
    (record.intention ? `\nIntention:\n${record.intention}\n` : "") +
    (record.learned ? `\nLearned:\n${record.learned}\n` : "")
  );
}

/**
 * Read one file back.
 *
 * Null rather than a partial record when the row is unusable: a session that joins to no plan row
 * counts toward nothing and would render as a session that happened against a topic that does
 * not exist. The caller counts the rejects and says so, rather than quietly showing fewer.
 */
export function parseSession(body: string): SessionRecord | null {
  const row = Number(body.match(/^Row:\s*(\d+)\s*$/m)?.[1]);
  if (!Number.isInteger(row) || row < 1 || row > PLAN_ROWS) return null;
  const block = (name: string) => body.match(new RegExp(`^${name}:\\n([\\s\\S]*?)(?=\\n\\n[A-Z][a-z]+:|$)`, "m"))?.[1]?.trim() ?? "";
  return {
    row,
    topic: body.match(/^Topic:\s*(.+)$/m)?.[1]?.trim() ?? "",
    minutes: Number(body.match(/^Minutes:\s*(\d+)\s*$/m)?.[1] ?? 0),
    date: body.match(/^Date:\s*(\S+)\s*$/m)?.[1] ?? "",
    intention: block("Intention"),
    learned: block("Learned"),
  };
}

export async function writeSession(
  record: SessionRecord,
  at: Date = new Date(),
): Promise<{ ok: boolean; path: string; url: string | null; synced: boolean; error: string | null }> {
  const path = sessionPath(record, at);
  if (!process.env.GITHUB_TOKEN) {
    return { ok: false, path, url: null, synced: false, error: "GitHub sync is not configured." };
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      // No `sha`. Without it the contents API refuses to overwrite an existing path, which is
      // what makes this store append-only by protocol rather than by convention.
      body: JSON.stringify({
        message: `session: row ${record.row} - ${record.topic}`,
        content: Buffer.from(renderSession(record)).toString("base64"),
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

/**
 * How many sessions have closed, and when the most recent one was.
 *
 * A count and a date, not the files. The companion needs to know whether the loop is being used
 * and how recently; the session bodies are the reader's own notes and pushing twenty of them into
 * a prompt would crowd out the plan without answering a question anyone asks.
 *
 * `synced: false` means "we do not know" - never "no sessions" - which is the rule every reader
 * in this codebase follows and the one that stops a GitHub outage becoming "you have not studied".
 */
export async function readSessionSummary(): Promise<{ count: number; latest: string | null; synced: boolean }> {
  if (!process.env.GITHUB_TOKEN) return { count: 0, latest: null, synced: false };
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${SESSIONS_DIR}?ref=${branch}`, {
      headers: headers(), cache: "no-store",
    });
    // A directory that does not exist yet is a real, known answer: no session has been recorded.
    if (response.status === 404) return { count: 0, latest: null, synced: true };
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const listing = (await response.json()) as { name: string; type: string }[];
    const files = listing.filter((f) => f.type === "file" && f.name.endsWith(".md")).map((f) => f.name).sort();
    const newest = files.length ? files[files.length - 1] : null;
    return { count: files.length, latest: newest ? newest.slice(0, 10) : null, synced: true };
  } catch {
    return { count: 0, latest: null, synced: false };
  }
}
