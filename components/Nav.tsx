"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The tab bar, as real links.
 *
 * The active tab is read from the URL, not from local state, because there is no longer any
 * local state that could disagree with it: `usePathname()` is the same value on a click, a
 * back button, and a cold load of /market, so the underline cannot get out of step with what
 * is rendered below it.
 *
 * The href list is exported because the footer counts it — "10 views" was `TABS.length` and
 * would otherwise become a number typed by hand next to a list it is supposed to describe.
 */
export const NAV = [
  { label: "Overview", href: "/overview" },
  { label: "Plan", href: "/plan" },
  { label: "Curriculum", href: "/curriculum" },
  { label: "Sandbox", href: "/sandbox" },
  { label: "Mocks", href: "/mocks" },
  { label: "Roadmaps", href: "/roadmaps" },
  { label: "Library", href: "/library" },
  { label: "Assessments", href: "/assessments" },
  { label: "Comp reality", href: "/comp" },
  { label: "Market", href: "/market" },
];

/**
 * /design is deliberately NOT in NAV. It is the only view about the app rather than about the
 * plan, and the tab bar is for the work. The route still exists and still measures the tokens
 * and the five contrast floors live — it is reachable at /design, it just does not compete for
 * attention with the ten views that are actually the plan.
 *
 * Anything counting "views" counts NAV, which is the nav, not the route table.
 */

export function Nav() {
  const pathname = usePathname();
  return <nav className="tabs" aria-label="Workbook views">{NAV.map((item) => {
    const active = pathname === item.href;
    // `.tab` was written for a <button>, which is where its colour, weight and the
    // `.tab.active:after` underline come from — all of that applies to an <a> unchanged. The
    // one thing a link brings that a button does not is the default underline, and it is
    // killed here rather than in globals.css so the rule sits next to the element it applies to rather than in a stylesheet three other agents were editing.
    return <Link key={item.href} href={item.href} className={active ? "tab active" : "tab"} style={{ textDecoration: "none" }} aria-current={active ? "page" : undefined}>{item.label}</Link>;
  })}</nav>;
}
