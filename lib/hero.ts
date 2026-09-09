/**
 * What the hero says to you, and why it is different every time you open it.
 *
 * The hero used to hold five lines built inline in the layout. Five, fixed, in the same order,
 * for 23 months. By week two you stop reading a line you have already read a hundred times, and a
 * status line nobody reads is decoration.
 *
 * So this builds a pool instead of a list, and the pool is arithmetic over your own numbers. Every
 * line names something measured: the month you are in, the row you are on, the hours behind and
 * ahead, the pace you set, the shape of the plan. Nothing here is a slogan with a number dropped
 * into it, and nothing is invented. A line whose inputs are missing is dropped rather than filled
 * in, which is why this is a filter and not a fixed array.
 *
 * ## The rule that shapes the encouraging lines
 *
 * It has to work on day one and in month twenty, and those are opposite problems.
 *
 * On day one every "done" number is zero. "0% of the plan is behind you" is true, useless and
 * bleak, and a tool that greets you that way on the morning you start is a tool you stop opening.
 * So the lines that count completed work are only built once there IS completed work, and the
 * early pool leans on scale and what is ahead, which are just as true and are the things actually
 * worth knowing at the start.
 *
 * Late in the plan the opposite risk applies: "1,400 hours ahead" stops being useful once most of
 * them are behind you. Those lines drop out as their numbers stop being the interesting ones.
 *
 * The result is a hero that says different true things at different points in the plan, rather
 * than the same five things for two years.
 *
 * ## Ordering
 *
 * `pool` is pure and deterministic. The shuffle happens in the component, in an effect, because a
 * server render and a client render that disagree about line order is a hydration mismatch, and
 * because "new every visit" is a property of the visit rather than of the data.
 */

export type HeroState = {
  /** Total planned hours across active rows. */
  hours: number;
  /** Hours behind you. */
  doneHours: number;
  /** Topics recorded done. */
  done: number;
  /** Active topics in the plan. */
  total: number;
  /** 1-based month you are currently in, or null when the plan is complete. */
  month: number | null;
  /** How many months the plan spans. */
  months: number;
  /** Track name of the current row, already stripped of its "A. " prefix. */
  track: string | null;
  /** The next topic that is neither done nor skipped. */
  nextTopic: string | null;
  /** Hours that row costs. */
  nextHours: number | null;
  /** Syllabus parts across the whole curriculum. 0 when the summary has not loaded. */
  parts: number;
  /** Distinct tracks. */
  tracks: number;
  /** The reader's weekly commitment, which is editable. */
  weeklyHours: number;
  /** Heaviest month by hours. */
  peak: { month: number; hours: number } | null;
};

const round = (n: number) => Math.max(1, Math.round(n));
/** "1 weeks" is the kind of thing a person notices every single morning. */
const weeksWord = (n: number) => `${n} week${n === 1 ? "" : "s"}`;

/**
 * Every line the current state can support, in a stable order.
 *
 * Stable matters: the shuffle is applied on top, so a deterministic pool keeps this function
 * testable and keeps two readers of the same state seeing the same set of available lines.
 */
export function pool(s: HeroState): string[] {
  const lines: string[] = [];
  const remaining = Math.max(0, s.hours - s.doneHours);
  const started = s.done > 0 || s.doneHours > 0;
  // No weeks line when there are no hours left. `round` has a floor of 1, so a finished plan
  // would otherwise announce "0h left, that is 1 week", which is both wrong and the last thing
  // you want to read on the morning you finish.
  const weeks = s.weeklyHours > 0 && remaining > 0 ? round(remaining / s.weeklyHours) : null;

  // Where you are. The most useful thing the hero can say, so it is always first in the pool.
  if (s.month && s.months) {
    lines.push(`Month ${s.month} of ${s.months}${s.track ? `, on ${s.track}` : ""}.`);
  }
  if (s.nextTopic) {
    lines.push(s.nextHours
      ? `Next: ${s.nextTopic}. ${s.nextHours}h.`
      : `Next: ${s.nextTopic}.`);
  }

  // What is ahead. True on day one, and the thing worth knowing then.
  lines.push(`${s.total} topics, ${s.hours}h, ${s.tracks} tracks. All of it planned.`);
  if (weeks) lines.push(`${remaining}h left. At ${s.weeklyHours}h a week, that is ${weeksWord(weeks)}.`);
  if (remaining === 0 && s.hours > 0) lines.push(`Every planned hour is behind you. ${s.hours}h.`);
  if (s.parts > 0) lines.push(`${s.parts.toLocaleString()} syllabus parts, each naming one public resource.`);
  if (s.peak) {
    lines.push(s.month && s.month > s.peak.month
      ? `Month ${s.peak.month} was the heaviest at ${s.peak.hours}h. It is behind you.`
      : `Month ${s.peak.month} is the heaviest at ${s.peak.hours}h.`);
  }

  // What is behind you. Only once there is any, because "0 of 117" as encouragement is a joke you
  // are not in the mood for on the first morning.
  if (started) {
    if (s.doneHours > 0) lines.push(`${s.doneHours}h done. Nobody can take those back.`);
    if (s.done > 0) lines.push(`${s.done} of ${s.total} topics recorded. That is ${Math.round((s.done / s.total) * 100)}% of the plan.`);
    if (s.doneHours > 0 && s.weeklyHours > 0) {
      lines.push(`${weeksWord(round(s.doneHours / s.weeklyHours))} of work already sat through.`);
    }
  }

  // The plan's own terms, which are the point of the product.
  lines.push("A row marked done is study. An artifact is a URL somebody else can open.");
  lines.push("Every number here is read from your own files. None of it is inferred.");

  return lines;
}

/**
 * Fisher-Yates over a copy, driven by a seeded generator so a given seed always produces the same
 * order. Seeded rather than `Math.random()` directly so the ordering can be asserted in a test.
 */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  // mulberry32. Small, fast, and good enough for choosing which true sentence to show first.
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
