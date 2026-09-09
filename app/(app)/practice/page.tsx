"use client";

import { Mocks } from "@/components/Mocks";
import { Assessments } from "@/components/Assessments";
import { useAppState } from "@/components/AppState";
import { planRows, topicKey, type Row } from "@/components/shared";

/**
 * /practice - the two ways the plan tests you, in one place.
 *
 * Mocks and Assessments were separate tabs rendering one panel each, sitting as peers to a
 * 387-line Market view. They answer the same question - how do you find out whether you actually
 * know this - and splitting them across two nav slots made the bar look full while making each
 * destination look empty.
 *
 * The scope derivation is unchanged and still lives here rather than in the panel, for the reason
 * it was written: the assessments component read no data at all and asserted "current plan topics"
 * as a frozen literal.
 */
export default function PracticePage() {
  const { statuses, focus, activeRows } = useAppState();
  const statusOf = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");
  const title = (r: Row) => String(r[2]);

  const inPlay = planRows.filter((r) => statusOf(r) === "In progress");
  const upNext = planRows.filter((r) => { const s = statusOf(r); return s !== "Done" && s !== "Skipped"; });
  const weeklyRows = (inPlay.length ? inPlay : upNext).slice(0, 3);
  const weekly = weeklyRows.length
    ? `${inPlay.length ? "Open now" : "Up next"} · ${weeklyRows.map(title).join(" · ")}`
    : null;

  const monthRows = focus ? activeRows.filter((r) => Number(r[1]) === focus.month) : [];
  const monthHours = monthRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthly = focus && monthRows.length
    ? `Month ${focus.month} · ${monthRows.length} topics · ${monthHours}h · ${focus.track}`
    : null;

  return <>
    <Assessments scopes={[weekly, monthly, null]} />
    <Mocks />
  </>;
}
