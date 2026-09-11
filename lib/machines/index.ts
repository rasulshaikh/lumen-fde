/**
 * The machine registry.
 *
 * Ordered by where they sit in the plan rather than by how impressive they look, so the list reads
 * as a path through the syllabus and not as a demo reel.
 */
import { admission } from "./admission";
import { k8s } from "./k8s";
import { oauthPkce } from "./oauth-pkce";
import { rag } from "./rag";
import { tcp } from "./tcp";
import { terraformPlan } from "./terraform-plan";
import { vpcPath } from "./vpc-path";
import { iamEval } from "./iam-eval";
import type { Machine } from "./types";

export const MACHINES: Machine[] = [tcp, k8s, admission, terraformPlan, vpcPath, iamEval, oauthPkce, rag];

export const machineById = (id: string): Machine | null => MACHINES.find((m) => m.id === id) ?? null;

/** Machines that explain a given plan topic, for linking from the syllabus panel. */
export const machinesForTopic = (index: number): Machine[] => MACHINES.filter((m) => m.topicIndices.includes(index));

export * from "./types";
