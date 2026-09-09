import { useEffect, useState } from "react";
import type { Insight } from "@/lib/market/insight";
import type { StoredArtifact } from "@/lib/artifacts";
import { buildPaths, horizonNote, unclaimedBands, type PathView, type ReachSlice } from "@/lib/paths";
import { compRows, verdictTier } from "./shared";
import workbook from "@/data/workbook.json";

/**
 * Which way out.
 *
 * The plan says what to study. Every other tab measures how that is going. None of them answered
 * the question underneath all of it - what is this *for* - and that question has four possible
 * answers for a senior FDE in Pune, with different odds, different evidence and different clocks.
 *
 * The four are not a menu someone wrote. They are the shape of the CompReality sheet the reader
 * filled in themselves, joined to the reach tiers the nightly scan derives from real requisitions.
 * `lib/paths.ts` does the join and the tests pin it; this file is presentation, and its one job is
 * to render each path's honesty flag rather than bury it.
 *
 * ## The line this page will not cross
 *
 * A reach tier says a role needs relocation and a visa. It does not say to which country. So the
 * Gulf and the US read one pool of requisitions, and neither card renders a total - because there
 * is no honest total to render. Splitting the pool by guess would invent two confident numbers no
 * scan ever measured, on the one page whose entire purpose is deciding where to aim; summing the
 * tiers instead, which this page did at first, produced "180 of 191" under the heading "The US
 * market" with the disclaimer in the smallest type on the screen. Both are the same mistake.
 */

type Feed = { insight?: Insight | null; synced: boolean; error?: string | null };
type Shipped = { artifacts?: StoredArtifact[]; synced?: boolean };
type Load = "loading" | "ready" | "error";

/** The odds chip, taken from the sheet's own prose so it cannot become a second opinion. */
function Verdict({ bands }: { bands: PathView["bands"] }) {
  if (!bands.length) return null;
  // Best odds first - a path whose easiest door is "High" is a High path, and showing the worst
  // of two bands would rank "India" by its hardest variant.
  const best = bands.map((b) => verdictTier(b.odds)).sort((a, b) => a.rank - b.rank)[0];
  return <span className={`prob prob-${best.tone}`}>{best.label}</span>;
}

/**
 * What the live market says about this path - or, more often, what it cannot say.
 *
 * Four states, and three of them are some form of "less than you'd like". They are written out
 * rather than collapsed because they mean genuinely different things, and the difference between
 * "no scan has run" and "no roles exist" is the difference between patience and despair.
 *
 * Exported, and pure, because the shared-pool caveat only renders in the one state a prerender
 * never reaches - the page ships with `openings: null` and fills in after a fetch, so the static
 * HTML cannot prove the most important sentence here is ever emitted. As a function of its props
 * it can be rendered directly in the test suite, which is where that is now pinned.
 */
