"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The tab bar, as real links.
 *
 * The active tab is read from the URL, not from local state, because there is no longer any
 * local state that could disagree with it: `usePathname()` is the same value on a click, a
 * back button, and a cold load of /market, so the underline cannot get out of step with what
 * is rendered below it.
 *
 * The href list is exported because the footer counts it - "10 views" was `TABS.length` and
 * would otherwise become a number typed by hand next to a list it is supposed to describe.
 */
export const NAV = [
  { label: "Overview", href: "/overview" },
  { label: "Plan", href: "/plan" },
  { label: "Curriculum", href: "/curriculum" },
  // Between the syllabus and the test: watch the system move before being asked about it.
  { label: "Machines", href: "/machines" },
  { label: "Practice", href: "/practice" },
  // A second curriculum, not a view of the FDE plan. It sits with the other "do you know this"
  // tabs. Market, next, measures requisitions; this one is a revenue-system path.
  { label: "GTM", href: "/gtm" },
  { label: "Market", href: "/market" },
  // Paths sits immediately after Market because it is built out of it: the reach tiers on the
  // Market tab are the evidence, and this is the decision they feed. Reading it before the market
  // it draws on would make four salary bands look like four choices rather than four bets.
  { label: "Paths", href: "/paths" },
  { label: "Library", href: "/library" },
  { label: "Sandbox", href: "/sandbox" },
];

/**
 * Nine: ten, merged down to seven, plus one that was missing, plus Machines.
 *
 * Five of the ten tabs rendered a single panel over one workbook sheet - Mocks and Comp reality
 * were five lines each, Roadmaps twenty-one - while sitting as equal peers to a 387-line Market
 * view. Ten equal slots presenting five substantial views and five stubs is a bar that looks full
 * and destinations that look empty, and it is a large part of why the app read as a document
 * rather than a product.
 *
 * They merged along the question each answers rather than by size:
 *   Mocks + Assessments -> Practice   both are "find out whether you actually know this"
 *   Roadmaps -> Library               both are material someone else wrote, that you consult
 *   Comp reality -> Market            one is what the market asks for, the other what it pays
 *
 * Nothing was removed from the product: every panel still renders, on the page where its question
 * is already being asked. The old URLs still resolve - see the redirects in next.config.ts, kept
 * because a bookmark that 404s is indistinguishable from a feature that was deleted.
 *
 * Paths is the eighth, and it is an addition rather than a restoration. Seven tabs measured how
 * the plan was going and none of them said what it was for; the compensation sheet and the scan's
 * reach tiers had held that answer between them for months with no page to render it on.
 */

/**
 * /design is deliberately NOT in NAV. It is the only view about the app rather than about the
 * plan, and the tab bar is for the work. The route still exists and still measures the tokens
 * and the five contrast floors live - it is reachable at /design, it just does not compete for
 * attention with the ten views that are actually the plan.
 *
 * Anything counting "views" counts NAV, which is the nav, not the route table.
 */

const PRIMARY = [
  { label: "Today", href: "/overview", routes: ["/overview"] },
  { label: "Study", href: "/plan", routes: ["/plan", "/curriculum"] },
  { label: "Practice", href: "/practice", routes: ["/practice", "/machines"] },
  { label: "Market", href: "/market", routes: ["/market", "/paths"] },
];
const TOOLS = [
  { label: "Curriculum", href: "/curriculum", detail: "Explore topic syllabuses" },
  { label: "Machines", href: "/machines", detail: "Debug interactive systems" },
  { label: "Career paths", href: "/paths", detail: "Compare your target markets" },
  { label: "GTM", href: "/gtm", detail: "Practice revenue systems" },
  { label: "Library", href: "/library", detail: "Find books and references" },
  { label: "Sandbox", href: "/sandbox", detail: "Run hands-on exercises" },
];

export function Nav() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const signOut = async () => {
    setSigningOut(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign out failed. Try again.");
      window.location.replace("/login");
    } catch { setError("Sign out failed. Try again."); setSigningOut(false); }
  };
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname]);
  const tool = TOOLS.find((item) => item.href === pathname);
  return <nav className="workspace-nav" aria-label="Main navigation">
    {PRIMARY.map((item) => <Link key={item.href} href={item.href} className={`workspace-nav-link${item.routes.includes(pathname) ? " active" : ""}`} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}
    <details ref={menu} className="workspace-tools" onKeyDown={(event) => {
      if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
    }}>
      <summary className={`workspace-nav-link${tool ? " active" : ""}`}>More <span aria-hidden="true">⌄</span></summary>
      <div className="workspace-tools-menu">
        <p className="eyebrow">Tools & resources</p>
        {TOOLS.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => { if (menu.current) menu.current.open = false; }}><strong>{item.label}</strong><span>{item.detail}</span></Link>)}
        <button className="ghost-button" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  </nav>;
}
