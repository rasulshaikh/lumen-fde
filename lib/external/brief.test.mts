/**
 * External brief tests. Run with:  npx tsx lib/external/brief.test.mts
 *
 * This module is the one thing Lumen shows that is not a file in the repo, so the properties
 * worth asserting are the ones that keep it checkable anyway:
 *
 * 1. **Nothing uncited survives extraction.** An item without an absolute http(s) URL is dropped,
 *    whatever envelope it arrived in. The engine's response shape belongs to someone else and can
 *    change; this guarantee cannot.
 * 2. **Age is stated, and staleness is stated louder.** A brief presenting last week's fetch as
 *    today's is the specific failure this module exists to prevent.
 * 3. **External text never outranks a measured number.** The prompt block says so in words, and
 *    the assertion here is what stops a future edit quietly dropping that sentence.
 *
 * The timeouts are asserted against the measured latency of the live endpoint (38.6s and 27.3s,
 * timed twice with curl) and against the 60s a Vercel Hobby function is allowed — never against
 * themselves. Two earlier versions of this file died here: an 18s live budget that would have
 * aborted every real call, and a 120s function that the plan rejects outright. Both looked
 * reasonable, neither had been checked, and both would have failed in production while passing
 * every test and every local build.
 */
import {
  briefAgeDays,
  briefQueries,
  REFRESH_TIMEOUT_MS,
  emptyBrief,
  externalContext,
  extractItems,
  LIVE_TIMEOUT_MS,
  MAX_ITEMS,
  STALE_AFTER_DAYS,
  externalPath,
  LATEST_PATH,
  type BriefItem,
} from "./brief.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const NOW = new Date("2026-09-09T18:30:00Z");

/** The slowest call ever observed against the endpoint. Every timeout below is judged against it. */
const SLOWEST_OBSERVED_MS = 38_600;

console.log("timeouts are set from measured latency, inside what the plan allows");
{
  // Vercel Hobby caps a function at 60s and rejects a build asking for more, so every budget here
  // is subtraction from 60. This is the constraint that moved live search out of /api/ask and
  // into its own route: the two could not share one function.
  const HOBBY_MAX_MS = 60_000;
  ck("live clears the slowest observed call", LIVE_TIMEOUT_MS > SLOWEST_OBSERVED_MS, `${LIVE_TIMEOUT_MS} vs ${SLOWEST_OBSERVED_MS}`);
  ck("refresh clears it too", REFRESH_TIMEOUT_MS > SLOWEST_OBSERVED_MS);
  ck("live fits a Hobby function, with room to answer", LIVE_TIMEOUT_MS < HOBBY_MAX_MS);
  ck("refresh fits one too, with room for the two commits", REFRESH_TIMEOUT_MS < HOBBY_MAX_MS);

  // The arithmetic that forced the split. If someone puts the search back inside /api/ask beside
  // the 55s model call, this is what says it cannot fit.
  ck("live + a 55s model call does NOT fit one function — the split is load-bearing", LIVE_TIMEOUT_MS + 55_000 > HOBBY_MAX_MS);
  // The refresh runs three queries in parallel, so its wall clock is one call and not their sum.
  ck("three sequential refreshes would NOT fit — parallelism is load-bearing", REFRESH_TIMEOUT_MS * 3 > HOBBY_MAX_MS);
}

