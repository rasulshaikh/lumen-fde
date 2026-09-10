/**
 * async def, and the two and a half percent that makes it slower.
 *
 * Plan row 28: "FastAPI in production: DI, settings, lifespan, background tasks, workers".
 *
 * The misconception: "async def is the fast one, so write everything as async def." An async
 * endpoint that blocks - a synchronous driver, a hash, a JSON parse of something large - blocks the
 * whole event loop, so its ceiling is one blocking section at a time. A plain `def` endpoint runs
 * in the threadpool and gets forty of them.
 *
 * They cross at a blocking fraction of 1/40. Two and a half percent of a request being blocking is
 * enough to make the async version slower than the sync one, and nobody's intuition puts the line
 * anywhere near that low.
 *
 * Then flip the blocking work from IO to CPU and the sync line collapses onto the async one,
 * because the GIL puts the forty threads back into single file.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Starlette's default threadpool. */
const THREADS = 40;
/** Total service time per request, ms. Only the ratio matters, so it is fixed. */
const SERVICE_MS = 100;

/** rps: the event loop can only be inside one blocking section at a time. */
export const asyncCeiling = (b: number) => (b <= 0 ? Infinity : 1000 / (b * SERVICE_MS));
/**
 * rps for a plain `def` endpoint. IO-bound blocking releases the GIL, so all forty threads
 * genuinely overlap. CPU-bound blocking does not, so the GIL serialises it back to one.
 */
export const syncCeiling = (b: number, cpuBound: boolean) =>
  cpuBound ? 1000 / Math.max(b * SERVICE_MS, 1e-9) : (1000 * THREADS) / SERVICE_MS;
/** Where they meet: b = 1/THREADS, exactly, for the IO case. */
export const crossoverB = () => 1 / THREADS;

const rps = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} rps` : "unbounded");

export const asyncBlocking: Lesson = {
  id: "async-blocking",
  title: "async def, and the two and a half percent that makes it slower",
  prompt: "Drag the blocking fraction. Find where async stops winning.",
  topicIndices: [28],
  view: { x0: 0, x1: 0.2, y0: 0, y1: 600 },

  params: [
    { id: "b", label: "Blocking fraction", min: 0, max: 0.2, step: 0.001, unit: "", value: 0.005, slider: false,
      hint: "Drag the ball. How much of the request is spent inside something that does not await." },
    { id: "cpu", label: "The blocking part is CPU", min: 0, max: 1, step: 1, unit: "", value: 0, slider: true,
      hint: "0 is a synchronous driver or file read, which releases the GIL. 1 is hashing, parsing or serialising, which does not." },
  ],
  handles: [{ id: "ball", param: "b", axis: "x" }],

  scene(params: Params): LessonScene {
    const b = paramValue(asyncBlocking, params, "b");
    const cpuBound = paramValue(asyncBlocking, params, "cpu") >= 0.5;

    const a = asyncCeiling(b);
    const s = syncCeiling(b, cpuBound);
    const cross = crossoverB();
    const asyncWins = a > s;

    const asyncCurve: Array<[number, number]> = [];
    const syncCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.0005 + (0.1995 * i) / 200;
      asyncCurve.push([x, Math.min(600, asyncCeiling(x))]);
      syncCurve.push([x, Math.min(600, syncCeiling(x, cpuBound))]);
    }

    const caption = cpuBound
      ? `${rps(a)} async against ${rps(s)} sync. With CPU-bound blocking they are the same line.`
      : asyncWins
        ? `${rps(a)} async against ${rps(s)} sync. Async is ahead, at ${(b * 100).toFixed(1)}% blocking.`
        : `${rps(a)} async against ${rps(s)} sync. The plain def endpoint is now faster.`;

    const detail = cpuBound
      ? `Moving CPU-bound work to a thread does not help, because the GIL only lets one thread execute Python at a time. Forty threads take turns rather than overlapping, so the sync ceiling collapses onto the async one and the "we moved it to a thread, so it is fine" fix bought nothing. That work belongs in a process pool or outside Python.`
      : asyncWins
        ? `The event loop can only be inside one blocking section at a time, so the async ceiling is one over the blocking time. The threadpool has ${THREADS} of them. Async is ahead here only because the blocking fraction is under ${(cross * 100).toFixed(1)}%.`
        : `Past ${(cross * 100).toFixed(1)}% blocking the single event loop is the bottleneck and ${THREADS} threads are not. This is the case people do not believe: the endpoint is written async, everything looks modern, and it is slower than the boring version because one call in the middle of it does not await.`;

    const arrived = !cpuBound && b > cross * 2
      ? `At ${(b * 100).toFixed(1)}% blocking the async endpoint tops out at ${rps(a)} and the plain def one at ${rps(s)}. The crossover is at exactly one over the threadpool size, ${(cross * 100).toFixed(1)}%, which is far lower than it feels like it should be. One synchronous database call inside an otherwise async handler is usually enough to be past it.`
      : undefined;

    return {
      paths: [
        { id: "async", kind: "curve", points: asyncCurve },
        { id: "sync", kind: "tangent", points: syncCurve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: b, y: Math.min(600, a), label: `${(b * 100).toFixed(1)}%` },
        { id: "cross", kind: "marker", x: cross, y: Math.min(600, syncCeiling(cross, false)) },
      ],
      readouts: [
        { label: "blocking", value: `${(b * 100).toFixed(1)}%` },
        { label: "async def", value: rps(a) },
        { label: "plain def", value: rps(s) },
        { label: "crossover", value: `${(cross * 100).toFixed(1)}%` },
        { label: "faster", value: cpuBound ? "neither" : asyncWins ? "async" : "sync" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
