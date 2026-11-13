/**
 * Broad market feed tests. Run with:  npx tsx lib/market/broad.test.mts
 *
 * The fixture is hand-made EXAMPLE data (invented companies, example.com links). Real feed
 * data lives in a private location and must never be committed to this public repo.
 *
 * What is pinned here:
 * - the flag is off by default and makes no request when off
 * - the contract whitelist drops JD text and any other unknown key
 * - bad links, duplicates, stale feeds, example feeds and oversized feeds are refused
 * - the 27-board benchmark config is untouched by this source
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BROAD_FEED_MAX_ROWS,
  broadFeedConfig,
  fetchBroadFeed,
  parseBroadFeed,
  summarizeBroad,
  type BroadFeedConfig,
} from "./fetch.ts";

const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("lib/market/fixtures/broad_feed.example.json", root), "utf8"));
const now = new Date("2026-11-13T06:00:00Z");

// Flag defaults off, and only the exact value `on` enables it.
assert.equal(broadFeedConfig({}).flag, undefined);
assert.equal(broadFeedConfig({}).path, "broad/latest.json");
assert.equal(broadFeedConfig({}).branch, "main");

const originalFetch = globalThis.fetch;
let calls = 0;
let lastInit: RequestInit | undefined;
let lastUrl = "";
let reply: () => Response = () => new Response(JSON.stringify({ ...fixture, example: false }), { status: 200 });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls += 1;
  lastUrl = String(input);
  lastInit = init;
  return reply();
}) as typeof fetch;

try {
  const base: BroadFeedConfig = { flag: undefined, repo: "owner/private_feed", path: "broad/latest.json", branch: "main", token: "test_token_not_real" };

  for (const flag of [undefined, "", "off", "true", "1", "ON"]) {
    const off = await fetchBroadFeed({ ...base, flag }, now);
    assert.equal(off.enabled, false, `flag ${String(flag)} stays off`);
    assert.equal(off.feed, null);
  }
  assert.equal(calls, 0, "flag off makes no request");

  const missing = await fetchBroadFeed({ ...base, flag: "on", token: undefined }, now);
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? "", /MARKET_BROAD_FEED_TOKEN/);
  const badRepo = await fetchBroadFeed({ ...base, flag: "on", repo: "not a repo" }, now);
  assert.match(badRepo.error ?? "", /owner\/name/);
  assert.equal(calls, 0, "misconfiguration makes no request");

  // Healthy read: raw media type, own token, deadline, contract applied.
  const on = await fetchBroadFeed({ ...base, flag: "on" }, now);
  assert.equal(calls, 1);
  assert.equal(on.ok, true, on.error ?? "");
  assert.equal(lastUrl, "https://api.github.com/repos/owner/private_feed/contents/broad/latest.json?ref=main");
  const headers = lastInit?.headers as Record<string, string>;
  assert.equal(headers.Accept, "application/vnd.github.raw+json");
  assert.equal(headers.Authorization, "Bearer test_token_not_real");
  assert.ok(lastInit?.signal, "feed read has a deadline");

  const feed = on.feed!;
  assert.equal(feed.rows.length, 4, "duplicate and javascript: link dropped");
  assert.equal(feed.dropped, 2);
  for (const row of feed.rows) {
    assert.deepEqual(Object.keys(row).sort(), ["ats", "board", "company", "id", "lane", "location", "postedAt", "region", "remote", "title", "url"]);
  }
  const serialized = JSON.stringify(feed);
  assert.ok(!serialized.includes("JD BODY"), "JD text never survives the read");
  assert.ok(!serialized.includes("$100k"), "pay text never survives the read");
  assert.equal(feed.rows[1].postedAt, "2026-11-12", "timestamps are cut to a day");
  assert.equal(feed.sources.length, 4);

  const summary = summarizeBroad(on);
  assert.equal(summary.rows, 4);
  assert.equal(summary.sourcesOk, 3);
  assert.equal(summary.companies, 3);
  assert.deepEqual(summary.byRegion, { india: 2, worldwide: 1, unstated: 1 });
  assert.ok(!JSON.stringify(summary).includes("Example Co"), "summary carries counts, not names");

  // Failures are values, never throws.
  reply = () => new Response("nope", { status: 404 });
  assert.deepEqual((await fetchBroadFeed({ ...base, flag: "on" }, now)).error, "HTTP 404");
  reply = () => new Response("{not json", { status: 200 });
  assert.equal((await fetchBroadFeed({ ...base, flag: "on" }, now)).ok, false);
  reply = () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); };
  assert.match((await fetchBroadFeed({ ...base, flag: "on" }, now)).error ?? "", /timeout/);

  // Contract refusals.
  assert.match(parseBroadFeed(fixture, now).error ?? "", /example feed refused/);
  assert.ok(parseBroadFeed(fixture, now, true).feed, "example allowed only when asked");
  assert.match(parseBroadFeed({ ...fixture, schema: "v0" }, now, true).error ?? "", /unexpected schema/);
  assert.match(parseBroadFeed(fixture, new Date("2026-11-20T00:00:00Z"), true).error ?? "", /stale/);
  assert.match(parseBroadFeed({ ...fixture, rows: new Array(BROAD_FEED_MAX_ROWS + 1).fill({}) }, now, true).error ?? "", /too large/);
  assert.match(parseBroadFeed({ ...fixture, rows: undefined }, now, true).error ?? "", /no rows/);

  // The benchmark stays the 27-board config; this source adds nothing to it.
  const sources = JSON.parse(readFileSync(new URL("data/market-sources.json", root), "utf8")) as { boards: { enabled: boolean; ats: string }[] };
  assert.equal(sources.boards.filter((b) => b.enabled).length, 27, "benchmark still 27 enabled boards");
  assert.ok(sources.boards.every((b) => b.ats !== "broad"), "no broad source in the benchmark config");

  console.log("Broad feed: flag off by default, contract whitelist, refusals, failures as values and benchmark isolation passed.");
} finally {
  globalThis.fetch = originalFetch;
}
