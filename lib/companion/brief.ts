/**
 * The daily brief: what the companion has to say before being asked.
 *
 * The home page's first four panels report PROGRESS, and at month one progress is zero, so the
 * first thing seen every morning is a wall of accurate zeros. The brief exists because the
 * platform is simultaneously sitting on a full plan, a full syllabus, a live recall schedule and
 * a scanned market — none of which needs anything to have been finished. There is always
 * something true and useful to say; the old panels just were not the ones that could say it.
 *
 * Pure, with `now` a parameter. No clock, no network, no filesystem — the same rule as
 * `lib/motivation.ts` and `lib/market/insight.ts`, so every sentence here can be exercised
 * against a fixture, including the two that matter most: the day nothing has been done, and the
 * day someone comes back after a fortnight away.
 *
 * ## Two rules this module must not break
 *
 * **1. The recall backlog count is never rendered.** `lib/review.ts` and `app/recall.tsx` both
 * state it: *"'37 due', close it forever… the count is never surfaced."* Overdue cards are taken
 * first so nothing starves, and whatever does not fit is simply due tomorrow. A brief that
 * greeted a returning reader with a backlog number would undo the one deliberate protection the
 * review scheduler has, on the exact morning it matters. So `recall` below is a state, not a
 * number, and there is no field here that could hold one.
 *
 * **2. Nothing here writes prose about numbers.** Every figure is rendered by the caller from a
 * value in this object. The warm sentence the companion adds is generated elsewhere, must
 * contain no digit, and is dropped if it does — the mechanism already shipped and tested for
 * Quaere's market reading. Warmth in words, truth in numbers.
 */
import { PROFILE } from "@/lib/profile";
import { isDue, type ReviewState } from "@/lib/review";
import type { Evidence, Streak } from "@/lib/motivation";

/** Whether anything is waiting in the review schedule. Deliberately not how much. */
export type RecallState = "none" | "waiting" | "unknown";

export type BriefFocus = {
  /** 1-based against workbook.Plan, the join key every citation in this codebase uses. */
  row: number;
  topic: string;
  status: string;
  /** The row's own description of the work. Never truncated here. */
  description: string;
  month: number;
  hours: number;
};

export type Brief = {
  /** UTC day this brief describes. */
  day: string;
  /** "Rasul", from the profile. The companion knows whose plan this is. */
  name: string;
  focus: BriefFocus | null;
  /** Named parts of the current topic, in syllabus order. Empty when the syllabus is not loaded. */
  parts: string[];
  recall: RecallState;
  /** What finishing the focus row buys, as `computeEvidence` already rendered it. */
  buys: string | null;
  /** Days since the most recent recorded event; null when nothing has ever been recorded. */
  gapDays: number | null;
  /** The rate-and-maximum sentence. Never a chain, never a zero that reads as a forfeit. */
  rhythm: string | null;
  /** Deliverables recorded. A count of things built is not a backlog. */
  shipped: number;
};

export type BriefInput = {
  focus: BriefFocus | null;
  parts?: string[];
  review?: { state: ReviewState; synced: boolean } | null;
  evidence?: Evidence | null;
  streak?: Streak | null;
  /** UTC day of the most recent recorded progress event, if any. */
  lastEventDay?: string | null;
  shipped?: number;
};

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Whole days between two UTC days.
 *
 * Returns null rather than a negative number when the event is in the future. A hand-edited file
 * or a skewed clock must cost the line, not render "back after -3 days" — the same guard
 * `daysLeading` uses in the digest, and for the same reason.
 */
export function gapInDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) return null;
  return Math.round((b - a) / 864e5);
}

/**
 * Is anything waiting in the schedule?
 *
 * Three states, because two would lie. An unreadable review store is not an empty one, and
 * "nothing due today" said to someone with a fortnight of overdue cards is the most damaging
 * sentence this page could produce. `synced: false` means "we do not know" here exactly as it
 * does everywhere else in this codebase.
 */
export function recallState(review: { state: ReviewState; synced: boolean } | null | undefined, now: Date): RecallState {
  if (!review || !review.synced) return "unknown";
  return Object.values(review.state).some((card) => isDue(card, now)) ? "waiting" : "none";
}

/**
 * The first line of a rendered statement, without its transport label.
 *
 * `lib/motivation.ts` prefixes its statements with `STUDY - ` and `EVIDENCE - ` and joins several
 * sentences with newlines, because its four consumers include a plain-text email and an MCP tool
 * where a label is what makes a line findable. On a panel the label is noise and the extra lines
 * duplicate what sits beside it.
 *
 * Stripping happens HERE and not in `motivation.ts`, because the label is right for the other
 * three consumers — this is a rendering decision belonging to the surface that renders, not a
 * change to the sentence everyone shares.
 */
export function lead(statement: string): string {
  return String(statement ?? "").split("\n")[0].replace(/^[A-Z][A-Z ]*[A-Z] - /, "").trim();
}

export function buildBrief(input: BriefInput, now: Date): Brief {
  const day = dayOf(now);
  return {
    day,
    name: PROFILE.name,
    focus: input.focus,
    parts: input.parts ?? [],
    recall: recallState(input.review, now),
    // Consumed, never recomputed — rule 3 of the motivation layer. `computeEvidence` owns every
    // readiness figure and the two would disagree on the day it mattered. Only the LEAD line is
    // taken: the full statement repeats the market share that the Evidence panel next to this
    // one already prints, and the same number twice on one screen reads as two numbers.
    buys: input.evidence ? lead(input.evidence.statement) : null,
    gapDays: input.lastEventDay ? gapInDays(input.lastEventDay, day) : null,
    // The sub-statements, not the combined one. `Streak.statement` is
    // `STUDY - <rate> <run> <recency>`: the label is a transport prefix for the digest and the
    // MCP tools, and the recency clause restates the gap the opening above has already said in
    // words. Both belong in an email and neither belongs on this panel.
    rhythm: input.streak ? `${input.streak.rateStatement} ${input.streak.runStatement}`.trim() : null,
    shipped: input.shipped ?? 0,
  };
}

/**
 * How the brief opens, in words, with no number in it.
 *
 * This is the one place the companion is allowed to be warm without a model, and it is
 * hand-written precisely so it cannot invent anything: each branch is chosen by a fact already
 * computed above. The long-gap branch is the reason the tone rule was changed — the product used
 * to state "Back after 14 days." and stop, and the reader who most needed a reason to sit down
 * got a measurement. It still never says a number, and it never claims work that did not happen.
 */
export function opening(brief: Brief): string {
  const gap = brief.gapDays;
  if (gap === null) return `This is where it starts, ${brief.name}. Nothing is recorded yet, and the first row is the only one that has to happen today.`;
  if (gap === 0) return `You have already been here today, ${brief.name}.`;
  if (gap === 1) return `Picking up from yesterday.`;
  if (gap <= 3) return `Welcome back, ${brief.name}. The thread is still warm — carry on where you left it.`;
  if (gap <= 14) return `Welcome back, ${brief.name}. A gap that size is nothing against a plan this long; the row below is exactly where you stopped.`;
  return `Good to see you, ${brief.name}. However long it has been, none of the work you did went anywhere — it is all still here, and so is the next row.`;
}
