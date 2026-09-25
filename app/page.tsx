import type { Metadata } from "next";
import workbook from "@/data/workbook.json";
import curriculum from "@/data/curriculum.json";
import library from "@/data/library-context.json";
import sources from "@/data/market-sources.json";
import { LADDER } from "@/lib/review";
import { LogoMark } from "./brand";
import { LIGHT_AUDIT, MARKET_SYSTEM, PROGRAMME, STUDY_SYSTEM, TITLE } from "@/lib/profile";

type Row = (string | number | null)[];
type Topic = { subtopics?: unknown[]; interviewQuestions?: unknown[] };

export const metadata: Metadata = {
  title: TITLE,
  description:
    "The study system that lifts your FDE ceiling: 117 topics, 2,236 syllabus parts, and a nightly scan of 27 job boards that ranks the plan by what is actually being asked for.",
};

/**
 * The public front door.
 *
 * A server component, so `curriculum.json` (3.7MB) is read at build time and costs a visitor
 * nothing. The proxy sends a request carrying a valid session to /overview instead of here, so
 * this page is only ever rendered for someone who is not signed in.
 *
 * **Every number here is derived and none of them are personal.** That constraint is not
 * stylistic: /login already documents the rule this follows - scale, never state. Topic counts,
 * hours and board counts describe how big the system is and are harmless on a public URL.
 * Progress, readiness, current focus, streaks and anything that says what Rasul has or has not
 * done stay behind the gate. If a number here ever needs `statuses` to compute, it does not
 * belong on this page.
 */
