import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/market/store";
import { sameValue, validWorkspaceSnapshot, validWorkspaceValue, WORKSPACE_PATH, type WorkspaceSnapshot } from "@/lib/workspace-state";

async function read() {
  const result = await readJson<WorkspaceSnapshot>(WORKSPACE_PATH);
  if (!result.synced || (result.data !== null && !validWorkspaceSnapshot(result.data))) throw new Error("Workspace sync is unavailable.");
  return { entries: result.data ?? {}, sha: result.sha };
}
export async function GET() {
  try { return NextResponse.json({ entries: (await read()).entries }); }
  catch { return NextResponse.json({ error: "Workspace sync is unavailable. Your device copy is retained." }, { status: 503 }); }
}
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || !validWorkspaceValue(body.key, body.value)
      || typeof body.mutationId !== "string" || !/^[\da-f-]{36}$/.test(body.mutationId)
      || (body.expected !== null && (typeof body.expected !== "string" || !/^[\da-f-]{36}$/.test(body.expected)))) {
    return NextResponse.json({ error: "Invalid workspace update." }, { status: 400 });
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await read(), entry = current.entries[body.key];
      if (entry?.revision === body.mutationId && sameValue(entry.value, body.value)) return NextResponse.json({ entry });
      if ((entry?.revision ?? null) !== body.expected) return NextResponse.json({ error: "This setting changed in another session. Load the latest copy before editing again." }, { status: 409 });
      if (entry && sameValue(entry.value, body.value)) return NextResponse.json({ entry });
      const next = { value: body.value, revision: body.mutationId, updatedAt: new Date().toISOString() };
      const saved = await writeJson(WORKSPACE_PATH, { ...current.entries, [body.key]: next }, current.sha, `workspace: update ${body.key}`);
      if (saved.ok) return NextResponse.json({ entry: next });
      if (attempt === 1) return NextResponse.json({ error: "Workspace save could not be confirmed. Retry sync." }, { status: 502 });
      // Re-read before a second attempt. Another key may have changed; a stale value of
      // this same key is still rejected above, never silently overwritten.
    }
  } catch { return NextResponse.json({ error: "Workspace sync is unavailable. Retry sync." }, { status: 503 }); }
}
