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
import { pool, shuffle, type HeroState } from "./hero.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const base: HeroState = {
  hours: 1588, doneHours: 0, done: 0, total: 117,
  month: 1, months: 23, track: "Foundations", nextTopic: "Shell mastery and scripting", nextHours: 12,
  parts: 2236, tracks: 15, weeklyHours: 16, peak: { month: 2, hours: 75.5 },
};

console.log("day one: nothing done, and the hero still has something true to say");
{
  const lines = pool(base);
  ck("the pool is not empty", lines.length > 0, `${lines.length} lines`);
  ck("no line reports completed topics", !lines.some((l) => /\b0 of 117\b/.test(l)), lines.find((l) => /0 of/.test(l)) ?? "");
  ck("no line reports completed hours", !lines.some((l) => /^0h done/.test(l)));
  ck("no line reports a 0% figure", !lines.some((l) => /\b0%/.test(l)));
  ck("no line reports 0 weeks sat through", !lines.some((l) => /0 weeks of work/.test(l)));
  ck("it still says where you are", lines.some((l) => l.includes("Month 1 of 23")));
  ck("and what is ahead", lines.some((l) => l.includes("1588h") || l.includes("1,588")));
  ck("and names the next row", lines.some((l) => l.includes("Shell mastery and scripting")));
}

console.log("mid plan: the done lines appear, and the peak is spoken of in the past");
{
  const mid = { ...base, done: 40, doneHours: 600, month: 12, track: "ML systems", nextTopic: "Vector stores", nextHours: 9 };
  const lines = pool(mid);
  ck("hours done are reported", lines.some((l) => l.includes("600h done")));
  ck("topics done are reported with a share", lines.some((l) => /40 of 117 topics recorded/.test(l) && /34%/.test(l)));
  ck("weeks already worked are reported", lines.some((l) => /38 weeks of work already sat through/.test(l)));
  ck("the plural agrees", !lines.some((l) => /\b1 weeks\b/.test(l)));
  ck("the heaviest month is behind you", lines.some((l) => l.includes("It is behind you.")));
  ck("remaining hours use the remainder, not the total", lines.some((l) => l.includes("988h left")), lines.find((l) => /left/.test(l)) ?? "");
  ck("and the weeks figure follows from it", lines.some((l) => l.includes("62 weeks")));
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
  ck("the always-true lines remain", lines.some((l) => l.includes("117 topics")));
}

console.log("the track is only named when there is one");
{
  ck("with a track", pool(base).some((l) => l === "Month 1 of 23, on Foundations."));
  ck("without one", pool({ ...base, track: null }).some((l) => l === "Month 1 of 23."));
}

console.log("a zero weekly pace cannot divide by itself");
{
  const lines = pool({ ...base, weeklyHours: 0 });
  ck("no weeks line at all", !lines.some((l) => /weeks/.test(l)), lines.find((l) => /weeks/.test(l)) ?? "");
  ck("nothing is Infinity", !lines.some((l) => /Infinity/.test(l)));
}

console.log("a finished plan says so without dividing by nothing");
{
  const donePlan = { ...base, done: 117, doneHours: 1588, month: null, nextTopic: null, nextHours: null };
  const lines = pool(donePlan);
  ck("the pool survives", lines.length > 0);
  ck("no weeks countdown at all", !lines.some((l) => /h left\./.test(l)), lines.find((l) => /h left/.test(l)) ?? "");
  ck("it says the hours are all behind you instead", lines.some((l) => l.includes("Every planned hour is behind you.")));
  ck("no '1 weeks' anywhere", !lines.some((l) => /\b1 weeks\b/.test(l)), lines.join(" | "));
  ck("100% is reported", lines.some((l) => l.includes("100%")));
  ck("nothing is negative", !lines.some((l) => /-\d/.test(l)), lines.join(" | "));
}

console.log("a single remaining week is singular");
{
  const nearly = { ...base, doneHours: 1580, done: 116 };
  const lines = pool(nearly);
  ck("says 1 week, not 1 weeks", lines.some((l) => /that is 1 week\./.test(l)), lines.find((l) => /h left/.test(l)) ?? "");
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

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
