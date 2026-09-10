/**
 * What Quaere has already answered.
 *
 * `reports/asks/` holds every answer it has ever given, and it was write-only: the companion
 * re-answered the same question with no record that it already had, and could not say "as I said
 * on the 3rd". Twenty-one files at the time of writing.
 *
 * Filenames only, never bodies. The path already carries the day and a slug of the question, which
 * is everything needed to recognise a repeat; fetching twenty markdown files inside the ~5s this
 * route has before the model call would trade the answer for the reminder.
 */
const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";

export const ASKS_DIR = "reports/asks";

export type AskTitle = { day: string; title: string };

/** `2026-09-09T18-40-08-797Z-build-a-practical-study-sequence.md` -> day plus a readable title. */
export function parseAskName(name: string): AskTitle | null {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})T[\d-]+Z-(.+)\.md$/);
  if (!m) return null;
  const title = m[2].replace(/-/g, " ").trim();
  return title ? { day: m[1], title: title.charAt(0).toUpperCase() + title.slice(1) } : null;
}

export async function readAskTitles(limit = 8): Promise<AskTitle[]> {
  if (!process.env.GITHUB_TOKEN) return [];
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${ASKS_DIR}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const listing = (await response.json()) as { name: string; type: string }[];
    return listing
      .filter((f) => f.type === "file")
      .map((f) => parseAskName(f.name))
      .filter((a): a is AskTitle => a !== null)
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, limit);
  } catch {
    // An unreadable listing costs the reminder, never the answer.
    return [];
  }
}
