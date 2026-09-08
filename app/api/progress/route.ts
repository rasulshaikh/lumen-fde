import { NextResponse } from "next/server";

const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
const branch = process.env.GITHUB_BRANCH || "main";
function headers() { return { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lumen-dashboard" }; }
function slug(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "topic"; }
// The only four statuses the UI and readiness understand. POST used to accept any string, so a
// typo from mcp/server.js's record_progress ("complete", "In Progres") committed a permanent
// file that readiness silently skips — the event looks recorded and counts toward nothing.
// Both wire forms are accepted because the dashboard sends "in_progress" and callers hand-write
// "in progress"; the body is stored verbatim so the file format and GET are unchanged.
const STATUSES = new Set(["not_started", "in_progress", "done", "skipped"]);
async function github(path: string, options: RequestInit = {}) { if (!process.env.GITHUB_TOKEN) throw new Error("GitHub progress sync is not configured."); const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } }); const data = await response.json(); if (!response.ok) throw new Error(data.message || `GitHub request failed with ${response.status}`); return data; }

export async function GET() {
  try {
    let files: { name: string; path: string; html_url?: string }[] = [];
    try { files = await github("reports/progress"); } catch (error) { if (!String(error).includes("Not Found")) throw error; }
    // Filenames start with an ISO stamp, so name order is chronological. GitHub returns
    // them ascending, and slicing that kept the OLDEST 100 — meaning a topic's status
    // could never advance once it had 100 events. Take the newest, and return newest-first
    // so every consumer sees the current status before any older one.
    files.sort((a, b) => b.name.localeCompare(a.name));
    const events = await Promise.all(files.slice(0, 100).map(async (file) => { const item = await github(file.path); const body = Buffer.from(item.content, "base64").toString("utf8"); const topic = body.match(/^Topic:\s*(.+)$/m)?.[1] || file.name; const status = body.match(/^Status:\s*(.+)$/m)?.[1] || "Not started"; const date = body.match(/^Date:\s*(.+)$/m)?.[1] || ""; return { topic, status, date, url: file.html_url }; }));
    return NextResponse.json({ events });
  } catch (error) { return NextResponse.json({ error: String((error as Error).message || error) }, { status: 502 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { topic?: string; status?: string; notes?: string };
    if (!body.topic?.trim() || !body.status) return NextResponse.json({ error: "Topic and status are required." }, { status: 400 });
    if (!STATUSES.has(String(body.status).trim().toLowerCase().replace(/\s+/g, "_"))) return NextResponse.json({ error: "Status must be one of not_started, in_progress, done, skipped." }, { status: 400 });
    const stampIso = new Date().toISOString(); const stamp = stampIso.replace(/[:.]/g, "-"); const path = `reports/progress/${stamp}-${slug(body.topic)}-${slug(body.status)}.md`;
    const markdown = `# Progress update\n\nTopic: ${body.topic.trim()}\nStatus: ${body.status}\nDate: ${stampIso}\n\n${body.notes ? `Notes:\n${body.notes}\n` : ""}`;
    const result = await github(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `study: record ${body.status} progress`, content: Buffer.from(markdown).toString("base64"), branch }) });
    return NextResponse.json({ saved: true, path, url: result.content?.html_url });
  } catch (error) { return NextResponse.json({ error: String((error as Error).message || error) }, { status: 502 }); }
}
