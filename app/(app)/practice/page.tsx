"use client";

import { useRouter } from "next/navigation";
import { Mocks } from "@/components/Mocks";
import { Assessments } from "@/components/Assessments";
import type { Scope } from "@/components/TestRunner";
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
 * The scope derivation lives here rather than in the panel, for the reason it was written: the
 * assessments component read no data at all and asserted "current plan topics" as a frozen
 * literal. It now carries plan row INDICES as well as a label, because those indices are the keys
 * `/api/recall` takes and the paper is drawn from them. A label alone could go stale against the
 * questions it claims to describe; an index cannot.
 */
export default function PracticePage() {
  const router = useRouter();
  const { statuses, focus, activeRows } = useAppState();
  const statusOf = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");
  const title = (r: Row) => String(r[2]);
  const indexOf = (r: Row) => planRows.indexOf(r);

  const inPlay = planRows.filter((r) => statusOf(r) === "In progress");
  const upNext = planRows.filter((r) => { const s = statusOf(r); return s !== "Done" && s !== "Skipped"; });
  const weeklyRows = (inPlay.length ? inPlay : upNext).slice(0, 3);
  const weekly: Scope | null = weeklyRows.length ? {
    id: "weekly",
    label: `${inPlay.length ? "Open now" : "Up next"} · ${weeklyRows.map(title).join(" · ")}`,
    indices: weeklyRows.map(indexOf),
    questions: 6,
    minutes: 30,
  } : null;

  const monthRows = focus ? activeRows.filter((r) => Number(r[1]) === focus.month) : [];
  const monthHours = monthRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthly: Scope | null = focus && monthRows.length ? {
    id: `month-${focus.month}`,
    label: `Month ${focus.month} · ${monthRows.length} topics · ${monthHours}h · ${focus.track}`,
    indices: monthRows.map(indexOf),
    questions: 12,
    minutes: 90,
  } : null;

  /**
   * The capstone is the only one drawn from everything you have touched rather than from where
   * you are standing. Done topics are the point of it: a quarterly paper that only asks about the
   * current month is a monthly paper with a longer clock.
   *
   * It falls back to the weekly scope early on, when nothing is finished yet, rather than
   * offering a three-hour exam over an empty set.
   */
  const touched = planRows.filter((r) => { const s = statusOf(r); return s === "Done" || s === "In progress"; });
  const quarterly: Scope | null = touched.length
    ? { id: "quarterly", label: `${touched.length} topic${touched.length === 1 ? "" : "s"} started or finished`, indices: touched.map(indexOf), questions: 20, minutes: 180 }
    : weekly && { ...weekly, id: "quarterly", questions: 20, minutes: 180 };

  return <>
    <Assessments scopes={[weekly, monthly, quarterly]} openRow={(index) => router.push(`/plan?row=${index + 1}`)} />
    <Mocks />
  </>;
}
