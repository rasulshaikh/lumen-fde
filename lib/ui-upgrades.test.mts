import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/plan" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window; globals.document = dom.window.document; globals.localStorage = dom.window.localStorage; globals.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function() {};
const React = await import("react"); globals.React = React;
const { createRoot } = await import("react-dom/client");
const { Plan } = await import("../components/Plan.tsx");
const { planRows } = await import("../components/shared.tsx");
const { Mocks } = await import("../components/Mocks.tsx");
const { WorkspaceProvider } = await import("../components/WorkspaceState.tsx");
const { mockStorageKey } = await import("./workspace-state.ts");
const container = document.getElementById("root")!, root = createRoot(container), original = globalThis.fetch;
const noop = () => {};
const props = { filtered: planRows, query: "", setQuery: noop, track: "All tracks", setTrack: noop, month: "All months", setMonth: noop, progress: "All progress", setProgress: noop, expanded: null as number | null, setExpanded: noop, statuses: {}, progressSync: "ready" as const, retryProgress: noop, setStatus: noop, setAskTopic: noop, setAskOpen: noop, setAskText: noop, renderSyllabus: () => React.createElement('p', {}, 'Syllabus fixture') };
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find((button) => (button.getAttribute('aria-label') || button.textContent || '').includes(label));
  assert.ok(button, label); assert.equal(button.disabled, false, label);
  await React.act(async () => { button.click(); });
};
try {
  await React.act(async () => root.render(React.createElement(Plan, props)));
  assert.equal(container.querySelectorAll('.topic-toggle').length, 12);
  await click('Next');
  assert.equal(container.querySelector('.topic-toggle strong')!.textContent, String(planRows[12][2]));
  await React.act(async () => root.render(React.createElement(Plan, { ...props, expanded: 90 })));
  assert.ok(container.querySelector('#syllabus-90'), 'deep link lands on the expanded topic page');
  let snapshot: Record<string, { value: unknown; revision: string; updatedAt: string }> = {}, offline = false;
  const key = mockStorageKey('Recruiter-screen narrative recordings');
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') {
      if (offline) throw new Error('offline');
      const job = JSON.parse(String(init.body));
      if ((snapshot[job.key]?.revision ?? null) !== job.expected) return Response.json({}, { status: 409 });
      const entry = { value: job.value, revision: job.mutationId, updatedAt: new Date().toISOString() }; snapshot = { ...snapshot, [job.key]: entry };
      return Response.json({ entry });
    }
    return Response.json({ entries: snapshot });
  };
  await React.act(async () => root.render(React.createElement(WorkspaceProvider, { key: 'device-a' }, React.createElement(Mocks, {}))));
  await click('Recruiter-screen narrative recordings');
  await click('Record one Recruiter');
  assert.equal(snapshot[key].value, 1);
  await React.act(async () => root.render(React.createElement(WorkspaceProvider, { key: 'device-b' }, React.createElement(Mocks, {}))));
  assert.match(container.textContent!, /1 \/ 3/);
  await click('Recruiter-screen narrative recordings');
  offline = true; await click('Record one Recruiter');
  assert.match(container.textContent!, /sync is unavailable/);
  offline = false; await click('Retry sync');
  assert.equal(snapshot[key].value, 2, 'queued change survives an outage and retries');
  snapshot[key] = { value: 1, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() };
  await click('Record one Recruiter');
  assert.match(container.textContent!, /newer workspace edit/);
  assert.equal(snapshot[key].value, 1, 'another device is never overwritten by stale state');
  await click('Load latest'); assert.match(container.textContent!, /1 of 3 repetitions/);
  console.log('Mounted UX: 12-topic pagination, deep-linked row, shared mock count, queued retry and cross-device conflict recovery passed.');
} finally { await React.act(async () => root.unmount()); globalThis.fetch = original; dom.window.close(); }
