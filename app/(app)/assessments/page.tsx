"use client";

import { Assessments } from "@/components/Assessments";
import { useAppState } from "@/components/AppState";
import { planRows, topicKey, type Row } from "@/components/shared";

/**
 * The page derives what the panel used to hard-code.
 *
 * "Current plan topics · shell · networking · systems" was a literal, so the only view in the app
 * that read no data was also the one making the most specific claim about where you are. The
 * scopes below come from the same `statuses` every other view reads, which means the assessments
 * page now moves when progress moves — and, more to the point, cannot say "current" about
 * something eighteen months stale.
 */
export default function AssessmentsPage() {
  const { statuses, focus, activeRows } = useAppState();

  const statusOf = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");
  const title = (r: Row) => String(r[2]);

  // In-progress rows are what "current" means. If nothing is open yet, the honest answer is what
  // you are about to start, in plan order — which is the same "you are here" the hero uses.
  const inPlay = planRows.filter((r) => statusOf(r) === "In progress");
  const upNext = planRows.filter((r) => { const s = statusOf(r); return s !== "Done" && s !== "Skipped"; });
  const weeklyRows = (inPlay.length ? inPlay : upNext).slice(0, 3);
  const weekly = weeklyRows.length
    ? `${inPlay.length ? "Open now" : "Up next"} · ${weeklyRows.map(title).join(" · ")}`
    : null;

  // The month's own work, named. `focus` is the first row that is neither done nor skipped, so
  // its month is the month you are actually in rather than a calendar month.
  const monthRows = focus ? activeRows.filter((r) => Number(r[1]) === focus.month) : [];
  const monthHours = monthRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthly = focus && monthRows.length
    ? `Month ${focus.month} · ${monthRows.length} topics · ${monthHours}h · ${focus.track}`
    : null;

  // Quarterly is a description of an exam format, not a function of progress. Left alone on
  // purpose — deriving it would be decoration dressed as data.
  return <Assessments scopes={[weekly, monthly, null]} />;
}
