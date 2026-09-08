"use client";

import { useEffect, useState } from "react";
import { Curriculum } from "@/components/Curriculum";
import { useAppState } from "@/components/AppState";

export default function CurriculumPage() {
  const { curSummary, ensureSummary, requestSyllabus, renderSyllabus } = useAppState();
  // Which topics are expanded is this page's view state, the same kind of thing as /plan's one
  // expanded row. The syllabi they pull are not — those are cached in the provider.
  const [curOpen, setCurOpen] = useState<Set<number>>(new Set());
  const toggleCur = (idx: number) => setCurOpen((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });

  // The summary is a few hundred bytes and labels every collapsed row, so it is fetched when
  // this page first mounts and then kept — the provider will not ask twice, including after a
  // navigation away and back.
  useEffect(() => { ensureSummary(); }, [ensureSummary]);

  const openKey = Array.from(curOpen).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestSyllabus(Array.from(curOpen)); }, [openKey]);

  return <Curriculum curSummary={curSummary} curOpen={curOpen} setCurOpen={setCurOpen} toggleCur={toggleCur} renderSyllabus={renderSyllabus} />;
}
