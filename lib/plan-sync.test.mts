/** A failed progress read must offer retry while keeping writes disabled. Render the
 * component through React: pagination now owns hooks, so direct function calls are invalid. */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/plan" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window; globals.document = dom.window.document; globals.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
const React = await import("react"); globals.React = React;
const { createRoot } = await import("react-dom/client");
const { Plan } = await import("../components/Plan.tsx");
const { planRows } = await import("../components/shared.tsx");
const noop = () => {}, container = document.getElementById('root')!, root = createRoot(container);
let retries = 0;
const retryProgress = () => { retries++; };
const props = (progressSync: "loading" | "ready" | "failed") => ({ filtered: planRows.slice(0, 3), query: "", setQuery: noop, track: "All tracks", setTrack: noop, month: "All months", setMonth: noop, progress: "All progress", setProgress: noop, expanded: null, setExpanded: noop, statuses: {}, progressSync, retryProgress, setStatus: noop, setAskTopic: noop, setAskOpen: noop, setAskText: noop, renderSyllabus: () => null });
try {
  for (const state of ['failed', 'loading', 'ready'] as const) {
    await React.act(async () => root.render(React.createElement(Plan, props(state))));
    const retry = container.querySelector<HTMLButtonElement>('.plan-sync-retry');
    assert.equal(!!retry, state === 'failed');
    assert.equal(container.querySelectorAll('.status-select').length, 3);
    for (const select of container.querySelectorAll<HTMLSelectElement>('.status-select')) assert.equal(select.disabled, state !== 'ready');
    if (state === 'failed') {
      assert.match(container.textContent!, /Progress could not be loaded/);
      assert.match(container.querySelector('.status-select')!.getAttribute('title')!, /Use the retry above the table/);
      assert.equal(retry!.type, 'button');
      await React.act(async () => retry!.click()); assert.equal(retries, 1);
      assert.ok(!container.textContent!.includes('Refresh to try again'));
    }
  }
  console.log('Plan sync: visible retry invokes callback, no warning while loading/ready, and writes stay disabled until progress is loaded.');
} finally { await React.act(async () => root.unmount()); dom.window.close(); }
