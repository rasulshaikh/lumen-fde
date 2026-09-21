"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { frame, ringAlpha, stepAngle, turnFor } from "@/lib/backdrop";
import { NAV } from "@/components/Nav";

/**
 * The 3D field under the whole site.
 *
 * The mark is a six-sided iris. This is that shape extruded into depth: five hexagonal rings at
 * receding Z, joined by spokes, turning slowly on two axes under a real perspective projection.
 * It sits behind every page at low alpha so it reads as texture rather than as a thing to look at.
 *
 * ## Why this is not three.js
 *
 * three.js is around 150KB gzipped, and this codebase has already refused a dependency of that
 * shape for exactly this reason: the Sparkline in `components/Market.tsx` is hand-drawn SVG
 * because "the smallest chart library in this space would outweigh everything this page currently
 * ships to the client". A rotating wireframe needs a 4x4 matrix, a perspective divide and a line
 * loop. Importing a scene graph, a material system and a WebGL renderer to draw sixty segments
 * would be the same trade the Sparkline already declined.
 *
 * The projection here is real 3D, just rasterised on the CPU. At around 100 line segments a frame
 * that costs nothing measurable, and it avoids WebGL context loss, shader compilation and the
 * blank-canvas failure mode on machines that block the GPU. If this ever needs actual geometry,
 * lighting or loaded models, three.js becomes the right answer and this becomes the wrong one.
 *
 * The maths lives in `lib/backdrop.ts` and is asserted there. What is left here is the canvas, the
 * lifecycle and the colour, which are the parts a test cannot hold.
 *
 * ## What it must never do
 *
 * **Cost the text its contrast.** It is drawn at very low alpha in the accent colour and the whole
 * canvas sits at `z-index:-1` under an opaque page background, so the panels the reader actually
 * reads are unaffected. Only the page gutter shows it.
 *
 * **Move for someone who asked it not to.** `prefers-reduced-motion: reduce` draws exactly one
 * frame and stops. Not slower, not gentler: one frame. That contract is about vestibular safety.
 *
 * **Run when nobody is looking.** The loop stops on `visibilitychange`, because a background tab
 * animating a wireframe is a laptop fan spinning for nothing over a two-year study plan.
 */

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const pathname = usePathname();

  /**
   * The angle this route wants, and the angle currently drawn.
   *
   * Held in refs rather than state on purpose. The frame loop reads them sixty times a second and
   * a state update per frame would re-render the tree sixty times a second to change a number no
   * React output depends on. `target` is written by the route effect; `turn` is eased toward it
   * inside the loop and never triggers a render at all.
   */
  const target = useRef(0);
  const turn = useRef(0);
  /**
   * A handle on the draw loop's `start`, so a route change can force a repaint.
   *
   * Under `prefers-reduced-motion` the loop draws exactly one frame and stops, and `start` was
   * only called on mount, resize, visibility and theme change - never on navigation. So the new
   * angle was computed on every route change and never painted. Someone who asked for reduced
   * motion got a backdrop frozen on whichever view they happened to load first.
   */
  const repaint = useRef<(() => void) | null>(null);
  /**
   * Whether the first angle has been placed.
   *
   * This was `if (turn.current === 0)`, which is the same test only if no route's angle is ever
   * exactly zero - and /overview is nav index 0, so its angle is exactly zero. While you sat on the
   * home page `turn.current` stayed 0, so the guard fired again on your FIRST navigation away and
   * snapped instead of easing. The most common journey in the app was the one where the feature
   * silently did nothing.
   */
  const placed = useRef(false);

  useEffect(() => {
    const index = NAV.findIndex((item) => item.href === pathname);
    target.current = turnFor(pathname, index);
    // First paint lands on the angle rather than swinging to it from zero, which would make every
    // full page load look like a transition that had already happened. Every navigation after that
    // eases, including away from a route whose angle happens to be zero.
    if (!placed.current) { placed.current = true; turn.current = target.current; }
    // Only needed when nothing is looping. With motion on, the next frame picks the target up.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) repaint.current?.();
  }, [pathname]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let width = 0;
    let height = 0;

    /*
     * The stroke colour, resolved rather than referenced.
     *
     * A canvas cannot read a CSS custom property: `strokeStyle = "rgba(var(--x), .1)"` is an
     * invalid colour, which the 2D context discards silently, leaving the previous value in place.
     * The first version of this did exactly that, and would have drawn in whatever colour happened
     * to be set, or nothing at all.
     *
     * Read once and re-read when the theme attribute changes, rather than every frame:
     * getComputedStyle forces a style resolve, and doing that 60 times a second for a value that
     * changes twice a day is the wrong trade.
     */
    let rgb = "184,148,53";
    const readColour = () => {
      const raw = getComputedStyle(canvas).getPropertyValue("--backdrop-rgb").trim();
      if (raw) rgb = raw;
    };
    readColour();

    // Resized rather than scaled, so the lines stay one device pixel wide on any display.
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      /*
       * Eased toward the route's angle, by the shortest way round.
       *
       * Without the wrap the form takes the long way whenever a move crosses zero - navigating
       * from a 20-degree tab to a 330-degree one would spin it 310 degrees forwards instead of 50
       * back, which reads as a glitch rather than as a turn.
       *
       * Someone who asked for reduced motion gets the angle immediately. They still get a
       * different view per tab; they do not get a thing sliding across their screen to deliver it.
       */
      turn.current = still.matches ? target.current : stepAngle(turn.current, target.current);

      const { rings, spokes } = frame(t, width, height, turn.current);
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      for (const points of rings) {
        ctx.beginPath();
        points.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.strokeStyle = `rgba(${rgb}, ${ringAlpha(points)})`;
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(${rgb}, 0.055)`;
      ctx.beginPath();
      for (const [a, b] of spokes) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    };

    const loop = (t: number) => { draw(t); raf = window.requestAnimationFrame(loop); };

    /*
     * `size()` runs on every start, and that is a fix rather than belt-and-braces.
     *
     * A canvas laid out in a hidden tab, or measured before layout settles, reports clientWidth 0.
     * The first version measured once on mount and never again except on window resize, so a page
     * opened in a background tab got a zero-sized canvas and kept it forever: becoming visible
     * fired visibilitychange, which called start(), which did not re-measure. Observed live, as a
     * canvas with zero painted pixels and nothing covering it.
     */
    const start = () => {
      window.cancelAnimationFrame(raf);
      size();
      // Nothing to draw into yet. The next start re-measures, so this recovers by itself.
      if (!width || !height) return;
      // One frame and stop, for reduced motion or a hidden tab. Not a slower animation.
      if (still.matches || document.hidden) { draw(0); return; }
      raf = window.requestAnimationFrame(loop);
    };

    const onResize = () => start();

    /*
     * A ResizeObserver as well as the window listener. The canvas is `position:fixed` with
     * `inset:0`, so it tracks the viewport rather than a parent, but the window event does not
     * fire when a hidden tab is finally laid out, which is exactly the case that produced a
     * zero-sized canvas.
     */
    const observer = new ResizeObserver(() => start());
    observer.observe(canvas);

    // The two palettes want different backdrop colours, and the toggle flips an attribute rather
    // than remounting, so nothing else would tell this canvas to change.
    const themed = new MutationObserver(() => { readColour(); if (still.matches || document.hidden) draw(0); });
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    repaint.current = start;
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);
    still.addEventListener("change", start);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      themed.disconnect();
      window.removeEventListener("resize", onResize);
      repaint.current = null;
      document.removeEventListener("visibilitychange", start);
      still.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" />;
}
