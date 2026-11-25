/**
 * Broad feed card tests. Run with:  npx tsx lib/market/broad-card.test.mts
 *
 * Pins the one property that matters for a public repo reading a private feed: nothing
 * row-level (company, title, link, board) reaches the API response, the rendered HTML or the
 * client component's imports. Uses the hand-made EXAMPLE fixture only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("lib/market/fixtures/broad_feed.example.json", root), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const live = { ...fixture, example: false, day: today };
// Every row-level string in the fixture. None may appear downstream of the server.
const secrets = (live.rows as Record<string, unknown>[]).flatMap((r) => [r.company, r.title, r.url, r.board, r.location, r.id]).filter((v): v is string => typeof v === "string" && v !== "Remote");
// ("Remote" alone is a generic word the region labels legitimately use; specific locations are still checked.)

const originalFetch = globalThis.fetch;
let feedCalls = 0;
globalThis.fetch = (async () => { feedCalls += 1; return new Response(JSON.stringify(live), { status: 200 }); }) as typeof fetch;

const { readBroadCounts, resetBroadCache } = await import("./broad-counts.ts");
const { GET } = await import("../../app/api/market/broad/route.ts");

try {
  // Flag off: nothing fetched, nothing shown.
  delete process.env.MARKET_BROAD_FEED;
  assert.deepEqual(await readBroadCounts(), { enabled: false });
  assert.equal(feedCalls, 0, "flag off makes no request");

  process.env.MARKET_BROAD_FEED = "on";
  process.env.MARKET_BROAD_FEED_REPO = "owner/private_feed";
  process.env.MARKET_BROAD_FEED_TOKEN = "test_token_not_real";
  resetBroadCache();

  const response = await GET();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.text();
  const counts = JSON.parse(body);
  assert.equal(counts.ok, true);
  assert.equal(counts.rows, 4);
  assert.equal(counts.companies, 3);
  assert.deepEqual(counts.byRegion, { india: 2, worldwide: 1, unstated: 1, check: 0, no: 0 });
  assert.equal(counts.byLane.fde, 1);
  assert.deepEqual(Object.keys(counts).sort(), ["byLane", "byRegion", "companies", "day", "enabled", "ok", "rows", "sources", "sourcesOk"]);
  for (const s of secrets) assert.ok(!body.includes(s), `API response leaks a row value: ${s}`);
  assert.ok(!body.includes("test_token_not_real") && !body.includes("private_feed"), "no token or repo name in the response");

  // Cached: a second read inside the hour makes no request.
  await GET();
  assert.equal(feedCalls, 1, "second request is served from the memo");

  // Unavailable feed: ok false, no error text, and nothing rendered.
  resetBroadCache();
  globalThis.fetch = (async () => new Response("no", { status: 404 })) as typeof fetch;
  assert.deepEqual(await readBroadCounts(), { enabled: true, ok: false });

  // Client component: imports nothing from the feed reader.
  const card = readFileSync(new URL("components/BroadMarketCard.tsx", root), "utf8");
  assert.ok(!/from\s+["'][^"']*market\/(fetch|broad-counts)["']/.test(card), "card must not import the feed reader");
  assert.ok(!/MARKET_BROAD_FEED/.test(card), "card must not read feed env");

  // Rendered HTML: counts only, and nothing at all when disabled or unavailable.
  const { JSDOM } = await import("jsdom");
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/market" });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  globals.React = React;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const { BroadMarketCard } = await import("../../components/BroadMarketCard.tsx");
  const container = dom.window.document.getElementById("root")!;
  const mount = async (payload: unknown) => {
    globalThis.fetch = (async () => Response.json(payload)) as typeof fetch;
    const r = createRoot(container);
    await React.act(async () => { r.render(React.createElement(BroadMarketCard)); });
    const html = container.innerHTML;
    await React.act(async () => { r.unmount(); });
    return html;
  };
  const html = await mount(counts);
  assert.match(html, /Broad market feed/);
  assert.match(html, /4 matching roles at 3 companies/);
  for (const s of secrets) assert.ok(!html.includes(s), `HTML leaks a row value: ${s}`);
  assert.equal(await mount({ enabled: false }), "", "flag off renders nothing");
  assert.equal(await mount({ enabled: true, ok: false }), "", "unavailable feed renders nothing");
  dom.window.close();

  console.log("Broad card: flag off, counts-only API, memo, unavailable state, client imports and HTML leak checks passed.");
} finally {
  globalThis.fetch = originalFetch;
}
