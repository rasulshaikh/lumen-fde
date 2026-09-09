"use client";

import { useState } from "react";
import workbook from "@/data/workbook.json";
import curriculum from "@/data/curriculum.json";
import "./preview.css";

/**
 * /preview — three candidate visual directions, on the real plan, switchable.
 *
 * This route exists because of a specific failure: the field-notebook identity was chosen from a
 * written description, approved sight-unseen, built, shipped, and disliked. Choosing again from a
 * better-written description would repeat exactly that. So nothing here is a mockup — it renders
 * the actual workbook rows, the actual hours, the actual month distribution and the actual
 * syllabus counts, at the density the app really has, and the three directions differ ONLY in
 * their tokens. The markup is byte-identical between them, which is the point: what you are
 * comparing is the design, not three different demos.
 *
 * It is disposable. Every rule is scoped under `.pv`, it imports nothing from globals.css and
 * exports nothing into it, and when a direction is chosen this route and its stylesheet are
 * deleted rather than grown.
 *
 * Gated like every other route — proxy.ts covers everything except `/`, so this needs the session
 * cookie. Nothing on it is public.
 */

type Row = (string | number | null)[];
type Topic = { subtopics?: unknown[] };

const DIRECTIONS = [
  { id: "broadsheet", label: "Broadsheet", note: "the Tech Mahindra pole" },
  { id: "instrument", label: "Instrument", note: "the dokeo pole" },
  { id: "board", label: "Board", note: "the terminal pole" },
];

export default function PreviewPage() {
  const [dir, setDir] = useState("broadsheet");

  // Real numbers, read the way every other surface reads them. A preview built on invented data
  // would flatter whichever direction handled invented data best.
  const rows = (workbook.Plan as Row[]).slice(1);
  const active = rows.filter((r) => String(r[15] ?? "").trim().toLowerCase() !== "skipped");
  const hours = active.reduce((n, r) => n + Number(r[13] || 0), 0);
  const tracks = new Set(active.map((r) => String(r[0]))).size;
  const months = Math.max(...active.map((r) => Number(r[1])));
  const parts = Object.values((curriculum as { topics: Record<string, Topic> }).topics)
    .reduce((n, t) => n + (t.subtopics?.length ?? 0), 0);

  const byMonth = Array.from({ length: months }, (_, i) =>
    active.filter((r) => Number(r[1]) === i + 1).reduce((n, r) => n + Number(r[13] || 0), 0));
  const peak = Math.max(...byMonth);

  // Fifteen consecutive real rows — enough to judge whether a direction survives density.
  const slice = active.slice(0, 15);
  const current = DIRECTIONS.find((d) => d.id === dir)!;

  return (
    <div className="pv" data-dir={dir}>
      <nav className="pv-switch" aria-label="Design direction">
        {DIRECTIONS.map((d) => (
          <button key={d.id} aria-pressed={dir === d.id} onClick={() => setDir(d.id)}>
            {d.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {d.note}</span>
          </button>
        ))}
        <span className="pv-meta">real data · {active.length} rows · {hours}h</span>
      </nav>

      {/* 1. The hero — the thing that has to feel confident. */}
      <section className="pv-band pv-invert">
        <div className="pv-wrap">
          <p className="pv-eyebrow">Preparation command centre</p>
          <h1 className="pv-h1">
            {dir === "broadsheet"
              ? <>Twenty-three months of <span className="pv-fill" data-text="proof">proof</span>, measured against the market that hires for it.</>
              : "Twenty-three months of proof, measured against the market that hires for it."}
          </h1>
          <p className="pv-lede">
            {current.label} — {current.note}. Everything below is your real plan: {active.length} topics,
            {" "}{hours} hours, {parts.toLocaleString()} syllabus parts. The markup is identical across
            all three directions; only the design tokens change.
          </p>
          <div style={{ marginTop: 24 }}>
            <button className="pv-cta">Open the plan →</button>
          </div>
        </div>
      </section>

      {/* 2. Figures — does a number read as confident, or as a settings screen? */}
      <section className="pv-band">
        <div className="pv-wrap">
          <p className="pv-eyebrow">What is true today</p>
          <h2 className="pv-h2">The shape of the commitment</h2>
          <div className="pv-metrics">
            <div className="pv-metric"><span>Topics</span><strong>{active.length}</strong><em>across {tracks} tracks</em></div>
            <div className="pv-metric"><span>Planned work</span><strong>{hours}h</strong><em>over {months} months</em></div>
            <div className="pv-metric"><span>Syllabus parts</span><strong>{parts.toLocaleString()}</strong><em>each naming a resource</em></div>
            <div className="pv-metric"><span>Recorded</span><strong>0</strong><em>nothing finished yet</em></div>
          </div>
        </div>
      </section>

      {/* 3. The chart — the rule forcing every bar to one colour is gone, so this can vary. */}
      <section className="pv-band">
        <div className="pv-wrap">
          <p className="pv-eyebrow">Pace map</p>
          <h2 className="pv-h2">Where the hours go</h2>
          <div className="pv-bars" aria-hidden="true">
            {byMonth.map((h, i) => <i key={i} style={{ height: `${Math.max(8, (h / peak) * 100)}%` }} />)}
          </div>
          <p className="pv-note">Twenty-three real months. Peak is {peak}h.</p>
        </div>
      </section>

      {/* 4. The density test. If a direction fails, it fails here. */}
      <section className="pv-band">
        <div className="pv-wrap">
          <p className="pv-eyebrow">The plan</p>
          <h2 className="pv-h2">Fifteen real rows</h2>
          <table className="pv-table">
            <thead>
              <tr><th>Row</th><th>Topic</th><th>Track</th><th>Month</th><th style={{ textAlign: "right" }}>Hours</th><th>Status</th></tr>
            </thead>
            <tbody>
              {slice.map((r, i) => {
                const status = String(r[15] ?? "Not started");
                const cls = /done|complete/i.test(status) ? "s-done" : /progress/i.test(status) ? "s-live" : "s-none";
                return (
                  <tr key={i}>
                    <td className="pv-num">{i + 1}</td>
                    <td>{String(r[2])}</td>
                    <td>{String(r[0]).replace(/^[A-Z]\. /, "")}</td>
                    <td className="pv-num">M{String(r[1])}</td>
                    <td className="pv-num">{String(r[13])}h</td>
                    <td><span className={`pv-pill ${cls}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pv-note">
            The real table is {active.length} rows on a 950px minimum width. If a direction only works
            at fifteen, it does not work.
          </p>
        </div>
      </section>

      <section className="pv-band pv-invert">
        <div className="pv-wrap">
          <p className="pv-eyebrow">Verdict</p>
          <h2 className="pv-h2">Which of these do you want to open every morning?</h2>
          <p className="pv-lede">
            Switch between all three at the top. Look at the table more than the hero — the hero is
            seen once a day and the table is where the hours go.
          </p>
        </div>
      </section>
    </div>
  );
}
