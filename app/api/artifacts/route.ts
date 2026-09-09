import { NextResponse } from "next/server";
import { PLAN_ROWS, readArtifacts, validateArtifact, writeArtifact } from "@/lib/artifacts";

/**
 * The shipped-artifact endpoint: what has actually been built, against which plan row.
 *
 * Two methods and no others. There is no PUT, no PATCH and no DELETE, and their absence is the
 * contract rather than an omission - an artifact records that something happened on a date, so
 * it is not a thing that can later be edited into having happened differently. Next answers
 * 405 for the rest, and `writeArtifact` sends no `sha`, so GitHub itself refuses an overwrite.
 *
 * All the validation lives in lib/artifacts.ts so the MCP server can reuse the identical rules
 * rather than growing a second, looser copy. That divergence is precisely how record_progress
 * came to accept any topic string.
 */

/**
 * Degrades exactly like /api/market and /api/review, and the three states the caller must be
 * able to tell apart from the payload alone:
 *   - no GITHUB_TOKEN        -> synced false, error null, empty list
 *   - GitHub did not answer  -> synced false, error set,  empty list
 *   - nothing built yet      -> synced true,  error null, empty list
 * The last is the honest cold start and it is a 200. An empty list on `synced: false` means
 * "we do not know", never "nothing has been built" - a UI that renders the two the same way is
 * reporting a network blip as an empty portfolio.
 *
 * `unreadable` is surfaced rather than swallowed: files sitting in reports/artifacts that do
 * not parse are work that exists and is not being counted, and the count is the only way
 * anyone finds out.
 */
export async function GET() {
  const { artifacts, unreadable, synced, error } = await readArtifacts();
  return NextResponse.json({ artifacts, unreadable, planRows: PLAN_ROWS, synced, error });
}

/**
 * 400 for anything the plan cannot vouch for, 502 for anything GitHub did to us. The split
 * matters: a 400 is the caller's payload and is fixable from the message, a 502 is not the
 * caller's fault and retrying the same body is the right response to it.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const checked = validateArtifact((body ?? {}) as Record<string, unknown>);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const result = await writeArtifact(checked.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  // The stored record is echoed back, including the workbook-derived topic the caller did not
  // send, so a client can render the new row without re-reading the whole list.
  return NextResponse.json({ saved: true, artifact: checked.value, path: result.path, url: result.url });
}
