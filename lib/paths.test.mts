/**
 * Paths tests. Run with:  npx tsx lib/paths.test.mts
 *
 * Three properties, and the first two are the ones that would make this page lie.
 *
 * 1. **Every CompReality row reaches the page.** A path is a regex over the market column, and a
 *    regex silently drops what it does not match. The sheet's most important row — "Your $250K
 *    target" — matches no path by design, so the test asserts it comes out of `unclaimedBands`
 *    rather than out of nowhere. Run against the real workbook, not a fixture: a fixture would
 *    keep passing after someone edited the sheet, which is the exact failure it exists to catch.
 *
 * 2. **A shared count is never presented as an exclusive one.** The Gulf and US paths read the
 *    same `relocate-sponsor` pool because a reach tier records that a move is needed, not where
 *    to. The tests pin the overlap as real and pin both paths to `attribution: "shared"`, so
 *    removing the disclosure breaks a test instead of quietly inventing a country split.
 *
 * 3. **Unknown is never rendered as none.** No scan, no store, no network — every one of those
 *    is `openings: null`, never `{count: 0}`.
 */
import workbook from "../data/workbook.json" with { type: "json" };
import {
  PATHS,
  buildPaths,
  horizonNote,
  toBand,
  unclaimedBands,
  type ReachSlice,
} from "./paths.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

type Row = (string | number | null)[];
const HEADER = workbook.CompReality[0] as Row;
// The same filter components/shared.tsx applies: data rows only, no header and no short footer.
const COMP = (workbook.CompReality.slice(1) as Row[]).filter((r) => r.length >= 5 && String(r[0] ?? "").trim() !== "" && !/^total/i.test(String(r[0] ?? "")));

const slices: ReachSlice[] = [
  { tier: "india-remote", label: "l", count: 7, companies: 6 },
  { tier: "india-office", label: "l", count: 11, companies: 9 },
  { tier: "emea-apac-remote", label: "l", count: 4, companies: 4 },
  { tier: "relocate-sponsor", label: "l", count: 20, companies: 15 },
  { tier: "out-of-reach", label: "l", count: 9, companies: 8 },
];

console.log("the sheet's column order is what the band reader assumes");
{
  // If the sheet is ever reordered, this is the test that fails — rather than the page quietly
  // labelling a source URL as a salary band.
  ck("column 0 is the market", /market/i.test(String(HEADER[0])), String(HEADER[0]));
  ck("column 1 is the band", /band/i.test(String(HEADER[1])), String(HEADER[1]));
  ck("column 2 is the source", /source/i.test(String(HEADER[2])), String(HEADER[2]));
  ck("column 3 is what it takes", /what it takes/i.test(String(HEADER[3])), String(HEADER[3]));
  ck("column 4 is the odds", /probability/i.test(String(HEADER[4])), String(HEADER[4]));

  const b = toBand(["M", "B", "S", "T", "O"]);
  ck("toBand follows that order", b.market === "M" && b.band === "B" && b.source === "S" && b.takes === "T" && b.odds === "O");
  ck("missing cells become empty strings, not 'null'", toBand([]).band === "");
}

console.log("every row of the real sheet reaches the page");
{
  const views = buildPaths(COMP, slices);
  const claimed = views.flatMap((v) => v.bands.map((b) => b.market));
  const unclaimed = unclaimedBands(COMP).map((b) => b.market);
  ck("the sheet has rows to place", COMP.length > 0, `${COMP.length} rows`);
  ck("claimed + unclaimed accounts for every row", claimed.length + unclaimed.length === COMP.length, `${claimed.length}+${unclaimed.length} vs ${COMP.length}`);
  // The property that matters more than the count: no row is claimed twice, so no band is shown
  // under two different paths as if it described both.
  ck("no row is claimed by two paths", new Set(claimed).size === claimed.length, claimed.join(" | "));
  ck("the target row is surfaced, not dropped", unclaimed.some((m) => /target/i.test(m)), unclaimed.join(" | "));
}

console.log("each path picks up the markets it should");
{
  const views = buildPaths(COMP, slices);
  const by = (id: string) => views.find((v) => v.id === id)!;
  ck("four paths", views.length === 4, `${views.length}`);
  ck("India picks up both India rows", by("india").bands.length === 2, by("india").bands.map((b) => b.market).join(" | "));
  ck("the Gulf picks up UAE", by("gulf").bands.some((b) => /uae/i.test(b.market)));
  ck("the US picks up the US band and the labs band", by("us").bands.length === 2, by("us").bands.map((b) => b.market).join(" | "));
  ck("your own thing claims no salary band", by("own").bands.length === 0);
  ck("every claimed band carries its source", views.flatMap((v) => v.bands).every((b) => b.source.length > 0));
}

