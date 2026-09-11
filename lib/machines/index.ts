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
import { rebase } from "./rebase";
import { raft } from "./raft";
import { samlSso } from "./saml-sso";
import { secretRotation } from "./secret-rotation";
import { sseResume } from "./sse-resume";
import { sparkJob } from "./spark-job";
import { systemdBoot } from "./systemd-boot";
import { trainingLoop } from "./training-loop";
import { temporalReplay } from "./temporal-replay";
import { supportBundle } from "./support-bundle";
import { tcp } from "./tcp";
import { terraformPlan } from "./terraform-plan";
import { vpcPath } from "./vpc-path";
import { expandContract } from "./expand-contract";
import { gitopsSync } from "./gitops-sync";
import { iamEval } from "./iam-eval";
import { leakageOrder } from "./leakage-order";
import type { Machine } from "./types";

// Sorted by the first plan row each machine explains, so the list genuinely reads as a path
// through the syllabus. Sorting at the module boundary rather than by hand keeps the comment above
// true when a machine is added - a hand-maintained order is a comment that decays silently.
export const MACHINES: Machine[] = [
  systemdBoot, tcp, rebase, containerStart, k8s, gitopsSync, admission, terraformPlan, vpcPath,
  iamEval, supportBundle, oauthPkce, sseResume, temporalReplay, sparkJob, raft, mcpTools, rag,
  secretRotation, samlSso, expandContract, leakageOrder, trainingLoop,
].sort((a, b) => Math.min(...a.topicIndices) - Math.min(...b.topicIndices));

export const machineById = (id: string): Machine | null => MACHINES.find((m) => m.id === id) ?? null;

/** Machines that explain a given plan topic, for linking from the syllabus panel. */
export const machinesForTopic = (index: number): Machine[] => MACHINES.filter((m) => m.topicIndices.includes(index));

export * from "./types";
