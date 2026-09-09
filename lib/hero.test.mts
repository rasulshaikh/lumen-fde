/**
 * Hero line tests. Run with:  npx tsx lib/hero.test.mts
 *
 * The property that matters most is the one that is easy to get wrong and impossible to notice:
 * this thing greets the reader every morning for 23 months, and on the first of those mornings
 * every "done" number is zero. A pool that says "0 of 117 topics" and "0% of the plan is behind
 * you" is factually correct and is the reason someone stops opening a tool.
 *
 * So: no line may report completed work before there is any, no line may render a placeholder for
 * a value it does not have, and the pool must never be empty whatever the state.
 */
import { headlines, pool, shuffle, type HeroState } from "./hero.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const base: HeroState = {
  hours: 1588, doneHours: 0, done: 0, total: 117,
  month: 1, months: 23, track: "Foundations", nextTopic: "Shell mastery and scripting", nextHours: 12,
  parts: 2236, tracks: 15, weeklyHours: 16, peak: { month: 2, hours: 75.5 },
  skipped: 2, skippedHours: 26,
};

/**
 * The hero sits directly above a focus card and four metric cards. Everything those already say is
 * off limits, because the first version of this rotated eight lines and six of them were the
 * surrounding chrome repeated in a larger font. These are the phrasings that chrome uses.
 */
const ALREADY_ON_SCREEN: [string, RegExp][] = [
  ["the Current focus card's month line", /Month \d+ of \d+/],
  ["the Current focus card's track", /Month \d+ of \d+, on /],
  ["the Plan progress metric", /\d+ of \d+ topics recorded/],
  ["a bare percentage, which the Plan progress metric owns", /\d+% of the plan/i],
  ["the Hours remaining metric", /^\d+h left\./],
  ["the pace map's own peak caption", /Peak: Month/],
];

console.log("no line repeats what the cards around it already say");
{
  // Checked across the whole life of the plan, not just today, because the duplication that
  // shipped was in lines that only appear once work has been recorded.
  const states = [
    base,
    { ...base, done: 40, doneHours: 600, month: 12 },
    { ...base, done: 117, doneHours: 1588, month: null, nextTopic: null, nextHours: null },
  ];
  for (const state of states) {
    for (const line of pool(state)) {
      for (const [what, pattern] of ALREADY_ON_SCREEN) {
        ck(`does not repeat ${what}`, !pattern.test(line), pattern.test(line) ? `-> "${line}"` : "");
      }
    }
  }
}

console.log("day one: nothing done, and the hero still has something true to say");
{
  const lines = pool(base);
  ck("the pool is not empty", lines.length > 0, `${lines.length} lines`);
  ck("no line reports completed topics", !lines.some((l) => /\b0 of 117\b/.test(l)), lines.find((l) => /0 of/.test(l)) ?? "");
  ck("no line says 0 topics answered for", !lines.some((l) => /^0 topics/.test(l)));
  ck("no line reports completed hours", !lines.some((l) => /^0h done/.test(l)));
  ck("no line reports a 0% figure", !lines.some((l) => /\b0%/.test(l)));
  ck("no line reports 0 weeks sat through", !lines.some((l) => /0 weeks of work/.test(l)));
  ck("it still frames the distance", lines.some((l) => /Saturday/.test(l)), lines.find((l) => /Saturday/.test(l)) ?? "");
  ck("it sizes the next row without naming it, since the focus card names it", lines.some((l) => /row in front of you is 12h/.test(l)) && !lines.some((l) => l.includes("Shell mastery and scripting")));
  ck("day one is named as day one rather than as 0%", lines.some((l) => /day one looks like/.test(l)));
}

console.log("mid plan: the done lines appear, and the peak is spoken of in the past");
{
  const mid = { ...base, done: 40, doneHours: 600, month: 12, track: "ML systems", nextTopic: "Vector stores", nextHours: 9 };
  const lines = pool(mid);
  ck("hours done are reframed, not reported", lines.some((l) => /600h are already behind you/.test(l)));
  ck("topics done are counted without the percentage the metric card owns", lines.some((l) => /40 topics answered for/.test(l)));
  ck("weeks already worked are reported", lines.some((l) => /sat through 38 weeks/.test(l)));
  ck("the plural agrees", !lines.some((l) => /\b1 weeks\b/.test(l)));
  ck("the heaviest month is spoken of in the past", lines.some((l) => /You already went through it/.test(l)));
  ck("the remainder drives the distance, not the total", lines.some((l) => /62 weeks of work left/.test(l)), lines.find((l) => /left/.test(l)) ?? "");
}

console.log("a missing value drops its line rather than rendering a placeholder");
{
  const thin = { ...base, month: null, track: null, nextTopic: null, nextHours: null, parts: 0, peak: null };
  const lines = pool(thin);
  ck("the pool survives", lines.length > 0, `${lines.length} lines`);
  ck("nothing renders null", !lines.some((l) => /null|undefined|NaN/.test(l)), lines.join(" | "));
  ck("no month line", !lines.some((l) => l.startsWith("Month")));
  ck("no next-row line", !lines.some((l) => l.startsWith("Next:")));
  ck("no syllabus-parts line", !lines.some((l) => l.includes("syllabus parts")));
  // "117 topics, 1588h" was one of the six duplicates and is gone. What survives a state with no
  // month, no next row, no peak and no syllabus is the method: the lines that argue for the
  // product rather than report it.
  ck("the method lines survive any state", lines.some((l) => /An artifact is a URL/.test(l)) && lines.some((l) => /Retrieval beats rereading/.test(l)));
}