console.log("openings are attributed honestly, or not attributed");
{
  const views = buildPaths(COMP, slices);
  const by = (id: string) => views.find((v) => v.id === id)!;

  ck("India sums its three no-move tiers", by("india").openings?.count === 22, `${by("india").openings?.count}`);
  ck("India is exact — those tiers describe nothing else", by("india").attribution === "exact");

  // The disclosure this whole module exists for.
  ck("the Gulf reads the relocation pool", by("gulf").openings?.count === 20, `${by("gulf").openings?.count}`);
  ck("the US reads that same pool plus out-of-reach", by("us").openings?.count === 29, `${by("us").openings?.count}`);
  ck("both are marked shared, never exact", by("gulf").attribution === "shared" && by("us").attribution === "shared");
  const gulfTiers = new Set(by("gulf").tiers);
  ck("and they genuinely overlap — the disclosure is not decorative", by("us").tiers.some((t) => gulfTiers.has(t)));

  // Companies are a floor, not a sum: one employer can post into two tiers.
  ck("companies is the max across tiers, never the sum", by("india").openings?.companies === 9, `${by("india").openings?.companies}`);

  ck("your own thing has no openings and is not zero", by("own").openings === null);
  ck("its attribution says why", by("own").attribution === "none");
}

console.log("no scan is unknown, never an empty market");
{
  const views = buildPaths(COMP, null);
  ck("every path reports null openings", views.every((v) => v.openings === null));
  ck("but the bands still render — the sheet is local", views.some((v) => v.bands.length > 0));

  // A scan that ran but found nothing in a tier is a real zero, and must be distinguishable.
  const empty = buildPaths(COMP, [{ tier: "india-remote", label: "l", count: 0, companies: 0 }]);
  const india = empty.find((v) => v.id === "india")!;
  ck("a measured zero is 0, not null", india.openings?.count === 0, JSON.stringify(india.openings));
  ck("and a tier missing from the scan is skipped, not counted as 0", india.openings?.slices.length === 1, `${india.openings?.slices.length}`);
}

console.log("the odds column discloses the horizon it was written for");
{
  const note = horizonNote(String(HEADER[4]), 23);
  ck("the real header states a horizon", /\d+\s*months?/i.test(String(HEADER[4])), String(HEADER[4]));
  ck("a 9-month column under a 23-month plan is disclosed", note !== null && note.includes("23"), String(note));
  ck("the note names the horizon actually written", note !== null && note.includes("9-month"), String(note));

  ck("agreement produces no note", horizonNote("Probability in 23 months (my read)", 23) === null);
  ck("a header with no horizon produces no note", horizonNote("Probability (my read)", 23) === null);
  ck("singular months parse too", horizonNote("Probability in 1 month", 23) !== null);
}

console.log("the disclosure actually reaches the screen");
{
  // Asserted by rendering, not by reading the source. The caveat lives in the one state a
  // prerender never reaches — the page ships with `openings: null` and fills in after a fetch —
  // so the built HTML contains every other sentence on this page and not this one. A condition
  // inverted here would have shipped looking fine.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Openings } = await import("../components/Paths.tsx");

  const views = buildPaths(COMP, slices);
  const render = (id: string, over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(Openings, { path: views.find((v) => v.id === id)!, core: 44, state: "ready", synced: true, ...over } as never));

  const gulf = render("gulf");
  ck("a shared path names the pool as shared", /shared with the other relocation path/.test(gulf), gulf.slice(0, 200));
  ck("and says the scan does not record the destination", /not <em>where to<\/em>/.test(gulf));
  ck("it still shows the measured count", gulf.includes("20"));
  ck("the US card carries the same disclosure", /shared with the other relocation path/.test(render("us")));

  const india = render("india");
  ck("an exact path carries NO shared caveat", !/shared with the other relocation path/.test(india));
  ck("and does show its count against the core denominator", india.includes("22") && india.includes("of 44"));

  const own = render("own");
  ck("the no-market path says why, and never shows a zero", /No requisition can evidence this one/.test(own) && !/>0</.test(own));

  const unread = render("india", { path: { ...views[0], openings: null }, synced: false });
  ck("an unreadable store says unknown, not zero", /unknown — not zero/.test(unread), unread);
  const noscan = render("india", { path: { ...views[0], openings: null }, synced: true });
  ck("a synced store with no scan says so differently", /No scan has recorded/.test(noscan), noscan);
  ck("the two empty states are not the same sentence", unread !== noscan);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
