import { version } from "@/package.json";

/** Liveness only: no keys, study data, provider calls, or credentials. */
export async function GET() {
  return Response.json({ ok: true, service: "lumen-fde", version }, { headers: { "Cache-Control": "no-store" } });
}
