/**
 * The machine registry.
 *
 * Ordered by where they sit in the plan rather than by how impressive they look, so the list reads
 * as a path through the syllabus and not as a demo reel.
 */
import { admission } from "./admission";
import { containerStart } from "./container-start";
import { k8s } from "./k8s";
import { mcpTools } from "./mcp-tools";
import { oauthPkce } from "./oauth-pkce";
import { rag } from "./rag";
import { raft } from "./raft";
import { samlSso } from "./saml-sso";
import { secretRotation } from "./secret-rotation";
import { sseResume } from "./sse-resume";
import { supportBundle } from "./support-bundle";
import { tcp } from "./tcp";
import { terraformPlan } from "./terraform-plan";
import { vpcPath } from "./vpc-path";
import { expandContract } from "./expand-contract";
import { gitopsSync } from "./gitops-sync";
import { iamEval } from "./iam-eval";
import type { Machine } from "./types";

export const MACHINES: Machine[] = [tcp, containerStart, k8s, admission, terraformPlan, vpcPath, iamEval, oauthPkce, samlSso, gitopsSync, expandContract, secretRotation, supportBundle, sseResume, raft, mcpTools, rag];

export const machineById = (id: string): Machine | null => MACHINES.find((m) => m.id === id) ?? null;

/** Machines that explain a given plan topic, for linking from the syllabus panel. */
export const machinesForTopic = (index: number): Machine[] => MACHINES.filter((m) => m.topicIndices.includes(index));

export * from "./types";
