import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='root'></div>", { url: "https://lumen.test/practice" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window; globals.document = dom.window.document; globals.localStorage = dom.window.localStorage; globals.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
const React = await import("react"); globals.React = React;
const { createRoot } = await import("react-dom/client");
const { RecallStrip } = await import("../app/recall.tsx");
const container = document.getElementById("root")!, root = createRoot(container), original = globalThis.fetch;
let recovered = false, saves = 0;
globalThis.fetch = async (input, init) => {
  if (String(input).includes('/api/recall')) return Response.json({ meta: { 1: { topic: 'Shell', track: 'Linux', outcomes: ['Explain cleanup'] } }, prompts: [{ i: 1, k: 'q1-0', kind: 'recall', p: 'Explain shell cleanup' }] });
  if (init?.method === 'PUT') {
    saves++;
    if (!recovered) return Response.json({ saved: false }, { status: 409 });
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.sha, 'b'.repeat(40));
    assert.equal(payload.state.other.seen, 3, 'retry retains a newer card from the other session');
    assert.equal(payload.state['q1-0'].seen, 1, 'retry retains the local grade');
    return Response.json({ saved: true, sha: 'c'.repeat(40) });
  }
  return Response.json({ synced: true, sha: (recovered ? 'b' : 'a').repeat(40), state: recovered ? { other: { rung: 1, seen: 3, due: '2026-11-06' } } : {} });
};
try {
  await React.act(async () => { root.render(React.createElement(RecallStrip, { startedTopics: [1] })); });
  const input = container.querySelector('textarea')!;
  assert.ok(input);
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Use a cleanup trap');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  const click = async (text: string) => {
    const button = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(text));
    assert.ok(button, text);
    await React.act(async () => { button.click(); });
  };
  await click('Reveal reference'); await click('Fluent');
  assert.match(container.textContent!, /Cloud sync unavailable/);
  assert.equal(JSON.parse(localStorage.getItem('lumen-review')!)['q1-0'].seen, 1);
  recovered = true; await click('Retry sync');
  assert.match(container.textContent!, /Review sync connected/); assert.equal(saves, 2);
  console.log('Mounted recall: failed save is visible, local grade survives and retry merges durable state with the current SHA.');
} finally { await React.act(async () => root.unmount()); globalThis.fetch = original; dom.window.close(); }
