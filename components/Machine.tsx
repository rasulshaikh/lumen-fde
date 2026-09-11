"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MACHINES, machineById } from "@/lib/machines";
import { MACHINE_STATE_KEY, readUnfinished, toStorage } from "@/lib/machines/unfinished";
import { ease, scrubTo, type Dials } from "@/lib/machines/types";
import type { Machine as MachineDef, Scene, SceneNode } from "@/lib/machines/types";

/**
 * The renderer. It owns no logic about any system it draws.
 *
 * Everything interesting lives in `scene(step, phase, faults)`, which is pure and tested without a
 * browser in `lib/machines.test.mts`. This file turns a `Scene` into SVG and turns clicks into new
 * arguments for that function. If a behaviour here cannot be expressed as "the scene changed", it
 * is in the wrong file.
 *
 * ## The clock
 *
 * `phase` runs 0 to 1 inside the current step and is advanced by requestAnimationFrame. Two rules
 * this codebase keeps relearning apply: the clock is read inside an effect and never during
 * render, because a duration derived while rendering is a hydration mismatch; and the frame loop
 * is cancelled on unmount, because a loop left running against a dead component is a leak that
 * only shows up as a warm laptop.
 *
 * ## Why paused is the default
 *
 * A diagram that animates on its own is decoration. A diagram you step through is a thing you are
 * doing. It opens paused on step 0, and the first thing the controls invite is Step rather than
 * Play.
 */

const VIEW_W = 320;
const VIEW_H = 160;
const NODE_W = 66;
const NODE_H = 30;

/** One step takes this long at play speed. Slow enough to read the caption before it changes. */
const STEP_MS = 2200;

const centre = (n: SceneNode) => ({ x: n.x, y: n.y });

function tokenPoint(scene: Scene, from: string, to: string, at: number) {
  const a = scene.nodes.find((n) => n.id === from);
  const b = scene.nodes.find((n) => n.id === to);
  if (!a || !b) return null;
  const p = centre(a), q = centre(b);
  return { x: p.x + (q.x - p.x) * at, y: p.y + (q.y - p.y) * at };
}

