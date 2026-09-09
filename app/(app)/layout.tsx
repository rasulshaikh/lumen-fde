"use client";

import { useState } from "react";
import { AskMark, LogoMark } from "@/app/brand";
import { RecallStrip } from "@/app/recall";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { planRows } from "@/components/shared";
import { useRouter } from "next/navigation";
import { NAV, Nav } from "@/components/Nav";
import { AskDock } from "./dock";
import { HeroLines } from "./hero-lines";
import { HeroHeadline } from "./hero-headline";
import { headlines, pool } from "@/lib/hero";

/**
 * The shell every one of the ten routes renders inside.
 *
 * A layout is the only place the cross-route state can live: Next keeps this component mounted
 * and swaps only the segment below it, so `AppStateProvider` is instantiated once per session
 * rather than once per navigation. Put the provider in a page and the progress fetch re-runs on
 * every tab click - which does not just flicker, it re-arms the un-hydrated write window that
 * once overwrote real progress.
 *
 * `Chrome` is a separate component in this same file for the boring reason that a provider
 * cannot consume its own context.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppStateProvider><Chrome>{children}</Chrome></AppStateProvider>;
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { askOpen, setAskOpen, setAskTopic, theme, toggleTheme, hours, focus, activeRows, curParts, startedTopics, done, doneHours, peakMonth, monthHours, nextRow, nextIndex, weeklyHours, trackTotals, skipped, skippedHours, statusOf } = useAppState();
  const [shared, setShared] = useState(false);
  const router = useRouter();

  /*
   * What the focus card knows.
   *
   * It carried four lines: the month, the track, the row and its hours. That is orientation
   * without a next step, on the one panel a reader looks at first every morning. These add the
   * two things the four lines implied but never answered: how far through the month you are, and
   * what comes after the row you are on.
   *
   * All of it is derived from state this component already holds, so the card costs no request.
   */
  const monthRows = focus ? activeRows.filter((r) => Number(r[1]) === focus.month) : [];
  const monthDone = monthRows.filter((r) => statusOf(r) === "Done").length;
  const monthLoad = monthRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const afterNext = nextIndex >= 0
    ? planRows.slice(nextIndex + 1).find((r) => { const st = statusOf(r); return st !== "Done" && st !== "Skipped"; }) ?? null
    : null;

  // What the hero rotates through. Built by lib/hero.ts from values this component already holds,
  // so there is no new fetch and nothing here can say something the footer would contradict.
  //
  // It is a pool rather than a list, and `HeroLines` shuffles it per visit. Five fixed lines in a
  // fixed order stop being read within a fortnight, and this is the first thing on the screen
  // every morning for 23 months. The pool also changes shape as the plan moves: lines that count
  // completed work do not exist until there is completed work, so the first morning is not greeted
  // with three different renderings of zero.
  const heroState = {
    hours,
    doneHours,
    done,
    total: activeRows.length,
    month: focus?.month ?? null,
    months: monthHours.length,
    track: focus?.track ?? null,
    nextTopic: nextRow ? String(nextRow[2]) : null,
    nextHours: nextRow ? Number(nextRow[13] || 0) || null : null,
    parts: curParts,
    tracks: trackTotals.length,
    weeklyHours,
    peak: peakMonth ?? null,
    skipped,
    skippedHours,
  };
  const heroLines = pool(heroState);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "Lumen · Senior FDE plan", url }); return; }
      await navigator.clipboard.writeText(url);
      setShared(true); window.setTimeout(() => setShared(false), 2000);
    } catch { /* cancelled, or clipboard blocked without a secure context */ }
  };

  return <main className={askOpen ? "shell ask-open" : "shell"}>
    <header className="topbar"><a className="brand brand-link" href="/overview" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">by Rasul</div></div></a><div className="top-actions"><button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Quaere</button><button className="ghost-button" onClick={share} aria-live="polite">{shared ? "✓ Link copied" : "↗ Share"}</button><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></header>
    <section className="hero"><div><p className="kicker">Preparation command center</p><HeroHeadline lines={headlines(heroState)} /><HeroLines lines={heroLines} /></div>{/* Current focus was a 300x73 chip in a 306px hero - about 7% of it - carrying one line.
        It is the only thing on the hero that changes as the plan moves, so it now says what it
        knows: where you are in the 23 months, the row you are actually on, and what that row
        costs. Every figure is read from the provider; nothing here is typed. */}
      <aside className="hero-focus">
        <p className="eyebrow">Current focus</p>
        {focus ? <>
          <p className="hero-focus-where">Month {focus.month} <span>of {monthHours.length}</span></p>
          <p className="hero-focus-track">{focus.track}</p>

          {monthRows.length > 0 && <div className="hero-focus-month">
            <div className="hero-focus-meter" role="presentation">
              <span style={{ width: `${Math.round((monthDone / monthRows.length) * 100)}%` }} />
            </div>
            <p>{monthDone} of {monthRows.length} topics this month · {monthLoad}h</p>
          </div>}

          {nextRow && <button className="hero-focus-row" onClick={() => router.push(`/plan?row=${nextIndex + 1}`)}>
            <span className="hero-focus-num">{String(nextIndex + 1).padStart(2, "0")}</span>
            <span className="hero-focus-body">
              <strong>{String(nextRow[2])}</strong>
              <span>{Number(nextRow[13] || 0)}h · {activeRows.length - done} topics left in the plan</span>
            </span>
            <span className="hero-focus-go" aria-hidden="true">→</span>
          </button>}

          {/* The row after the one you are on. Small, because it is not today's problem, and
              present, because "what is coming" is the question the card kept raising. */}
          {afterNext && <p className="hero-focus-then">Then: {String(afterNext[2])}</p>}
        </> : <p className="hero-focus-where">Plan complete</p>}
      </aside></section>
    <Nav /><RecallStrip startedTopics={startedTopics} />
    {children}
    {/* The dock slot. Everything Quaere needs is already in the provider above, so this is a
        one-line seam: the route-aware dock replaces app/(app)/dock.tsx and nothing here moves. */}
    <AskDock />
    <footer><span>Built from Rasul&apos;s Senior FDE plan · {activeRows.length} active topics · {hours} hours{curParts ? ` · ${curParts.toLocaleString()} syllabus parts` : ""}</span><span>{NAV.length} views · dashboard and MCP read the same plan</span></footer>
  </main>;
}
