import { githubFetch, mapPool } from "@/lib/github";
import { searchPassages } from "./corpus";
import type { Passage } from "./types";

/** Read-only retrieval from a fixed directory allowlist. The model never supplies a path
 * or URL. No GitHub token, filesystem path, or arbitrary network target reaches a tool. */
export async function searchRecordedWork(query: string, signal: AbortSignal): Promise<{ passages: Passage[]; warning?: string }> {
  if (!process.env.GITHUB_TOKEN) return { passages: [], warning: "Recorded-work search is not configured." };
  const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde", branch = process.env.GITHUB_BRANCH || "main";
  const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" };
  const get = (path: string) => githubFetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { headers, signal });
  try {
    let capped = false;
    const listings = await Promise.all(["reports/notes", "reports/asks"].map(async (directory) => {
      const response = await get(directory);
      if (response.status === 404) return [];
      if (!response.ok) throw new Error("Recorded work could not be read.");
      const files = await response.json() as { name: string; path: string; type: string }[];
      if (!Array.isArray(files) || files.length >= 1000) throw new Error("Recorded-work directory requires compaction.");
      const eligible = files.filter((file) => file.type === "file" && file.name.endsWith(".md") && file.path === `${directory}/${file.name}` && /^[\w.-]+$/.test(file.name));
      if (eligible.length > 80) capped = true;
      return eligible.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 80).map((file) => ({ id: file.path, kind: "records" as const, title: file.name.replace(/-/g, " "), text: file.name.replace(/-/g, " "), url: `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${file.path}` }));
    }));
    const candidates = listings.flat();
    const ranked = searchPassages(query, candidates, "records", 3);
    const selected = ranked.length ? ranked : candidates.slice(0, 2);
    const passages = await mapPool(selected, 3, async (file) => {
      const response = await get(file.id);
      if (!response.ok) throw new Error("A recorded note could not be read.");
      const item = await response.json();
      if (typeof item.content !== "string" || item.content.length > 200_000) throw new Error("A recorded note exceeds the retrieval limit.");
      const text = Buffer.from(item.content, "base64").toString("utf8").slice(0, 9000);
      return { ...file, title: text.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 180) || file.title, text, date: text.match(/^Date:\s*(.+)$/m)?.[1] };
    });
    return { passages, ...(capped ? { warning: "Recorded-work search covers 80 recent files per directory. Older notes were not searched." } : {}) };
  } catch { return { passages: [], warning: "Recorded-work search was unavailable or partial; do not infer that no notes exist." }; }
}
