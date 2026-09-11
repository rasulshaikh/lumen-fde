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
import { LESSONS } from "./lessons/index.ts";
import { MACHINES } from "./machines/index.ts";
import { MACHINE_STATE_KEY, toStorage, readUnfinished } from "./machines/unfinished.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { url: "https://lumen.test/machines", pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
// next/link reaches for `self` through its idle-callback shim, which is a browser global rather
// than a property of the jsdom window object.
g.self = dom.window;
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
const { Machines, MachineView } = await import("../components/Machine.tsx");
const { LessonView } = await import("../components/Lesson.tsx");

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
  // The heading, not the page text. Every machine's title appears in the picker, so asking whether
  // the document mentions a title answers a different question from which machine is open - and the
  // check that used to live here passed because it happened to name a title the picker abbreviates.
  const heading = host.querySelector(".mx-panel .panel-head h2")?.textContent ?? "";
  ck("the broken machine is the one on screen", /Kubernetes: scheduling a pod/.test(heading), heading);
  ck("not the default first machine", heading !== MACHINES[0].title, `${heading} vs ${MACHINES[0].title}`);
  ck("and every machine is reachable from the picker", host.querySelectorAll(".mx-pick").length === MACHINES.length,
    String(host.querySelectorAll(".mx-pick").length));
  ck("and the fault is shown as still set", /Broken: Cordon node-a/.test(text), "");

  await unmount();
  ck("unmounting does not clear it either", store.getItem(MACHINE_STATE_KEY) === seed);
}

console.log("every machine survives the real renderer");
{
  // Twenty-three machines existed and exactly one of them had ever been through this component.
  // `lib/machines.test.mts` proves scene() is pure and in-bounds, which is a claim about the data;
  // it says nothing about whether the renderer can draw it. Every machine is mounted here at every
  // step, with every fault on - the state that exercises the short-circuit branches, which are the
  // ones most likely to return a node id no edge refers to.
  let broken = 0;
  for (const m of MACHINES) {
    const allFaults = m.faults.map((f) => f.id);
    for (const faults of [[], allFaults]) {
      for (let step = 0; step < m.steps.length; step++) {
        const { host, unmount } = await mount(createElement(MachineView, { machine: m, initial: { step, faults } }));
        const svg = host.querySelector(".mx-stage");
        const where = `${m.id} step ${step}${faults.length ? " all-faults" : ""}`;
        if (!svg) { broken++; console.log(`  FAIL ${where}: no stage rendered`); }
        else {
          // A NaN coordinate is an invisible element rather than an error: nothing throws and
          // nothing draws. Checked on ATTRIBUTES only, not on the markup as a whole - the
          // training-loop machine legitimately prints the text "NaN" as a node note, because a
          // weight that has become NaN is the thing it teaches. A guard broad enough to catch
          // that is the "cap so tight the content is unreachable" defect wearing a test's clothes.
          const bad: string[] = [];
          for (const el of svg.querySelectorAll("*")) {
            for (const a of Array.from(el.attributes)) {
              if (/NaN|Infinity|undefined|null/.test(a.value)) bad.push(`${el.tagName}.${a.name}="${a.value}"`);
            }
          }
          if (bad.length) { broken++; console.log(`  FAIL ${where}: ${bad.slice(0, 3).join(" ")}`); }
        }
        if (svg) {
          const drawn = svg.querySelectorAll(".mx-node").length;
          const expected = m.scene(step, 0.5, faults).nodes.length;
          if (drawn !== expected) { broken++; console.log(`  FAIL ${where}: drew ${drawn} nodes, scene has ${expected}`); }
        }
        // The caption is the whole point of the step; an empty one is a blank screen.
        const cap = host.querySelector(".mx-caption")?.textContent?.trim() ?? "";
        if (cap.length < 10) { broken++; console.log(`  FAIL ${where}: caption is "${cap}"`); }
        await unmount();
      }
    }
  }
  ck(`all ${MACHINES.length} machines render at every step, clean and broken`, broken === 0, `${broken} bad renders`);
}

