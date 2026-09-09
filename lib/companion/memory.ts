/**
 * What the companion remembers between sessions.
 *
 * Quaere answers well and forgets everything. Over a 23-month plan that is the difference
 * between a search box with good context and a study partner: it re-explains what it explained
 * last week, cannot notice that the same confusion has come back three times, and has no way to
 * say "you have not opened Track C yet".
 *
 * **Scope was decided explicitly: study facts, not transcripts.** Whole conversations would put
 * every question ever asked into git history and grow the repo without bound for a marginal gain
 * over the digest below. What is kept is the shape of the studying - which topics keep coming
 * back, what has already been explained, and how many sessions have closed.
 *
 * Two storage shapes, and the difference is not incidental:
 *
 *   - `memory.json` is an INVENTORY. It is rewritten, so it is read whole and written whole with
 *     its `sha`, exactly like `reports/review/state.json`. Sending a stale sha is how two writers
 *     silently clobber each other, which is why `writeJson` refuses without one.
 *   - `sessions/` is a HISTORY. One file per closed session, never edited, never deleted, and
 *     written with no `sha` so the contents API itself refuses an overwrite - append-only
 *     enforced by the protocol rather than by everyone remembering, the same discipline
 *     `lib/artifacts.ts` uses and for the same reason.
 *
 * Every function that shapes memory is pure and takes `now` as a parameter. Same rule as
 * `lib/motivation.ts` and `lib/market/insight.ts`: a fact that can only be produced by a live
 * call is one nobody can test, and one nobody tests is one nobody trusts.
 */
import { readJson, writeJson } from "@/lib/market/store";

export const MEMORY_PATH = "reports/companion/memory.json";
export const SESSIONS_DIR = "reports/companion/sessions";

/**
 * How many entries each list keeps.
 *
 * Bounded on purpose. An unbounded digest is a file that grows every time the companion is used
 * and is read whole on every request that wants it - it would degrade quietly for months before
 * anyone noticed, which is the worst failure shape available. 40 is comfortably more than the
 * plan's 15 tracks and enough to hold a long tail of recurring confusions.
 */
export const MAX_ENTRIES = 40;

/** Longest remembered phrase. Caps a pathological paste, not a normal question. */
export const MAX_PHRASE = 120;

/** One remembered thing, and how often and how recently it has come up. */
export type Note = {
  /** Normalised: trimmed, collapsed whitespace, capped at MAX_PHRASE. */
  key: string;
  count: number;
  /** UTC day of the most recent occurrence, `YYYY-MM-DD`. */
  last: string;
};

export type Memory = {
  version: 1;
  /** UTC day this digest was last changed. */
  updated: string;
  /** Topics the reader has said, or been observed, to find hard. */
  struggled: Note[];
  /** Topics the companion has already explained, so it can stop repeating itself. */
  explained: Note[];
  /** Questions asked more than once. A `count` of 1 is not interesting and is not kept. */
  asked: Note[];
  /** Closed sessions ever recorded. A count, not a list - the list is `sessions/`. */
  sessions: number;
};

export const emptyMemory = (): Memory => ({
  version: 1,
  updated: "",
  struggled: [],
  explained: [],
  asked: [],
  sessions: 0,
});

/** UTC day. Matches `lib/review.ts`'s `today` and the day the progress events are keyed on. */
export const day = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Normalise a remembered phrase.
 *
 * Case and whitespace are collapsed so "K8s probes" and "k8s  probes" are one memory rather than
 * two half-remembered ones. Returns "" for anything that normalises to nothing, and every caller
 * treats "" as "do not remember this" - an empty key would otherwise occupy a slot in a bounded
 * list forever.
 */
export function normalise(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_PHRASE);
}

/**
 * Record one occurrence, newest first.
 *
 * Moves the entry to the front so the cap drops what has been quiet longest rather than what was
 * added longest ago - a confusion that recurred yesterday must outrank one that recurred once in
 * March, or the cap would evict exactly the memories worth having.
 */
export function note(list: Note[], value: string, now: Date, cap = MAX_ENTRIES): Note[] {
  const key = normalise(value);
  if (!key) return list;
  const existing = list.find((n) => n.key === key);
  const rest = list.filter((n) => n.key !== key);
  const entry: Note = { key, count: (existing?.count ?? 0) + 1, last: day(now) };
  return [entry, ...rest].slice(0, cap);
}

/**
 * Everything one closed session, or one answered question, adds to the digest.
 *
 * A single entry point rather than four setters, because the `updated` day must move whenever
 * anything else does and a caller that forgets it produces a digest that looks stale while being
 * current.
 */
export type MemoryUpdate = {
  struggled?: string[];
  explained?: string[];
  asked?: string[];
  /** True only when a session actually closed. Asking a question is not a session. */
  sessionClosed?: boolean;
};

export function applyMemory(memory: Memory, update: MemoryUpdate, now: Date): Memory {
  let next: Memory = { ...memory, version: 1 };
  for (const value of update.struggled ?? []) next = { ...next, struggled: note(next.struggled, value, now) };
  for (const value of update.explained ?? []) next = { ...next, explained: note(next.explained, value, now) };
  for (const value of update.asked ?? []) next = { ...next, asked: note(next.asked, value, now) };
  if (update.sessionClosed) next = { ...next, sessions: next.sessions + 1 };
  const changed =
    next.struggled !== memory.struggled ||
    next.explained !== memory.explained ||
    next.asked !== memory.asked ||
    next.sessions !== memory.sessions;
  // Only stamp when something actually moved. A digest whose `updated` advances on every no-op
  // read cannot be used to answer "has anything happened lately", which is one of the few
  // questions it exists to answer.
  return changed ? { ...next, updated: day(now) } : memory;
}

/**
 * Questions worth showing the reader: asked more than once, most recent first.
 *
 * A question asked once is a question, not a pattern. This is the read the brief uses, so the
 * threshold lives here rather than at each call site.
 */
export function recurring(memory: Memory, min = 2): Note[] {
  return memory.asked.filter((n) => n.count >= min);
}

/**
 * Read the digest.
 *
 * Follows the one rule `lib/market/store.ts` states for every reader in this codebase:
 * `synced: false` means "we do not know", never "there is nothing". A companion that treats a
 * GitHub outage as an empty memory would greet a reader of eighteen months as a stranger.
 */
export async function readMemory(): Promise<{ memory: Memory; sha: string | null; synced: boolean }> {
  const { data, sha, synced } = await readJson<Memory>(MEMORY_PATH);
  if (!synced) return { memory: emptyMemory(), sha: null, synced: false };
  return { memory: data ? { ...emptyMemory(), ...data, version: 1 } : emptyMemory(), sha, synced: true };
}

export async function writeMemory(memory: Memory, sha: string | null) {
  return writeJson(MEMORY_PATH, memory, sha, `companion: update ${MEMORY_PATH}`);
}
