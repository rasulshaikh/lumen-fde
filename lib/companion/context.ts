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
 * `app/recall.tsx` both record the rule and the reason - "'37 due', close it forever… the count
 * is never surfaced" - and `lib/companion/brief.ts` enforces it in the UI by making `recall` a
 * state rather than a number. A model handed the number will eventually say it, and a sentence
 * from the companion is as visible as a panel. So this module passes the same three states the
 * brief does and no integer ever reaches the prompt.
 */
import workbook from "@/data/workbook.json";
import type { Benchmark } from "@/lib/market/benchmark";
import type { StoredArtifact } from "@/lib/artifacts";
import { LADDER, isDue, type ReviewState } from "@/lib/review";

type Row = (string | number | null)[];

/** Rows that are real data rather than a "Total" or a short footer, as the app filters them. */
const isDataRow = (r: Row, min: number) => Array.isArray(r) && r.length >= min && String(r[0] ?? "").trim() !== "" && !/^total/i.test(String(r[0] ?? ""));

const cap = (lines: string[], max: number, what: string) =>
  lines.length <= max ? lines.join("\n") : `${lines.slice(0, max).join("\n")}\n(${lines.length - max} more ${what} not shown)`;

/**
 * The three workbook sheets the ask route never opened.
 *
 * CompReality is the one that matters most for the questions actually being asked - "should I aim
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
    // Every column named. The first version labelled column 2 as the verdict, but column 2 is the
    // SOURCE: the prompt read "verdict fde.academy salary guide (Feb 2026)", presenting a citation
    // as a probability, while the real verdict in column 4 arrived unlabelled at the end. A model
    // handed that will quote a salary guide as the odds.
    parts.push(cap(comp.map((r) => `- ${r[0]}: ${r[1]} | source: ${r[2]} | what it takes: ${r[3]}${r[4] ? ` | odds (the learner's own read, not data): ${r[4]}` : ""}`), 12, "markets"));
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
 * `synced: false` from either store means "we do not know", never "nothing" - the rule
 * `lib/market/store.ts` sets for every reader here. A companion that reports "you have shipped
 * nothing" during a GitHub outage is worse than one that says it cannot see.
 */
export function evidenceContext(artifacts: { artifacts: StoredArtifact[]; synced: boolean }, sessions: { count: number; latest: string | null; synced: boolean }): string {
  const parts: string[] = [];
  if (!artifacts.synced) parts.push("SHIPPED ARTIFACTS: unreadable right now. This is unknown, NOT zero - do not tell the learner they have built nothing.");
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
 * Whether recall is waiting. A STATE, never a count - see the module header.
 *
 * Returns the same three values the brief renders, for the same reason: an unreadable schedule is
 * not an empty one, and telling a returning learner nothing is due when the store simply could not
 * be read is the single most damaging sentence this companion could produce.
 */
export function recallContext(
  review: { state: ReviewState; synced: boolean } | null,
  now: Date,
  topicName: (key: string) => string = (k) => k,
): string {
  if (!review || !review.synced) return "RECALL: not known right now (the schedule could not be read). Do not claim anything is or is not due.";

  const due = Object.entries(review.state).filter(([, card]) => isDue(card, now));
  if (!due.length) return "RECALL: nothing is due today.";

  /*
   * Named topics and their rungs, and still not a number.
   *
   * The whole schedule was read over the network and reduced to one sentence: something is
   * waiting. The reader could not be told WHAT, so the companion could not say "the two you keep
   * dropping are Kafka and TLS", which is the only advice a spaced-repetition system can give that
   * changes what someone does next.
   *
   * The count stays out, and that rule is not negotiable - `lib/review.ts` and `app/recall.tsx`
   * both record why ("'37 due', close it forever"). So this names topics, caps the list, and says
   * "and more besides" rather than "and 34 more", because the overflow phrasing is the exact place
   * a count would sneak back in.
   */
  const RECALL_NAMED = 6;
  const named = due
    .sort((a, b) => (a[1].rung - b[1].rung) || a[0].localeCompare(b[0]))
    .slice(0, RECALL_NAMED)
    .map(([key, card]) => {
      const rung = `rung ${card.rung + 1} of ${LADDER.length}`;
      const grade = card.lastGrade ? `, last graded ${card.lastGrade}` : "";
      return `${topicName(key)} (${rung}${grade})`;
    });

  return [
    "RECALL: something is waiting in the spaced-repetition schedule.",
    `Waiting now, weakest rung first: ${named.join("; ")}${due.length > RECALL_NAMED ? "; and more besides" : ""}.`,
    "A low rung means it has been dropped recently and the interval was pulled back; a high rung means it has survived several sittings.",
    "NEVER state how many cards are due, and never total this list or say how many were withheld. Name topics. A backlog number is what makes people abandon a review system, and this learner has 23 months left.",
  ].join("\n");
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
    parts.push(`AUDITED GAPS - asked for by the market, covered by no plan row (${gaps.length}):`);
    parts.push(cap(gaps.map((g) => `- ${g.statement ?? g.id}`), 13, "gaps"));
  }
  if (Array.isArray(over) && over.length) {
    parts.push(`\nOVER-INVESTMENT - plan hours against measured requisition frequency:`);
    parts.push(cap(over.map((o) => `- ${o.statement ?? ""}`).filter(Boolean), 6, "tracks"));
  }
  return parts.join("\n");
}

