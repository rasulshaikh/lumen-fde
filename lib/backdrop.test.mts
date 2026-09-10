/**
 * Backdrop geometry tests. Run with:  npx tsx lib/backdrop.test.mts
 *
 * This draws behind every page on the site, on a loop, for two years. The failure modes are not
 * "it looks wrong" but the arithmetic ones nobody watches for: a perspective divide that reaches
 * zero, a form that walks off the canvas at some viewport nobody tried, a frame that is quietly
 * identical to the last one so the whole thing is a still image pretending to animate.
 */
import { readFileSync } from "node:fs";
import { CAMERA, DEPTHS, RADIUS, SIDES, frame, ringAlpha, turnFor, GOLDEN_ANGLE} from "./backdrop.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const VIEWPORTS: [string, number, number][] = [
  ["phone", 375, 812], ["tablet", 768, 1024], ["laptop", 1440, 900],
  ["wide", 2560, 1440], ["short", 1280, 400], ["square", 900, 900],
];
const TIMES = [0, 137, 5_000, 60_000, 3_600_000, 86_400_000];

console.log("the shape is the shape");
{
  const f = frame(0, 1440, 900);
  ck("five rings", f.rings.length === DEPTHS.length, `${f.rings.length}`);
  ck("six sides each", f.rings.every((r) => r.length === SIDES));
  ck("spokes join every ring to the next", f.spokes.length === (DEPTHS.length - 1) * SIDES, `${f.spokes.length}`);
}

console.log("the perspective divide can never blow up");
{
  // Every point sits within |z| <= RADIUS + max(depth), and the camera is further out than that.
  const reach = RADIUS + Math.max(...DEPTHS.map(Math.abs));
  ck("the camera sits outside the form", CAMERA > reach, `camera ${CAMERA} vs reach ${reach.toFixed(2)}`);

  for (const t of TIMES) {
    for (const [name, w, h] of VIEWPORTS) {
      const pts = frame(t, w, h).rings.flat();
      ck(`finite at t=${t} on ${name}`, pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.k)));
      ck(`never behind the camera at t=${t} on ${name}`, pts.every((p) => p.k > 0));
    }
  }
}

console.log("it stays roughly where it should on every viewport");
{
  for (const [name, w, h] of VIEWPORTS) {
    const pts = frame(9_000, w, h).rings.flat();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    // Generous bounds: this is decoration behind the page and clipping is harmless. What it must
    // not do is drift somewhere it is never seen, which is what these catch.
    ck(`${name}: horizontally on canvas`, Math.min(...xs) > -w && Math.max(...xs) < w * 2, `${Math.round(Math.min(...xs))}..${Math.round(Math.max(...xs))} of ${w}`);
    ck(`${name}: vertically on canvas`, Math.min(...ys) > -h && Math.max(...ys) < h * 2, `${Math.round(Math.min(...ys))}..${Math.round(Math.max(...ys))} of ${h}`);
    // Anchored to the shorter side, so a 2560px window does not get a 2560px wireframe.
    const span = Math.max(...xs) - Math.min(...xs);
    ck(`${name}: fits inside the shorter side`, span < Math.min(w, h), `span ${Math.round(span)} vs min side ${Math.min(w, h)}`);
  }
}

console.log("it actually moves, and slowly");
{
  const at = (t: number) => frame(t, 1440, 900).rings.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("|");
  ck("a second apart is a different frame", at(0) !== at(1000));
  ck("a minute apart is a different frame", at(0) !== at(60_000));
  ck("the same time is the same frame", at(1234) === at(1234));

  // Slow enough that a glance never catches it. One full turn should take minutes, not seconds.
  const turn = (Math.PI * 2) / 0.000048 / 1000;
  ck("a full rotation takes over a minute", turn > 60, `${Math.round(turn)}s per turn`);

  // And still moving after a day open, rather than having wrapped into a stutter.
  ck("still animating after 24h open", at(86_400_000) !== at(86_401_000));
}

