/**
 * Plan progress-sync tests. Run with:  npx tsx lib/plan-sync.test.mts
 *
 * This suite exists because of a specific bug, and it is written to catch that bug's whole class
 * rather than its one instance.
 *
 * `progressSync: "failed"` was terminal. The fetch ran in an effect with an empty dependency array
 * and `.catch(() => setProgressSync("failed"))` had no other writer, so a single 502 from
 * /api/progress - which happens whenever GITHUB_TOKEN is missing or GitHub is briefly unreachable -
 * disabled the status control on all 119 plan rows for the rest of the session. The only thing on
 * screen that acknowledged this was a `title` tooltip on a **disabled** `<select>`, which is
 * invisible to keyboard and screen-reader users, and its text told the reader to refresh.
 *
 * So the assertions come in two halves:
 *
 * 1. **The escape hatch is on screen and reachable.** Rendered, not read out of the source, and in
 *    the failed state specifically - the state a prerender never reaches, which is how the missing
 *    affordance survived a build, fifteen suites and a live deploy.
 * 2. **The button calls the real callback.** Presence is not wiring. This repo has now shipped five
 *    controls that looked like they did something and did not - an aim toggle whose state nothing
 *    read, a "Try again" whose guard returned first, a record button that reported success without
 *    a request. Markup cannot tell those apart from a working control, so this walks the element
 *    tree and asserts identity against the function that was passed in.
 *
 * The write guard is asserted too, in the same breath: the controls must STAY disabled while the
 * sync is unsettled. Being unable to leave the failed state was the bug; being able to write to a
 * baseline that never loaded would be a worse one.
 */
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Plan } from "../components/Plan.tsx";
import { planRows, type Row } from "../components/shared.tsx";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const noop = () => {};
const retryProgress = () => {};
const rows: Row[] = planRows.slice(0, 3);

const props = (progressSync: "loading" | "ready" | "failed") => ({
  filtered: rows, query: "", setQuery: noop, track: "All tracks", setTrack: noop,
  month: "All months", setMonth: noop, progress: "All progress", setProgress: noop,
  expanded: null, setExpanded: noop, statuses: {}, progressSync, retryProgress,
  setStatus: noop, setAskTopic: noop, setAskOpen: noop, setAskText: noop,
  renderSyllabus: () => null,
});

const html = (state: "loading" | "ready" | "failed") =>
  renderToStaticMarkup(createElement(Plan, props(state) as never));

/** Every element in the tree the component returns, depth first. */
function walk(node: ReactNode, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) { for (const child of node) walk(child, out); return out; }
  if (!isValidElement(node)) return out;
  const p = node.props as Record<string, unknown>;
  out.push({ ...p, __type: node.type });
  walk(p.children as ReactNode, out);
  return out;
}

console.log("the failed sync offers a way out, on screen");
{
  const failed = html("failed");
  ck("the state is stated in words, not only in a tooltip", /could not be loaded/.test(failed), failed.slice(failed.indexOf("plan-sync"), failed.indexOf("plan-sync") + 90));
  ck("a real button is rendered", /<button[^>]*class="plan-sync-retry"/.test(failed));
  ck("and it is a button, not a link dressed as one", !/<a[^>]*plan-sync-retry/.test(failed));
  ck("it says what pressing it does", /Try loading it again/.test(failed));

  // The sentence has to explain WHY the rows look wrong, or the reader concludes their progress is
  // gone. Unknown must not read as none - the same rule the recall and artifacts blocks are held to.
  ck("it explains that the rows show a default, not the reader's real status", /rather than your real status/.test(failed));
  ck("and it does not claim the progress was lost", !/\blost\b|\bgone\b|\bdeleted\b/i.test(failed));
}

console.log("the way out is not offered when there is nothing to escape");
{
  ck("a ready sync shows no warning", !/plan-sync/.test(html("ready")));
  // "loading" is the state every single page load starts in. A warning there would cry wolf on
  // every visit and be ignored by the time it mattered.
  ck("a loading sync shows no warning either", !/plan-sync/.test(html("loading")));
}

console.log("the button calls the callback it was given");
{
  // The assertion this suite exists for. Markup proves a button is on screen; it cannot prove the
  // button does anything. Identity against the passed function can.
  const tree = walk(Plan(props("failed") as never));
  const retryButtons = tree.filter((n) => n.className === "plan-sync-retry");
  ck("exactly one retry control exists", retryButtons.length === 1, `found ${retryButtons.length}`);
  ck("its onClick IS retryProgress, not a fresh no-op", retryButtons[0]?.onClick === retryProgress);
  ck("it is typed button, so it cannot submit an enclosing form", retryButtons[0]?.type === "button");

  const ready = walk(Plan(props("ready") as never)).filter((n) => n.className === "plan-sync-retry");
  ck("and it does not exist at all when the sync is fine", ready.length === 0);
}

console.log("the write guard survives the escape hatch");
{
  // Adding a way out must not add a way in. Writes are POSTs that commit permanently to the
  // reader's own repo, and the baseline they would be written against never loaded.
  for (const state of ["loading", "failed"] as const) {
    const selects = walk(Plan(props(state) as never)).filter((n) => n.className === "status-select");
    ck(`${state}: every status control is still disabled`, selects.length > 0 && selects.every((s) => s.disabled === true), `${selects.length} controls`);
  }
  const ready = walk(Plan(props("ready") as never)).filter((n) => n.className === "status-select");
  ck("ready: the controls are writable again", ready.length > 0 && ready.every((s) => s.disabled === false));
}

console.log("the old instruction is gone");
{
  // It said "Refresh to try again." That was true when reloading was the only escape. Leaving it
  // next to a retry button is this repo's most-shipped defect: a sentence asserting something the
  // code no longer does.
  const failed = html("failed");
  ck("nothing tells the reader to refresh any more", !/Refresh to try again/.test(failed), failed.match(/Refresh[^"<]*/)?.[0] ?? "");
  ck("the tooltip points at the button instead", /Use the retry above the table/.test(failed));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
