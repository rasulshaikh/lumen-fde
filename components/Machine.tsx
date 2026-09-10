"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MACHINES, machineById } from "@/lib/machines";
import { ease } from "@/lib/machines/types";
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

export function MachineView({ machine }: { machine: MachineDef }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState(0.55);
  const [playing, setPlaying] = useState(false);
  const [faults, setFaults] = useState<string[]>([]);
  const raf = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  const last = machine.steps.length - 1;
  const scene = useMemo(() => machine.scene(step, ease(phase), faults), [machine, step, phase, faults]);

  // The frame loop. `startedAt` is set inside the effect, never during render.
  useEffect(() => {
    if (!playing) { startedAt.current = null; return; }
    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const p = Math.min(1, (now - startedAt.current) / STEP_MS);
      setPhase(p);
      if (p >= 1) {
        startedAt.current = null;
        setStep((s) => {
          if (s >= last) { setPlaying(false); return s; }
          return s + 1;
        });
        setPhase(0);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; };
  }, [playing, last]);

  const go = useCallback((next: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, next)));
    // Mid-step rather than 0, so a stepped-to scene shows its token in flight rather than glued to
    // the node it left. Stepping is for reading, not for watching.
    setPhase(0.55);
  }, [last]);

  const toggleFault = useCallback((id: string) => {
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

      <svg className="mx-stage" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
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
        {faults.length ? <button type="button" className="text-button" onClick={() => { setFaults([]); setPlaying(false); setStep(0); setPhase(0.55); }}>Put it all back</button> : null}
      </div>
    </section>
  );
}

export function MachinePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  return (
    <nav className="mx-picker" aria-label="Machines">
      {MACHINES.map((m) => (
        <button key={m.id} type="button" className={`mx-pick${m.id === current ? " is-here" : ""}`} aria-current={m.id === current ? "page" : undefined} onClick={() => onPick(m.id)}>
          <strong>{m.title.split(":")[0]}</strong>
          <span>{m.steps.length} steps · {m.faults.length} faults</span>
        </button>
      ))}
    </nav>
  );
}

export function Machines() {
  const [id, setId] = useState(MACHINES[0].id);
  const machine = machineById(id) ?? MACHINES[0];
  return (
    <>
      <MachinePicker current={machine.id} onPick={setId} />
      <MachineView machine={machine} />
    </>
  );
}
