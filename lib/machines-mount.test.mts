/**
 * Machine mount tests. Run with:  npx tsx lib/machines-mount.test.mts
 *
 * This suite exists because `lib/machines.test.mts` passed completely while the feature it covers
 * did not work at all.
 *
 * That suite tests `lib/machines/unfinished.ts` as pure logic, and the logic was correct. The bug
 * was in the ORDER two effects ran in. React commits passive effects bottom-up, child before
 * parent: `MachineView`'s persistence effect ran on mount with an empty fault list, took its
 * `removeItem` branch and deleted the saved bookmark, and only then did the parent `Machines`
 * effect read the key it had just erased. Resume never fired once, and the Overview strip's "Pick
 * it back up" button was actively destructive - it landed you on the wrong machine with nothing
 * broken and took the bookmark with it.
 *
 * No pure-function test can see that, because nothing pure is wrong. So this one mounts the real
 * components into a real DOM and asserts what is in storage afterwards, which is the only place
 * the defect was ever visible.
 */
import { JSDOM } from "jsdom";
import { MACHINES } from "./machines/index.ts";
import { MACHINE_STATE_KEY, toStorage, readUnfinished } from "./machines/unfinished.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { url: "https://lumen.test/machines", pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// Node 22 defines `navigator` as a getter-only global, so it is redefined rather than assigned.
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
// The components call bare `localStorage`, which resolves to globalThis - NOT dom.window. Without
// this line every access throws ReferenceError, both try/catch blocks swallow it, and the suite
// passes while exercising nothing. That is exactly the shape of the bug being tested for.
g.localStorage = dom.window.localStorage;
// jsdom does not implement matchMedia, and MachineView reads it to honour prefers-reduced-motion.
// A stub answering "no preference" is the branch under test here; the reduced-motion branch is
// asserted separately below.
const mql = (matches: boolean) => ({ matches, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
let prefersReduced = false;
(dom.window as unknown as Record<string, unknown>).matchMedia = (q: string) => mql(prefersReduced && /reduce/.test(q));
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
g.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) ?? ((id: number) => clearTimeout(id));
g.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { Machines } = await import("../components/Machine.tsx");

const store = dom.window.localStorage;
const mount = async (node: unknown) => {
  const host = dom.window.document.getElementById("root")!;
  host.innerHTML = "";
  const root = createRoot(host);
  await act(async () => { root.render(node as never); });
  return { host, unmount: async () => { await act(async () => { root.unmount(); }); } };
};

console.log("visiting /machines does not destroy the bookmark it is supposed to restore");
{
  // The exact defect. Seed a broken machine the way the runner would, then mount the page.
  const seed = toStorage("k8s", ["cordon-a"], 2);
  store.setItem(MACHINE_STATE_KEY, seed);

  const { host, unmount } = await mount(createElement(StrictMode, null, createElement(Machines)));

  const after = store.getItem(MACHINE_STATE_KEY);
  ck("the record survives the mount", after !== null, String(after));
  ck("and is unchanged", after === seed, `${after}`);
  ck("it is still readable as the same machine", readUnfinished(after, MACHINES)?.machine.id === "k8s");

  // And the restore actually happened - the page opened the machine that was broken, not the first
  // one in the list.
  const text = host.textContent ?? "";
  ck("the broken machine is the one on screen", /Kubernetes: scheduling a pod/.test(text), text.slice(0, 70));
  ck("not the default first machine", !/TCP: a connection, and a packet/.test(text));
  ck("and the fault is shown as still set", /Broken: Cordon node-a/.test(text), "");

  await unmount();
  ck("unmounting does not clear it either", store.getItem(MACHINE_STATE_KEY) === seed);
}

console.log("a visit that changes nothing writes nothing");
{
  store.removeItem(MACHINE_STATE_KEY);
  const { unmount } = await mount(createElement(StrictMode, null, createElement(Machines)));
  ck("no key is created by simply looking at the page", store.getItem(MACHINE_STATE_KEY) === null, String(store.getItem(MACHINE_STATE_KEY)));
  await unmount();
}

console.log("breaking something still writes it");
{
  store.removeItem(MACHINE_STATE_KEY);
  const { host, unmount } = await mount(createElement(Machines));

  // The first fault toggle on the default machine (TCP / drop the SYN-ACK).
  const toggle = host.querySelector(".mx-fault-toggle") as HTMLButtonElement | null;
  ck("there is a fault toggle to press", !!toggle);
  await act(async () => { toggle!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  const written = store.getItem(MACHINE_STATE_KEY);
  ck("pressing it records the break", written !== null, String(written));
  const found = readUnfinished(written, MACHINES);
  ck("under the right machine", found?.machine.id === "tcp", found?.machine.id);
  ck("with the fault that was pressed", found?.state.faults.includes("drop-synack") === true, JSON.stringify(found?.state.faults));

  // And un-pressing it clears deliberately, which must still work now that mounts do not write.
  await act(async () => { toggle!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ck("un-breaking it clears the record on purpose", store.getItem(MACHINE_STATE_KEY) === null, String(store.getItem(MACHINE_STATE_KEY)));

  await unmount();
}

console.log("switching machines by hand does not delete what you broke");
{
  // The second half of the same defect: `pick` remounts MachineView with an empty fault list, and
  // the old persistence effect deleted the bookmark for the machine you had actually broken.
  store.setItem(MACHINE_STATE_KEY, toStorage("k8s", ["cordon-a"], 2));
  const { host, unmount } = await mount(createElement(Machines));

  const picks = [...host.querySelectorAll(".mx-pick")] as HTMLButtonElement[];
  ck("the picker lists every machine", picks.length === MACHINES.length, `${picks.length}`);
  await act(async () => { picks[0].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  ck("looking at a different machine keeps the bookmark", store.getItem(MACHINE_STATE_KEY) !== null, String(store.getItem(MACHINE_STATE_KEY)));
  ck("and it still names the machine that is broken", readUnfinished(store.getItem(MACHINE_STATE_KEY), MACHINES)?.machine.id === "k8s");

  await unmount();
}


console.log("reduced motion still advances the sequence, without sliding");
{
  // The CSS rule that used to sit on these tokens suppressed a transition that was never declared,
  // so the preference was documented and not honoured. It is honoured in the component now, and
  // this is the assertion that keeps it that way.
  store.removeItem(MACHINE_STATE_KEY);
  prefersReduced = true;
  const { host, unmount } = await mount(createElement(Machines));

  const play = [...host.querySelectorAll(".mx-btn")].find((b) => /Play/.test(b.textContent ?? "")) as HTMLButtonElement;
  ck("there is a Play control", !!play);
  await act(async () => { play.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  // Under reduced motion the step is placed at its end state immediately rather than interpolated,
  // so the token sits on the node it arrived at rather than partway along the edge.
  const token = host.querySelector(".mx-token circle");
  ck("a token is on screen", !!token);
  const cx = Number(token?.getAttribute("cx"));
  const nodes = [...host.querySelectorAll(".mx-node rect")].map((r) => Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2);
  const onANode = nodes.some((n) => Math.abs(n - cx) < 0.001);
  ck("it is parked on a node, not mid-flight", onANode, `cx ${cx} vs nodes ${nodes.join(",")}`);

  prefersReduced = false;
  await unmount();
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
