"use client";

import { useEffect, useMemo, useState } from "react";
import { Plan } from "@/components/Plan";
import { planRows, topicKey } from "@/components/shared";
import { useAppState } from "@/components/AppState";

/**
 * The Plan explorer's own state — four filters and one expanded row — which is all local
 * because it is this page's view of the data and means nothing anywhere else. It resets when
 * you leave, and that is correct: arriving at /plan from /market with a stale "Month 7" filter
 * hiding the row you were sent to look at is the failure this avoids.
 */
export function PlanView({ initialTrack, initialExpanded }: { initialTrack: string; initialExpanded: number | null }) {
  const { statuses, progressSync, setStatus, setAskOpen, setAskTopic, setAskText, renderSyllabus, requestSyllabus, setPageContext } = useAppState();
  const [track, setTrack] = useState(initialTrack);
  const [month, setMonth] = useState("All months");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState("All progress");
  const [expanded, setExpanded] = useState<number | null>(initialExpanded);

  const filtered = useMemo(() => planRows.filter((r) => (track === "All tracks" || r[0] === track) && (month === "All months" || String(r[1]) === month) && (progress === "All progress" || String(statuses[topicKey(r)] || r[15] || "Not started") === progress) && String(r[2]).toLowerCase().includes(query.toLowerCase())), [track, month, progress, query, statuses]);

  // The syllabus cache is the provider's, so an expanded row that was already fetched on
  // /curriculum renders instantly here and costs no second request.
  useEffect(() => { if (expanded !== null) requestSyllabus([expanded]); }, [expanded, requestSyllabus]);

  // What this page contributes to a Quaere question: the rows actually on screen, and the row
  // you have open as the topic to go deep on. Cleared on the way out so a question asked from
  // /market does not quietly carry /plan's filters.
  const context = useMemo(() => filtered.slice(0, 8).map((r) => `${r[0]} | ${r[2]} | ${r[3]} | resources: ${r[4]}, ${r[7]}, ${r[10]}`).join("\n"), [filtered]);
  useEffect(() => { setPageContext(context, expanded); return () => setPageContext("", null); }, [context, expanded, setPageContext]);

  return <Plan
    filtered={filtered}
    query={query} setQuery={setQuery}
    track={track} setTrack={setTrack}
    month={month} setMonth={setMonth}
    progress={progress} setProgress={setProgress}
    expanded={expanded} setExpanded={setExpanded}
    statuses={statuses}
    progressSync={progressSync}
    setStatus={setStatus}
    setAskTopic={setAskTopic}
    setAskOpen={setAskOpen}
    setAskText={setAskText}
    renderSyllabus={renderSyllabus}
  />;
}
