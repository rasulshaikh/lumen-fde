/**
 * Everything Lumen already knows that Quaere was never told.
 *
 * The ask route sent the plan, the library, the repo map, one topic's syllabus and a readiness
 * slice of the market. Sitting unused in the same repo: the Mocks, Roadmaps and CompReality
 * sheets, the benchmark's audited gaps and over-investment, the review schedule, the shipped
 * artifacts, and the session history. So the companion could be asked "should I aim at UAE or
 * India-remote" and had no compensation data, or "what have I built" and had no artifacts.
 *
 * Two rules shape every function here.
 *
 * **1. Everything is capped, and the cap is stated in the text.** A model given a 450KB market
 * index answers worse than one given the top twenty rows, because the useful part is diluted and
 * the window fills with pairs it has to ignore. Every block below truncates and says so, so the
 * model knows it is looking at a slice rather than the whole.
 *
 * **2. THE RECALL BACKLOG COUNT IS NEVER PUT IN THE PROMPT.** `lib/review.ts` and
 * `app/recall.tsx` both record the rule and the reason — "'37 due', close it forever… the count
 * is never surfaced" — and `lib/companion/brief.ts` enforces it in the UI by making `recall` a
 * state rather than a number. A model handed the number will eventually say it, and a sentence
 * from the companion is as visible as a panel. So this module passes the same three states the
 * brief does and no integer ever reaches the prompt.
 */
import workbook from "@/data/workbook.json";
import type { Benchmark } from "@/lib/market/benchmark";
import type { StoredArtifact } from "@/lib/artifacts";
import { isDue, type ReviewState } from "@/lib/review";

type Row = (string | number | null)[];

/** Rows that are real data rather than a "Total" or a short footer, as the app filters them. */
const isDataRow = (r: Row, min: number) => Array.isArray(r) && r.length >= min && String(r[0] ?? "").trim() !== "" && !/^total/i.test(String(r[0] ?? ""));

const cap = (lines: string[], max: number, what: string) =>
  lines.length <= max ? lines.join("\n") : `${lines.slice(0, max).join("\n")}\n(${lines.length - max} more ${what} not shown)`;

/**
 * The three workbook sheets the ask route never opened.
 *
 * CompReality is the one that matters most for the questions actually being asked — "should I aim
 * at India-remote or UAE" is a compensation question, and the answer has been sitting in the
 * workbook the whole time.
 */
export function workbookContext(): string {
  const mocks = (workbook.Mocks as Row[]).slice(1).filter((r) => isDataRow(r, 9));
  const roadmaps = (workbook.Roadmaps as Row[]).slice(1).filter((r) => isDataRow(r, 3));
  const comp = (workbook.CompReality as Row[]).slice(1).filter((r) => isDataRow(r, 5));

  const parts: string[] = [];
  if (comp.length) {
    parts.push("COMPENSATION REALITY (the learner's own calibration, from data/workbook.json):");
    parts.push(cap(comp.map((r) => `- ${r[0]}: ${r[1]} | verdict ${r[2]} | ${r[3]}${r[4] ? ` | ${r[4]}` : ""}`), 12, "markets"));
  }
  if (mocks.length) {
    parts.push("\nINTERVIEW REPS PLANNED:");
    parts.push(cap(mocks.map((r) => `- ${r[0]}: target ${r[1]}`), 12, "mock types"));
  }
  if (roadmaps.length) {
    parts.push("\nEXTERNAL ROADMAPS the learner has chosen to follow:");
    parts.push(cap(roadmaps.map((r) => `- ${r[0]}: ${r[1]}`), 12, "roadmaps"));
  }
  return parts.join("\n");
}

/**
 * What has actually been built, and when work last happened.
 *
 * `synced: false` from either store means "we do not know", never "nothing" — the rule
 * `lib/market/store.ts` sets for every reader here. A companion that reports "you have shipped
 * nothing" during a GitHub outage is worse than one that says it cannot see.
 */
export function evidenceContext(artifacts: { artifacts: StoredArtifact[]; synced: boolean }, sessions: { count: number; latest: string | null; synced: boolean }): string {
  const parts: string[] = [];
  if (!artifacts.synced) parts.push("SHIPPED ARTIFACTS: unreadable right now. This is unknown, NOT zero — do not tell the learner they have built nothing.");
  else if (!artifacts.artifacts.length) parts.push("SHIPPED ARTIFACTS: none recorded yet. The plan carries one deliverable per row; none has been recorded.");
  else {
    parts.push(`SHIPPED ARTIFACTS (${artifacts.artifacts.length} recorded):`);
    parts.push(cap(artifacts.artifacts.slice(0, 20).map((a) => `- row ${a.row} · ${a.topic} · ${a.title} · ${a.date.slice(0, 10)}`), 20, "artifacts"));
  }

  if (!sessions.synced) parts.push("\nSTUDY SESSIONS: unreadable right now. Unknown, not zero.");
  else parts.push(`\nSTUDY SESSIONS: ${sessions.count} recorded${sessions.latest ? `, most recent ${sessions.latest}` : ""}.`);
  return parts.join("\n");
}

/**
 * Whether recall is waiting. A STATE, never a count — see the module header.
 *
 * Returns the same three values the brief renders, for the same reason: an unreadable schedule is
 * not an empty one, and telling a returning learner nothing is due when the store simply could not
 * be read is the single most damaging sentence this companion could produce.
 */
export function recallContext(review: { state: ReviewState; synced: boolean } | null, now: Date): string {
  if (!review || !review.synced) return "RECALL: not known right now (the schedule could not be read). Do not claim anything is or is not due.";
  const waiting = Object.values(review.state).some((card) => isDue(card, now));
  return waiting
    ? "RECALL: something is waiting in the spaced-repetition schedule. NEVER state how many cards are due — say that recall is waiting and name at most the topic. A backlog number is what makes people abandon a review system."
    : "RECALL: nothing is due today.";
}

/**
 * The parts of the benchmark the ask route dropped: what the market asks for that the plan does
 * not cover, and what the plan spends on that the market is not asking for.
 *
 * Both are the honest half of the market picture, and both are what a question like "what should
 * I do instead" actually needs.
 */
export function benchmarkGapsContext(benchmark: Benchmark | null): string {
  if (!benchmark) return "";
  const parts: string[] = [];
  const gaps = benchmark.gaps ?? [];
  const over = benchmark.overInvested ?? [];
  if (gaps.length) {
    parts.push(`AUDITED GAPS — asked for by the market, covered by no plan row (${gaps.length}):`);
    parts.push(cap(gaps.map((g) => `- ${g.statement ?? g.id}`), 13, "gaps"));
  }
  if (Array.isArray(over) && over.length) {
    parts.push(`\nOVER-INVESTMENT — plan hours against measured requisition frequency:`);
    parts.push(cap(over.map((o) => `- ${o.statement ?? ""}`).filter(Boolean), 6, "tracks"));
  }
  return parts.join("\n");
}
