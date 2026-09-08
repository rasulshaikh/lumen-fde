"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Overview } from "@/components/Overview";
import { NAV } from "@/components/Nav";
import { useAppState } from "@/components/AppState";

export default function OverviewPage() {
  const router = useRouter();
  const state = useAppState();

  // Overview still speaks in tab names, because it is a shared component and its API is not
  // this migration's to rewrite. One adapter, here, turns the two calls it makes into routes.
  //
  // The ref is load-bearing: "By track" fires `setTrack(name)` and then `setView("Plan")` in the
  // same handler, and a filter that is now a query parameter would be thrown away by the push
  // that follows it. Holding the track until setView runs keeps both halves of that click.
  const pendingTrack = useRef<string | null>(null);
  const setTrack = (name: string) => { pendingTrack.current = name; };
  const setView = (name: string) => {
    const href = NAV.find((item) => item.label === name)?.href ?? "/";
    const track = pendingTrack.current;
    pendingTrack.current = null;
    router.push(href === "/plan" && track ? `/plan?track=${encodeURIComponent(track)}` : href);
  };

  // The old single-page URL was /?tab=Market. Nobody is known to hold one, but the mapping is
  // six lines and a dead bookmark landing silently on Overview is the kind of thing nobody
  // reports. Read off `window.location` rather than useSearchParams so this route keeps its
  // static prerender and needs no Suspense boundary for a parameter that should never arrive.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const href = tab && NAV.find((item) => item.label === tab)?.href;
    if (href && href !== "/") router.replace(href);
  }, [router]);

  return <Overview
    done={state.done}
    activeRows={state.activeRows}
    skipped={state.skipped}
    hours={state.hours}
    doneHours={state.doneHours}
    skippedHours={state.skippedHours}
    weeklyHours={state.weeklyHours}
    setWeekly={state.setWeekly}
    monthHours={state.monthHours}
    maxMonthHours={state.maxMonthHours}
    peakMonth={state.peakMonth}
    nextRow={state.nextRow}
    nextIndex={state.nextIndex}
    setView={setView}
    trackTotals={state.trackTotals}
    setTrack={setTrack}
    marketTiers={state.marketTiers}
  />;
}
