/**
 * The four routes out of this plan, and what the data actually says about each.
 *
 * The plan answers "what should I study". It has never answered "what am I studying *toward*",
 * and that is the question with a deadline attached — a Pune-based reader can aim at a
 * dollar-linked remote role, a Gulf relocation, the US market, or their own thing, and those are
 * different bets with different odds, different evidence and different timelines.
 *
 * Everything here is a join over data that already exists: the CompReality sheet the reader wrote
 * themselves, and the reach tiers the nightly market scan derives from real requisitions. Nothing
 * on this page is typed prose about a market.
 *
 * ## The attribution problem, and why it is disclosed rather than solved
 *
 * A reach tier says what a requisition *demands* — `relocate-sponsor` means "on-site elsewhere,
 * would need a move and a visa". It does not say **where**. So the honest count for the Gulf path
 * and the honest count for the US path are the same pool of requisitions seen from two angles,
 * and reporting "14 UAE openings" and "14 US openings" off one 14 would be inventing a split the
 * scan never measured.
 *
 * Rather than fabricate the split or drop the number, every path carries an `attribution`:
 *
 *  - `exact` — the tiers map onto this path and nothing else. The count is this path's count.
 *  - `shared` — the tiers describe a demand, not a destination. **The UI must render no total for
 *    these paths at all.** The first version summed the tiers and captioned the sum with a
 *    disclaimer, which produced "180 of 191 live requisitions" under "The US market" — and was
 *    doubly wrong, because the US tiers are the relocation pool PLUS `out-of-reach`, so the sum is
 *    not even the shared pool it claimed to be. Per-tier counts are each true; their total is not.
 *  - `none` — no requisition can evidence this path, because it is not a job market.
 *
 * The third case is the entrepreneurial route, and it gets `none` rather than zero on purpose.
 * Zero openings reads as a market that rejected you; there is no market, which is the entire
 * point of that path.
 */
import type { ReachTier } from "@/lib/market/reach";

export type PathId = "india" | "gulf" | "us" | "own";

/** How a path's opening count relates to the requisitions behind it. See the module header. */
export type Attribution = "exact" | "shared" | "none";

export type PathDef = {
  id: PathId;
  label: string;
  /** One line: what taking this route actually means, in the reader's own situation. */
  premise: string;
  /** Reach tiers whose requisitions evidence this path. Empty for a path with no job market. */
  tiers: ReachTier[];
  attribution: Attribution;
  /** Matched against the CompReality market column. Written here so the sheet stays the source. */
  match: RegExp;
};

/**
 * Ordered by how reachable the route is from Pune today, nearest first.
 *
 * The same ordering principle `lib/market/reach.ts` applies to tiers, for the same reason: a
 * reader scanning this page top to bottom should meet the thing they could do this quarter
 * before the thing that takes three years, or the page reads as a fantasy list.
 */
export const PATHS: readonly PathDef[] = [
  {
    id: "india",
    label: "Stay in India",
    premise: "No relocation, no visa. Either a dollar-linked remote role from Pune, or an Indian employer.",
    // All three no-move tiers. `emea-apac-remote` belongs here because a remote EMEA req with an
    // IST overlap is takeable from this desk, which is the property the path is defined by.
    tiers: ["india-remote", "emea-apac-remote", "india-office"],
    attribution: "exact",
    match: /^india/i,
  },
  {
    id: "gulf",
    label: "The Gulf",
    premise: "Relocation to the UAE on an employer visa. Tax free, and the shortest move that changes the band.",
    tiers: ["relocate-sponsor"],
    attribution: "shared",
    match: /uae|dubai|gulf/i,
  },
  {
    id: "us",
    label: "The US market",
    premise: "The highest bands and the hardest entry. Needs a US-market role first, which usually needs a move.",
    tiers: ["relocate-sponsor", "out-of-reach"],
    attribution: "shared",
    match: /united states|ai labs/i,
  },
  {
    id: "own",
    label: "Your own thing",
    premise: "Build the product instead of applying. No requisition can evidence this one — the plan's shipped deliverables are the only proof it has.",
    tiers: [],
    attribution: "none",
    // `(?!)` — a negative lookahead on the empty pattern, which can never succeed. The previous
    // `/$^/` was wrong in a way that only a blank cell would expose: `/$^/.test("")` is TRUE, so a
    // CompReality row with an empty market column would have been claimed as a salary band by
    // "Your own thing" instead of surfacing through `unclaimedBands`. `(?!)` matches nothing at
    // all, including the empty string.
    match: /(?!)/,
  },
];

