import { NextResponse } from "next/server";
import { readPapers, validatePaper, writePaper } from "@/lib/papers";

/**
 * /api/papers - the exam history.
 *
 * POST records one sitting. GET returns the most recent few.
 *
 * It writes to `reports/papers/` and to nothing else. In particular it does not touch
 * `reports/review/state.json`: the spaced-repetition ladder is moved by the recall strip, one card
 * at a time, and a practice paper silently advancing twenty scheduled cards is what would make
 * that schedule untrustworthy. `lib/papers.ts` imports nothing that could write it.
 *
 * The gate in `proxy.ts` covers this path like every other /api/ route, so there is no auth check
 * here. An auth check in a route body would be a second answer to a question this app answers in
 * one file.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const validated = validatePaper((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const written = await writePaper(validated.value);
  if (!written.ok) {
    return NextResponse.json({ ok: false, error: written.error ?? "The paper could not be recorded." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, path: written.path, url: written.url });
}

export async function GET() {
  const { papers, synced } = await readPapers();
  // `synced: false` is unknown, never none. The caller must be able to tell the difference.
  return NextResponse.json({ papers, synced });
}
