/**
 * The geometry behind the site, as arithmetic.
 *
 * Separated from the canvas for the same reason `lib/paths.ts` is separated from the panel that
 * draws it: a projection living inside a `useEffect` can only be checked by looking at it, and
 * "looks about right" is not a property you can hold across a refactor. Here it is a pure function
 * of time and viewport, so the frame a browser paints can be asserted, and rendered to an SVG for
 * a human to look at, without a browser being involved in either.
 *
 * The form is the Lumen mark given depth: five hexagonal rings at receding Z, joined by spokes,
 * turning on two axes under a perspective divide.
 */

export type Pt = { x: number; y: number; k: number };
export type Frame = { rings: Pt[][]; spokes: [Pt, Pt][] };

/** Ring depths in projection units, front to back. */
export const DEPTHS = [-1.6, -0.8, 0, 0.8, 1.6];
export const SIDES = 6;
export const RADIUS = 1.35;

/**
 * Radians per millisecond. At 0.000048 a full turn takes just over two minutes, which is slow
 * enough that a glance never catches it moving and a stare eventually does.
 */
export const SPIN_Y = 0.000048;
export const SPIN_X = 0.000021;

/**
 * Camera distance. Every point sits within |z| <= RADIUS + max(DEPTHS), comfortably inside this,
 * so `CAMERA + z` can never reach zero and the perspective divide can never blow up or flip sign.
 * That is the one arithmetic failure this function could have, and the constant is what prevents it.
 */
export const CAMERA = 4;

export function frame(t: number, width: number, height: number): Frame {
  const ay = t * SPIN_Y;
  const ax = Math.sin(t * SPIN_X) * 0.42;
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cx = Math.cos(ax), sx = Math.sin(ax);

  // Anchored to the shorter side, so the form neither fills a wide desktop nor spills off a
  // phone, and seated slightly above centre where the hero sits.
  //
  // 0.22 rather than the 0.42 this started at. RADIUS is 1.35 and the perspective divide reaches
  // about 1.15 on the nearest ring, so the drawn span is roughly 3.1x the scale factor: at 0.42
  // that put a 1507px wireframe behind a 900px-tall laptop window and spilled a phone by 70%.
  const scale = Math.min(width, height) * 0.22;
  const ox = width / 2;
  const oy = height * 0.42;

  const project = (px: number, py: number, pz: number): Pt => {
    const x1 = px * cy + pz * sy;
    const z1 = -px * sy + pz * cy;
    const y2 = py * cx - z1 * sx;
    const z2 = py * sx + z1 * cx;
    const k = CAMERA / (CAMERA + z2);
    return { x: ox + x1 * scale * k, y: oy + y2 * scale * k, k };
  };

  const rings = DEPTHS.map((depth) =>
    Array.from({ length: SIDES }, (_, i) => {
      const a = (i / SIDES) * Math.PI * 2;
      return project(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, depth);
    }),
  );

  const spokes: [Pt, Pt][] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SIDES; j++) spokes.push([rings[i][j], rings[i + 1][j]]);
  }

  return { rings, spokes };
}

/**
 * Nearer rings are fractionally brighter. That difference is what reads as depth without shading.
 *
 * The range is 0.11 to 0.19, tuned by rendering frames rather than by taste. A first attempt ran
 * to 0.24, loud enough to compete with the page; dropping it to 0.13 made it so faint on a light
 * background it may as well not have been drawn.
 *
 * `k` spans 0.714 to 1.667, which is `CAMERA / (CAMERA +/- (RADIUS + max depth))`. An earlier
 * version of this comment claimed 1.15 for the near end and the mapping was built on that figure,
 * which pushed the nearest ring to 0.284 instead of the 0.19 it was aiming at. The test caught it,
 * and the constants below are derived from the real span rather than a remembered one.
 */
export const ringAlpha = (points: Pt[]) => {
  const k = points.reduce((n, p) => n + p.k, 0) / points.length;
  return Number((0.11 + (k - 0.714) * 0.084).toFixed(3));
};
