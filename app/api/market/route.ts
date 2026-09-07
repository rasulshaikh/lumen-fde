import { NextResponse } from "next/server";
import { BENCHMARK_PATH, TREND_PATH, readJson } from "@/lib/market/store";
import type { Benchmark } from "@/lib/market/benchmark";
import type { TrendPoint } from "@/lib/market/store";

/**
 * The Market tab's read endpoint: two fixed paths, two requests, no fan-out.
 *
 * Deliberately not shaped like /api/progress, which lists `reports/progress` and then
 * re-fetches every file individually — an N+1 against the GitHub API. `reports/market/history`
 * is a write-only archive for exactly that reason; nothing in a request path may list it.
 *
 * Everything served here is already rendered. The benchmark's statement strings are computed
 * by the cron, so the tab and the weekly email print identical sentences and there is one
 * place to fix a sentence. No model is involved on this path at all — a market benchmark whose
 * numbers came from a model is not a benchmark.
 *
 * Stays behind the proxy's session gate: `proxy.ts` exempts `/api/cron` only, so an
 * unauthenticated call to this route gets 401 JSON, which is correct.
 */
export async function GET() {
  const [benchmark, trend] = await Promise.all([readJson<Benchmark>(BENCHMARK_PATH), readJson<TrendPoint[]>(TREND_PATH)]);

  /**
   * Three states collapse to one empty response, and the tab must be able to tell them apart
   * from `synced` alone:
   *   - no GITHUB_TOKEN     -> synced false, error null (same degrade as /api/review)
   *   - GitHub did not answer -> synced false, error set
   *   - the scan has never completed a cycle -> synced true, benchmark null
   * The last one is the cold start, and it is a 200 with an empty state rather than an error:
   * the trend line legitimately starts empty on day one and the UI says so instead of faking
   * a history that cannot be backfilled.
   */
  return NextResponse.json({
    benchmark: benchmark.data ?? null,
    trend: trend.data ?? [],
    synced: benchmark.synced,
    error: benchmark.error ?? trend.error,
  });
}
