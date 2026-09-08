"use client";

import { useState } from "react";
import { AskMark, LogoMark } from "@/app/brand";
import { RecallStrip } from "@/app/recall";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { NAV, Nav } from "@/components/Nav";
import { AskDock } from "./dock";

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
  const { askOpen, setAskOpen, setAskTopic, theme, toggleTheme, hours, focus, activeRows, curParts, startedTopics } = useAppState();
  const [shared, setShared] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "Lumen · Senior FDE plan", url }); return; }
      await navigator.clipboard.writeText(url);
      setShared(true); window.setTimeout(() => setShared(false), 2000);
    } catch { /* cancelled, or clipboard blocked without a secure context */ }
  };

  return <main className={askOpen ? "shell ask-open" : "shell"}>
    <header className="topbar"><a className="brand brand-link" href="/" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">by Rasul</div></div></a><div className="top-actions"><button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Quaere</button><button className="ghost-button" onClick={share} aria-live="polite">{shared ? "✓ Link copied" : "↗ Share"}</button><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></header>
    <section className="hero"><div><p className="kicker">Preparation command center</p><h1>Build proof, not just knowledge.</h1><p className="hero-copy">Your {hours}-hour Senior FDE plan, reduced to the pace, practice, and proof that matter this week.</p></div><div className="hero-note"><span className="note-pin">●</span><div><strong>Current focus</strong><p>{focus ? `Month ${focus.month} · ${focus.track}` : "Plan complete"}</p></div></div></section>
    <Nav /><RecallStrip startedTopics={startedTopics} />
    {children}
    {/* The dock slot. Everything Quaere needs is already in the provider above, so this is a
        one-line seam: the route-aware dock replaces app/(app)/dock.tsx and nothing here moves. */}
    <AskDock />
    <footer><span>Built from Rasul&apos;s Senior FDE plan · {activeRows.length} active topics · {hours} hours{curParts ? ` · ${curParts.toLocaleString()} syllabus parts` : ""}</span><span>{NAV.length} views · dashboard and MCP read the same plan</span></footer>
  </main>;
}
