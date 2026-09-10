/**
 * Lesson tests. Run with:  npx tsx lib/lessons.test.mts
 *
 * A lesson is the other interaction shape: not a sequence you walk, but one continuous thing where
 * the pointer is the input. That moves the risk somewhere new. A machine could be wrong about what
 * it showed; a lesson can be wrong about the ARITHMETIC, and a maths lesson that teaches the wrong
 * maths confidently is worse than no lesson.
 *
 * So this suite checks three things:
 *
 * 1. **The maths is right.** The derivative really is the derivative of the loss, checked against a
 *    numerical gradient. The minima are where the code says they are. Descent converges.
 * 2. **The drag maths is right.** A pointer at a given fraction across the box becomes the value the
 *    reader expects, edges clamp, and a drag on nothing does nothing. This is the part that decides
 *    whether the handle tracks the finger or drifts away from it.
 * 3. **The lesson still refuses to praise.** Reaching the bottom is the moment every learning
 *    product says "great job". `lib/companion/context.ts` refuses that, `TestRunner` refuses it,
 *    and axonlearn.app - the reference for this whole primitive - refuses it too: "I will never say
 *    'great job!' when you didn't."
 */
import workbook from "../data/workbook.json" with { type: "json" };
import { LESSONS, lessonById, lessonsForTopic } from "./lessons/index.ts";
import { dragToParam, paramValue, quantise, restingParams } from "./lessons/types.ts";
import { lossAt, slopeAt, takeStep, MINIMA, gradientDescent } from "./lessons/gradient-descent.ts";
import { crossEnt, entropy, kldiv, dLoss, crossEntropy } from "./lessons/cross-entropy.ts";
import { seqScanCost, indexScanCost, crossoverSelectivity, indexCrossover } from "./lessons/index-crossover.ts";
import { latency, idealLatency, utilisation, wall, capacity, cacheHitRate } from "./lessons/cache-hit-rate.ts";
import { chain, peakGradient, backpropChain } from "./lessons/backprop-chain.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const plan = workbook.Plan as unknown[][];

console.log("lessons point at real plan topics");
{
  for (const l of LESSONS) {
    ck(`${l.id}: has a topic`, l.topicIndices.length > 0);
    for (const t of l.topicIndices) {
      ck(`${l.id}: topic ${t} is real`, !!String(plan[t + 1]?.[2] ?? ""), String(plan[t + 1]?.[2] ?? "").slice(0, 44));
    }
    ck(`${l.id}: every handle names a real param`, l.handles.every((h) => l.params.some((p) => p.id === h.param)));
    ck(`${l.id}: every handle names a dot the scene draws`, l.handles.every((h) => l.scene(restingParams(l)).dots.some((d) => d.id === h.id)));
    ck(`${l.id}: params rest inside their own range`, l.params.every((p) => p.value >= p.min && p.value <= p.max && p.min < p.max && p.step > 0));
  }
  ck("lessonById finds one", lessonById("gradient-descent")?.id === "gradient-descent");
  ck("and refuses a crafted id", lessonById("../../etc/passwd") === null);
  ck("lessonsForTopic finds the calculus row", lessonsForTopic(94).length === 1);
}

console.log("the maths is actually the maths");
{
  // The gradient is hand-written, so it can be hand-written WRONG - and a lesson whose whole
  // subject is the gradient would then teach a number that is not the gradient. Checked against a
  // central difference, which is a different method and would not share a mistake.
  let worst = 0;
  for (let x = -3; x <= 3; x += 0.05) {
    const h = 1e-5;
    const numeric = (lossAt(x + h) - lossAt(x - h)) / (2 * h);
    worst = Math.max(worst, Math.abs(numeric - slopeAt(x)));
  }
  ck("the derivative matches a numerical gradient everywhere", worst < 1e-4, `worst ${worst.toExponential(1)}`);

  // The minima are load-bearing: the lesson names their losses in prose.
  ck("the left minimum is a minimum", Math.abs(slopeAt(MINIMA.left)) < 1e-3, `slope ${slopeAt(MINIMA.left).toExponential(1)}`);
  ck("the right minimum is a minimum", Math.abs(slopeAt(MINIMA.right)) < 1e-3, `slope ${slopeAt(MINIMA.right).toExponential(1)}`);
  ck("and the left one is genuinely deeper", lossAt(MINIMA.left) < lossAt(MINIMA.right),
    `${lossAt(MINIMA.left).toFixed(3)} vs ${lossAt(MINIMA.right).toFixed(3)}`);
  // If they were the same depth the lesson would have nothing to teach.
  ck("by enough to matter", lossAt(MINIMA.right) - lossAt(MINIMA.left) > 0.3);
}

