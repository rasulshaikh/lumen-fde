import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/overview" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window; globals.document = dom.window.document;
globals.localStorage = dom.window.localStorage;
globals.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
const React = await import("react");
globals.React = React;
const { createRoot } = await import("react-dom/client");
const { ShippedWall } = await import("../components/ShippedWall.tsx");
const { BriefPanel } = await import("../components/Brief.tsx");
const { Plan } = await import("../components/Plan.tsx");
const { buildBrief } = await import("./companion/brief.ts");
const { planRows } = await import("../components/shared.tsx");
const container = document.getElementById("root")!;
const root = createRoot(container);
const realFetch = globalThis.fetch;
let calls = 0;
let invalidations = 0;
let resolveRequest: (value: Response) => void = () => {};
globalThis.fetch = async (_input, init) => {
  calls++;
  assert.equal(init?.method, "POST");
  const payload = JSON.parse(String(init?.body));
  assert.equal(payload.row, 1);
  assert.equal(payload.title, "Cleanup CLI");
  assert.equal(payload.url, "https://example.test/proof");
  return new Promise<Response>((resolve) => { resolveRequest = resolve; });
};
const click = async (text: string) => {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  assert.ok(button, `button exists: ${text}`);
  await React.act(async () => { button.click(); });
};
const fill = async (label: string, value: string) => {
  const element = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label));
  assert.ok(element);
  const input = document.getElementById(element.htmlFor) as HTMLInputElement;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};
try {
  await React.act(async () => { root.render(React.createElement(ShippedWall, {
    feed: { loading: false, artifacts: [], unreadable: 0, synced: true, error: null },
    planCount: planRows.length, nextRow: planRows[0], nextIndex: 0, openPlan() {},
    onSaved() { invalidations++; },
  })); });
  await click("Record proof");
  assert.equal(calls, 0, "opening the form writes nothing");
  await fill("What did you build?", " Cleanup CLI ");
  await fill("Link to your work", "https://example.test/proof");
  await React.act(async () => {
    container.querySelector("form")!.requestSubmit();
    container.querySelector("form")!.requestSubmit();
  });
  assert.equal(calls, 1, "duplicate submission is blocked while saving");
  await React.act(async () => { resolveRequest(Response.json({ error: "Try later" }, { status: 502 })); });
  assert.match(container.querySelector('[role="alert"]')!.textContent!, /Try later/);
  assert.equal(container.querySelectorAll("input")[0].value, " Cleanup CLI ", "failed save retains input");
  await React.act(async () => { container.querySelector("form")!.requestSubmit(); });
  assert.equal(calls, 2, "failed save can be retried");
  await React.act(async () => { resolveRequest(Response.json({ saved: true, path: "reports/artifacts/test.md", url: null,
    artifact: { row: 1, topic: String(planRows[0][2]), title: "Cleanup CLI", url: "https://example.test/proof", date: "2026-11-05T00:00:00Z", notes: null },
  })); });
  assert.equal(invalidations, 1, "successful save invalidates the home cache");
  assert.ok(container.querySelector('a[href="https://example.test/proof"]'), "saved proof appears immediately");
  assert.match(container.querySelector('[role="status"]')!.textContent!, /Proof recorded/);
  assert.equal(document.activeElement?.textContent, "Record proof", "focus returns to the trigger after saving");
  await click("Record proof"); await click("Cancel");
  assert.equal(calls, 2, "cancel never writes");

  const brief = buildBrief({ focus: { row: 1, topic: String(planRows[0][2]), status: "Not started", description: "Build a tested CLI", month: 1, hours: 14 }, parts: ["Cleanup traps"] }, new Date("2026-11-05"));
  await React.act(async () => { root.render(React.createElement(BriefPanel, { brief, readingUrl: null, onOpenPlan() {}, setStatus() {} })); });
  const session = container.querySelector(".session-box")!;
  const details = container.querySelector("details")!;
  assert.ok(session.compareDocumentPosition(details) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "session precedes optional context");
  assert.equal(details.open, false, "topic context starts collapsed");
  assert.match(container.textContent!, /14h for the whole topic/);
  const cleared: string[] = [];
  await React.act(async () => { root.render(React.createElement(Plan, {
    filtered: [], query: "no match", track: "track", month: "1", progress: "Done", expanded: null,
    statuses: {}, progressSync: "ready", renderSyllabus() { return null; }, retryProgress() {},
    setQuery(value) { cleared.push(value); }, setTrack(value) { cleared.push(value); },
    setMonth(value) { cleared.push(value); }, setProgress(value) { cleared.push(value); },
    setExpanded() {}, setStatus() {}, setAskTopic() {}, setAskOpen() {}, setAskText() {},
  })); });
  assert.match(container.textContent!, /No topics match/);
  await click("Clear filters");
  assert.deepEqual(cleared, ["", "All tracks", "All months", "All progress"]);
  assert.equal(container.querySelector('[aria-label="Filter by track"]')?.tagName, "SELECT");
  console.log("Workspace: proof saving and recovery, session hierarchy, and empty-filter recovery passed.");
} finally {
  await React.act(async () => { root.unmount(); });
  globalThis.fetch = realFetch; dom.window.close();
}