console.log("the track is only named when there is one");
{
  ck("the track is never printed, because the focus card prints it", !pool(base).some((l) => l.includes("Foundations")));
}

console.log("a zero weekly pace cannot divide by itself");
{
  const lines = pool({ ...base, weeklyHours: 0 });
  ck("no weeks line at all", !lines.some((l) => /weeks of work left/.test(l)), lines.find((l) => /weeks of work left/.test(l)) ?? "");
  ck("nothing is Infinity", !lines.some((l) => /Infinity/.test(l)));
}

console.log("a finished plan says so without dividing by nothing");
{
  const donePlan = { ...base, done: 117, doneHours: 1588, month: null, nextTopic: null, nextHours: null };
  const lines = pool(donePlan);
  ck("the pool survives", lines.length > 0);
  ck("no weeks countdown at all", !lines.some((l) => /work left/.test(l)), lines.find((l) => /work left/.test(l)) ?? "");
  ck("it says the hours are behind you instead", lines.some((l) => /1588h are already behind you/.test(l)));
  ck("no '1 weeks' anywhere", !lines.some((l) => /\b1 weeks\b/.test(l)), lines.join(" | "));
  ck("nothing is negative", !lines.some((l) => /-\d/.test(l)), lines.join(" | "));
}

console.log("a single remaining week is singular");
{
  const nearly = { ...base, doneHours: 1580, done: 116 };
  const lines = pool(nearly);
  ck("says 1 week and 1 Saturday, both singular", lines.some((l) => /^1 week of work left.*1 Saturday\.$/.test(l)), lines.find((l) => /Saturday/.test(l)) ?? "");
}

console.log("the shuffle is a shuffle, and it is reproducible");
{
  const lines = pool({ ...base, done: 20, doneHours: 300 });
  ck("same seed, same order", shuffle(lines, 7).join("|") === shuffle(lines, 7).join("|"));
  ck("different seed, different order", shuffle(lines, 7).join("|") !== shuffle(lines, 8).join("|"));
  ck("nothing is lost", shuffle(lines, 42).length === lines.length);
  ck("nothing is duplicated", new Set(shuffle(lines, 42)).size === new Set(lines).size);
  ck("every line survives", [...shuffle(lines, 3)].sort().join("|") === [...lines].sort().join("|"));
  ck("the input is not mutated", shuffle(lines, 5) !== lines && lines[0] === pool({ ...base, done: 20, doneHours: 300 })[0]);

  // Across many seeds the first line should not always be the same one, or "new every visit" is
  // a claim the shuffle does not deliver.
  const firsts = new Set(Array.from({ length: 40 }, (_, i) => shuffle(lines, i)[0]));
  ck("the opening line actually varies", firsts.size >= 4, `${firsts.size} distinct openers over 40 seeds`);
}

console.log("no line is a duplicate of another");
{
  const lines = pool({ ...base, done: 40, doneHours: 600, month: 12 });
  ck("all distinct", new Set(lines).size === lines.length, lines.join(" | "));
}

console.log("the headline changes per visit and stays headline-sized");
{
  const hs = headlines(base);
  ck("there is a pool to choose from", hs.length >= 6, `${hs.length} headlines`);
  ck("all distinct", new Set(hs).size === hs.length);

  // The canonical one is first: the server renders it and build-icons.mjs prints it on the
  // link-preview card, so a shared link and a cold load have to agree.
  ck("the canonical headline is first", hs[0] === "Build proof you can show.");

  // 42px, two lines, with a focus card beside it. A third line pushes that card out of line.
  ck("every headline fits two lines at hero size", hs.every((h) => h.length <= 48), hs.find((h) => h.length > 48) ?? "");
  ck("every headline is a sentence", hs.every((h) => /[.!?]$/.test(h)));

  // The shape this codebase keeps removing from its own copy.
  ck("none is a not-X-but-Y contrast", !hs.some((h) => /\bnot just\b|\bnot only\b|\brather than\b|, not /i.test(h)), hs.find((h) => /not just|not only|rather than|, not /i.test(h)) ?? "");

  // The headline must not become a fifth metric in the largest type on the page.
  for (const [what, pattern] of ALREADY_ON_SCREEN) {
    ck(`no headline repeats ${what}`, !hs.some((h) => pattern.test(h)), hs.find((h) => pattern.test(h)) ?? "");
  }

  const picked = new Set(Array.from({ length: 40 }, (_, i) => shuffle(hs, i * 7919)[0]));
  ck("the visit actually changes it", picked.size >= 5, `${picked.size} distinct over 40 visits`);

  // Derived entries drop out when their inputs do, like every other line here.
  const thin = headlines({ ...base, months: 0, total: 0 });
  ck("derived headlines drop when the numbers are missing", thin.length === hs.length - 2, `${thin.length} vs ${hs.length}`);
  ck("nothing renders a zero", !thin.some((h) => /^0 /.test(h)));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
