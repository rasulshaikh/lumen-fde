"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AskMark, LogoMark } from "@/app/brand";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { NAV, Nav } from "@/components/Nav";
import { AskDock } from "./dock";
import { PROGRAMME, TITLE } from "@/lib/profile";
import { WorkspaceProvider } from "@/components/WorkspaceState";
import "./workspace.css";

// Keep the provider mounted across routes: sessions and progress must survive navigation.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><AppStateProvider><Chrome>{children}</Chrome></AppStateProvider></WorkspaceProvider>;
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { askOpen, setAskOpen, setAskTopic, theme, toggleTheme, hours, activeRows, done, progressSync } = useAppState();
  const [shared, setShared] = useState(false);
  const pathname = usePathname();
  const title = pathname === "/overview" ? "Your study desk" : NAV.find((item) => item.href === pathname)?.label ?? "Workspace";
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: TITLE, url: window.location.href }); return; }
      await navigator.clipboard.writeText(window.location.href);
      setShared(true); window.setTimeout(() => setShared(false), 2000);
    } catch { /* sharing was cancelled */ }
  };

  return <main className={`shell workspace-shell${askOpen ? " ask-open" : ""}`}>
    <a className="workspace-skip" href="#workspace-content">Skip to content</a>
    <header className="topbar workspace-topbar">
      <Link className="brand brand-link" href="/overview" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">Study workspace</div></div></Link>
      <div className="top-actions">
        <button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Ask Lumen</button>
        <button className="ghost-button workspace-share" onClick={share} aria-live="polite">{shared ? "Link copied" : "Share"}</button>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </header>
    <Nav />
    <div className="workspace-heading">
      <div><p className="eyebrow">{PROGRAMME}</p><h1>{title}</h1></div>
      <span className="workspace-progress">{progressSync === "ready" ? `${done} of ${activeRows.length} topics completed` : progressSync === "loading" ? "Loading your progress…" : "Progress unavailable"}</span>
    </div>
    <div id="workspace-content" tabIndex={-1} key={pathname} className="route-enter workspace-content">{children}</div>
    <AskDock />
    <footer><span>{PROGRAMME} · {activeRows.length} active topics · {hours} planned hours</span><span>Build. Practice. Record the evidence.</span></footer>
  </main>;
}
