/** The lesson registry, ordered by where the topic sits in the plan. */
import { bandwidthDelay } from "./bandwidth-delay";
import { cpuThrottling } from "./cpu-throttling";
import { histogramP99 } from "./histogram-p99";
import { scalabilityLaw } from "./scalability-law";
import { asyncBlocking } from "./async-blocking";
import { kvCache } from "./kv-cache";
import { baseRate } from "./base-rate";
import { dimensionality } from "./dimensionality";
import { stepSize } from "./step-size";
import { statisticalPower } from "./statistical-power";
import { catastrophicCancellation } from "./catastrophic-cancellation";
import { softmaxScale } from "./softmax-scale";
import { autocorrelation } from "./autocorrelation";
import { indexCrossover } from "./index-crossover";
import { cacheHitRate } from "./cache-hit-rate";
import { gradientDescent } from "./gradient-descent";
import { crossEntropy } from "./cross-entropy";
import { backpropChain } from "./backprop-chain";
import type { Lesson } from "./types";

export const LESSONS: Lesson[] = [
  bandwidthDelay, cpuThrottling, kvCache, histogramP99, scalabilityLaw, asyncBlocking,
  indexCrossover, cacheHitRate, statisticalPower, baseRate, gradientDescent, crossEntropy,
  catastrophicCancellation, dimensionality, autocorrelation, stepSize, backpropChain, softmaxScale,
];

export const lessonById = (id: string): Lesson | null => LESSONS.find((l) => l.id === id) ?? null;
export const lessonsForTopic = (index: number): Lesson[] => LESSONS.filter((l) => l.topicIndices.includes(index));

export { paramValue, restingParams, dragToParam, quantise, toUnit, fromUnit } from "./types";
export type { Lesson, Param, Params, Handle, LessonScene, LessonDot, LessonPath } from "./types";
