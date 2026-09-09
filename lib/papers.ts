/**
 * The record that a paper was sat.
 *
 * `TestRunner` shipped saving nothing, and the reason was good: a practice run that quietly moves
 * twenty cards in the spaced-repetition ladder makes the schedule untrustworthy, and a schedule
 * you cannot trust is one you stop obeying. That reason still holds and nothing here weakens it.
 * **Papers are a separate store. This module cannot write to `reports/review/state.json` and does
 * not import anything that can.**
 *
 * What the original decision got wrong was treating "do not touch the schedule" and "keep no
 * record" as the same choice. They are not. Over 23 months the exam history is the strongest
 * evidence of interview readiness the product can hold, and it was being discarded on every
 * sitting: sit a 20-question, three-hour quarterly capstone and the system retained nothing.
 *
 * ## What is stored, and what is deliberately not
 *
 * Outcomes, never an average. A per-question grade and the topic it belonged to, so a reader can
 * be told "you were Gone on Kafka twice in a row" - which is actionable - and never "your score
 * is trending down 4%", which is the gamified framing this codebase keeps refusing. There is no
 * streak, no rolling mean, and no pass mark.
 *
 * Append-only, enforced by the protocol rather than by convention: `writePaper` sends no `sha`, so
 * the GitHub contents API itself refuses to overwrite an existing path. Nothing edits a paper and
 * nothing deletes one.
 */
import workbook from "@/data/workbook.json";

export const PAPERS_DIR = "reports/papers";

/** 1-based over `workbook.Plan`, whose index 0 is the header. Derived, never typed. */
export const PLAN_ROWS = (workbook.Plan as unknown[]).length - 1;

/** The three the recall strip and the runner both use. A grade is a state, not a score. */
export const GRADES = ["fluent", "halting", "gone"] as const;
export type Grade = (typeof GRADES)[number];

/** Longest paper accepted. The quarterly capstone is 20; this is headroom, not a target. */
export const MAX_QUESTIONS = 60;

/** A sitting cannot outlast a day. A tab left open would otherwise record a 14-hour capstone. */
export const MAX_MINUTES = 600;

export type Answered = {
  /** The prompt key from data/recall-bank.json, so a question can be traced to its text. */
  k: string;
  /** 0-based plan row index, the same key the curriculum and recall bank use. */
  i: number;
  grade: Grade;
};

export type Paper = {
  version: 1;
  /** Scope id from the runner: "weekly", "month-3", "quarterly". */
  scope: string;
  /** What the reader saw the paper called. */
  label: string;
  /** UTC day. */
  day: string;
  /** ISO instant. */
  at: string;
  minutes: number;
  answered: Answered[];
};

export type PaperInput = { scope?: unknown; label?: unknown; minutes?: unknown; answered?: unknown };
export type Validated = { ok: true; value: Paper } | { ok: false; error: string };

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isGrade = (v: unknown): v is Grade => GRADES.includes(v as Grade);

/**
 * Validate before storing, for the reason `lib/artifacts.ts` records: `/api/progress` once accepted
 * any topic string, so a typo committed a permanent file that matched no plan row and was silently
 * skipped. It looked recorded and counted toward nothing. A paper keyed on unchecked rows fails
 * the same way and is just as invisible.
 */
export function validatePaper(input: PaperInput, now: Date = new Date()): Validated {
  const scope = text(input.scope, 60);
  if (!scope) return { ok: false, error: "scope is required." };

  const rawMinutes = String(input.minutes ?? "0").trim();
  if (!/^\d+$/.test(rawMinutes)) return { ok: false, error: "minutes must be a whole number." };
  const minutes = Number(rawMinutes);
  if (minutes > MAX_MINUTES) return { ok: false, error: `minutes must not exceed ${MAX_MINUTES}.` };

  if (!Array.isArray(input.answered) || input.answered.length === 0) {
    return { ok: false, error: "a paper with no graded questions is not a paper." };
  }
  if (input.answered.length > MAX_QUESTIONS) {
    return { ok: false, error: `a paper may not exceed ${MAX_QUESTIONS} questions.` };
  }

  const answered: Answered[] = [];
  const seen = new Set<string>();
  for (const raw of input.answered as Record<string, unknown>[]) {
    const k = text(raw?.k, 40);
    if (!k) return { ok: false, error: "every answer needs its question key." };
    // The same question twice is a bug in the caller, and averaging it away would hide that.
    if (seen.has(k)) return { ok: false, error: `question ${k} appears twice.` };
    seen.add(k);
    if (!isGrade(raw?.grade)) return { ok: false, error: `grade must be one of ${GRADES.join(", ")}.` };
    const i = Number(raw?.i);
    if (!Number.isInteger(i) || i < 0 || i >= PLAN_ROWS) {
      return { ok: false, error: `row index ${raw?.i} is outside the plan.` };
    }
    answered.push({ k, i, grade: raw.grade });
  }

  return {
    ok: true,
    value: {
      version: 1,
      scope,
      label: text(input.label, 200) || scope,
      day: now.toISOString().slice(0, 10),
      at: now.toISOString(),
      minutes,
      answered,
    },
  };
}

