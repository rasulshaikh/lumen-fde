"use client";

import Link from "next/link";
import type { Brief } from "@/lib/companion/brief";
import { opening } from "@/lib/companion/brief";

/**
 * The daily brief, at the top of the home page.
 *
 * Everything rendered here comes from `buildBrief`, and every number is a field on that object
 * rather than a sentence someone wrote. The one free-text line is `opening()`, which is
 * hand-written per gap-length branch and asserted digit-free by the test suite — warmth in
 * words, truth in numbers.
 *
 * The recall line says WHETHER something is waiting and never how much. That is not a styling
 * choice: `lib/review.ts` and `app/recall.tsx` both record the rule, because a backlog count is
 * what makes a spaced-repetition system get abandoned, and the returning reader is exactly who
 * would see it.
 */
export function BriefPanel({ brief, onOpenPlan, readingUrl }: { brief: Brief; onOpenPlan: () => void; readingUrl: string | null }) {
  const focus = brief.focus;
  return (
    <section className="panel wide brief-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{focus ? focus.topic : "The plan is complete"}</h2>
        </div>
        {focus && <span className="panel-meta">Row {focus.row} · month {focus.month} · {focus.hours}h</span>}
      </div>

      <p className="brief-opening">{opening(brief)}</p>

      {focus && <p className="brief-what">{focus.description}</p>}

      {brief.parts.length > 0 && (
        <div className="brief-parts">
          <p className="eyebrow">What it is made of</p>
          <ul>{brief.parts.map((part) => <li key={part}>{part}</li>)}</ul>
        </div>
      )}

      <div className="brief-facts">
        {/* A state, never a count. */}
        <div className="brief-fact">
          <span className="brief-fact-label">Recall</span>
          <strong>
            {brief.recall === "waiting" ? "Something is waiting" : brief.recall === "none" ? "Nothing due today" : "Not known right now"}
          </strong>
        </div>
        <div className="brief-fact">
          <span className="brief-fact-label">Shipped</span>
          <strong>{brief.shipped === 0 ? "Nothing recorded yet" : `${brief.shipped} recorded`}</strong>
        </div>
        {brief.rhythm && (
          <div className="brief-fact brief-fact-wide">
            <span className="brief-fact-label">Rhythm</span>
            <strong>{brief.rhythm}</strong>
          </div>
        )}
      </div>

      {brief.buys && <p className="brief-buys">{brief.buys}</p>}

      <div className="brief-actions">
        <button className="primary-button" onClick={onOpenPlan}>Open the plan <span>→</span></button>
        {readingUrl && <Link className="text-button" href={readingUrl} target="_blank" rel="noreferrer">Open reading ↗</Link>}
      </div>
    </section>
  );
}
