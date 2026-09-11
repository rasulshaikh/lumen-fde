"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LESSONS, dragToParam, lessonById, restingParams, type Lesson as LessonDef, type Params } from "@/lib/lessons";

/**
 * The lesson engine. Written once, so a lesson is data.
 *
 * Everything specific to gradient descent lives in `lib/lessons/gradient-descent.ts` as a curve, two
 * parameters and a caption table. This file knows only how to project lesson space onto pixels,
 * turn a pointer into a parameter, and draw paths and dots. Adding a second lesson touches nothing
 * here.
 *
 * That is the difference from `components/Machine.tsx`, and it is the whole point of the exercise:
 * each machine is a bespoke `scene()` of ~130 lines because each describes a different system with
 * different stages. Three of them took hours and the plan has 119 topics. A lesson is small enough
 * to author in minutes because the hard parts - the inverse pointer maths, the clamping, the
 * accessibility - are here and are paid for once.
 */

const W = 520;
const H = 300;
const PAD = 18;

export function LessonView({ lesson }: { lesson: LessonDef }) {
  const [params, setParams] = useState<Params>(() => restingParams(lesson));
  const stage = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const scene = useMemo(() => lesson.scene(params), [lesson, params]);

  // Lesson space to pixels. y is flipped: pixels grow downward, maths grows upward.
  const { x0, x1, y0, y1 } = lesson.view;
  const px = useCallback((x: number) => PAD + ((x - x0) / (x1 - x0)) * (W - PAD * 2), [x0, x1]);
  const py = useCallback((y: number) => H - PAD - ((y - y0) / (y1 - y0)) * (H - PAD * 2), [y0, y1]);
  const line = useCallback((pts: Array<[number, number]>) => pts.map(([x, y]) => `${px(x)},${py(y)}`).join(" "), [px, py]);

  const handleId = lesson.handles[0]?.id;

  const moveTo = useCallback((clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !handleId) return;
    // Back out the padding: the drawing area is inset, so a pointer at the very edge of the svg is
    // outside lesson space and must clamp rather than extrapolate.
    const inset = (PAD / W) * box.width;
    const usable = box.width - inset * 2;
    const next = dragToParam(lesson, handleId, clientX - box.left - inset, clientY - box.top, usable, box.height);
    if (next) setParams((current) => ({ ...current, [next.param]: next.value }));
  }, [lesson, handleId]);

  const onDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    moveTo(e.clientX, e.clientY);
  }, [moveTo]);
  const onMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current) moveTo(e.clientX, e.clientY);
  }, [moveTo]);
  const endDrag = useCallback(() => { dragging.current = false; }, []);

  /**
   * The keyboard path.
   *
   * A draggable thing that only responds to a pointer is a lesson a keyboard user cannot take. The
   * handle is focusable and the arrow keys nudge it by the parameter's own step, which is also the
   * only way to land on an exact value on purpose.
   */
  const onKey = useCallback((e: React.KeyboardEvent) => {
    const p = lesson.params.find((q) => q.id === lesson.handles[0]?.param);
    if (!p) return;
    const delta = e.key === "ArrowRight" ? p.step : e.key === "ArrowLeft" ? -p.step : e.key === "PageUp" ? p.step * 10 : e.key === "PageDown" ? -p.step * 10 : 0;
    if (!delta) return;
    e.preventDefault();
    setParams((c) => ({ ...c, [p.id]: Math.min(p.max, Math.max(p.min, (c[p.id] ?? p.value) + delta)) }));
  }, [lesson]);

  const handleParam = lesson.params.find((p) => p.id === lesson.handles[0]?.param);
  const handleDot = scene.dots.find((d) => d.id === handleId);

  return (
    <section className="panel ls">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Lesson · drag it</p>
          <h2>{lesson.title}</h2>
        </div>
      </div>
      <p className="ls-prompt">{lesson.prompt}</p>

      <svg ref={stage} className="ls-stage" viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
        role="img" aria-label={`${lesson.title}. ${scene.caption} ${scene.readouts.map((r) => `${r.label} ${r.value}`).join(", ")}`}>
        <line className="ls-axis" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
        {scene.paths.map((p) => (
          <polyline key={p.id} className={`ls-path ls-${p.kind}`} points={line(p.points)} fill="none" />
        ))}
        {scene.dots.filter((d) => d.kind !== "handle").map((d) => (
          <g key={d.id} className={`ls-dot ls-${d.kind}`}>
            <circle cx={px(d.x)} cy={py(d.y)} r={d.kind === "ghost" ? 5 : 3} />
            {d.label ? <text x={px(d.x)} y={py(d.y) - 11} textAnchor="middle">{d.label}</text> : null}
          </g>
        ))}
        {handleDot ? (
          <g className="ls-dot ls-handle" tabIndex={0} role="slider" onKeyDown={onKey}
            aria-label={handleParam?.label ?? "handle"}
            aria-valuemin={handleParam?.min} aria-valuemax={handleParam?.max}
            aria-valuenow={Number((params[handleParam?.id ?? ""] ?? 0).toFixed(2))}>
            <circle cx={px(handleDot.x)} cy={py(handleDot.y)} r="9" />
            {handleDot.label ? <text x={px(handleDot.x)} y={py(handleDot.y) - 16} textAnchor="middle">{handleDot.label}</text> : null}
          </g>
        ) : null}
      </svg>

      <dl className="ls-readouts">
        {scene.readouts.map((r) => (
          <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>
        ))}
      </dl>

      <div className="ls-read" aria-live="polite">
        <p className="ls-caption">{scene.caption}</p>
        {scene.arrived ? <p className="ls-arrived">{scene.arrived}</p> : null}
        <p className="ls-detail">{scene.detail}</p>
      </div>

      <div className="ls-controls">
        {lesson.action ? (
          <button type="button" className="mx-btn mx-play" onClick={() => setParams(lesson.action!.apply)}>{lesson.action.label}</button>
        ) : null}
        <button type="button" className="mx-btn" onClick={() => setParams(restingParams(lesson))}>Put it back</button>
      </div>

      {lesson.params.filter((p) => p.slider !== false).map((p) => (
        <label key={p.id} className="mx-dial ls-dial">
          <span className="mx-dial-head">
            <span className="mx-dial-label">{p.label}</span>
            <output className="mx-dial-value">{params[p.id] ?? p.value}{p.unit}</output>
          </span>
          <input type="range" min={p.min} max={p.max} step={p.step} value={params[p.id] ?? p.value}
            onChange={(e) => setParams((c) => ({ ...c, [p.id]: Number(e.target.value) }))} />
          <span className="mx-dial-hint">{p.hint}</span>
        </label>
      ))}
    </section>
  );
}