export const paperPath = (paper: Paper) =>
  `${PAPERS_DIR}/${paper.at.replace(/[:.]/g, "-")}-${paper.scope.replace(/[^a-z0-9-]/gi, "-")}.json`;

/** Counts by grade. Plain arithmetic, kept here so the API, the UI and the prompt agree. */
export const tally = (paper: Paper) => ({
  fluent: paper.answered.filter((a) => a.grade === "fluent").length,
  halting: paper.answered.filter((a) => a.grade === "halting").length,
  gone: paper.answered.filter((a) => a.grade === "gone").length,
  total: paper.answered.length,
});

/**
 * The two most recent sittings, as prompt text.
 *
 * Two, not a history: the question a reader asks is "how did I do and what should I redo", which
 * the last two answer, and a longer list would spend the budget on months nobody is asking about.
 *
 * Named topics, never a trend. "Gone on rows 12 and 36 in both sittings" is something to act on;
 * "your average is down four points" is a score, and this product does not keep scores.
 *
 * `synced: false` means the store could not be read. Unknown, never "you have sat nothing" - the
 * rule every reader in this codebase follows.
 */
export function papersContext(
  papers: { papers: Paper[]; synced: boolean },
  topicName: (row: number) => string,
): string {
  if (!papers.synced) return "PAPERS SAT: unreadable right now. Unknown, NOT none - do not tell the reader they have sat no tests.";
  if (!papers.papers.length) return "PAPERS SAT: none recorded yet. The Practice tab can draw one from the recall bank.";

  const lines: string[] = [];
  for (const paper of papers.papers.slice(0, 2)) {
    const t = tally(paper);
    lines.push(`- ${paper.day} · ${paper.label} · ${t.total} questions in ${paper.minutes} min · fluent ${t.fluent}, halting ${t.halting}, gone ${t.gone}`);
    const weak = paper.answered.filter((a) => a.grade !== "fluent");
    if (weak.length) {
      const names = [...new Set(weak.map((a) => `${topicName(a.i)} (${a.grade})`))].slice(0, 6);
      lines.push(`  struggled with: ${names.join("; ")}`);
    }
  }
  return `PAPERS SAT (${papers.papers.length} recorded, the most recent ${Math.min(2, papers.papers.length)} shown):\n${lines.join("\n")}\nThese are self-graded under exam conditions. Use them to say what to revisit. Never compute a score, an average or a trend from them.`;
}

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";
const headers = () => ({ Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" });

/**
 * Commit one paper.
 *
 * No `sha` is sent, which is what makes this store append-only by protocol rather than by
 * convention: without one the contents API refuses to overwrite an existing path. The same
 * discipline `writeSession` and the artifacts store use, for the same reason.
 */
export async function writePaper(paper: Paper): Promise<{ ok: boolean; path: string; url: string | null; error: string | null }> {
  const path = paperPath(paper);
  if (!process.env.GITHUB_TOKEN) return { ok: false, path, url: null, error: "GitHub sync is not configured." };
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `paper: ${paper.scope} - ${tally(paper).total} questions`,
        content: Buffer.from(JSON.stringify(paper, null, 2)).toString("base64"),
        branch,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `GitHub returned ${response.status}`);
    return { ok: true, path, url: body.content?.html_url ?? null, error: null };
  } catch (error) {
    return { ok: false, path, url: null, error: String((error as Error).message || error) };
  }
}

/**
 * The most recent papers, newest first.
 *
 * Reads the directory listing, then only the newest few files. The whole store is not fetched:
 * a year of weekly and monthly sittings is around sixty files, and a prompt needs two of them.
 *
 * `synced: false` is "we do not know", never "none" - a GitHub outage must not render as a reader
 * who has sat no tests.
 */
export async function readPapers(limit = 4): Promise<{ papers: Paper[]; synced: boolean }> {
  if (!process.env.GITHUB_TOKEN) return { papers: [], synced: false };
  try {
    const listing = await fetch(`https://api.github.com/repos/${repo}/contents/${PAPERS_DIR}?ref=${branch}`, { headers: headers(), cache: "no-store" });
    // A directory that does not exist yet is a real, known answer: no paper has been sat.
    if (listing.status === 404) return { papers: [], synced: true };
    if (!listing.ok) throw new Error(`GitHub returned ${listing.status}`);
    const files = ((await listing.json()) as { name: string; download_url: string; type: string }[])
      .filter((f) => f.type === "file" && f.name.endsWith(".json"))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, limit);
    const loaded = await Promise.allSettled(files.map((f) => fetch(f.download_url, { cache: "no-store" }).then((r) => r.json())));
    const papers = loaded
      .filter((r): r is PromiseFulfilledResult<Paper> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((p) => p && Array.isArray(p.answered));
    return { papers, synced: true };
  } catch {
    return { papers: [], synced: false };
  }
}
