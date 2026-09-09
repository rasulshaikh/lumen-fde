"use client";

import { useState } from "react";
import { AskMark, LogoMark } from "@/app/brand";
import { RecallStrip } from "@/app/recall";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { NAV, Nav } from "@/components/Nav";
import { AskDock } from "./dock";
import { HeroLines } from "./hero-lines";

/**
 * The shell every one of the ten routes renders inside.
 *
 * A layout is the only place the cross-route state can live: Next keeps this component mounted
 * and swaps only the segment below it, so `AppStateProvider` is instantiated once per session
 * rather than once per navigation. Put the provider in a page and the progress fetch re-runs on
 * every tab click — which does not just flicker, it re-arms the un-hydrated write window that
 * once overwrote real progress.
 *
 * `Chrome` is a separate component in this same file for the boring reason that a provider
 * cannot consume its own context.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppStateProvider><Chrome>{children}</Chrome></AppStateProvider>;
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { askOpen, setAskOpen, setAskTopic, theme, toggleTheme, hours, focus, activeRows, curParts, startedTopics, done, doneHours, peakMonth, monthHours, nextRow, nextIndex } = useAppState();
  const [shared, setShared] = useState(false);

  // What the hero rotates through. Every line is arithmetic over values this component already
  // holds — no new fetch, and nothing here can say something the footer would contradict. A line
  // that cannot be derived is dropped rather than filled in, which is why this is a filter and
  // not a fixed array.
  const heroLines = [
    `Your ${hours}-hour Senior FDE plan, reduced to the pace, practice, and proof that matter this week.`,
    focus ? `Month ${focus.month} of ${monthHours.length} · ${focus.track}.` : null,
    `${done} of ${activeRows.length} topics recorded · ${hours - doneHours}h still ahead.`,
    curParts ? `${curParts.toLocaleString()} syllabus parts, each naming one public resource.` : null,
    peakMonth ? `Heaviest month is ${peakMonth.month}, at ${peakMonth.hours}h.` : null,
  ].filter((line): line is string => Boolean(line));

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
    <section className="hero"><div><p className="kicker">Preparation command center</p><h1>Build proof, not just knowledge.</h1><HeroLines lines={heroLines} /></div>{/* Current focus was a 300x73 chip in a 306px hero — about 7% of it — carrying one line.
        It is the only thing on the hero that changes as the plan moves, so it now says what it
        knows: where you are in the 23 months, the row you are actually on, and what that row
        costs. Every figure is read from the provider; nothing here is typed. */}
      <aside className="hero-focus">
        <p className="eyebrow">Current focus</p>
        {focus ? <>
          <p className="hero-focus-where">Month {focus.month} <span>of {monthHours.length}</span></p>
          <p className="hero-focus-track">{focus.track}</p>
          {nextRow && <div className="hero-focus-row">
            <span className="hero-focus-num">{String(nextIndex + 1).padStart(2, "0")}</span>
            <div>
              <strong>{String(nextRow[2])}</strong>
              <span>{Number(nextRow[13] || 0)}h · {activeRows.length - done} topics left</span>
            </div>
          </div>}
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