function NodeBox({ node }: { node: SceneNode }) {
  const cls = ["mx-node", `mx-${node.kind}`, node.dim ? "is-dim" : "", node.down ? "is-down" : ""].filter(Boolean).join(" ");
  return (
    <g className={cls}>
      <rect x={node.x - NODE_W / 2} y={node.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx="5" />
      <text x={node.x} y={node.note ? node.y - 1 : node.y + 3} textAnchor="middle" className="mx-label">{node.label}</text>
      {node.note ? <text x={node.x} y={node.y + 9} textAnchor="middle" className="mx-note">{node.note}</text> : null}
    </g>
  );
}

export function MachineView({ machine, initial }: { machine: MachineDef; initial?: { step: number; faults: string[] } }) {
  const [step, setStep] = useState(initial?.step ?? 0);
  const [phase, setPhase] = useState(0.55);
  const [playing, setPlaying] = useState(false);
  const [faults, setFaults] = useState<string[]>(initial?.faults ?? []);
  const [dials, setDials] = useState<Dials>(() =>
    Object.fromEntries((machine.dials ?? []).map((d) => [d.id, d.value])));
  const stage = useRef<SVGSVGElement | null>(null);
  const raf = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  const last = machine.steps.length - 1;
  const scene = useMemo(() => machine.scene(step, ease(phase), faults, dials), [machine, step, phase, faults, dials]);

  /**
   * Whether the reader asked for reduced motion.
   *
   * Read in an effect into state, never during render: `matchMedia` during render makes the server
   * and the client disagree about the first paint. Held as state rather than a ref because the
   * render actually branches on it.
   */
  const [still, setStill] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(mq.matches);
    const onChange = () => setStill(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The frame loop. `startedAt` is set inside the effect, never during render.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    if (!playing) { startedAt.current = null; return; }

    // Reduced motion still advances the sequence - it is the content - but places each step at its
    // end state instead of sliding toward it. A timer rather than a frame loop, because there is
    // nothing to interpolate.
    if (still) {
      setPhase(1);
      const id = window.setInterval(() => {
        setStep((s) => { if (s >= last) { setPlaying(false); return s; } return s + 1; });
        setPhase(1);
      }, STEP_MS);
      return () => window.clearInterval(id);
    }

    const tick = (now: number) => {
      /*
       * Resuming picks up where the pause left it.
       *
       * `startedAt = now` would restart the current step from phase 0, so pressing Pause halfway
       * and then Play visibly rewound the packet to the node it had already left. Seeding the
       * clock backwards by however much of the step is already done makes Play a resume.
       */
      if (startedAt.current === null) startedAt.current = now - phaseRef.current * STEP_MS;
      const p = Math.min(1, (now - startedAt.current) / STEP_MS);
      setPhase(p);
      if (p >= 1) {
        startedAt.current = null;
        setStep((s) => {
          // Last step: stop with the token where it arrived. Resetting phase to 0 here parked the
          // final packet back at its origin the instant the sequence finished, so the machine ended
          // on a frame that had never been part of it.
          if (s >= last) { setPlaying(false); return s; }
          setPhase(0);
          return s + 1;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; };
  }, [playing, last, still]);

  /*
   * Remember what is broken, so it is still broken when you come back.
   *
   * Written in an effect and never during render, because localStorage during render is the
   * hydration mismatch this codebase keeps rewriting the same comment about. A machine at rest
   * clears the key rather than storing an empty fault list: nothing broken is not something to
   * return to, and a bookmark pointing at a working system is just noise on the Overview.
   */
  const touched = useRef(false);
  useEffect(() => {
    /*
     * Nothing is written until the reader actually changes something, and that guard is the whole
     * fix for a bug that made this feature never work at all.
     *
     * React commits passive effects bottom-up, child before parent. This effect lives in
     * MachineView; the one that RESTORES the saved state lives in its parent, Machines. So on
     * every mount of /machines this ran first, with `faults` still empty, took the `removeItem`
     * branch, and deleted the record - and then the parent read the key it had just erased.
     *
     * The result was worse than "resume does not work". The Overview strip rendered correctly and
     * its "Pick it back up" button was destructive: clicking it landed you on TCP with nothing
     * broken AND wiped the bookmark, so the strip was gone afterwards too. Reproduced under
     * hydrateRoot inside StrictMode, which is the shape Next actually renders.
     *
     * A mount is not a user action, so it no longer writes. Clearing on purpose still works,
     * because "Put it all back" and un-toggling a fault both set `touched` first.
     */
    if (!touched.current) return;
    try {
      if (faults.length) localStorage.setItem(MACHINE_STATE_KEY, toStorage(machine.id, faults, step));
      else localStorage.removeItem(MACHINE_STATE_KEY);
    } catch { /* private mode, a full quota - not worth failing a diagram over */ }
  }, [machine.id, faults, step]);

  const go = useCallback((next: number) => {
    touched.current = true;
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, next)));
    // Mid-step rather than 0, so a stepped-to scene shows its token in flight rather than glued to
    // the node it left. Stepping is for reading, not for watching.
    setPhase(0.55);
  }, [last]);

  /**
   * Drag anywhere across the stage to move through the whole sequence.
   *
   * The step buttons make this a diagram you operate. This makes it a thing you touch: the packet
   * moves because your finger is moving, and stopping halfway is a position rather than a state
   * you selected from a menu. Both are kept - the buttons are still the accessible path and the
   * only one a keyboard can use.
   *
   * `scrubTo` is pure and asserted in lib/machines.test.mts; this handler only turns a pointer
   * into an x, which is the part a test cannot hold anyway.
   */
  const scrub = useCallback((clientX: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const { step: next, phase: at } = scrubTo(clientX - box.left, box.width, machine.steps.length);
    touched.current = true;
    setPlaying(false);
    setStep(next);
    setPhase(at);
  }, [machine.steps.length]);

  /*
   * Drag state in a ref, not read back from the pointer.
   *
   * This was `if (e.currentTarget.hasPointerCapture(e.pointerId))`, which is the browser's own
   * record of the capture and is a worse question to ask: it is false for any pointer the platform
   * did not originate, so the whole drag silently degraded to a single click. Capture is still
   * requested - it is what keeps a drag alive once the finger leaves the diagram, which is exactly
   * where someone dragging a packet to the far node ends up - but whether we are dragging is our
   * own state, and it cannot disagree with itself.
   */
  const dragging = useRef(false);

  const onDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer to capture */ }
    scrub(e.clientX);
  }, [scrub]);

  const onMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current) scrub(e.clientX);
  }, [scrub]);

  const endDrag = useCallback(() => { dragging.current = false; }, []);

  const setDial = useCallback((id: string, value: number) => {
    touched.current = true;
    setPlaying(false);
    setDials((current) => ({ ...current, [id]: value }));
  }, []);

  const toggleFault = useCallback((id: string) => {
    touched.current = true;
    setFaults((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));
    // Back to the start. A fault that appears halfway through leaves the learner looking at a state
    // the fault did not actually produce.
    setPlaying(false);
    setStep(0);
    setPhase(0.55);
  }, []);

  return (
    <section className="panel mx-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{machine.steps.length} steps · {machine.faults.length} things you can break</p>
          <h2>{machine.title}</h2>
        </div>
      </div>
      <p className="mx-sub">{machine.subtitle}</p>

      <svg ref={stage} className="mx-stage" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
        aria-label={`${machine.title}. Step ${step + 1} of ${machine.steps.length}: ${scene.caption}`}>
        {scene.edges.map((e, i) => {
          const a = scene.nodes.find((n) => n.id === e.from);
          const b = scene.nodes.find((n) => n.id === e.to);
          if (!a || !b) return null;
          return <line key={`${e.from}-${e.to}-${i}`} className={`mx-edge${e.dashed ? " is-dashed" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
        {scene.nodes.map((n) => <NodeBox key={n.id} node={n} />)}
        {scene.tokens.map((t) => {
          const p = tokenPoint(scene, t.from, t.to, t.at);
          if (!p) return null;
          return (
            <g key={t.id} className={`mx-token tone-${t.tone}`}>
              <circle cx={p.x} cy={p.y} r="5" />
              <text x={p.x} y={p.y - 9} textAnchor="middle" className="mx-token-label">{t.label}</text>
            </g>
          );
        })}
      </svg>

      <p className="mx-scrub-hint">Drag across the diagram to move through it, or use the steps below.</p>

      {machine.dials?.length ? (
        <div className="mx-dials">
          {machine.dials.map((d) => (
            <label key={d.id} className="mx-dial">
              <span className="mx-dial-head">
                <span className="mx-dial-label">{d.label}</span>
                <output className="mx-dial-value">{dials[d.id] ?? d.value}{d.unit}</output>
              </span>
              <input type="range" min={d.min} max={d.max} step={d.step}
                value={dials[d.id] ?? d.value}
                onChange={(e) => setDial(d.id, Number(e.target.value))} />
              <span className="mx-dial-hint">{d.hint}</span>
            </label>
          ))}
        </div>
      ) : null}

      <ol className="mx-steps">
        {machine.steps.map((name, i) => (
          <li key={name}>
            <button type="button" className={`mx-step${i === step ? " is-here" : ""}`} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
              <span className="mx-step-n">{i + 1}</span>{name}
            </button>
          </li>
        ))}
      </ol>

      <div className="mx-controls">
        <button type="button" className="mx-btn" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
        <button type="button" className="mx-btn" onClick={() => go(step + 1)} disabled={step === last}>Step</button>
        <button type="button" className="mx-btn mx-play" onClick={() => { if (step === last) { setStep(0); setPhase(0); } setPlaying((p) => !p); }}>
          {playing ? "Pause" : step === last ? "Replay" : "Play"}
        </button>
      </div>

      {/* aria-live, because the caption is the actual content and it changes without the focus moving. */}
      <div className="mx-read" aria-live="polite">
        <p className="mx-caption">{scene.caption}</p>
        {scene.fault ? <p className="mx-fault">{scene.fault}</p> : null}
        <p className="mx-detail">{scene.detail}</p>
      </div>

      <div className="mx-faults">
        <p className="label">Break it</p>
        <p className="mx-faults-note">
          Nothing here is scored and nothing is marked right. You change something, and the system
          responds the way the real one would.
        </p>
        {machine.faults.map((f) => {
          const on = faults.includes(f.id);
          return (
            <button key={f.id} type="button" className={`mx-fault-toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleFault(f.id)}>
              <span className="mx-fault-label">{on ? "Broken: " : ""}{f.label}</span>
              <span className="mx-fault-blurb">{f.blurb}</span>
            </button>
          );
        })}
        {faults.length ? <button type="button" className="text-button" onClick={() => { touched.current = true; setFaults([]); setPlaying(false); setStep(0); setPhase(0.55); }}>Put it all back</button> : null}
      </div>
    </section>
  );
}