export function Lessons() {
  const [id, setId] = useState(LESSONS[0]?.id ?? "");
  const [restored, setRestored] = useState(false);

  // A lesson named in the URL wins, so the syllabus panel can link straight to the one that
  // explains the topic being read. Read from window.location rather than useSearchParams, which
  // opts the whole route into dynamic rendering for one optional string.
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    try {
      const wanted = new URLSearchParams(window.location.search).get("l");
      if (wanted && lessonById(wanted)) setId(wanted);
    } catch { /* no window, no query */ }
  }, [restored]);

  const lesson = lessonById(id) ?? LESSONS[0];
  if (!lesson) return null;

  return (
    <>
      {LESSONS.length > 1 ? (
        <nav className="mx-picker" aria-label="Lessons">
          {LESSONS.map((l) => (
            <button key={l.id} type="button" className={`mx-pick${l.id === lesson.id ? " is-here" : ""}`}
              aria-current={l.id === lesson.id ? "page" : undefined} onClick={() => setId(l.id)}>
              <strong>{l.title.split(",")[0]}</strong>
              <span>row {Math.min(...l.topicIndices) + 1}</span>
            </button>
          ))}
        </nav>
      ) : null}
      {/* Keyed, so switching lessons starts the new one at rest rather than carrying the last
          one's parameters into a lesson that does not have them. */}
      <LessonView key={lesson.id} lesson={lesson} />
    </>
  );
}