/**
 * The market at full width, and the reading the cron already wrote for this companion.
 *
 * Three things the prompt was dropping, all measured:
 *
 * **26 of 34 skills.** `marketContext` fills ten coverage lines and stops, so RAG, MCP, Kubernetes
 * and guardrails were absent from a market model built to rank exactly those. The share is one
 * short line per skill, so all 34 cost less than the ten long ones did.
 *
 * **The reachable share.** `insight.reachability.skills` carries `reachablePct` beside
 * `marketPct`: what the market asks for, and what the slice you can actually take asks for. Those
 * two numbers disagreeing is the single most useful fact the scan produces, and neither the gap
 * nor the reachable figure had ever reached a prompt.
 *
 * **`insight.quaere`.** The nightly cron writes an 80-word reading of the scan explicitly for this
 * companion. The Market tab renders it. The companion it was written for never saw it.
 */
export function marketDepthContext(insight: {
  quaere?: string | null;
  reachability?: { skills?: { label?: string; marketPct?: number; reachablePct?: number }[] } | null;
} | null): string {
  if (!insight) return "";
  const parts: string[] = [];

  const skills = (insight.reachability?.skills ?? []).filter((s) => s.label);
  if (skills.length) {
    parts.push("SKILL DEMAND, all measured skills. `market` is the share of every core requisition; `reachable` is the share of only those you could take from India. Where they disagree, the reachable figure is the one that decides what to study next:");
    parts.push(cap(
      [...skills]
        .sort((a, b) => (b.marketPct ?? 0) - (a.marketPct ?? 0))
        .map((s) => `- ${s.label}: market ${s.marketPct ?? 0}%, reachable ${s.reachablePct ?? 0}%`),
      34,
      "skills",
    ));
  }

  if (insight.quaere) {
    parts.push(`\nTHE SCAN'S OWN READING, written by the nightly cron for you specifically and stored with the numbers it describes. It is interpretation, not measurement, and it may be older than today:\n${insight.quaere}`);
  }

  return parts.join("\n");
}

/**
 * Rhythm: what the study history says about pace, and what has been asked before.
 *
 * `lib/motivation.ts` carries 19,510 bytes of tests and reached no prompt, while two files claimed
 * `/api/ask` consumed it. The streak is the answer to "am I being honest with myself about pace",
 * which is a question the FAQ literally suggests and the companion could not answer.
 *
 * The rule the streak layer itself sets is carried through verbatim: a gap moves the rate and
 * leaves the run standing. There is no chain to break, so the model must not invent one to praise
 * or to warn about.
 */
export function rhythmContext(
  streak: { statement?: string; days?: number; perWeek?: number } | null,
  asks: { title: string; day: string }[],
): string {
  const parts: string[] = [];
  if (streak?.statement) {
    parts.push(`STUDY RHYTHM: ${streak.statement}`);
    parts.push("There is no streak to protect and no chain to break: a gap moves the rate and leaves the run standing. Never frame a missed day as a broken run.");
  }
  if (asks.length) {
    parts.push(`\nYOU HAVE ALREADY ANSWERED THESE, most recent first. If the question repeats one, say so and build on it rather than starting over:\n${cap(asks.slice(0, 8).map((a) => `- ${a.day}: ${a.title}`), 8, "saved answers")}`);
  }
  return parts.join("\n");
}

/**
 * The route the reader has chosen to aim at.
 *
 * `/paths` offers four, and picking one wrote to localStorage and changed nothing else: a
 * preference nothing could read is a highlight, not a preference. It is the single most useful
 * thing the companion can know when the same question has four different right answers, because
 * "should I take a contract or hold out" depends entirely on whether the target is a dollar-linked
 * remote role from Pune or a Gulf relocation.
 *
 * Stated as a choice rather than a fact, and revocable in one press, so the model advises toward it
 * without treating it as settled.
 */
export function aimContext(aim: string | null, label: (id: string) => string | null): string {
  if (!aim) return "";
  const name = label(aim);
  if (!name) return "";
  return `THE ROUTE THEY ARE AIMING AT: ${name}. They chose this on the Paths tab, and it is a current preference rather than a commitment - they can change it in one press. Where a question has different answers for different routes, answer for this one first and say briefly what would change if they were aiming elsewhere. Do not treat it as settled, and do not congratulate them for having chosen.`;
}
