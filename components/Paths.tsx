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
 * the question underneath all of it — what is this *for* — and that question has four possible
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
 * Gulf and the US read one pool of requisitions, and the page says that in words on both cards.
 * The alternative — splitting the pool by guess — would produce two confident numbers that no
 * scan ever measured, on the one page whose entire purpose is deciding where to aim.
 */

type Feed = { insight?: Insight | null; synced: boolean; error?: string | null };
type Shipped = { artifacts?: StoredArtifact[]; synced?: boolean };
type Load = "loading" | "ready" | "error";

/** The odds chip, taken from the sheet's own prose so it cannot become a second opinion. */
function Verdict({ bands }: { bands: PathView["bands"] }) {
  if (!bands.length) return null;
  // Best odds first — a path whose easiest door is "High" is a High path, and showing the worst
  // of two bands would rank "India" by its hardest variant.
  const best = bands.map((b) => verdictTier(b.odds)).sort((a, b) => a.rank - b.rank)[0];
  return <span className={`prob prob-${best.tone}`}>{best.label}</span>;
}

/**
 * What the live market says about this path — or, more often, what it cannot say.
 *
 * Four states, and three of them are some form of "less than you'd like". They are written out
 * rather than collapsed because they mean genuinely different things, and the difference between
 * "no scan has run" and "no roles exist" is the difference between patience and despair.
 *
 * Exported, and pure, because the shared-pool caveat only renders in the one state a prerender
 * never reaches — the page ships with `openings: null` and fills in after a fetch, so the static
 * HTML cannot prove the most important sentence here is ever emitted. As a function of its props
 * it can be rendered directly in the test suite, which is where that is now pinned.
 */
export function Openings({ path, core, state, synced }: { path: PathView; core: number | null; state: Load; synced: boolean }) {
  if (path.attribution === "none") {
    return <p className="path-openings path-openings-none">No requisition can evidence this one. It is the only path here whose proof is something you built rather than something someone posted.</p>;
  }
  if (state === "loading") return <p className="path-openings path-openings-quiet">Reading the last scan…</p>;
  if (!path.openings) {
    return <p className="path-openings path-openings-quiet">{synced ? "No scan has recorded requisitions yet, so this path has no live count." : "The market store could not be read, so the live count is unknown — not zero."}</p>;
  }
  const { count, companies, slices } = path.openings;
  const denom = core ? ` of ${core}` : "";
  return <div className="path-openings">
    <p className="path-count"><strong>{count}</strong>{denom} live requisitions{companies ? <> · {companies}+ companies</> : null}</p>
    <ul className="path-tiers">{slices.map((s) => <li key={s.tier}><span>{s.count}</span> {s.label}</li>)}</ul>
    {path.attribution === "shared" && <p className="path-caveat">
      The scan records that a role needs a move and a visa, not <em>where to</em>. This is that whole pool — shared with the other relocation path on this page, not a count of roles in this market.
    </p>}
  </div>;
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
  const built = shipped?.artifacts?.length ?? null;

  return <section className="panel full-panel">
    <div className="panel-head"><div>
      <p className="eyebrow">Four routes, one plan</p>
      <h2>Which way out</h2>
    </div></div>

    <p className="path-intro">
      The plan is the same whichever of these you take — the difference is what counts as done. Each card
      below joins the compensation sheet you wrote to the requisitions the nightly scan actually found, so
      the odds are your own read and the openings are measured.
    </p>

    {/* The target row is not a market, so no path claims it — and it is the number the other five
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
      {views.map((p, i) => <article className="path-card" key={p.id}>
        <header className="path-head">
          <span className="path-num">{String(i + 1).padStart(2, "0")}</span>
          <h3>{p.label}</h3>
          <Verdict bands={p.bands} />
        </header>
        <p className="path-premise">{p.premise}</p>

        <Openings path={p} core={reach?.coreCount ?? null} state={state} synced={Boolean(feed?.synced)} />

        {p.bands.map((b) => <div className="path-band" key={b.market}>
          <p className="path-band-market">{b.market}</p>
          <p className="path-band-money">{b.band}</p>
          <p className="path-band-takes">{b.takes}</p>
          <p className="path-band-odds">{b.odds}</p>
          <p className="path-source">{b.source}</p>
        </div>)}

        {/* The fourth path has no band and no requisition, so its evidence is the only kind it
            can have: things that exist because you made them. Unknown stays unknown here too —
            an unreadable artifacts directory is not an empty one. */}
        {p.attribution === "none" && <div className="path-band">
          <p className="path-band-market">What would evidence it</p>
          <p className="path-band-money">{built === null ? "Shipped work — currently unreadable" : `${built} deliverable${built === 1 ? "" : "s"} recorded`}</p>
          <p className="path-band-takes">The plan carries one deliverable per topic. On this path they stop being interview evidence and start being the product itself — which is the only route here that pays nothing until it works, and everything after.</p>
        </div>}
      </article>)}
    </div>

    <p className="path-foot">
      Bands are public estimates and the odds column is a personal read, not data — both are anchors for a
      negotiation, not promises. The requisition counts are measured, and they move every night.
    </p>
  </section>;
}
