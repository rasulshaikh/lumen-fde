import type { Metadata } from "next";
import workbook from "@/data/workbook.json";
import curriculum from "@/data/curriculum.json";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";
import sources from "@/data/market-sources.json";
import { LADDER } from "@/lib/review";
import { LogoMark } from "./brand";

type Row = (string | number | null)[];
type Topic = { subtopics?: unknown[]; interviewQuestions?: unknown[] };

export const metadata: Metadata = {
  title: "Lumen · a Senior FDE preparation system",
  description:
    "The study system behind one 23-month Senior Forward Deployed Engineer plan: 117 topics, 2,236 syllabus parts, and a nightly scan of 27 job boards that ranks the plan by what is actually being asked for.",
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

  const what: [string, string][] = [
    ["The plan", `${active.length} topics across ${tracks} tracks and ${months} months. Every row carries its hours, the month it belongs to, and one thing it expects you to ship.`],
    ["The syllabus", `${parts.toLocaleString()} parts. Each part names what to learn and one public resource for it. Every topic also carries the ways it fails in production and the questions an interviewer would ask, ${questions.toLocaleString()} of them.`],
    ["Recall and practice", `Spaced repetition runs over the topics actually started, on a ${LADDER.length}-rung ladder that widens from ${LADDER[0]} day to ${LADDER[LADDER.length - 1]}. Mock loops and written assessments sit on the same schedule.`],
    ["The market benchmark", `${boards} job boards scanned and classified nightly, so the plan is ranked by measured requisition frequency, including the parts of it the market is not asking for.`],
  ];

  return (
    <main className="lp">
      <header className="lp-top">
        <div className="lp-brand"><LogoMark className="brand-mark" /><span>Lumen</span></div>
        <a className="lp-signin" href="/login">Sign in →</a>
      </header>

      <section className="lp-hero">
        <p className="lp-kicker">A Senior FDE preparation system</p>
        <h1>Twenty-three months of preparation, measured against the market that hires for it.</h1>
        <p className="lp-lede">
          Lumen is the study system behind one Senior Forward Deployed Engineer plan. It holds the
          curriculum, schedules the recall, records what gets shipped, and every night it reads the
          job market and re-ranks the plan against it. It is honest about how much is left.
        </p>
      </section>

      <section className="lp-scale">
        <h2 className="lp-h2">The scale of it</h2>
        <dl className="lp-stats">
          {stats.map(([value, label]) => (
            <div key={label}><dt>{value}</dt><dd>{label}</dd></div>
          ))}
        </dl>
      </section>

      <section className="lp-block">
        <h2 className="lp-h2">What it does</h2>
        <ol className="lp-list">
          {what.map(([title, body], i) => (
            <li key={title}>
              <span className="lp-num">{String(i + 1).padStart(2, "0")}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-block">
        <h2 className="lp-h2">How it is built</h2>
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
      </section>

      <footer className="lp-foot">
        <span>lumenfde.com · a private workspace</span>
        <a href="/login">Sign in →</a>
      </footer>
    </main>
  );
}