export function MachinePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  return (
    <nav className="mx-picker" aria-label="Machines">
      {MACHINES.map((m) => (
        <button key={m.id} type="button" className={`mx-pick${m.id === current ? " is-here" : ""}`} aria-current={m.id === current ? "page" : undefined} onClick={() => onPick(m.id)}>
          <strong>{m.short}</strong>
          <span>row {Math.min(...m.topicIndices) + 1}</span>
        </button>
      ))}
    </nav>
  );
}

export function Machines() {
  const [id, setId] = useState(MACHINES[0].id);
  const [initial, setInitial] = useState<{ step: number; faults: string[] } | null>(null);
  const [restored, setRestored] = useState(false);

  /*
   * Reopen whatever was left broken.
   *
   * Read once on mount, in an effect. `restored` gates it so picking a different machine by hand
   * afterwards is not undone by this - the stored state is where you resume from, not a rail you
   * are held on.
   */
  useEffect(() => {
    if (restored) return;
    setRestored(true);

    /*
     * A machine named in the URL wins over the saved one. This is how the incident sim's "Stuck?
     * Step through the system underneath" arrives, and it has to land on the system that incident
     * is about - it linked to a bare /machines before, so the RAG incident opened TCP.
     *
     * Read from window.location rather than useSearchParams: the hook opts the whole route into
     * dynamic rendering and wants a Suspense boundary, which is a lot of machinery for one
     * optional string. Inside an effect there is no hydration risk either way.
     */
    try {
      const wanted = new URLSearchParams(window.location.search).get("m");
      if (wanted && machineById(wanted)) { setId(wanted); return; }
    } catch { /* no window, no query - fall through to the saved state */ }

    let raw: string | null = null;
    try { raw = localStorage.getItem(MACHINE_STATE_KEY); } catch { return; }
    const found = readUnfinished(raw, MACHINES);
    if (!found) return;
    setId(found.machine.id);
    setInitial({ step: found.state.step, faults: found.state.faults });
  }, [restored]);

  const machine = machineById(id) ?? MACHINES[0];
  const pick = useCallback((next: string) => { setId(next); setInitial(null); }, []);

  return (
    <>
      <MachinePicker current={machine.id} onPick={pick} />
      {/* Keyed, so switching machines rebuilds the view rather than carrying the previous one's
          step and faults into a machine that does not have them. */}
      <MachineView key={`${machine.id}:${initial ? "resumed" : "fresh"}`} machine={machine} initial={initial ?? undefined} />
    </>
  );
}
