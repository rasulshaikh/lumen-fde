/** The lesson registry, ordered by where the topic sits in the plan. */
import { indexCrossover } from "./index-crossover";
import { cacheHitRate } from "./cache-hit-rate";
import { crossEntropy } from "./cross-entropy";
import { gradientDescent } from "./gradient-descent";
import { backpropChain } from "./backprop-chain";
import type { Lesson } from "./types";

export const LESSONS: Lesson[] = [indexCrossover, cacheHitRate, gradientDescent, crossEntropy, backpropChain];

export const lessonById = (id: string): Lesson | null => LESSONS.find((l) => l.id === id) ?? null;
export const lessonsForTopic = (index: number): Lesson[] => LESSONS.filter((l) => l.topicIndices.includes(index));

export { paramValue, restingParams, dragToParam, quantise, toUnit, fromUnit } from "./types";
export type { Lesson, Param, Params, Handle, LessonScene, LessonDot, LessonPath } from "./types";
