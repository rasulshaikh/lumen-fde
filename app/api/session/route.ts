import { NextResponse } from "next/server";
import { applyMemory, readMemory, writeMemory } from "@/lib/companion/memory";
import { validateSession, writeSession } from "@/lib/companion/session";

/**
 * POST /api/session — record that a study session happened.
 *
 * Deliberately narrow. It writes a session file and updates the companion's digest, and it does
 * NOT touch progress: marking a row goes through /api/progress, which already has the validation
 * and the hydration write-guard that exists because a browser session once wrote `not_started`
 * over `in_progress` on a real row. Two writers to one append-only store is two places to get
 * that wrong, and the second is the one nobody re-reads.
 *
 * The gate in `proxy.ts` covers this path like every other /api/ route: no session cookie, 401
 * JSON. Nothing extra is needed here and nothing extra should be added — an auth check in a
 * route body is a second answer to a question this app answers in one file.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const validated = validateSession((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const written = await writeSession(validated.value);
  if (!written.ok) {
    return NextResponse.json({ ok: false, error: written.error ?? "Could not record the session." }, { status: 502 });
  }

  // Memory is best-effort and deliberately after the session write. The session file is the
  // record that matters; a digest that failed to update is a companion that repeats itself once,
  // which is a far smaller loss than a session that vanished because a second write failed.
  let remembered = false;
  try {
    const { memory, sha, synced } = await readMemory();
    if (synced) {
      const struggled = Array.isArray((body as { struggled?: unknown })?.struggled)
        ? ((body as { struggled: unknown[] }).struggled).map(String)
        : [];
      const next = applyMemory(memory, { sessionClosed: true, struggled, explained: [validated.value.topic] }, new Date());
      if (next !== memory) remembered = (await writeMemory(next, sha)).ok;
    }
  } catch { /* the session is already recorded; the digest is not worth failing the request for */ }

  return NextResponse.json({ ok: true, path: written.path, url: written.url, remembered });
}
