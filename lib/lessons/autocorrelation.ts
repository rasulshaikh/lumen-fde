/**
 * Persistence, and the backtest that is mostly one observation.
 *
 * Plan row 108: "Time series: decomposition, ARIMA, Prophet, honest backtesting".
 *
 * The misconception: "I have two years of daily data, so n is 730." If the series is autocorrelated
 * - and every business series is - consecutive points are not independent observations, they are
 * one observation smeared out. Drag the persistence up and watch two things go at once: a shock
 * takes longer and longer to decay, and the effective sample size collapses toward a number that
 * makes the confidence interval on your backtest meaningless.
 *
 * At phi = 0.95 a two-year daily series carries about as much information as nineteen independent
 * points, which is the honest reason a backtest can look excellent and predict nothing.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const N = 730;

/** Periods for a shock to decay to half: ln(0.5)/ln(phi). Vertical as phi approaches 1. */
export const halfLife = (phi: number) => (phi >= 1 ? Infinity : Math.log(0.5) / Math.log(Math.max(phi, 1e-9)));
/**
 * Effective sample size for the mean of an AR(1): n * (1-phi)/(1+phi).
 *
 * The standard variance-inflation result. It is the number that should appear in the denominator of
 * every standard error computed on the series, and it almost never does.
 */
export const effectiveN = (phi: number) => (N * (1 - phi)) / (1 + phi);
/** How much wider the honest confidence interval is: sqrt(n / n_eff). */
export const intervalInflation = (phi: number) => Math.sqrt(N / Math.max(effectiveN(phi), 1e-9));

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "never");

export const autocorrelation: Lesson = {
  id: "autocorrelation",
  title: "Persistence, and the backtest that is mostly one observation",
  prompt: "Drag the persistence. Watch two years of daily data stop being 730 numbers.",
  topicIndices: [108],
  view: { x0: 0.5, x1: 0.99, y0: 0, y1: 200 },

  params: [
    { id: "phi", label: "Persistence", min: 0.5, max: 0.99, step: 0.005, unit: "", value: 0.8, slider: false,
      hint: "Drag the ball. The AR(1) coefficient: how much of today survives into tomorrow. Traffic and revenue series sit high." },
  ],
  handles: [{ id: "ball", param: "phi", axis: "x" }],

  scene(params: Params): LessonScene {
    const phi = paramValue(autocorrelation, params, "phi");
    const hl = halfLife(phi);
    const neff = effectiveN(phi);
    const inflation = intervalInflation(phi);

    const curve: Array<[number, number]> = [];
    const effCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.5 + (0.49 * i) / 200;
      curve.push([x, Math.min(200, halfLife(x))]);
      effCurve.push([x, Math.min(200, effectiveN(x))]);
    }

    const severe = neff < 50;

    const caption = severe
      ? `A shock takes ${fmt(hl)} periods to half-decay, and ${N} days carry the information of ${fmt(neff, 0)}.`
      : `Half-life ${fmt(hl)} periods; effective sample ${fmt(neff, 0)} of ${N}.`;

    const detail = severe
      ? `Every standard error computed on this series should be ${fmt(inflation, 1)} times wider than the naive one, because n_eff is ${fmt(neff, 0)} rather than ${N}. A backtest that reports a tight interval on a series this persistent has computed the interval on an assumption the series does not satisfy, and the model may be doing nothing more than carrying yesterday forward.`
      : `Half-life and effective sample size move together because they are the same fact twice: how long the series remembers, and therefore how many genuinely new observations it contains. Both go vertical as persistence approaches one, and business series live close to one.`;

    const arrived = phi >= 0.95
      ? `At ${phi.toFixed(3)} persistence, two years of daily data is worth about ${fmt(neff, 0)} independent observations and a shock is still half-present after ${fmt(hl, 0)} days. This is why the honest baseline for a time series is "yesterday's value", why beating it is harder than it looks, and why a backtest split at a random point rather than forward in time will report a score it cannot reproduce.`
      : undefined;

    return {
      paths: [
        { id: "halflife", kind: "curve", points: curve },
        { id: "neff", kind: "tangent", points: effCurve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: phi, y: Math.min(200, hl), label: `${fmt(hl)} periods` },
      ],
      readouts: [
        { label: "persistence", value: phi.toFixed(3) },
        { label: "half-life", value: `${fmt(hl)}` },
        { label: "effective n", value: fmt(neff, 0) },
        { label: "of", value: `${N}` },
        { label: "interval wider by", value: `${fmt(inflation, 1)}x` },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
