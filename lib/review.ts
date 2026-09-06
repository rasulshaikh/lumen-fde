/**
 * Spaced-retrieval scheduling. Pure functions, no React, no storage — so the interval
 * behaviour can be reasoned about and tested without a browser.
 */

export type Grade = "fluent" | "halting" | "gone";
export type Card = { rung: number; due: string; seen: number; lastGrade?: Grade };
export type ReviewState = Record<string, Card>;

/**
 * Expanding intervals in days. Successive relearning wants the gap to grow only when
 * retrieval actually succeeded, so the rung moves on the grade, never on the clock.
 *
 * The tail is deliberately long: the plan runs well over a year, and something learned in
 * month 1 needs to still be there at the interview, not be re-drilled weekly for a year.
 * The top rung repeats rather than growing further, so a month-1 topic is still checked
 * roughly annually however long the plan runs — no ladder change is needed when the
 * calendar moves.
 */
export const LADDER = [1, 7, 21, 60, 150, 240, 330];

/**
 * Two separate limits, and the split is the whole design.
 *
 * A single combined cap fails: simulated over 400 days with every prompt eligible, the cap
 * binds on 386 days and 547 of 700 prompts are still untouched at the end — the queue never
 * drains and reviews compete with an endless intake. Reviews therefore run first and new
 * cards only fill what is left, which is the behaviour that makes the schedule converge.
 */
export const DAILY_CAP = 5;
export const NEW_PER_DAY = 2;

/**
 * At most three prompts enter the schedule per topic. 119 topics x 7 interview questions x
 * 875 failure modes is 1,710 cards; at any sane daily rate that is not coverable in 13
 * months, so scheduling all of it guarantees most of it is never seen and the rest is
 * starved. Three per topic is ~357 cards, which does converge. The remaining questions are
 * not lost — they are still in the syllabus, where they read as an interview-prep list.
 */
export const PER_TOPIC = 3;

export const today = (now: Date) => now.toISOString().slice(0, 10);

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Grade a card and return its next state.
 *
 * fluent  advances one rung
 * halting repeats the current rung — you got there, but not cleanly
 * gone    drops two rungs, not to zero: a lapse is not amnesia, and resetting to day 1
 *         every time is what makes these systems feel punitive and get abandoned.
 */
export function grade(card: Card | undefined, g: Grade, now: Date): Card {
  const current = card?.rung ?? 0;
  const rung = g === "fluent" ? Math.min(current + 1, LADDER.length - 1) : g === "halting" ? current : Math.max(0, current - 2);
  return { rung, due: addDays(today(now), LADDER[rung]), seen: (card?.seen ?? 0) + 1, lastGrade: g };
}

/** A card already in the schedule is due when its date arrives. */
export function isDue(card: Card | undefined, now: Date) {
  return !!card && card.due <= today(now);
}

/** Trim a topic's prompts to the few that actually enter the schedule. */
export function eligible<T extends { i: number }>(prompts: T[], perTopic = PER_TOPIC) {
  const seen = new Map<number, number>();
  return prompts.filter((p) => {
    const n = seen.get(p.i) ?? 0;
    if (n >= perTopic) return false;
    seen.set(p.i, n + 1);
    return true;
  });
}

/**
 * Choose today's cards: due reviews first, then a trickle of new material.
 *
 * The cap is what stops this becoming the Anki death spiral — miss a week, open it to
 * "37 due", close it forever. Overdue items are taken first so nothing starves, anything
 * that does not fit is simply still due tomorrow, and the count is never surfaced.
 */
export function nextDue<T extends { k: string; i: number }>(
  prompts: T[],
  state: ReviewState,
  now: Date,
  cap = DAILY_CAP,
  newPerDay = NEW_PER_DAY,
): T[] {
  const pool = eligible(prompts);
  const reviews = pool.filter((p) => isDue(state[p.k], now));
  reviews.sort((a, b) => {
    const ad = state[a.k]!.due;
    const bd = state[b.k]!.due;
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.k < b.k ? -1 : 1;
  });

  const picked: T[] = [];
  const perTopic = new Map<number, number>();
  const take = (list: T[], limit: number) => {
    // two passes: one per topic first, then fill — interleaving without starving a topic
    for (const pass of [1, Infinity]) {
      for (const p of list) {
        if (picked.length >= cap || picked.length >= limit) return;
        const used = perTopic.get(p.i) ?? 0;
        if (used >= pass || picked.includes(p)) continue;
        picked.push(p);
        perTopic.set(p.i, used + 1);
      }
    }
  };
  take(reviews, cap);
  const fresh = pool.filter((p) => !state[p.k]);
  take(fresh, picked.length + newPerDay);
  return picked;
}

/** How far through the ladder the started material is — for an honest, non-gamified read. */
export function retention(prompts: { k: string }[], state: ReviewState) {
  if (!prompts.length) return { seen: 0, total: 0, matured: 0 };
  let seen = 0;
  let matured = 0;
  for (const p of prompts) {
    const c = state[p.k];
    if (!c) continue;
    seen += 1;
    if (c.rung >= 3) matured += 1; // 60 days or longer
  }
  return { seen, total: prompts.length, matured };
}
