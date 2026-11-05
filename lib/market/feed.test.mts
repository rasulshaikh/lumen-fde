import assert from "node:assert/strict";

process.env.GITHUB_TOKEN = "test-only";
const { GET } = await import("../../app/api/market/route.ts");
const originalFetch = globalThis.fetch;
let failure = "";
let missing = false;
const signals: AbortSignal[] = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  assert.ok(init?.signal, "GitHub reads have a deadline");
  signals.push(init.signal);
  if (missing) return new Response(null, { status: 404 });
  if (failure && url.includes(failure)) return Response.json({ message: "unavailable" }, { status: 503 });
  const data = url.includes("trend.json") ? [] : { day: "2026-11-04" };
  return Response.json({ content: Buffer.from(JSON.stringify(data)).toString("base64"), sha: "test" });
};
try {
  let response = await GET();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).synced, true);
  for (failure of ["benchmark.json", "trend.json", "insight.json"]) {
    response = await GET();
    const data = await response.json();
    assert.equal(data.synced, false, `${failure} failure is visible`);
    assert.equal(data.error, "unavailable");
    if (failure !== "benchmark.json") assert.ok(data.benchmark, "healthy benchmark survives partial failure");
  }
  failure = ""; missing = true;
  const cold = await (await GET()).json();
  assert.equal(cold.synced, true);
  assert.equal(cold.benchmark, null);
  delete process.env.GITHUB_TOKEN;
  const unconfigured = await (await GET()).json();
  assert.equal(unconfigured.synced, false);
  assert.ok(signals.length > 0);
  console.log("Market feed: healthy, partial failure, cold start, no token, deadlines and cache policy passed.");
} finally { globalThis.fetch = originalFetch; }

// Exercise the actual retry control and stale/partial states in a mounted page.
const { JSDOM } = await import("jsdom");
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { readFileSync } = await import("node:fs");
const { Market } = await import("../../components/Market.tsx");
const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/market" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
globals.React = React;
globals.IS_REACT_ACT_ENVIRONMENT = true;
const container = dom.window.document.getElementById("root")!;
const root = createRoot(container);
let calls = 0;
let mode = "error";
globalThis.fetch = async () => {
  calls++;
  if (mode === "error") throw new Error("offline");
  if (mode === "empty") return Response.json({ benchmark: null, trend: [], synced: true });
  const benchmark = JSON.parse(readFileSync(new URL("../../reports/market/benchmark.json", import.meta.url), "utf8"));
  benchmark.computedAt = "2000-01-01T00:00:00Z";
  return Response.json({ benchmark, trend: [], insight: null, synced: false });
};
try {
  await React.act(async () => { root.render(React.createElement(Market, { statuses: {}, openPlanRow() {} })); });
  assert.match(container.textContent!, /could not be loaded/);
  mode = "empty";
  await React.act(async () => { container.querySelector("button")!.click(); });
  assert.equal(calls, 2, "retry issues another request");
  assert.match(container.textContent!, /No scan has completed/);
  await React.act(async () => { root.unmount(); });
  const secondRoot = createRoot(container);
  mode = "partial";
  await React.act(async () => { secondRoot.render(React.createElement(Market, { statuses: {}, openPlanRow() {} })); });
  assert.match(container.textContent!, /Some market data could not be read/);
  assert.match(container.textContent!, /overdue for a refresh/);
  assert.match(container.textContent!, /Core FDE market/);
  await React.act(async () => { secondRoot.unmount(); });
  console.log("Mounted Market: retry, empty state, partial failure, stale warning and healthy data retention passed.");
} finally { globalThis.fetch = originalFetch; dom.window.close(); }
