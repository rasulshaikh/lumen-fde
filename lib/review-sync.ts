import type { ReviewState } from "./review";

export function validReviewState(value: unknown): value is ReviewState {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 2000) return false;
  return Object.entries(value).every(([key, card]) => {
    if (!/^[\w:.-]{1,120}$/.test(key) || !card || typeof card !== "object" || Array.isArray(card)) return false;
    const c = card as Record<string, unknown>;
    return Number.isInteger(c.rung) && Number(c.rung) >= 0 && Number(c.rung) <= 6
      && Number.isSafeInteger(c.seen) && Number(c.seen) >= 0
      && typeof c.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.due)
      && !Number.isNaN(Date.parse(c.due)) && new Date(c.due).toISOString().slice(0, 10) === c.due
      && (c.lastGrade === undefined || ["fluent", "halting", "gone"].includes(String(c.lastGrade)));
  });
}

/** Most observations win; ties keep the durable copy rather than overwrite another tab. */
export function mergeReview(local: ReviewState, remote: ReviewState): ReviewState {
  const merged = { ...remote };
  for (const [key, card] of Object.entries(local)) {
    if (!merged[key] || card.seen > merged[key].seen) merged[key] = card;
  }
  return merged;
}