console.log("descent descends, and lands in the basin you started above");
{
  const run = (x: number, lr = 0.15, steps = 60) => {
    let p = { x, lr };
    for (let i = 0; i < steps; i++) p = takeStep(p);
    return p.x;
  };
  ck("from the right it settles in the right basin", Math.abs(run(1.9) - MINIMA.right) < 0.05, `${run(1.9).toFixed(3)}`);
  ck("from the left it settles in the left basin", Math.abs(run(-1.9) - MINIMA.left) < 0.05, `${run(-1.9).toFixed(3)}`);
  // The point of the whole lesson: starting nearer the shallow hole finds the shallow hole.
  ck("the shallow basin is reachable and is worse", lossAt(run(1.9)) > lossAt(run(-1.9)));

  // Loss must fall monotonically at a sane rate, or "descent" is the wrong word.
  let p = { x: 1.9, lr: 0.15 };
  let rose = false;
  for (let i = 0; i < 40; i++) { const before = lossAt(p.x); p = takeStep(p); if (lossAt(p.x) > before + 1e-9) rose = true; }
  ck("at a sane rate the loss never goes up", !rose);
}

console.log("a learning rate can be too big, and the lesson says what happened");
{
  const gentle = gradientDescent.scene({ x: 1.9, lr: 0.1 });
  const wild = gradientDescent.scene({ x: 1.9, lr: 0.9 });
  ck("a small rate descends", !/HIGHER/.test(gentle.caption), gentle.caption.slice(0, 40));
  ck("a large one overshoots", /HIGHER/.test(wild.caption), wild.caption.slice(0, 46));
  ck("and the readout says the next loss is higher", /higher/.test(wild.readouts.find((r) => r.label === "next loss")!.value));
  // It must name the gradient as still correct - the failure is the step length, not the direction,
  // and conflating those is the misconception the lesson exists to prevent.
  ck("it says the gradient is not what is wrong", /Nothing is wrong with the gradient/.test(wild.detail));
}

console.log("the pointer maths puts the handle under the finger");
{
  const l = gradientDescent;
  const W = 600, H = 300;
  const at = (frac: number) => dragToParam(l, "ball", W * frac, H / 2, W, H)!.value;
  ck("the middle of the box is the middle of the range", Math.abs(at(0.5) - 0) < 0.02, `${at(0.5)}`);
  ck("the left edge is the minimum", at(0) === l.params[0].min, `${at(0)}`);
  ck("the right edge is the maximum", at(1) === l.params[0].max, `${at(1)}`);
  ck("a quarter across is a quarter through", Math.abs(at(0.25) - -1.5) < 0.02, `${at(0.25)}`);
  ck("dragging past the edge clamps", dragToParam(l, "ball", -9999, 0, W, H)!.value === l.params[0].min);

  ck("a drag on nothing does nothing", dragToParam(l, "not-a-handle", 10, 10, W, H) === null);
  ck("a zero-width box cannot divide by zero", dragToParam(l, "ball", 10, 10, 0, H) === null);
  ck("the value lands on the parameter's own step", Number.isInteger(Math.round(at(0.333) * 100)), `${at(0.333)}`);

  ck("quantise snaps and does not leak float noise", quantise(1.7000000000000002, 0.1) === 1.7);
  ck("quantise survives a zero step", quantise(1.23, 0) === 1.23);
  ck("paramValue clamps a hand-edited value", paramValue(l, { x: 999 }, "x") === l.params[0].max);
  ck("and falls back when it is missing", paramValue(l, {}, "x") === l.params[0].value);
}

