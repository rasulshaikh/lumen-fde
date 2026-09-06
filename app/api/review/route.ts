import { NextResponse } from "next/server";

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";
const PATH = "reports/review/state.json";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lumen-dashboard",
  };
}

/**
 * Review scheduling state, as ONE file.
 *
 * Deliberately not routed through /api/progress. That endpoint appends a markdown file per
 * event and its GET then re-reads every file individually — an N+1 against the GitHub API,
 * capped at the newest 100. That shape is right for an append-only progress *history*; it
 * is wrong for a mutable schedule that is rewritten on every grade. One file, read whole,
 * written whole with its sha.
 *
 * Failure here is never fatal: the client keeps its own copy in localStorage and treats
 * GitHub as the sync layer, so an unconfigured token degrades to local-only rather than
 * breaking the strip.
 */
export async function GET() {
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ state: {}, sha: null, synced: false });
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${PATH}?ref=${branch}`, { headers: headers(), cache: "no-store" });
    if (response.status === 404) return NextResponse.json({ state: {}, sha: null, synced: true });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `GitHub returned ${response.status}`);
    const state = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    return NextResponse.json({ state, sha: data.sha, synced: true });
  } catch (error) {
    return NextResponse.json({ state: {}, sha: null, synced: false, error: String((error as Error).message || error) });
  }
}

export async function PUT(request: Request) {
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ saved: false, synced: false });
  try {
    const body = (await request.json()) as { state?: Record<string, unknown>; sha?: string | null };
    if (!body.state || typeof body.state !== "object") return NextResponse.json({ error: "state is required." }, { status: 400 });
    const payload: Record<string, unknown> = {
      message: "study: update review schedule",
      content: Buffer.from(JSON.stringify(body.state, null, 1)).toString("base64"),
      branch,
    };
    // Without the sha GitHub rejects an update to an existing file, and sending a stale one
    // is how two tabs silently clobber each other.
    if (body.sha) payload.sha = body.sha;
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${PATH}`, {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `GitHub returned ${response.status}`);
    return NextResponse.json({ saved: true, synced: true, sha: data.content?.sha ?? null });
  } catch (error) {
    return NextResponse.json({ saved: false, synced: false, error: String((error as Error).message || error) });
  }
}
