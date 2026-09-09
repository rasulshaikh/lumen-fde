/**
 * Who this instance of Lumen belongs to.
 *
 * The routed-pages spec asked for this file and it was never created, so the facts it holds were
 * scattered: the weekly target existed as editable client state AND as the literal string
 * "16h/week" typed into the daily digest and the login page, which is the same defect as every
 * other hand-written count this project has had to chase down — change the setting and two
 * sentences keep claiming the old number.
 *
 * **The boundary is what keeps this file honest: it holds only what cannot be derived.**
 *
 * Name, location, target role and the declared weekly target are facts about a person; nothing
 * computes them. Topic counts, hours, the month horizon and the syllabus size are facts about the
 * plan, and every one of them is read from `data/workbook.json` or `data/curriculum.json` at the
 * point of use. Putting `"horizonMonths": 23` in here would create a second source for a number
 * the workbook already owns, and the two would disagree the first time a row moved — which is
 * precisely how this codebase ended up advertising 916h that included work already skipped.
 *
 * So: if a value can be computed, it does not belong here, however convenient it would be.
 *
 * This is not a step toward multi-user. It is one place instead of five.
 */
import profile from "@/data/profile.json";

export type Profile = {
  name: string;
  location: string;
  targetRole: string;
  /**
   * The DECLARED weekly commitment, and the default the app starts from.
   *
   * Not the live value: the Overview lets this be edited and persists the override in
   * `localStorage` under `lumen-statuses`' sibling key, because the number a person is actually
   * managing to do is theirs to change without a commit. Server-side surfaces — the digest, the
   * login page — have no access to that override and use this, which is the declared intent and
   * the honest thing for them to state.
   */
  weeklyHours: number;
  repo: string;
};

export const PROFILE = profile as Profile;

/**
 * "16h/week", assembled once.
 *
 * Two server-rendered sentences wrote this by hand. A helper is not ceremony here — it is the
 * difference between changing the commitment in one place and remembering to change it in three.
 */
export const weeklyPace = () => `${PROFILE.weeklyHours}h/week`;

/**
 * Weeks of calendar time a number of study hours represents at the declared pace.
 *
 * Guards the zero case rather than returning Infinity: a weekly target of 0 is a paused plan,
 * not an infinitely long one, and "Infinity weeks" is the kind of string that reaches a screen.
 */
export const weeksAtPace = (hours: number, weekly = PROFILE.weeklyHours) =>
  weekly > 0 ? Math.round((hours / weekly) * 10) / 10 : null;