export function Openings({ path, core, state, synced }: { path: PathView; core: number | null; state: Load; synced: boolean }) {
  if (path.attribution === "none") {
    return <p className="path-openings path-openings-none">No requisition can evidence this one. It is the only path here whose proof is work you built yourself.</p>;
  }
  if (state === "loading") return <p className="path-openings path-openings-quiet">Reading the last scan…</p>;
  if (!path.openings) {
    return <p className="path-openings path-openings-quiet">{synced ? "No scan has recorded requisitions yet, so this path has no live count." : "The market store could not be read, so the live count is unknown, not zero."}</p>;
  }
  const { count, companies, slices } = path.openings;

  /*
   * A shared path gets NO headline number and NO "of N" denominator, and that is the fix for a
   * defect this page shipped with.
   *
   * The first version rendered every path identically: a 19px accent-coloured total over a 12px
   * grey caveat. Against real scan data that produced "147 of 191" on the Gulf card and "180 of
   * 191" on the US card - 94% of the entire market presented as US openings - with a disclaimer
   * underneath in the quietest type on the page. Two failures at once: a visual hierarchy arguing
   * against its own footnote, and, on the US card, a caveat that was flatly false. It said "this
   * is that whole pool", but the US total is the relocation pool PLUS `out-of-reach`, a disjoint
   * tier the Gulf card does not count - so two different numbers each claimed to be the same pool.
   * And `out-of-reach` is not destination-unknown at all: it is "US-person clause, active
   * clearance, or a region that excludes India", which is a door closed rather than a door
   * elsewhere.
   *
   * There was never a defensible total for these paths, so none is rendered. The per-tier lines
   * are each true on their own, and the caveat now describes exactly the tiers beside it.
   */
  if (path.attribution === "shared") {
    const relocation = slices.find((s) => s.tier === "relocate-sponsor");
    const blocked = slices.find((s) => s.tier === "out-of-reach");
    return <div className="path-openings">
      <p className="path-pool">No count of roles in this market exists. The scan records what a role <em>demands</em>, never which country it is in.</p>
      <ul className="path-tiers">{slices.map((s) => <li key={s.tier}><span>{s.count}</span> {s.label}</li>)}</ul>
      <p className="path-caveat">
        {relocation ? <>The {relocation.count} needing a move and a visa are the same requisitions the other relocation path on this page counts, not additional ones. </> : null}
        {blocked ? <>The {blocked.count} marked out of reach are closed to you outright, not waiting on a destination. </> : null}
        Adding these to the other cards would double-count.
      </p>
    </div>;
  }

  const denom = core ? ` of ${core}` : "";
  return <div className="path-openings">
    <p className="path-count"><strong>{count}</strong>{denom} live requisitions{companies ? <> · {companies}+ companies</> : null}</p>
    <ul className="path-tiers">{slices.map((s) => <li key={s.tier}><span>{s.count}</span> {s.label}</li>)}</ul>
  </div>;
}

/**
 * The four routes, compact, for the Overview rail.
 *
 * It sits directly under "Reality check", and that placement is the whole argument for it: that
 * panel says "$250K is a 2-3 year target, not something this plan promises", which raises the
 * obvious question - then what am I aiming at - and until now the page had no answer to it. This
 * is the answer, and the link to the full view.
 *
 * Bands only, no requisition counts. Everything here comes from the bundled CompReality sheet, so
 * the panel costs no request and cannot be the reason the home page waits. The measured openings,
 * and the disclosures they need, live on /paths where there is room to state them properly - a
 * rail is not the place to explain why two cards share one pool.
 */
export function PathsRail({ open }: { open: () => void }) {
  const views = buildPaths(compRows, null);
  return <div className="panel paths-rail">
    <p className="eyebrow">Four routes</p>
    <h2>Which way out</h2>
    <p className="paths-rail-lead">Same plan either way. What changes is what counts as done.</p>
    <ul className="paths-rail-list">
      {views.map((p) => <li key={p.id}>
        <span className="paths-rail-name">{p.label}</span>
        <Verdict bands={p.bands} />
        <span className="paths-rail-band">{p.bands[0]?.band || "No salary band describes this one."}</span>
      </li>)}
    </ul>
    <button className="text-button" onClick={open}>Compare the four →</button>
  </div>;
}

/**
 * One card. Exported and pure for the same reason `Openings` is.
 *
 * Every populated state of this page - a card with its openings filled in, its bands, its odds chip -
 * only exists after a fetch resolves, so the prerendered HTML shows the loading state and nothing
 * else. A component that renders four cards' worth of real data in a state no static build can
 * reach is a component whose layout nobody has looked at. As a function of its props it can be
 * rendered with real market data outside the app, which is how the populated layout gets checked.
 */