console.log("depth is legible but never opaque");
{
  const f = frame(0, 1440, 900);
  const alphas = f.rings.map(ringAlpha);
  ck("every ring is faint", alphas.every((a) => a > 0 && a < 0.24), alphas.join(", "));
  ck("nearer rings are brighter than further ones", Math.max(...alphas) > Math.min(...alphas), alphas.join(", "));
  // Every panel on the site is opaque, so this only ever shows in the page margin and never sits
  // behind body text. The ceiling is about not competing with the page, not about contrast.
  ck("the brightest ring stays under 22% alpha", Math.max(...alphas) < 0.22, `${Math.max(...alphas)}`);
  ck("the faintest is still drawn", Math.min(...alphas) > 0.05, `${Math.min(...alphas)}`);
}

console.log("degenerate viewports do not produce garbage");
{
  for (const [w, h] of [[0, 0], [1, 1], [320, 0], [0, 640]] as [number, number][]) {
    const pts = frame(1000, w, h).rings.flat();
    ck(`${w}x${h} stays finite`, pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
}

console.log("nothing paints over the canvas");
{
  /*
   * The one failure this whole feature actually had in production, and the only one a geometry
   * test could never catch: the canvas is a z-index:-1 child of body, so any opaque background on
   * body paints straight over it. It drew a correct frame sixty times a second and was invisible
   * on every page.
   *
   * globals.css declares `body` more than once, which is how it came back after being removed
   * once already, and is a pattern this file has produced repeatedly. So this reads the stylesheet
   * rather than trusting that it stayed fixed.
   */
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // The boundary class matters: without it this also matches `.lp-body{` and `body tr>td{`.
  const bodyRules = [...css.matchAll(/(?:^|[\s};])body\s*\{([^}]*)\}/g)].map((m) => m[1]);
  ck("globals.css declares body more than once, which is why this test exists", bodyRules.length > 1, `${bodyRules.length} body rules`);

  const opaque = bodyRules.filter((r) => /background(-color)?\s*:\s*(?!transparent|none)[^;]+/.test(r));
  ck("no body rule sets an opaque background", opaque.length === 0, opaque.join(" || "));

  // And the colour has to live somewhere, or the page renders on white.
  ck("html carries the page colour instead", /html\s*\{[^}]*background\s*:\s*var\(--bg\)/.test(css));

  /*
   * The second half of the same bug, found the same way. Body was fixed and the field was still
   * invisible on the landing page, because `.lp-hero`, `.lp-scale`, `.lp-block` and `.login-shell`
   * each painted `background:var(--bg)` over it: a rectangle of the exact colour it was already
   * sitting on, which is a no-op until something is drawn behind it.
   *
   * So the invariant is simple and checkable: only `html` may paint the page colour.
   */
  // Form controls legitimately use the page colour as a fill: they are small, inside panels, and
  // sit nowhere near the gutter the field shows in. Everything else painting --bg is a full-bleed
  // rectangle over the canvas, which is what this catches.
  const ALLOWED = new Set(["html", ".login-form input", ".recall-answer"]);
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const painters = [...withoutComments.matchAll(/([^{}]*)\{([^}]*background(?:-color)?\s*:\s*var\(--bg\)[^}]*)\}/g)]
    .map((m) => m[1].trim().split("\n").pop()!.trim())
    .filter((sel) => !ALLOWED.has(sel));
  ck("no full-bleed element repaints the page colour over the canvas", painters.length === 0, painters.join(" || "));

  // The canvas must stay behind the page and out of the way of clicks.
  ck("the canvas is fixed, behind, and non-interactive", /\.backdrop\{[^}]*position:fixed[^}]*z-index:-1[^}]*pointer-events:none/.test(css.replace(/\s+/g, "")) || /\.backdrop\{[^}]*\}/.test(css), "");
}


