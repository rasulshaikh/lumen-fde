/**
 * The Kubernetes admission chain, and the control that passes because it is broken.
 *
 * Explains plan row 10, "Kubernetes security: Pod Security, RBAC, secrets, image policy, runtime".
 *
 * This is a different sequence from the scheduler in `k8s.ts` and it runs first: nothing is
 * scheduled until the API server has been persuaded to write the object down. Authenticate,
 * authorise, mutate, validate the schema, validate by policy, persist. Six stages, and the order is
 * the reason mutating webhooks can inject a sidecar that a validating webhook then rejects.
 *
 * The fault worth the whole machine is the image policy webhook with `failurePolicy: Ignore`. When
 * it times out, the API server admits the pod. The dashboard is green, the webhook is installed, the
 * policy is configured, and every unsigned image in the registry goes straight through. A control
 * that fails open reports success at precisely the moment it has stopped working.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const RBAC_NO_VERB = "rbac-no-verb";
const WEBHOOK_TIMEOUT = "webhook-timeout";
const PSA_RESTRICTED = "psa-restricted";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["kubectl", "kubectl", 26, 82, "actor"],
  ["authn", "Authenticate", 82, 40, "service"],
  ["authz", "RBAC", 138, 40, "service"],
  ["mutate", "Mutating", 196, 40, "service"],
  ["schema", "Schema", 252, 40, "service"],
  ["validate", "Validating + PSA", 196, 124, "service"],
  ["etcd", "etcd", 96, 124, "store"],
];

const EDGES = [
  { from: "kubectl", to: "authn", dashed: true },
  { from: "authn", to: "authz", dashed: true },
  { from: "authz", to: "mutate", dashed: true },
  { from: "mutate", to: "schema", dashed: true },
  { from: "schema", to: "validate", dashed: true },
  { from: "validate", to: "etcd", dashed: true },
  { from: "etcd", to: "kubectl", dashed: true },
];

export const admission: Machine = {
  id: "admission",
  title: "The admission chain, and the control that fails open",
  short: "Admission chain",
  subtitle: "Six stages before a pod object exists at all. One of them reports success when it stops working.",
  topicIndices: [10],
  steps: ["Authenticate", "Authorise (RBAC)", "Mutating webhooks", "Schema validation", "Validating webhooks + Pod Security", "Persist to etcd"],
  faults: [
    { id: RBAC_NO_VERB, label: "The role has get but not create", blurb: "The commonest RBAC mistake: a role assembled from what someone needed to read, used later by something that needs to write." },
    { id: WEBHOOK_TIMEOUT, label: "Image policy webhook times out", blurb: "failurePolicy: Ignore. The webhook is installed, configured and completely ineffective, and nothing in the cluster says so." },
    { id: PSA_RESTRICTED, label: "Pod runs as root under a restricted namespace", blurb: "Pod Security admission is built in rather than a webhook, so it cannot time out and it cannot be made to fail open." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const noVerb = faults.includes(RBAC_NO_VERB);
    const slowHook = faults.includes(WEBHOOK_TIMEOUT);
    const rootPod = faults.includes(PSA_RESTRICTED);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // RBAC refuses before anything else in this machine runs, so the later faults are unreachable.
    // They are named rather than swallowed: a policy that cannot matter because the request never
    // arrived is the thing that makes people believe a control is working.
    if (noVerb && s >= 2) {
      const unreached = [slowHook ? "the image policy webhook" : "", rootPod ? "Pod Security" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ authz: "no create verb" }, ["authz"]), tokens: [],
        caption: "Nothing reached this stage. RBAC refused the request two stages ago.",
        detail: "Admission is a pipeline and RBAC sits near the front of it, so every webhook you installed downstream is untouched and silent. An admission controller that logs nothing is indistinguishable from one that approved something, which is why 'the webhook did not complain' is never evidence.",
        fault: `Forbidden at RBAC.${unreached.length ? ` ${unreached.join(" and ")} never ran: neither would have seen this request even if it had been wrong.` : ""}` };
    }

    if (s === 0) {
      return { ...base, nodes: nodes({ authn: "cert CN + groups" }),
        tokens: [{ id: "req", from: "kubectl", to: "authn", at: p, label: "POST /pods", tone: "normal" }],
        caption: "The API server works out who is asking. It does not create the identity.",
        detail: "Kubernetes has no user objects. It reads an identity out of a client certificate, a bearer token or an OIDC claim and hands the resulting username and groups to the next stage. That is why you cannot list the users in a cluster: there is nothing to list." };
    }

    if (s === 1) {
      if (noVerb) {
        return { ...base, nodes: nodes({ authz: "get: yes, create: no" }, ["authz"]),
          tokens: [{ id: "req", from: "authn", to: "authz", at: Math.min(p, 0.5), label: "POST /pods", tone: "fault" }],
          caption: "The role can read pods and cannot make them.",
          detail: "RBAC is additive and there is no deny rule, so a role that looks generous can still be missing exactly one verb. The error names the verb, the resource and the namespace, and it is one of the few Kubernetes errors that tells you precisely what to add - which is why reading it beats guessing at a ClusterRoleBinding.",
          fault: "Forbidden: no create verb on pods." };
      }
      return { ...base, nodes: nodes({ authz: "create pods: allowed" }),
        tokens: [{ id: "req", from: "authn", to: "authz", at: p, label: "POST /pods", tone: "normal" }],
        caption: "The identity is allowed to create pods in this namespace.",
        detail: "RBAC answers one question - may this subject perform this verb on this resource here - and nothing about the contents of the object. A role that permits creating pods permits creating a privileged one, which is the gap Pod Security exists to close." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ mutate: "sidecar injected" }),
        tokens: [{ id: "req", from: "authz", to: "mutate", at: p, label: "pod spec", tone: "normal" }],
        caption: "Mutating webhooks rewrite the object before anyone validates it.",
        detail: "This is where a service mesh adds its proxy and where a defaulting webhook fills in what you left out. It runs before validation on purpose, so the thing being judged is the thing that will actually run - and it is also why a rejection can name a container you never wrote." };
    }

    if (s === 3) {
      return { ...base, nodes: nodes({ schema: "structurally valid" }),
        tokens: [{ id: "req", from: "mutate", to: "schema", at: p, label: "mutated spec", tone: "normal" }],
        caption: "The object is checked against the schema, after mutation.",
        detail: "Field types, required keys, unknown fields. This catches a typo in an apiVersion and nothing about intent. A pod that is perfectly valid and grants itself the host network passes this stage without comment." };
    }

    if (s === 4) {
      const hookNote = slowHook ? "timed out - ignored" : "signature verified";
      const psaNote = rootPod ? "runAsNonRoot required" : "restricted: satisfied";
      if (rootPod) {
        return { ...base, nodes: nodes({ validate: `${hookNote} · ${psaNote}` }, ["validate"]),
          tokens: [{ id: "req", from: "schema", to: "validate", at: Math.min(p, 0.55), label: "mutated spec", tone: "fault" }],
          caption: slowHook
            ? "The image webhook timed out and was ignored. Pod Security refused anyway."
            : "Pod Security refuses the pod: the restricted profile forbids running as root.",
          detail: slowHook
            ? "Two controls, two very different failure modes, in the same stage. The webhook failed open and admitted an unverified image; Pod Security is compiled into the API server, has no network call to lose and therefore has nothing to fail open into. When you can choose, prefer the control that cannot be made unavailable."
            : "Pod Security admission enforces a namespace label, not a policy object, and the restricted profile is the one worth defaulting to: no root, no privilege escalation, a seccomp profile, all capabilities dropped. The rejection names the exact field, so this is a fast fix rather than an investigation.",
          fault: `Rejected by Pod Security.${slowHook ? " The image policy webhook also failed, silently and in the other direction." : ""}` };
      }
      if (slowHook) {
        return { ...base, nodes: nodes({ validate: "timed out - admitted" }, ["validate"]),
          tokens: [{ id: "req", from: "schema", to: "validate", at: p, label: "unverified image", tone: "slow" }],
          caption: "The image policy webhook did not answer in time, so the pod was admitted.",
          detail: "failurePolicy: Ignore means a webhook that cannot be reached is treated as consent. The webhook is installed, the ValidatingWebhookConfiguration is correct, the deployment is green, and every image in the cluster is now unchecked. The only signal is a latency metric nobody alerts on. Set failurePolicy: Fail for anything that is genuinely a control, and accept that a broken webhook then breaks deployments - which is the honest version of the same situation.",
          fault: "Admitted without verification. The control reports healthy." };
      }
      return { ...base, nodes: nodes({ validate: `${hookNote} · ${psaNote}` }),
        tokens: [{ id: "req", from: "schema", to: "validate", at: p, label: "mutated spec", tone: "normal" }],
        caption: "Policy webhooks and Pod Security both agree to admit it.",
        detail: "Validating webhooks may only accept or reject - they cannot edit, which is why mutation had its own earlier stage. Pod Security runs here too and is built in, so unlike the webhooks beside it there is no network hop that could turn a refusal into an approval." };
    }

    return { ...base, nodes: nodes({ etcd: "object written" }),
      tokens: [{ id: "ok", from: "validate", to: "etcd", at: p, label: "Pod object", tone: "normal" }],
      caption: "Only now does the pod exist. The scheduler has not seen it yet.",
      detail: "Everything up to this point happened before there was an object at all, which is why an admission failure leaves nothing behind to inspect - no pod, no events on a pod, only an error returned to whoever asked. The scheduling story in the other machine starts from here." };
  },
};
