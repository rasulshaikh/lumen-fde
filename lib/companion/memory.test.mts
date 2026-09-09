/**
 * Companion memory tests. Run with:  npx tsx lib/companion/memory.test.mts
 *
 * The digest is bounded and rewritten, which is the combination that fails quietly. An
 * unbounded list degrades over months with no error; a cap that evicts the wrong end throws away
 * exactly the memories worth keeping and still looks like it is working. Neither has a natural
 * failure signal, so both are asserted directly.
 *
 * Everything here is pure with `now` passed in - no clock, no network, no filesystem - matching
 * lib/motivation.ts and lib/market/insight.ts.
 */
import {
  MAX_ENTRIES,
  MAX_PHRASE,
  applyMemory,
  day,
  emptyMemory,
  normalise,
  note,
  recurring,
  type Memory,
} from "./memory.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const T = (iso: string) => new Date(`${iso}T09:00:00Z`);

console.log("normalise");
ck("collapses case and whitespace", normalise("  K8s   Probes ") === "k8s probes");
ck("empty stays empty", normalise("   ") === "");
ck("caps a pathological paste", normalise("x".repeat(500)).length === MAX_PHRASE);

console.log("note");
{
  let list = note([], "K8s probes", T("2026-09-01"));
  ck("first occurrence counts once", list.length === 1 && list[0].count === 1);
  list = note(list, "k8s  PROBES", T("2026-09-05"));
  ck("normalised duplicate is the same memory, not a second one", list.length === 1, `len ${list.length}`);
  ck("count rises", list[0].count === 2);
  ck("last moves to the newer day", list[0].last === "2026-09-05");
  ck("an empty value is not remembered", note(list, "   ", T("2026-09-06")).length === 1);
}

console.log("the cap evicts the quietest, not the oldest");
{
  // Fill past the cap, then bring the very first entry back on the newest day. It must survive.
  let list: ReturnType<typeof note> = [];
  list = note(list, "the-one-that-recurs", T("2026-01-01"));
  for (let i = 0; i < MAX_ENTRIES + 10; i++) list = note(list, `filler-${i}`, T("2026-02-01"));
  ck("bounded at the cap", list.length === MAX_ENTRIES, `len ${list.length}`);
  ck("a stale unique entry is evicted", !list.some((n) => n.key === "the-one-that-recurs"));

  let live: ReturnType<typeof note> = [];
  live = note(live, "recurring-topic", T("2026-01-01"));
  for (let i = 0; i < MAX_ENTRIES - 1; i++) live = note(live, `filler-${i}`, T("2026-02-01"));
  live = note(live, "recurring-topic", T("2026-03-01"));
  for (let i = 0; i < 10; i++) live = note(live, `later-${i}`, T("2026-03-02"));
  ck("a memory that came back recently survives the cap",
    live.some((n) => n.key === "recurring-topic"), JSON.stringify(live.map((n) => n.key).slice(0, 3)));
}

console.log("applyMemory");
{
  const base = emptyMemory();
  const one = applyMemory(base, { asked: ["what is a readiness probe"], explained: ["probes"] }, T("2026-09-09"));
  ck("stamps the day when something moved", one.updated === "2026-09-09");
  ck("records into the right lists", one.asked.length === 1 && one.explained.length === 1 && one.struggled.length === 0);
  ck("asking is not a session", one.sessions === 0);

  const closed = applyMemory(one, { sessionClosed: true }, T("2026-09-10"));
  ck("a closed session increments the count", closed.sessions === 1);

  // The no-op case is the one that matters: a read that changes nothing must not advance the
  // day, or `updated` stops answering "has anything happened lately".
  const noop = applyMemory(closed, {}, T("2026-12-25"));
  ck("a no-op update does not advance `updated`", noop.updated === "2026-09-10", noop.updated);
  ck("a no-op update returns the same object", noop === closed);

  const empties = applyMemory(closed, { asked: ["  "], struggled: [""] }, T("2026-12-25"));
  ck("updates consisting only of empty values are a no-op", empties === closed);
}

console.log("recurring");
{
  let m: Memory = emptyMemory();
  m = applyMemory(m, { asked: ["lora vs qlora"] }, T("2026-09-01"));
  ck("asked once is not a pattern", recurring(m).length === 0);
  m = applyMemory(m, { asked: ["LoRA vs QLoRA"] }, T("2026-09-08"));
  ck("asked twice is", recurring(m).length === 1 && recurring(m)[0].count === 2);
}

console.log("day");
ck("day is the UTC slice", day(new Date("2026-09-09T23:30:00Z")) === "2026-09-09");

console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
