import { months, planRows, tracks } from "@/components/shared";
import { PlanView } from "./view";

/**
 * /plan - the only route that takes parameters, so the only one that is a server component.
 *
 * Reading `searchParams` here rather than calling `useSearchParams()` in the client view is what
 * lets the deep link work on a cold load: the segment renders dynamically with the parameter
 * already in hand, so there is no prerendered-then-corrected pass and no Suspense boundary
 * standing between the URL and the table.
 *
 * `key` remounts the view when the parameters change. All three jumps that produce them, "By track"
 * and a pace-map bar on Overview and a cited row on Market, mean "show me this, from a clean
 * slate", which is exactly what a remount is; without it the client view would keep the filter
 * state it was mounted with and the second jump would appear to do nothing.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ track?: string; month?: string; row?: string }> }) {
  const { track, month, row } = await searchParams;
  // A plan row cited by the benchmark is 1-based against workbook.Plan, whose header sits at
  // index 0 - so planRows[row - 1] is that topic.
  const index = Number(row) - 1;
  const expanded = Number.isInteger(index) && index >= 0 && index < planRows.length ? index : null;
  // An unknown track would put the <select> on a value it has no <option> for, which renders as
  // an empty control claiming to be a filter. Fall back to the unfiltered view instead.
  const initialTrack = track && tracks.includes(track) ? track : "All tracks";
  // Same guard as the track, for the same reason: the <select> renders one <option> per month the
  // workbook actually has, so ?month=99 would leave the control showing a value it has no option
  // for, which looks like a filter that is on and displays nothing.
  const initialMonth = month && months.some((m) => String(m) === month) ? month : "All months";
  return <PlanView key={`${initialTrack}|${initialMonth}|${expanded}`} initialTrack={initialTrack} initialMonth={initialMonth} initialExpanded={expanded} />;
}
