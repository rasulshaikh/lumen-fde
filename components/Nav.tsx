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

export function Nav() {
  const pathname = usePathname();
  return <nav className="tabs" aria-label="Workbook views">{NAV.map((item) => {
    const active = pathname === item.href;
    // `.tab` was written for a <button>, which is where its colour, weight and the
    // `.tab.active:after` underline come from - all of that applies to an <a> unchanged. The
    // one thing a link brings that a button does not is the default underline, and it is
    // killed here rather than in globals.css so the rule sits next to the element it applies to rather than in a stylesheet three other agents were editing.
    return <Link key={item.href} href={item.href} className={active ? "tab active" : "tab"} style={{ textDecoration: "none" }} aria-current={active ? "page" : undefined}>{item.label}</Link>;
  })}</nav>;
}