export default function LandingPage() {
  const rows = (workbook.Plan as Row[]).slice(1);
  const active = rows.filter((r) => String(r[15] ?? "").trim().toLowerCase() !== "skipped");
  const hours = active.reduce((n, r) => n + Number(r[13] || 0), 0);
  const tracks = new Set(active.map((r) => String(r[0]))).size;
  const months = Math.max(...active.map((r) => Number(r[1])));
  const topics = Object.values((curriculum as { topics: Record<string, Topic> }).topics);
  const parts = topics.reduce((n, t) => n + (t.subtopics?.length ?? 0), 0);
  const questions = topics.reduce((n, t) => n + (t.interviewQuestions?.length ?? 0), 0);
  const boards = (sources as { enabledCount: number }).enabledCount;

  const stats: [string, string][] = [
    [String(active.length), "topics"],
    [`${hours.toLocaleString()}h`, "of planned work"],
    [String(months), "months"],
    [String(tracks), "tracks"],
    [parts.toLocaleString(), "syllabus parts"],
    [questions.toLocaleString(), "interview questions"],
    [String(library.length), "books indexed"],
    [String(boards), "job boards scanned"],
  ];

  const study: [string, string, string][] = [
    ["01", "The plan", `${active.length} topics across ${tracks} tracks and ${months} months. Every row carries its hours, the month it belongs to, and one thing it expects you to ship.`],
    ["02", "The syllabus", `${parts.toLocaleString()} parts. Each part names what to learn and one public resource for it. Every topic also carries the ways it fails in production and the questions an interviewer would ask, ${questions.toLocaleString()} of them.`],
    ["03", "Recall and practice", `Spaced repetition runs over the topics actually started, on a ${LADDER.length}-rung ladder that widens from ${LADDER[0]} day to ${LADDER[LADDER.length - 1]}. Mock loops and written assessments sit on the same schedule.`],
  ];

  const market: [string, string, string][] = [
    ["04", "Nightly scan", `${boards} job boards classified every night so the plan is ranked by measured requisition frequency.`],
    ["05", "The gap", "Includes the parts of the plan the market is not asking for, so you stop studying the wrong ceiling."],
    ["06", LIGHT_AUDIT, "A ranked view of what is capping Senior FDE readiness, and what it costs in weeks at the declared pace."],
  ];

  const ticker = `[#${STUDY_SYSTEM.toUpperCase()}]&[#${MARKET_SYSTEM.toUpperCase()}]&[#${LIGHT_AUDIT.toUpperCase()}]// `;

  return (
    <main className="lp">
      <header className="lp-bar-wrap">
        <div className="lp-bar">
          <a className="lp-brand" href="#top">
            <LogoMark className="brand-mark" />
            <span>Lumen</span>
          </a>
          <nav className="lp-nav" aria-label="Systems">
            <a href="#study">{STUDY_SYSTEM}</a>
            <a href="#market">{MARKET_SYSTEM}</a>
          </nav>
          <a className="lp-cta lp-cta-nav" href="/login">Open a {LIGHT_AUDIT}</a>
        </div>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-field" aria-hidden="true" />
        <div className="lp-hero-stage">
          <h1>
            We build the
            <br />
            study system that
            <br />
            lifts your FDE ceiling.
          </h1>
          <div className="lp-hero-end">
            <p className="lp-lede">
              A {months}-month Senior Forward Deployed Engineer plan, ranked every
              night against the market that actually hires for it.
            </p>
            <div className="lp-actions">
              <a className="lp-cta" href="/login">Open a {LIGHT_AUDIT}</a>
              <a className="lp-ghost" href="#method">See how it works</a>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-paper" id="study">
        <div className="lp-inner">
          <p className="lp-kicker">{PROGRAMME}</p>
          <h2 className="lp-display">Two systems. One ceiling to lift.</h2>
          <div className="lp-two">
            <article>
              <p className="lp-meta">Pillar 01 · 3 capabilities</p>
              <h3 className="lp-pillar">{STUDY_SYSTEM}</h3>
              <ol className="lp-list">
                {study.map(([num, title, body]) => (
                  <li key={num}>
                    <span className="lp-num">{num}</span>
                    <div><h4>{title}</h4><p>{body}</p></div>
                  </li>
                ))}
              </ol>
            </article>
            <article id="market">
              <p className="lp-meta">Pillar 02 · 3 capabilities</p>
              <h3 className="lp-pillar">{MARKET_SYSTEM}</h3>
              <ol className="lp-list">
                {market.map(([num, title, body]) => (
                  <li key={num}>
                    <span className="lp-num">{num}</span>
                    <div><h4>{title}</h4><p>{body}</p></div>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-ink" id="method">
        <div className="lp-inner">
          <p className="lp-kicker">The method</p>
          <h2 className="lp-display">Find the gap. Close it. Hold the level.</h2>
          <div className="lp-steps">
            <div>
              <span className="lp-step-n">1</span>
              <h3>Find the gap</h3>
              <p>The {LIGHT_AUDIT} ranks what is constraining output against the live market. Yours to keep.</p>
            </div>
            <div>
              <span className="lp-step-n">2</span>
              <h3>Close it</h3>
              <p>The {STUDY_SYSTEM} puts the next topic, the recall due, and the thing to ship on the same desk.</p>
            </div>
            <div>
              <span className="lp-step-n">3</span>
              <h3>Hold the level</h3>
              <p>Nightly re-rank and a morning digest make the new pace the floor, not a week of enthusiasm.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-paper">
        <div className="lp-inner">
          <p className="lp-kicker">The scale of it</p>
          <dl className="lp-stats">
            {stats.map(([value, label]) => (
              <div key={label}><dt>{value}</dt><dd>{label}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="lp-band lp-band-ink">
        <div className="lp-inner lp-built">
          <p className="lp-kicker">How it is built</p>
          <h2 className="lp-display">One repository. No database.</h2>
          <p className="lp-body">
            Lumen is a Next.js app on Vercel, with a Node MCP server on Render so an AI assistant
            reads the same plan the dashboard does, and GitHub as the database: every mutable
            artifact is a file in one repository, read and written whole, diffable, and readable by
            a second process on a different host. There is no database, no queue and no object store.
          </p>
          <p className="lp-body">
            Two scheduled jobs run it: one scans the {boards} boards, classifies the requisitions and
            recomputes the benchmark; the other sends a morning digest with the day&apos;s topic, the
            recall due, and an alert if the scan went stale. The numbers on the dashboard and the
            numbers an assistant quotes come from the same files.
          </p>
        </div>
      </section>

      <section className="lp-band lp-band-close">
        <div className="lp-inner">
          <h2 className="lp-display">Let&apos;s find the gap.</h2>
          <p className="lp-lede">
            Thirty seconds to sign in. The {LIGHT_AUDIT} is the ranked view of what is capping
            Senior FDE readiness, and what it costs in weeks at the declared pace.
          </p>
          <div className="lp-actions">
            <a className="lp-cta" href="/login">Open a {LIGHT_AUDIT}</a>
          </div>
        </div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-track">
          <span>{ticker.repeat(4)}</span>
          <span>{ticker.repeat(4)}</span>
        </div>
      </div>

      <footer className="lp-foot">
        <span>lumenfde.com · a private workspace</span>
        <a href="/login">Sign in →</a>
      </footer>
    </main>
  );
}