console.log("an item without a citable URL never reaches the brief");
{
  const payload = {
    organicResults: [
      { title: "Real result", link: "https://example.com/a", snippet: "A snippet." },
      { title: "No URL at all", snippet: "Should be dropped." },
      { title: "Relative URL", link: "/somewhere", snippet: "Should be dropped." },
      { title: "Not http", link: "javascript:alert(1)", snippet: "Should be dropped." },
      { link: "https://example.com/no-title", snippet: "Title missing, dropped." },
    ],
  };
  const items = extractItems(payload, "q");
  ck("only the citable item survives", items.length === 1, `got ${items.length}`);
  ck("and it kept its URL", items[0]?.url === "https://example.com/a");
  ck("every item carries an absolute http(s) URL", items.every((i) => /^https?:\/\//.test(i.url)));
  ck("every item carries the query that surfaced it", items.every((i) => i.query === "q"));
}

console.log("extraction survives a shape it has never seen");
{
  // The envelope is someone else's and may change. Tolerant about nesting, strict about the item.
  const nested = { data: { pages: [{ results: [{ name: "Deep", href: "https://example.com/deep", description: "d" }] }] } };
  const items = extractItems(nested, "q");
  ck("finds an item nested three levels down", items.length === 1);
  ck("accepts name/href/description as aliases", items[0]?.title === "Deep" && items[0]?.snippet === "d");

  ck("a null payload yields nothing rather than throwing", extractItems(null, "q").length === 0);
  ck("a string payload yields nothing", extractItems("nope", "q").length === 0);
  ck("an empty object yields nothing", extractItems({}, "q").length === 0);

  const dupes = { r: [{ title: "A", url: "https://x.test/1" }, { title: "A again", url: "https://x.test/1" }] };
  ck("the same URL twice is stored once", extractItems(dupes, "q").length === 1);
}

console.log("stored text is cleaned and bounded");
{
  const long = "x".repeat(1000);
  const items = extractItems({ r: [{ title: `  spaced\n\ttitle  `, url: "https://x.test/1", snippet: long }] }, "q");
  ck("whitespace is collapsed and trimmed", items[0]?.title === "spaced title", JSON.stringify(items[0]?.title));
  ck("a snippet is capped", items[0]!.snippet.length <= 320, `${items[0]!.snippet.length}`);
}

console.log("queries follow the market the scan measured");
{
  const q = briefQueries(["Kubernetes", "Python", "Terraform", "Go"]);
  ck("capped at three", q.length === 3, `${q.length}`);
  ck("the standing FDE query is always first", q[0].includes("forward deployed engineer"));
  ck("the top skills drive the rest", q[1].includes("Kubernetes") && q[2].includes("Python"));
  ck("a fourth skill is not queried", !q.some((s) => s.includes("Go")));
  // The first live brief searched "Customer-site travel expectation industry adoption news" and
  // stored four travel-industry market reports. Every query naming the role is what stops a
  // coverage label — which is a requirement sentence, not a search term — dragging the brief into
  // whatever sector the phrase happens to mention.
  ck("every query names the role", q.every((s) => /forward deployed engineer/i.test(s)), q.join(" | "));
  const drifty = briefQueries(["Customer-site travel expectation"]);
  ck("a label that names an industry stays anchored to the role", drifty[1] === "forward deployed engineer Customer-site travel expectation", drifty.join(" | "));

  // A missing benchmark costs the skill queries, not the run.
  ck("no skills still yields the standing query", briefQueries([]).length === 1);
  ck("blank skills are dropped rather than queried as empty", briefQueries(["", "  "]).length === 1);
}

console.log("age is computed, and staleness is disclosed");
{
  ck("same day is 0", briefAgeDays("2026-09-09", NOW) === 0);
  ck("yesterday is 1", briefAgeDays("2026-09-08", NOW) === 1);
  ck("a week back is 7", briefAgeDays("2026-09-02", NOW) === 7);
  // A brief dated in the future is a clock or a bug, and "-2 days old" is worse than saying nothing.
  ck("a future date is null, not negative", briefAgeDays("2026-09-10", NOW) === null);
  ck("an unparseable date is null", briefAgeDays("not-a-day", NOW) === null);
  ck("an empty date is null", briefAgeDays("", NOW) === null);
}

console.log("the prompt block states its own date, age and rank");
{
  const item = (n: number): BriefItem => ({ title: `T${n}`, url: `https://x.test/${n}`, snippet: `S${n}`, query: "q" });
  const fresh = { ...emptyBrief("2026-09-08"), items: [item(1), item(2)] };
  const text = externalContext(fresh, NOW);
  ck("names the day it was fetched", text.includes("2026-09-08"));
  ck("states the age in days", text.includes("1 day old"), text.slice(0, 120));
  ck("does not cry stale when it is fresh", !text.includes("STALE"));
  ck("every line carries its URL", text.includes("https://x.test/1") && text.includes("https://x.test/2"));

  // The sentence the whole module exists to protect. If an edit drops it, this fails.
  ck("says external never overrides a measured number", /NEVER overrides a number measured in this repository/.test(text));
  ck("names the measured things it must not overrule", text.includes("readiness"));

  const old = { ...emptyBrief("2026-09-01"), items: [item(1)] };
  const staleText = externalContext(old, NOW);
  ck("a brief older than the threshold says STALE", staleText.includes("STALE"), `age ${briefAgeDays("2026-09-01", NOW)} vs threshold ${STALE_AFTER_DAYS}`);

  const edge = { ...emptyBrief("2026-09-06"), items: [item(1)] };
  ck("exactly at the threshold is not yet stale", !externalContext(edge, NOW).includes("STALE"), `age ${briefAgeDays("2026-09-06", NOW)}`);

  const many = { ...emptyBrief("2026-09-09"), items: Array.from({ length: 20 }, (_, i) => item(i)) };
  const lines = externalContext(many, NOW).split("\n").filter((l) => l.startsWith("- "));
  ck("the block is capped", lines.length === MAX_ITEMS, `${lines.length}`);
}

console.log("a partial fetch says it is partial");
{
  // `note` was written on every partial fetch and read by nobody — not the UI, not the prompt.
  // A short brief that does not say it is short reads as a quiet market rather than a failed fetch.
  const item = (n: number): BriefItem => ({ title: `T${n}`, url: `https://x.test/${n}`, snippet: "", query: "q" });
  const partial = { ...emptyBrief("2026-09-09"), items: [item(1)], note: "2 of 3 queries failed: timeout" };
  const text = externalContext(partial, NOW);
  ck("the note reaches the prompt", text.includes("2 of 3 queries failed"), text);
  ck("and is labelled as incompleteness, not colour", /INCOMPLETE/.test(text));
  const clean = { ...emptyBrief("2026-09-09"), items: [item(1)] };
  ck("a complete brief carries no such line", !/INCOMPLETE/.test(externalContext(clean, NOW)));
}

console.log("no brief is silence, not an empty claim");
{
  // The rule every reader in this codebase follows: unknown is never rendered as none. An empty
  // string means the prompt gets no outside block at all, which is where the route was before.
  ck("a null brief contributes nothing", externalContext(null, NOW) === "");
  ck("a brief with no items contributes nothing", externalContext(emptyBrief("2026-09-09"), NOW) === "");
}

console.log("paths are dated and the pointer is fixed");
{
  ck("the dated path carries the day", externalPath("2026-09-09").endsWith("/2026-09-09.json"));
  ck("latest is a fixed pointer", LATEST_PATH.endsWith("/latest.json"));
  ck("both live under the same directory", externalPath("2026-09-09").startsWith(LATEST_PATH.replace(/\/latest\.json$/, "")));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