/** One CompReality row, named. Column order is the sheet's, and it is asserted in the tests. */
export type CompBand = { market: string; band: string; source: string; takes: string; odds: string };

export type ReachSlice = { tier: ReachTier; label: string; count: number; companies: number };

export type PathView = PathDef & {
  bands: CompBand[];
  /** Null when no scan has run, which is different from a path with no market. */
  openings: { count: number; companies: number; slices: ReachSlice[] } | null;
};

const cell = (row: (string | number | null)[], i: number) => String(row[i] ?? "").trim();

/** The sheet's own column order, so a reordered sheet fails a test rather than mislabelling a band. */
export const toBand = (row: (string | number | null)[]): CompBand => ({
  market: cell(row, 0),
  band: cell(row, 1),
  source: cell(row, 2),
  takes: cell(row, 3),
  odds: cell(row, 4),
});

/**
 * Join the sheet and the scan onto the four paths.
 *
 * `tiers` may be null — a scan that has not run yet, or a store that could not be read. Every
 * path then reports `openings: null`, and the caller says "not known" rather than "none". That
 * is the rule every reader in this codebase follows and the one that stops a GitHub outage from
 * rendering as a market with no jobs in it.
 *
 * Companies are NOT summed across tiers. One employer posting a Bengaluru role and a remote-EMEA
 * role is one company, and adding the per-tier figures would count it twice; the maximum is the
 * only defensible number available from per-tier counts alone, and it is a floor, not a total.
 */
export function buildPaths(
  compRows: (string | number | null)[][],
  tiers: ReachSlice[] | null,
): PathView[] {
  return PATHS.map((def) => {
    const bands = compRows.filter((r) => def.match.test(cell(r, 0))).map(toBand);
    if (def.attribution === "none") return { ...def, bands, openings: null };
    if (!tiers) return { ...def, bands, openings: null };
    const slices = def.tiers
      .map((t) => tiers.find((entry) => entry.tier === t))
      .filter((s): s is ReachSlice => Boolean(s));
    return {
      ...def,
      bands,
      openings: {
        count: slices.reduce((n, s) => n + s.count, 0),
        companies: slices.reduce((n, s) => Math.max(n, s.companies), 0),
        slices,
      },
    };
  });
}

/**
 * The sheet rows no path claimed.
 *
 * There is exactly one today — "Your $250K target", which is not a market but the number the
 * other five are calibrated against — and it is the single most important row in the sheet. A
 * `filter` per path would have dropped it on the floor with no trace, so this exists to make an
 * unclaimed row impossible to lose: whatever fails to match gets rendered anyway, and a row added
 * to the sheet next year appears on the page instead of disappearing into a regex that predates it.
 */
export function unclaimedBands(compRows: (string | number | null)[][]): CompBand[] {
  return compRows.filter((r) => !PATHS.some((p) => p.match.test(cell(r, 0)))).map(toBand);
}

/**
 * Whether the sheet's odds column still describes the plan the reader is on.
 *
 * The CompReality header reads "Probability in 9 months (my read)", and the plan is 23 months
 * long. Every verdict under that column — "Low in 9 months without relocation", "Realistic in
 * 6-9 months" — was written against a horizon that no longer exists, and rendering them beside a
 * 23-month plan silently re-dates them. Deriving the mismatch rather than hardcoding it means
 * re-writing the sheet header clears this notice by itself.
 *
 * Returns null when the horizons agree or when the header states no horizon at all.
 */
export function horizonNote(header: string, planMonths: number): string | null {
  const stated = Number(header.match(/(\d+)\s*months?/i)?.[1]);
  if (!Number.isInteger(stated) || stated === planMonths) return null;
  return `These verdicts were written against a ${stated}-month horizon. The plan is now ${planMonths} months, so read them as the odds at ${stated} months in — not as the odds at the end.`;
}