console.log("scene() is pure, and every readout moves");
{
  const l = gradientDescent;
  const a = JSON.stringify(l.scene({ x: 0.7, lr: 0.2 }));
  ck("same inputs, same output", a === JSON.stringify(l.scene({ x: 0.7, lr: 0.2 })));
  ck("no state carried between calls", (l.scene({ x: -2, lr: 1 }), JSON.stringify(l.scene({ x: 0.7, lr: 0.2 })) === a));

  // A readout that never changes is a decoration. Each must differ somewhere in the range.
  const one = l.scene({ x: -2.5, lr: 0.1 }).readouts;
  const two = l.scene({ x: 2.5, lr: 0.9 }).readouts;
  for (const [i, r] of one.entries()) ck(`readout "${r.label}" responds`, r.value !== two[i].value, `${r.value} -> ${two[i].value}`);

  // The ball must sit ON the curve, or the diagram is lying about where it is.
  for (const x of [-2.4, -1, 0.3, 1.6, 2.7]) {
    const ball = l.scene({ x, lr: 0.2 }).dots.find((d) => d.id === "ball")!;
    if (Math.abs(ball.y - lossAt(x)) > 1e-9) { ck("the ball sits on the curve", false, `x=${x}`); break; }
  }
  ck("the ball sits on the curve at every position", true);
}

console.log("arriving at the bottom is not praised");
{
  const l = gradientDescent;
  let p = { x: 1.9, lr: 0.15 };
  for (let i = 0; i < 60; i++) p = takeStep(p);
  const done = l.scene(p);
  ck("the lesson notices you arrived", !!done.arrived, (done.arrived ?? "").slice(0, 40));
  ck("no praise", !/well done|great|nice work|congrat|correct|perfect/i.test(done.arrived ?? ""), done.arrived?.slice(0, 60));
  ck("no score", !/\bscore\b|\d+\s*\/\s*\d+|\bpoints?\b/i.test(done.arrived ?? ""));
  // It has to say the uncomfortable thing: this is a minimum, and it is the wrong one.
  ck("it says this is not the lowest one", /not the lowest one/.test(done.arrived ?? ""));
  ck("and that nothing failed", /Nothing here failed/.test(done.arrived ?? ""));

  let q = { x: -1.9, lr: 0.15 };
  for (let i = 0; i < 60; i++) q = takeStep(q);
  const deep = l.scene(q).arrived ?? "";
  ck("landing in the deeper basin is not praised either", !/well done|great|congrat/i.test(deep));
  ck("it says why it found it", /found it because it is the one you started above/.test(deep), deep.slice(-46));
}


