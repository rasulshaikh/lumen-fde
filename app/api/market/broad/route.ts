import { NextResponse } from "next/server";
import { readBroadCounts } from "@/lib/market/broad-counts";

/**
 * Counts-only read of the private broad market feed for the /market card. Session-gated by
 * proxy.ts (only /api/cron is exempt, so a signed-out call gets 401). See broad-counts.ts.
 */
export async function GET() {
  return NextResponse.json(await readBroadCounts(), { headers: { "Cache-Control": "private, no-store" } });
}
