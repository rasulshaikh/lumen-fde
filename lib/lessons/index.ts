/** The lesson registry. */
import { gradientDescent } from "./gradient-descent";
import type { Lesson } from "./types";

export const LESSONS: Lesson[] = [gradientDescent];
export const lessonById = (id: string): Lesson | null => LESSONS.find((l) => l.id === id) ?? null;
export const lessonsForTopic = (index: number): Lesson[] => LESSONS.filter((l) => l.topicIndices.includes(index));

export { paramValue, restingParams, dragToParam, quantise, toUnit, fromUnit } from "./types";
export type { Lesson, Param, Params, Handle, LessonScene, LessonDot, LessonPath } from "./types";