console.log("every lesson survives the real renderer, at both ends of its range");
{
  // Same gap as the machines: twenty-one lessons and nothing had ever mounted one. The failure
  // this is looking for has already happened once - bandwidth-delay and kv-cache put their whole
  // subject inside about 1% of a linear axis, so the handle was unreachable by pointer. The pure
  // suite caught the mechanical half of that (an orphaned handle) and could not see the rest.
  // Driving to each extreme through the keyboard path is what exercises the clamping.
  let broken = 0;
  const badAttrs = (el: Element | null) => {
    const out: string[] = [];
    if (!el) return out;
    for (const n of el.querySelectorAll("*")) {
      for (const a of Array.from(n.attributes)) {
        if (/NaN|Infinity|undefined|null/.test(a.value)) out.push(`${n.tagName}.${a.name}="${a.value}"`);
      }
    }
    return out;
  };

  for (const l of LESSONS) {
    const { host, unmount } = await mount(createElement(LessonView, { lesson: l }));
    const handleParam = l.params.find((q) => q.id === l.handles[0]?.param);
    const grip = host.querySelector('[role="slider"]') as HTMLElement | null;
    if (!handleParam || !grip) {
      broken++; console.log(`  FAIL ${l.id}: no draggable handle rendered`);
      await unmount(); continue;
    }
    // PageUp/PageDown move by ten steps, so this is the press count that reaches either end.
    const presses = Math.ceil((handleParam.max - handleParam.min) / (handleParam.step * 10)) + 2;
    for (const [end, key] of [["rest", ""], ["min", "PageDown"], ["max", "PageUp"]] as const) {
      if (key) {
        await act(async () => {
          for (let i = 0; i < (end === "max" ? presses * 2 : presses); i++) {
            grip.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true }));
          }
        });
      }
      const stage = host.querySelector(".ls-stage");
      const where = `${l.id} at ${end}`;
      const bad = badAttrs(stage);
      if (!stage) { broken++; console.log(`  FAIL ${where}: no stage`); }
      else if (bad.length) { broken++; console.log(`  FAIL ${where}: ${bad.slice(0, 3).join(" ")}`); }
      // The handle is the entire interaction. If it stops being drawn at an extreme, the lesson
      // is a picture at that end of its range.
      if (!host.querySelector(".ls-handle circle")) { broken++; console.log(`  FAIL ${where}: handle not drawn`); }
      const cap = host.querySelector(".ls-caption")?.textContent?.trim() ?? "";
      if (cap.length < 10) { broken++; console.log(`  FAIL ${where}: caption is "${cap}"`); }
      const readouts = host.querySelectorAll(".ls-readouts dd");
      if (!readouts.length) { broken++; console.log(`  FAIL ${where}: no readouts`); }
      for (const rd of readouts) {
        const t = rd.textContent ?? "";
        if (/NaN|Infinity|undefined/.test(t)) { broken++; console.log(`  FAIL ${where}: readout reads "${t}"`); }
      }
    }
    await unmount();
  }
  ck(`all ${LESSONS.length} lessons render at rest and at both extremes`, broken === 0, `${broken} bad renders`);
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

  // The first fault toggle on whichever machine the page opens by default.
  const toggle = host.querySelector(".mx-fault-toggle") as HTMLButtonElement | null;
  ck("there is a fault toggle to press", !!toggle);
  await act(async () => { toggle!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  const written = store.getItem(MACHINE_STATE_KEY);
  ck("pressing it records the break", written !== null, String(written));
  const found = readUnfinished(written, MACHINES);
  ck("under the right machine", found?.machine.id === MACHINES[0].id, `${found?.machine.id} vs ${MACHINES[0].id}`);
  ck("with the fault that was pressed", found?.state.faults.includes(MACHINES[0].faults[0].id) === true, JSON.stringify(found?.state.faults));

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


console.log("running a command does not throw the keyboard user back to the top");
{
  // Disabling a control while it holds focus removes it from the tab order, and the browser drops
  // focus to <body>. A keyboard user lost their place after every single command and had to tab in
  // from the top of the document again. Both handlers dedupe, so nothing needed the disabled state.
  const { IncidentView } = await import("../components/Incident.tsx");
  const { INCIDENTS } = await import("./incidents/index.ts");
  const { host, unmount } = await mount(createElement(IncidentView, { incident: INCIDENTS[0] } as never));

  const cmd = host.querySelector(".inc-cmd") as HTMLButtonElement;
  ck("there is a command to run", !!cmd);
  cmd.focus();
  ck("it can hold focus", dom.window.document.activeElement === cmd);

  await act(async () => { cmd.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ck("the command ran", !!host.querySelector(".inc-term"));
  ck("and focus is still on the button, not on the body", dom.window.document.activeElement === cmd,
    String(dom.window.document.activeElement?.tagName));
  ck("the button is not disabled", cmd.disabled === false);
  ck("it is marked as spent visually instead", cmd.className.includes("is-run"));

  // A second press must be a no-op rather than a duplicate terminal block.
  await act(async () => { cmd.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ck("pressing it again adds nothing", host.querySelectorAll(".inc-out").length === 1,
    `${host.querySelectorAll(".inc-out").length} blocks`);

  const fix = host.querySelector(".inc-fix") as HTMLButtonElement;
  fix.focus();
  await act(async () => { fix.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ck("the same holds for a fix", dom.window.document.activeElement === fix && fix.disabled === false);

  await unmount();
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
