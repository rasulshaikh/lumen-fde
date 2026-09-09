/**
 * Scheduler tests. Run with:  npx tsx lib/review.test.mts
 *
 * The simulation is the point, not the unit assertions. A single combined daily cap
 * looked fine until simulated: it bound on 386 of 400 days and left 547 of 700 prompts
 * untouched, because reviews and new material competed for the same five slots. Splitting
 * them (reviews first, then NEW_PER_DAY of new) and trimming to PER_TOPIC cards is what
 * makes it converge. Re-run this before changing LADDER, DAILY_CAP, NEW_PER_DAY or
 * PER_TOPIC - the failure mode is invisible in unit tests.
 */
import { readFile } from "node:fs/promises";
import { grade, isDue, nextDue, eligible, retention, PER_TOPIC, type ReviewState } from "./review.ts";
const d = (s: string) => new Date(`${s}T12:00:00Z`);
let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

let c = grade(undefined, "fluent", d("2026-01-01"));
ck("new+fluent -> rung1 due +7", c.rung === 1 && c.due === "2026-01-08");
ck("halting repeats", grade(c, "halting", d("2026-01-08")).rung === 1);
ck("gone drops two not to zero", grade({rung:5,due:"x",seen:9}, "gone", d("2026-02-01")).rung === 3);
ck("unseen is not a 'review'", !isDue(undefined, d("2026-01-01")));

const seven = Array.from({length: 119*7}, (_, n) => ({ k:`k${n}`, i: Math.floor(n/7), kind:"recall" }));
ck(`per-topic trim to ${PER_TOPIC}`, eligible(seven).length === 119*PER_TOPIC, `(${eligible(seven).length})`);

/**
 * The kind mix. `eligible` used to keep the first PER_TOPIC prompts in array order, and the
 * bank lists a topic's recall prompts (7+ of them) before its drills - so every one of the
 * 875 drills was cut and the drill branches in app/recall.tsx could never render. These pin
 * the round robin that fixes it. A shape change in the bank that reintroduced the ordering
 * dependency would show up here as "drills reachable at all" going to zero.
 */
const mixed = [
  ...Array.from({length: 7}, (_, n) => ({ k:`r${n}`, i: 0, kind:"recall" })),
  ...Array.from({length: 9}, (_, n) => ({ k:`d${n}`, i: 0, kind:"drill" })),
  ...Array.from({length: 5}, (_, n) => ({ k:`r1-${n}`, i: 1, kind:"recall" })), // recall only
  ...Array.from({length: 4}, (_, n) => ({ k:`d2-${n}`, i: 2, kind:"drill" })),  // drill only
  { k:"r3-0", i: 3, kind:"recall" }, { k:"d3-0", i: 3, kind:"drill" },          // short topic
];
const mix = eligible(mixed);
const kindsOf = (i: number) => mix.filter(p => p.i === i).map(p => p.kind);
ck("drills reachable at all", mix.some(p => p.kind === "drill"), `(${mix.filter(p=>p.kind==="drill").length} drills)`);
ck("topic with both kinds yields both", new Set(kindsOf(0)).size === 2, `(${kindsOf(0).join(",")})`);
ck("recall-only topic still fills quota", kindsOf(1).length === PER_TOPIC, `(${kindsOf(1).length})`);
ck("drill-only topic still fills quota", kindsOf(2).length === PER_TOPIC, `(${kindsOf(2).length})`);
ck("topic shorter than quota keeps all it has", kindsOf(3).length === 2, `(${kindsOf(3).length})`);
ck("total is perTopic x topics", mix.length === 3*PER_TOPIC + 2, `(${mix.length})`);
ck("no prompt is scheduled twice", new Set(mix.map(p => p.k)).size === mix.length);
ck("perTopic argument is honoured", eligible(mixed, 1).length === 4, `(${eligible(mixed, 1).length})`);
ck("deterministic across calls", eligible(mixed).map(p=>p.k).join() === mix.map(p=>p.k).join());

// Against the shipped bank, because the synthetic fixture above only proves the round robin
// works on the shape I imagined. This is the number that was 0.
const bank = JSON.parse(await readFile(new URL("../data/recall-bank.json", import.meta.url), "utf8")) as { prompts: {k:string;i:number;kind:string}[] };
const scheduled = eligible(bank.prompts);
const drills = scheduled.filter(p => p.kind === "drill").length;
const topics = new Set(bank.prompts.map(p => p.i)).size;
console.log(`\n  shipped bank: ${bank.prompts.length} prompts, ${topics} topics -> ${scheduled.length} scheduled (${drills} drills)`);
ck("shipped bank schedules drills", drills > 0, `(${drills})`);
ck("shipped bank schedules recall too", scheduled.some(p => p.kind === "recall"));
ck("shipped bank total is perTopic x topics", scheduled.length === topics*PER_TOPIC, `(${scheduled.length})`);

// 400-day sim on a realistic ramp
let state: ReviewState = {}; const all: {k:string;i:number;kind:string}[] = [];
const loads:number[]=[]; const start=new Date("2026-01-01T12:00:00Z");
for (let day=0; day<400; day++){
  const now=new Date(start.getTime()+day*864e5);
  if (day%4===0 && all.length < 119*7){ const t=Math.floor(all.length/7); for(let n=0;n<7;n++) all.push({k:`t${t}-${n}`,i:t,kind:"recall"}); }
  const todays=nextDue(all,state,now); loads.push(todays.length);
  for(const p of todays) state[p.k]=grade(state[p.k], Math.random()<0.75?"fluent":"halting", now);
}
const pool = eligible(all);
const mean=loads.reduce((a,b)=>a+b,0)/loads.length;
const atCap=loads.filter(l=>l===5).length;
const r=retention(pool,state);
const end=new Date(start.getTime()+400*864e5);
const overdue=pool.filter(p=>isDue(state[p.k],end)).length;
console.log(`\n  400-day sim (${pool.length} scheduled cards of ${all.length} prompts)`);
console.log(`    mean ${mean.toFixed(2)}/day · at cap ${atCap}/400 days · max ${Math.max(...loads)}`);
console.log(`    introduced ${r.seen}/${r.total} · matured (60d+) ${r.matured} · still due at end ${overdue}`);
ck("never exceeds cap", Math.max(...loads)<=5);
ck("corpus is actually coverable", r.seen/r.total > 0.9, `(${(r.seen/r.total*100).toFixed(0)}% introduced)`);
ck("backlog stays small", overdue < 20, `(${overdue} due)`);
ck("most material matures", r.matured/r.total > 0.5, `(${(r.matured/r.total*100).toFixed(0)}% at 60d+)`);
console.log(fails?`\n${fails} FAILURES`:"\nall assertions passed");
process.exit(fails?1:0);
