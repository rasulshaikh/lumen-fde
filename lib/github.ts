/** Bounded GitHub transport. A failed read never becomes an empty successful store. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function githubFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const deadline = AbortSignal.timeout(10_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const options = { ...init, cache: "no-store" as RequestCache, signal };
  // Reads alone retry transient upstream failures. Writes require content verification first.
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await fetch(url, options); }
    catch (error) {
      if (method === "PUT" && !signal.aborted) {
        const confirmed = await confirmWrite(url, options);
        if (confirmed) return confirmed;
      }
      throw error;
    }
    if (method === "GET" && RETRYABLE.has(response.status) && attempt < 2 && !signal.aborted) {
      const retry = Number(response.headers.get("retry-after"));
      // A long rate-limit window is reported promptly, never slept through in a request.
      if (Number.isFinite(retry) && retry > 2) return response;
      await response.body?.cancel();
      await pause(retry > 0 ? retry * 1000 : 100 * (attempt + 1));
      continue;
    }
    if (method === "PUT" && [409, 422].includes(response.status)) {
      const confirmed = await confirmWrite(url, options);
      if (confirmed) return confirmed;
    }
    return response;
  }
}

async function confirmWrite(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const payload = JSON.parse(String(init.body));
    if (typeof payload.content !== "string") return null;
    const check = new URL(url);
    if (payload.branch) check.searchParams.set("ref", payload.branch);
    const response = await fetch(check.toString(), { headers: init.headers, signal: init.signal, cache: "no-store" });
    if (!response.ok) return null;
    const current = await response.json();
    // Never convert a stale-sha conflict into an overwrite of someone else's update.
    if (typeof current.content !== "string" || current.content.replace(/\s/g, "") !== payload.content.replace(/\s/g, "")) return null;
    return Response.json({ content: { sha: current.sha, html_url: current.html_url }, verified: true });
  } catch { return null; }
}

export async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const index = next++; results[index] = await task(items[index]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