console.log("lessons are reachable from the topic they explain");
{
  // Same guard the machines carry: `machinesForTopic` once shipped with zero callers while the
  // design spec claimed machines were reachable from the topic being studied. Pinned at both ends.
  const { readFileSync } = await import("node:fs");
  const provider = readFileSync("components/AppState.tsx", "utf8");
  ck("the syllabus panel calls lessonsForTopic", /lessonsForTopic\(/.test(provider));
  ck("and links to the specific lesson", /\/machines\?l=\$\{l\.id\}/.test(provider));

  const view = readFileSync("components/Lesson.tsx", "utf8");
  ck("the page reads the l parameter", /URLSearchParams\(window\.location\.search\)\.get\("l"\)/.test(view));
  ck("and validates it before using it", /lessonById\(wanted\)/.test(view));

  for (const l of LESSONS) {
    ck(`${l.id} is reachable from a topic`, l.topicIndices.some((i) => lessonsForTopic(i).some((x) => x.id === l.id)));
  }
}


console.log("every lesson holds the shared rules, not just the first one");
{
  for (const l of LESSONS) {
    const rest = restingParams(l);
    const sc = l.scene(rest);
    ck(`${l.id}: draws something`, sc.paths.length > 0 && sc.dots.length > 0);
    ck(`${l.id}: has readouts`, sc.readouts.length >= 3, `${sc.readouts.length}`);
    ck(`${l.id}: captions its resting state`, sc.caption.length > 15 && sc.detail.length > 60);
    ck(`${l.id}: scene is pure`, JSON.stringify(l.scene(rest)) === JSON.stringify(l.scene(rest)));

    // Nothing may be NaN on screen. A NaN coordinate is an invisible path, not an error.
    const bad = sc.paths.flatMap((pa) => pa.points).some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
      || sc.dots.some((d) => !Number.isFinite(d.x) || !Number.isFinite(d.y));
    ck(`${l.id}: no NaN geometry at rest`, !bad);

    // Sweep the draggable parameter across its whole range - the reader will.
    const h = l.handles[0];
    const hp = l.params.find((q) => q.id === h.param)!;
    let broke = "";
    for (let i = 0; i <= 60; i++) {
      const v = hp.min + ((hp.max - hp.min) * i) / 60;
      const s2 = l.scene({ ...rest, [hp.id]: v });
      if (!s2.caption || !s2.detail) { broke = `no caption at ${v}`; break; }
      if (s2.paths.flatMap((pa) => pa.points).some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) { broke = `NaN path at ${v}`; break; }
      if (s2.dots.some((d) => !Number.isFinite(d.x) || !Number.isFinite(d.y))) { broke = `NaN dot at ${v}`; break; }
    }
    ck(`${l.id}: survives the whole drag range`, broke === "", broke);

    // No praise, anywhere, in any branch reachable by the drag.
    let praised = "";
    for (let i = 0; i <= 40; i++) {
      const v = hp.min + ((hp.max - hp.min) * i) / 40;
      const t = JSON.stringify(l.scene({ ...rest, [hp.id]: v }));
      if (/well done|great job|nice work|congrat|perfect!|correct!/i.test(t)) { praised = `at ${v}`; break; }
    }
    ck(`${l.id}: never praises`, praised === "", praised);

    // The button only exists where the lesson declares it.
    ck(`${l.id}: action is declared or absent, never inherited`, l.action === undefined || typeof l.action.apply === "function");
  }
  ck("only gradient descent offers a step", LESSONS.filter((l) => l.action).map((l) => l.id).join(",") === "gradient-descent");
}

console.log("cross-entropy: the identity holds and the penalty has no floor");
{
  // CE = H + KL, with KL computed independently rather than by subtraction, so this is a real check.
  let worst = 0;
  for (let q = 0.6; q <= 1; q += 0.02) for (let p = 0.01; p <= 0.99; p += 0.01) {
    worst = Math.max(worst, Math.abs(crossEnt(p, q) - (entropy(q) + kldiv(p, q))));
  }
  ck("CE = H + KL everywhere in the box", worst < 1e-12, `worst ${worst.toExponential(1)}`);

  // The analytic derivative against a central difference - a different method.
  let dworst = 0;
  for (let q = 0.6; q <= 1; q += 0.05) for (let p = 0.05; p <= 0.95; p += 0.01) {
    const hh = 1e-6;
    dworst = Math.max(dworst, Math.abs((crossEnt(p + hh, q) - crossEnt(p - hh, q)) / (2 * hh) - dLoss(p, q)));
  }
  ck("dCE/dp matches a numerical gradient", dworst < 1e-4, `worst ${dworst.toExponential(1)}`);
  ck("the loss is least exactly where the prediction matches the truth", Math.abs(dLoss(0.8, 0.8)) < 1e-12);
  ck("entropy is zero for a certain outcome, not -0", Object.is(entropy(1), 0));
  ck("being sure and wrong costs more than being unsure and wrong", crossEnt(0.01, 1) > crossEnt(0.5, 1) * 5);
}

console.log("index crossover: the seq scan does not care and the index does");
{
  const seq = seqScanCost();
  ck("the sequential scan costs the same at every selectivity", seqScanCost() === seq);
  // The whole lesson: index cost rises with selectivity, seq cost does not.
  let rises = true, prev = -1;
  for (let s = 0.0001; s <= 1; s *= 1.3) { const c = indexScanCost(s, 0); if (c < prev) rises = false; prev = c; }
  ck("the index scan's cost rises with selectivity", rises);

  for (const corr of [0, 0.5, 1]) {
    const x = crossoverSelectivity(corr);
    const gap = Math.abs(indexScanCost(x, corr) - seq) / seq;
    ck(`crossover at correlation ${corr} really is where they meet`, gap < 1e-6, `${(x * 100).toFixed(3)}%, gap ${gap.toExponential(1)}`);
    ck(`  below it the index wins`, indexScanCost(x * 0.5, corr) < seq);
    ck(`  above it the seq scan wins`, indexScanCost(Math.min(1, x * 2), corr) > seq);
  }
  // Correlation is the parameter people do not expect to matter, so pin that it does, a lot.
  ck("physical row order moves the crossover by an order of magnitude", crossoverSelectivity(1) > crossoverSelectivity(0) * 10,
    `${(crossoverSelectivity(0) * 100).toFixed(3)}% -> ${(crossoverSelectivity(1) * 100).toFixed(3)}%`);
}

console.log("cache: the win is at the bottom, and the gap is the queue");
{
  // The lesson's own resting value, so the test measures what the reader actually meets.
  const w = cacheHitRate.params.find((p) => p.id === "workers")!.value;
  ck("at rest the wall is off the left of the view", wall(w) < cacheHitRate.view.x0, `wall ${(wall(w) * 100).toFixed(1)}%`);

  // Equal moves in hit rate buy comparable reductions while the origin keeps up. This is the first
  // half of the misconception and it must be visible without touching the second slider.
  const lowMove = latency(0.5, w) - latency(0.55, w);
  const highMove = latency(0.9, w) - latency(0.95, w);
  ck("both moves are finite inside the view", Number.isFinite(lowMove) && Number.isFinite(highMove));
  // The lesson's actual claim, and the opposite of the misconception: the win is at the BOTTOM.
  ck("five points buys far more at a low hit rate than a high one", lowMove > highMove * 3,
    `${lowMove.toFixed(2)}ms low vs ${highMove.toFixed(2)}ms high`);

  // The queue-free line is straight, which is what makes the gap above it mean something.
  const a = idealLatency(0.5) - idealLatency(0.55);
  const b = idealLatency(0.9) - idealLatency(0.95);
  ck("the queue-free line really is straight", Math.abs(a - b) < 1e-12, `${a.toFixed(4)} vs ${b.toFixed(4)}`);
  ck("and the real curve sits above it wherever there is a queue", latency(0.7, w) > idealLatency(0.7));
  ck("converging as the origin empties", latency(0.999, w) - idealLatency(0.999) < latency(0.6, w) - idealLatency(0.6));

  // The second half: pulling connections down walks the wall into hit rates that felt comfortable.
  ck("dropping connections brings the wall into the view", wall(10) > cacheHitRate.view.x0, `${(wall(10) * 100).toFixed(0)}%`);

  ck("the wall is where arrivals meet capacity", Math.abs(utilisation(wall(w), w) - 1) < 1e-9, `${(wall(w) * 100).toFixed(1)}%`);
  ck("past the wall latency is unbounded rather than large", !Number.isFinite(latency(wall(w) - 0.01, w)));
  ck("and finite the other side of it", Number.isFinite(latency(wall(w) + 0.01, w)));
  ck("fewer connections move the wall into hit rates that felt safe", wall(4) > wall(30));
  ck("capacity is workers times what one can finish", capacity(20) === 1000);
}

console.log("backprop: three correct factors multiply to nothing");
{
  // The composed gradient against a central difference of the composed function.
  let worst = 0;
  for (let w = 1; w <= 10; w += 0.5) for (let x = -3; x <= 3; x += 0.05) {
    const hh = 1e-6;
    const numeric = (chain(x + hh, w).y - chain(x - hh, w).y) / (2 * hh);
    worst = Math.max(worst, Math.abs(numeric - chain(x, w).g));
  }
  ck("dy/dx matches a numerical gradient over the whole box", worst < 1e-5, `worst ${worst.toExponential(1)}`);
  ck("the closed form at the centre agrees with the chain", Math.abs(chain(0, 4).g - peakGradient(4)) < 1e-12);
  ck("each sigmoid derivative peaks at a quarter", Math.abs(chain(0, 1).s1 - 0.25) < 1e-12);

  // The lesson: the gradient collapses as the input leaves the centre, with nothing broken.
  const centre = Math.abs(chain(0, 4).g);
  const out = Math.abs(chain(2.5, 4).g);
  ck("moving off centre collapses the gradient by orders of magnitude", centre / out > 100, `${centre.toExponential(1)} -> ${out.toExponential(1)}`);
  ck("and it never becomes negative or NaN", Number.isFinite(out) && out > 0);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