export function PathCard({ path, index, core, state, synced, built }: { path: PathView; index: number; core: number | null; state: Load; synced: boolean; built: number | null }) {
  return <article className="path-card">
    <header className="path-head">
      <span className="path-num">{String(index + 1).padStart(2, "0")}</span>
      <h3>{path.label}</h3>
      <Verdict bands={path.bands} />
    </header>
    <p className="path-premise">{path.premise}</p>

    <Openings path={path} core={core} state={state} synced={synced} />

    {path.bands.map((b) => <div className="path-band" key={b.market}>
      <p className="path-band-market">{b.market}</p>
      <p className="path-band-money">{b.band}</p>
      <p className="path-band-takes">{b.takes}</p>
      <p className="path-band-odds">{b.odds}</p>
      <p className="path-source">{b.source}</p>
    </div>)}

    {/* The fourth path has no band and no requisition, so its evidence is the only kind it
        can have: things that exist because you made them. Unknown stays unknown here too -
        an unreadable artifacts directory is not an empty one. */}
    {path.attribution === "none" && <div className="path-band">
      <p className="path-band-market">What would evidence it</p>
      <p className="path-band-money">{state === "loading" ? "Shipped work: reading…" : built === null ? "Shipped work: the store could not be read, so this is unknown, not none" : `${built} deliverable${built === 1 ? "" : "s"} recorded`}</p>
      <p className="path-band-takes">The plan carries one deliverable per topic. Elsewhere they are interview evidence; on this path they are the product. It is the only route here that pays nothing until it works, and everything after.</p>
    </div>}
  </article>;
}

export function Paths({ planMonths }: { planMonths: number }) {
  const [state, setState] = useState<Load>("loading");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [shipped, setShipped] = useState<Shipped | null>(null);

  useEffect(() => {
    // Settled independently: the artifacts directory is what evidences the fourth path, and a
    // market outage must not blank it. Each block below states its own absence.
    Promise.allSettled([
      fetch("/api/market").then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))),
      fetch("/api/artifacts").then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))),
    ]).then(([market, artifacts]) => {
      if (market.status === "fulfilled") { setFeed(market.value); setState("ready"); } else setState("error");
      if (artifacts.status === "fulfilled") setShipped(artifacts.value);
    });
  }, []);

  const reach = feed?.insight?.reachability ?? null;
  const tiers: ReachSlice[] | null = reach ? reach.tiers.map((t) => ({ tier: t.tier, label: t.label, count: t.count, companies: t.companies })) : null;
  const views = buildPaths(compRows, tiers);
  const unclaimed = unclaimedBands(compRows);
  const note = horizonNote(String((workbook.CompReality[0] as unknown[])[4] ?? ""), planMonths);
  /*
   * `synced` decides this, NOT `artifacts.length`, and NOT `r.ok`.
   *
   * `/api/artifacts` degrades with HTTP **200** and `{artifacts: [], synced: false}` - both when
   * GITHUB_TOKEN is unset and in readArtifacts' catch block - so `r.ok` passing tells you nothing
   * about whether the store was readable. Reading `.length` off that gives 0, and the card then
   * printed "0 deliverables recorded" during a GitHub outage: a portfolio blip rendered as an
   * empty portfolio, on the one path whose only stated proof is work you shipped. That is exactly
   * the rule this codebase keeps writing down - unknown is never rendered as none - and
   * ShippedWall.tsx already branches on `!synced` against this identical payload.
   */
  const built = shipped === null ? null : shipped.synced ? (shipped.artifacts?.length ?? 0) : null;

  return <section className="panel full-panel">
    <div className="panel-head"><div>
      <p className="eyebrow">Four routes, one plan</p>
      <h2>Which way out</h2>
    </div></div>

    <p className="path-intro">
      The plan is the same whichever of these you take. The difference is what counts as done. Each card
      below joins the compensation sheet you wrote to the requisitions the nightly scan actually found, so
      the odds are your own read and the openings are measured.
    </p>

    {/* The target row is not a market, so no path claims it - and it is the number the other five
        are calibrated against. Rendered first, as the thing the four cards are answers to. */}
    {unclaimed.map((b) => <div className="path-target" key={b.market}>
      <p className="eyebrow">{b.market}</p>
      <h3>{b.band}</h3>
      <p>{b.takes}</p>
      <p className="path-odds">{b.odds}</p>
      <p className="path-source">{b.source}</p>
    </div>)}

    {note && <p className="path-horizon">{note}</p>}

    <div className="path-grid">
      {views.map((p, i) => <PathCard key={p.id} path={p} index={i} core={reach?.coreCount ?? null} state={state} synced={Boolean(feed?.synced)} built={built} />)}
    </div>

    <p className="path-foot">
      Bands are public estimates and the odds column is a personal read. Treat both as anchors for a
      negotiation, not as promises. The requisition counts are measured, and they move every night.
    </p>
  </section>;
}