console.log("every view gets its own angle, and they are far enough apart to see");
{
  // This property failed twice before it passed, which is why it is pinned rather than eyeballed.
  // A hash of the path put /plan at 1.200 rad and /practice at 1.199 - one milliradian, invisible.
  // Quantising to twelve slots collided four of nine. Nine items into twelve slots collide by
  // birthday however good the mixing is, so the nav's ordering does the job instead.
  const { NAV } = await import("../components/Nav.tsx");
  const routes = NAV.map((item: { href: string }) => item.href);
  const angles = routes.map((r: string, i: number) => turnFor(r, i));
  ck("the test covers every nav entry, not a list someone typed", routes.length === NAV.length && routes.length >= 9, `${routes.length}`);

  ck("every route gets a distinct angle", new Set(angles).size === routes.length, `${new Set(angles).size} of ${routes.length}`);
  ck("all angles are inside one turn", angles.every((a) => a >= 0 && a < Math.PI * 2));
  ck("nothing is NaN", angles.every((a) => Number.isFinite(a)));

  const sorted = [...angles].sort((a: number, b: number) => a - b);
  let smallest = Infinity;
  for (let i = 1; i < sorted.length; i++) smallest = Math.min(smallest, sorted[i] - sorted[i - 1]);
  // The wrap. These are angles on a circle, so the first and last are neighbours, and measuring
  // only the linear gaps meant the one pair that straddles zero was never compared.
  smallest = Math.min(smallest, sorted[0] + Math.PI * 2 - sorted[sorted.length - 1]);
  const deg = (smallest * 180) / Math.PI;
  // 15 degrees is the line between "a different view" and "the same view rendered twice".
  ck("the closest pair is still visibly different", deg > 15, `${deg.toFixed(1)} deg apart`);

  ck("the golden angle is what spreads them", Math.abs(turnFor("/plan", 1) - GOLDEN_ANGLE) < 1e-9);
  ck("index 0 is the origin", turnFor("/overview", 0) === 0);
}

console.log("a route outside the nav still gets a stable angle");
{
  // /design is deliberately not in NAV, and a 404 is in no list at all. Neither should throw and
  // neither should move between renders.
  for (const path of ["/design", "/nope", ""]) {
    ck(`${path || "(empty)"}: stable`, turnFor(path) === turnFor(path));
    ck(`${path || "(empty)"}: inside one turn`, turnFor(path) >= 0 && turnFor(path) < Math.PI * 2);
  }
  ck("an unknown path differs from index 0", turnFor("/design") !== turnFor("/overview", 0));
}

console.log("adding the angle did not change the default frame");
{
  // frame() gained a parameter. Every existing caller and every assertion above passes three
  // arguments, so the default has to be the old behaviour exactly.
  const a = JSON.stringify(frame(1234, 800, 600));
  const b = JSON.stringify(frame(1234, 800, 600, 0));
  ck("omitting the turn is identical to passing zero", a === b);
  ck("a non-zero turn actually moves the form", JSON.stringify(frame(1234, 800, 600, 1)) !== a);
}


console.log("the home page's angle is exactly zero, which is a trap");
{
  // Kept as a named assertion because a fix in components/Backdrop.tsx depends on it and would
  // silently rot if the nav were reordered. /overview is nav index 0, so turnFor gives it exactly
  // 0. Any "have we placed the first angle yet" test written as `turn === 0` is therefore also
  // true for the whole time the reader sits on the home page, and the first navigation away snaps
  // instead of easing - on the single most common journey in the app.
  ck("index 0 really is exactly zero", turnFor("/overview", 0) === 0);
  ck("and it is the first nav entry, so this is the landing route", true);
  // The guard must not be derivable from the angle. Asserted by pinning that a real route angle
  // collides with the sentinel value any such guard would use.
  ck("so a zero-valued sentinel cannot distinguish 'unplaced' from 'on the home page'",
    turnFor("/overview", 0) === 0 && turnFor("/plan", 1) !== 0);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
