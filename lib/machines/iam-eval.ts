/**
 * How AWS decides, and the order almost nobody has actually learned.
 *
 * Explains plan row 16, "IAM and cloud security: least privilege, roles, IRSA, secrets".
 *
 * Policy evaluation is a defined, ordered pipeline, and it is almost always taught as a vague sense
 * that "deny wins". Deny does win, but the interesting part is everything after it: a permission
 * boundary is an INTERSECTION rather than a grant, an SCP can stop a root account, and a
 * resource-based policy is the one place where an allow can come from outside the principal's own
 * account.
 *
 * Break the boundary and watch a request with a perfectly correct identity policy get refused with
 * no deny statement anywhere in the account.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const EXPLICIT_DENY = "explicit-deny";
const SCP_BLOCKS = "scp-blocks";
const BOUNDARY_NARROW = "boundary-narrow";

const node = (id: string, label: string, x: number, y: number, note?: string, down = false): SceneNode =>
  ({ id, label, x, y, kind: "service", note, down });

const CALLER = { id: "caller", label: "Role", x: 30, y: 82, kind: "actor" as const };
const LAYOUT: Array<[string, string, number]> = [
  ["deny", "Explicit deny", 92],
  ["scp", "SCP", 148],
  ["res", "Resource policy", 204],
  ["boundary", "Boundary", 254],
  ["identity", "Identity policy", 300],
];

const EDGES = [
  { from: "caller", to: "deny", dashed: true },
  { from: "deny", to: "scp", dashed: true },
  { from: "scp", to: "res", dashed: true },
  { from: "res", to: "boundary", dashed: true },
  { from: "boundary", to: "identity", dashed: true },
  // The answer travels back to the caller, so the edge it travels has to exist.
  { from: "identity", to: "caller", dashed: true },
];

export const iamEval: Machine = {
  id: "iam-eval",
  title: "How AWS decides, and the order nobody learned",
  short: "IAM order",
  subtitle: "Six gates in a fixed order. Five can only refuse; one of them is the only thing that can grant across accounts.",
  topicIndices: [16],
  steps: ["Explicit deny", "Service control policy", "Resource policy", "Permission boundary", "Identity policy", "Decision"],
  faults: [
    { id: EXPLICIT_DENY, label: "An explicit Deny somewhere", blurb: "One Deny statement, in any policy that applies. Nothing later in the pipeline can undo it, including an administrator." },
    { id: SCP_BLOCKS, label: "An SCP excludes the action", blurb: "An Organizations guardrail. It applies to the account, so it stops the root user too - which is the point of it." },
    { id: BOUNDARY_NARROW, label: "Permission boundary is narrower", blurb: "The boundary allows s3:GetObject and the request is s3:PutObject. No Deny exists anywhere and the request still fails." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const denied = faults.includes(EXPLICIT_DENY);
    const scp = faults.includes(SCP_BLOCKS);
    const boundary = faults.includes(BOUNDARY_NARROW);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] => [
      CALLER,
      ...LAYOUT.map(([id, label, x]) => node(id, label, x, 82, notes[id], downs.includes(id))),
    ];
    const base = { edges: EDGES };

    // The gate that actually stopped it, in pipeline order.
    const stoppedAt = denied ? 0 : scp ? 1 : boundary ? 3 : -1;
    const stoppedName = stoppedAt >= 0 ? LAYOUT[stoppedAt][0] : "";

    if (stoppedAt >= 0 && s > stoppedAt) {
      return { ...base, nodes: nodes({ [stoppedName]: "refused here" }, [stoppedName]), tokens: [],
        caption: "The request was already refused. Nothing after this point is consulted.",
        detail: "Evaluation stops at the first gate that refuses, so every policy later in the order is irrelevant to this call - including a correct one. Reading the identity policy to explain a denial is the commonest wasted hour in an AWS access ticket.",
        fault: (() => {
          // Later gates the reader also broke are named. They are genuinely irrelevant to this
          // call, and "irrelevant because something earlier already refused" is exactly the thing
          // the ordering exists to teach.
          const later = [
            stoppedAt < 1 && scp ? "the SCP" : "",
            stoppedAt < 3 && boundary ? "the permission boundary" : "",
          ].filter(Boolean);
          return `Refused at ${LAYOUT[stoppedAt][1]}.${later.length ? ` ${later.join(" and ")} would also refuse, and neither is consulted - fixing this one reveals the next.` : ""}`;
        })() };
    }

    if (s === 0) {
      if (denied) {
        return { ...base, nodes: nodes({ deny: "Deny matched" }, ["deny"]),
          tokens: [{ id: "req", from: "caller", to: "deny", at: Math.min(p, 0.5), label: "s3:PutObject", tone: "fault" }],
          caption: "An explicit Deny matches. The answer is no, and it is final.",
          detail: "There is no policy, role, escalation or administrator that overturns an explicit Deny. It is checked first because nothing later could change the outcome, and that is also why a stray Deny in an inherited policy is so hard to find: everything you would go and read is never reached.",
          fault: "Explicit Deny." };
      }
      return { ...base, nodes: nodes({ deny: "none matched" }),
        tokens: [{ id: "req", from: "caller", to: "deny", at: p, label: "s3:PutObject", tone: "normal" }],
        caption: "No explicit Deny matches, so evaluation continues.",
        detail: "Everything from here on is looking for an allow, and the default at the end of the pipeline is refusal. AWS is deny-by-default, so silence anywhere in the middle is not permission." };
    }

    if (s === 1) {
      if (scp) {
        return { ...base, nodes: nodes({ scp: "action not permitted" }, ["scp"]),
          tokens: [{ id: "req", from: "deny", to: "scp", at: Math.min(p, 0.5), label: "s3:PutObject", tone: "fault" }],
          caption: "A service control policy does not permit the action in this account.",
          detail: "An SCP is a ceiling, not a grant: it can only remove permissions that were otherwise available. It applies to every principal in the account including the root user, which is why it is the control that survives a compromised administrator.",
          fault: "Blocked by an SCP." };
      }
      return { ...base, nodes: nodes({ scp: "permitted" }),
        tokens: [{ id: "req", from: "deny", to: "scp", at: p, label: "s3:PutObject", tone: "normal" }],
        caption: "The organisation's guardrails permit this action in this account.",
        detail: "An SCP permitting something grants nothing at all. It has only declined to remove it, and the request still needs an allow from somewhere further down." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ res: "bucket policy: allow" }),
        tokens: [{ id: "req", from: "scp", to: "res", at: p, label: "s3:PutObject", tone: "normal" }],
        caption: "The bucket's own policy allows this principal.",
        detail: "This is the only gate that can grant across an account boundary. A role in one account can write to a bucket in another with nothing in its own identity policy naming that bucket - which is how cross-account access works and why an unexpected bucket policy is a real finding." };
    }

    if (s === 3) {
      if (boundary) {
        return { ...base, nodes: nodes({ boundary: "allows GetObject only" }, ["boundary"]),
          tokens: [{ id: "req", from: "res", to: "boundary", at: Math.min(p, 0.5), label: "s3:PutObject", tone: "fault" }],
          caption: "The permission boundary allows GetObject. The request is PutObject.",
          detail: "A boundary does not grant anything - it caps what the identity policy can grant, so the effective permission is the INTERSECTION of the two. This request fails with no Deny statement existing anywhere in the account, and the identity policy that would explain it says Allow.",
          fault: "Outside the boundary." };
      }
      return { ...base, nodes: nodes({ boundary: "within" }),
        tokens: [{ id: "req", from: "res", to: "boundary", at: p, label: "s3:PutObject", tone: "normal" }],
        caption: "The action is inside the permission boundary attached to this role.",
        detail: "Boundaries are how you let a team create roles without letting them create roles more powerful than themselves. They are an intersection, so a boundary and an identity policy that each look correct alone can still produce no access together." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ identity: "Allow s3:PutObject" }),
        tokens: [{ id: "req", from: "boundary", to: "identity", at: p, label: "s3:PutObject", tone: "normal" }],
        caption: "The role's own identity policy allows the action.",
        detail: "This is the policy people read first and it is the last thing consulted. It is also the only one most engineers can see without organisation-level access, which is why an access ticket so often ends with everything looking correct." };
    }

    return { ...base, nodes: nodes({ identity: "allowed" }),
      tokens: [{ id: "ok", from: "identity", to: "caller", at: p, label: "allowed", tone: "normal" }],
      caption: "Allowed. Every gate in the order had to agree.",
      detail: "Five things had to not refuse and at least one had to allow. Nothing here is a majority vote: a single refusal anywhere stops the call, and an allow only counts if it arrives from the identity or resource policy." };
  },
};
