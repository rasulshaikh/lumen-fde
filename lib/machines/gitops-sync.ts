/**
 * The reconcile loop, and what "Healthy" is actually claiming.
 *
 * Explains plan row 9, "GitOps: Helm charts and ArgoCD".
 *
 * The loop never stops. Observe what is live, render the chart at the revision git says, compare,
 * sync in waves, assess health, and start again in three minutes. That continuous quality is the
 * whole difference from a pipeline: `terraform apply` runs when you run it, and a reconciler is
 * always running, which means drift is not something you discover at the next deploy but something
 * the system is actively fighting.
 *
 * The fault worth the machine is the last stage. "Healthy" is a claim assembled from resource
 * status, and a Deployment with no readiness probe reports available the moment its containers
 * start - so a workload that cannot serve a single request rolls out green, and the dashboard that
 * was supposed to be the safety net is the thing that confirms the mistake.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const MANUAL_EDIT = "manual-edit";
const PRUNE_OFF = "prune-off";
const HEALTH_LIES = "health-lies";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["git", "Git", 30, 44, "store"],
  ["render", "Rendered chart", 120, 44, "service"],
  ["diff", "Diff", 214, 44, "service"],
  ["cluster", "Cluster", 214, 128, "service"],
  ["health", "Health", 120, 128, "service"],
  ["ops", "Dashboard", 30, 128, "actor"],
];

const EDGES = [
  { from: "git", to: "render", dashed: true },
  { from: "render", to: "diff", dashed: true },
  { from: "cluster", to: "diff", dashed: true },
  { from: "diff", to: "cluster", dashed: true },
  { from: "cluster", to: "health", dashed: true },
  { from: "health", to: "ops", dashed: true },
  { from: "ops", to: "git", dashed: true },
];

export const gitopsSync: Machine = {
  id: "gitops-sync",
  title: "The reconcile loop, and what Healthy is claiming",
  short: "ArgoCD reconcile",
  subtitle: "It never stops running. That is the difference from a pipeline, and it is where the surprises live.",
  topicIndices: [9],
  steps: ["Observe live state", "Render at the target revision", "Diff", "Sync in waves", "Assess health", "Loop again"],
  faults: [
    { id: MANUAL_EDIT, label: "Someone ran kubectl edit", blurb: "During an incident, correctly. With self-heal off the app sits OutOfSync indefinitely; with it on, the fix is reverted within minutes." },
    { id: PRUNE_OFF, label: "Prune is disabled", blurb: "Deleting a file from git removes nothing from the cluster. Everything ever deployed is still running, and nobody knows which parts." },
    { id: HEALTH_LIES, label: "No readiness probe", blurb: "The Deployment reports available as soon as the container starts. Sync goes green on a workload that cannot serve a request." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const edited = faults.includes(MANUAL_EDIT);
    const noPrune = faults.includes(PRUNE_OFF);
    const blindHealth = faults.includes(HEALTH_LIES);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ cluster: edited ? "replicas: 6 (edited)" : "replicas: 3" }, edited ? ["cluster"] : []),
        tokens: [{ id: "obs", from: "cluster", to: "diff", at: p,
          label: edited ? "live: 6 replicas" : "live state", tone: edited ? "slow" : "normal" }],
        caption: edited
          ? "The live state includes a change nobody committed."
          : "The reconciler reads what is actually running.",
        detail: edited
          ? "Someone scaled the deployment during an incident and it was the right call. The cluster is now describing a state that git has never seen, and the reconciler has no way to know the difference between a deliberate emergency fix and an accident - it only sees a disagreement."
          : "The loop starts from reality rather than from a record of the last deploy. That is why a reconciler notices a resource somebody deleted by hand, and a pipeline does not." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ git: "revision 7c3f1a", render: "18 manifests" }),
        tokens: [{ id: "rn", from: "git", to: "render", at: p, label: "helm template", tone: "normal" }],
        caption: "The chart is rendered at the revision git names, not at latest.",
        detail: "Rendering is a pure function of the chart, the values and the revision, which is what makes the desired state reproducible - the same commit renders the same manifests next year. It is also the step where an unpinned chart dependency quietly makes that untrue, so pin them." };
    }

    if (s === 2) {
      const parts = [edited ? "replicas differ" : "", noPrune ? "3 orphans ignored" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ diff: parts.length ? parts.join(", ") : "in sync" }, parts.length ? ["diff"] : []),
        tokens: [{ id: "df", from: "render", to: "diff", at: p, label: parts.length ? "OutOfSync" : "Synced", tone: parts.length ? "slow" : "normal" }],
        caption: parts.length ? "The rendered manifests and the live cluster disagree." : "Rendered manifests match the cluster exactly.",
        detail: edited
          ? "This is drift, and what happens next is a setting rather than a law. With self-heal on, the reconciler reverts the manual change within minutes - which is correct in general and can end an incident's fix while the incident is still running. With it off, the application sits OutOfSync until a human decides, and OutOfSync is a state teams learn to ignore. Neither default is safe on its own; the discipline is that an emergency change is not finished until it is in git."
          : noPrune
            ? "Three resources exist in the cluster and in no rendered manifest. The diff can see them and has been told not to care, so they will not appear here as a problem - only as three things nobody can account for."
            : "A clean diff is the only proof that the cluster, the chart and the commit all describe the same system. Anything else is a belief about the last deploy.",
        fault: parts.length ? "Not in sync." : undefined };
    }

    if (s === 3) {
      if (noPrune) {
        return { ...base, nodes: nodes({ cluster: "old CronJob still running" }, ["cluster"]),
          tokens: [{ id: "sy", from: "diff", to: "cluster", at: p, label: "apply, prune off", tone: "fault" }],
          caption: "New resources are applied. Nothing is ever removed.",
          detail: "Deleting a manifest from git removes it from the desired state and leaves it running in the cluster, so the CronJob that was decommissioned six months ago is still firing on schedule against a database that has since been migrated. Prune is off because turning it on is frightening, and it is frightening because nobody is sure what is out there - which is the loop that has to be broken once, deliberately, with a dry run.",
          fault: "Removed from git, still running." };
      }
      return { ...base, nodes: nodes({ cluster: "wave 1: CRDs, wave 2: apps" }),
        tokens: [{ id: "sy", from: "diff", to: "cluster", at: p, label: "sync waves", tone: "normal" }],
        caption: "Resources are applied in waves, so dependencies exist before their dependants.",
        detail: "Custom resource definitions before the custom resources that use them, migrations before the deployment that expects the new schema. Without ordering the first apply of a fresh environment fails on resources that would have been valid thirty seconds later, which is why a chart that works on an existing cluster can be untestable on a new one." };
    }

    if (s === 4) {
      if (blindHealth) {
        return { ...base, nodes: nodes({ health: "Healthy", cluster: "0 requests served" }, ["health"]),
          tokens: [{ id: "hl", from: "cluster", to: "health", at: p, label: "available: true", tone: "fault" }],
          caption: "Reported Healthy. The pods are running and cannot serve a single request.",
          detail: "A Deployment's health is assessed from its status, and without a readiness probe a pod counts as available as soon as its container process exists - before the application has connected to its database, loaded its config or bound a port. Sync goes green, the rollout completes, and the dashboard that was meant to catch this confirms it instead. This is the same defect shape as an admission webhook that fails open: a control reporting success because it has nothing to check. Add a readiness probe that touches a real dependency, and treat any resource type whose health you have not defined as unknown rather than healthy.",
          fault: "Green, on a workload that does not work." };
      }
      return { ...base, nodes: nodes({ health: "Healthy (probes passing)" }),
        tokens: [{ id: "hl", from: "cluster", to: "health", at: p, label: "ready 3/3", tone: "normal" }],
        caption: "Health is assessed from readiness, not from the process existing.",
        detail: "Health is a per-resource-kind judgement the reconciler makes, and for anything custom it is whatever you taught it - which means an unhealthy custom resource reads as healthy by default. The rollback decision hangs off this number, so it is worth being precise about what it is claiming." };
    }

    const stuck = edited || noPrune || blindHealth;
    return { ...base, nodes: nodes({ ops: stuck ? "green, and wrong" : "Synced, Healthy" }, stuck ? ["ops"] : []),
      tokens: [{ id: "lp", from: "health", to: "ops", at: p, label: stuck ? "misleading" : "Synced", tone: stuck ? "slow" : "normal" }],
      caption: stuck
        ? "The loop runs again in three minutes and reports the same thing."
        : "Three minutes later the loop runs again, and keeps running.",
      detail: stuck
        ? "A reconciler repeats its judgement continuously, which makes a wrong judgement continuously reassuring. The value of GitOps is that git is the record of intent - and that only holds while what is running and what is committed are the same thing, which is a property somebody has to maintain rather than one the tool provides."
        : "Continuous reconciliation means the answer to 'what is running in production' is a git revision rather than an investigation, and that is the actual deliverable. Everything else - waves, prune, health - exists to make that sentence true rather than aspirational." };
  },
};
