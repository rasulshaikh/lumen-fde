/**
 * What the hero says to you, and why it is different every time you open it.
 *
 * ## What went wrong the first time
 *
 * The first version of this rotated eight lines of arithmetic, and six of them restated something
 * already on the screen. "Month 1 of 23, on Linux, Networking, Shell" is the Current focus card
 * beside it, word for word. "0 of 117 topics recorded, that is 0% of the plan" is the Plan
 * progress metric below it. "1588h left, at 16h a week that is 99 weeks" is the Hours remaining
 * card and the Weekly commitment card, added together.
 *
 * The homepage already carries a focus card and four metrics. It does not need a ninth readout at
 * the top in a bigger font. The reader asked for something that motivates, and got a duplicate
 * dashboard.
 *
 * ## What these lines do instead
 *
 * They REFRAME a number rather than report it. 1,588 hours is a wall; ninety-nine Saturdays is a
 * distance you can picture. The heaviest month is a fact in the pace chart; "it is never this
 * steep again after month 2" is a reason to keep going. Every line is still arithmetic over the
 * reader's own files, still dropped when its inputs are missing, and still incapable of saying
 * something the footer would contradict. Nothing here is a slogan with a number dropped into it,
 * and nothing is invented.
 *
 * The test enforces the anti-duplication rule directly: no line may reproduce the phrasing the
 * focus card or the metric cards already use.
 *
 * ## The rule that shapes the encouraging lines
 *
 * It has to work on day one and in month twenty, and those are opposite problems.
 *
 * On day one every "done" number is zero. "0% of the plan is behind you" is true, useless and
 * bleak, and a tool that greets you that way on the morning you start is a tool you stop opening.
 * So the lines that count completed work are only built once there IS completed work, and the
 * early pool leans on scale and distance, which are just as true and are the things actually worth
 * knowing at the start.
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
  /** Topics deliberately skipped, and the hours they carried. */
  skipped: number;
  skippedHours: number;
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
  const weeks = s.weeklyHours > 0 && remaining > 0 ? round(remaining / s.weeklyHours) : null;

  // Distance, reframed. The Hours remaining card already says the number; a week has one Saturday
  // in it, and ninety-nine of those is a thing you can actually picture.
  if (weeks) {
    // A week holds one Saturday, so the same number said twice lands differently: "99 weeks" is a
    // sentence, "99 Saturdays" is a picture of one.
    lines.push(`${weeksWord(weeks)} of work left at your own pace. That is ${weeks} Saturday${weeks === 1 ? "" : "s"}.`);
  }
  if (s.months) lines.push(`${s.months} months is a long time to keep a promise to yourself. That is the whole difficulty, and it is the only one.`);

  // The next row, sized against the pace rather than named. The focus card already names it.
  if (s.nextHours && s.weeklyHours > 0) {
    const share = s.nextHours / s.weeklyHours;
    lines.push(share <= 1
      ? `The row in front of you is ${s.nextHours}h. Less than one week of your ${s.weeklyHours}.`
      : `The row in front of you is ${s.nextHours}h. About ${weeksWord(round(share))} at your pace, and then it is done for good.`);
  }

  // The heaviest month, as a reason rather than a statistic.
  if (s.peak) {
    lines.push(s.month && s.month > s.peak.month
      ? `The steepest month was ${s.peak.month}, at ${s.peak.hours}h. You already went through it.`
      : `Month ${s.peak.month} is the steepest in the plan at ${s.peak.hours}h. After that it never gets harder than it has already been.`);
  }

  // Scale, as permission rather than a target.
  if (s.parts > 0) lines.push(`${s.parts.toLocaleString()} syllabus parts sit behind this plan. You do not have to hold them all, only the one in front of you.`);
  if (s.tracks > 1) lines.push(`${s.tracks} tracks, and none of them need finishing today.`);

  // A skip is a judgement call and deserves to be named as one, since the metric card reports it
  // as a subtraction and nothing else says it was deliberate.
  if (s.skipped > 0 && s.skippedHours > 0) {
    lines.push(`You cut ${s.skipped} topic${s.skipped === 1 ? "" : "s"} and ${s.skippedHours}h from this plan. Deciding what not to study is the same skill as studying.`);
  }

  // Behind you. Only once there is any, because zero as encouragement is a joke you are not in
  // the mood for on the first morning.
  if (started) {
    if (s.doneHours > 0) lines.push(`${s.doneHours}h are already behind you. Nobody can take those back, and nothing about a bad week undoes them.`);
    if (s.doneHours > 0 && s.weeklyHours > 0) lines.push(`You have already sat through ${weeksWord(round(s.doneHours / s.weeklyHours))} of this. The hard part was starting and it is finished.`);
    if (s.done > 1) lines.push(`${s.done} topics answered for. Each one is a thing you could be asked about tomorrow and would not flinch.`);
  } else {
    lines.push("Nothing recorded yet, which is exactly what day one looks like for everybody who finished.");
  }

  // The method, which is the argument the whole product makes.
  lines.push("A row marked done is study. An artifact is a URL somebody else can open. Only one of those survives an interview.");
  lines.push("Retrieval beats rereading, which is why the box below asks you before it tells you.");
  lines.push("Every number here is read from your own files. If it looks bad, it is bad, and that is the point of it.");

  return lines;
}

/**
 * The headline, which also changes per visit.
 *
 * Only the small line under it rotated at first, so the biggest words on the page were the one
 * thing that never moved. If the hero is meant to be new when you open it, the 42px sentence is
 * the part that decides whether it feels new.
 *
 * These are stance rather than status. The sub-line carries the arithmetic; a headline that
 * reported a number would put a fifth metric in the largest type on the screen, which is the
 * mistake the pool below already made once.
 *
 * Two constraints they all meet. They are short, because this renders at 42px in a hero that is
 * two lines tall and a third line pushes the focus card out of alignment. And none of them is a
 * not-X-but-Y contrast, which is the shape this codebase keeps removing from its own copy.
 *
 * The first entry is canonical: the server renders it, `scripts/build-icons.mjs` prints it on the
 * link-preview card, and the shuffle only takes over after mount. So a shared link and a cold load
 * always agree, and the variety is something the reader gets rather than something a crawler sees.
 */
export function headlines(s: HeroState): string[] {
  const lines = [
    "Build proof you can show.",
    "An artifact is the part somebody else can open.",
    "The next row is the whole job today.",
    "Nobody is checking this but you.",
    "Answer it before you read the key.",
    "Retrieval beats rereading.",
    "Ship something with a URL on it.",
    "Finish the row. Then write it down.",
  ];
  // Two that are actually yours rather than anyone's.
  if (s.months) lines.push(`${s.months} months, one row at a time.`);
  if (s.total) lines.push(`${s.total} topics. One of them is today.`);
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
