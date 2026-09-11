/**
 * Kubernetes: how a pod gets onto a node, and the two ways it never does.
 *
 * Explains plan rows 7 and 8 - "Kubernetes core" and "Kubernetes production ops: probes, HPA,
 * requests and limits".
 *
 * The scheduler is a filter and a score, and almost everyone learns it as magic. The two faults
 * here are the two support tickets you will actually get: a pod stuck Pending because nothing can
 * fit it, and a pod that starts fine and never becomes Ready because someone set a probe for a
 * process that has not finished booting. Both look like "Kubernetes is broken" and neither is.
 */
import { clamp01, dialValue, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CORDON = "cordon-a";
const NO_CAPACITY = "no-capacity";
const TIGHT_PROBE = "tight-probe";

const api = (note?: string, down = false): SceneNode => ({ id: "api", label: "API server", x: 48, y: 82, kind: "service", note, down });
const sched = (note?: string): SceneNode => ({ id: "sched", label: "Scheduler", x: 152, y: 82, kind: "service", note });
const nodeA = (note?: string, dim = false, down = false): SceneNode => ({ id: "nodeA", label: "node-a", x: 268, y: 38, kind: "store", note, dim, down });
const nodeB = (note?: string, dim = false, down = false): SceneNode => ({ id: "nodeB", label: "node-b", x: 268, y: 126, kind: "store", note, dim, down });

const EDGES = [
  { from: "api", to: "sched", dashed: true },
  { from: "sched", to: "nodeA", dashed: true },
  { from: "sched", to: "nodeB", dashed: true },
  { from: "api", to: "nodeA", dashed: true },
  { from: "api", to: "nodeB", dashed: true },
  { from: "nodeA", to: "api", dashed: true },
  { from: "nodeB", to: "api", dashed: true },
  { from: "sched", to: "api", dashed: true },
];

export const k8s: Machine = {
  id: "k8s",
  title: "Kubernetes: scheduling a pod, and the two ways it never runs",
  short: "Pod scheduling",
  subtitle: "Filter, score, bind, start, become Ready. Break a node or a probe and watch which of those five stops.",
  topicIndices: [7, 8],
  steps: ["Pod created", "Filter", "Score", "Bind", "Kubelet starts it", "Ready"],
  /*
   * Two dials rather than a "node-b is full" checkbox.
   *
   * Requests-versus-capacity is the arithmetic behind most Pending tickets, and it is usually
   * learned as a rule ("the pod did not fit") instead of as a number. Dragging the request up
   * until the pod stops fitting is the same fact with the threshold discovered rather than
   * announced - and it makes the second thing visible too, which is that the scheduler compares
   * against REQUESTS and not against what the node is really using.
   */
  dials: [
    { id: "request", label: "This pod's memory request", min: 1, max: 12, step: 0.5, unit: "Gi", value: 2,
      hint: "What the pod asks for. Pull it up until node-b stops being able to take it." },
    { id: "free", label: "node-b unrequested memory", min: 0, max: 16, step: 0.5, unit: "Gi", value: 8,
      hint: "What is left after every other pod's request. Not what is free in top." },
  ],
  faults: [
    { id: CORDON, label: "Cordon node-a", blurb: "Mark a node unschedulable, the way you would before draining it for maintenance." },
    { id: NO_CAPACITY, label: "node-b is full", blurb: "The remaining node has no memory left for this pod's request. Requests, not usage." },
    { id: TIGHT_PROBE, label: "Readiness probe too aggressive", blurb: "A one-second timeout on a process that needs twenty to boot. The container is fine. It just never gets to say so." },
  ],

  scene(step, phase, faults, dials): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const cordoned = faults.includes(CORDON);
    const request = dialValue(k8s, dials, "request");
    const free = dialValue(k8s, dials, "free");
    // The fault and the dials say the same thing two ways: the checkbox is the shortcut, the dials
    // are the arithmetic. Either can make node-b unable to take the pod.
    const full = faults.includes(NO_CAPACITY) || free < request;
    const fit = `${free}Gi free, asks ${request}Gi`;
    const tight = faults.includes(TIGHT_PROBE);
    const feasible = (!cordoned ? 1 : 0) + (!full ? 1 : 0);
    const target = !cordoned ? "nodeA" : "nodeB";

    if (s === 0) {
      return { nodes: [api("pod: Pending"), sched(), nodeA(cordoned ? "cordoned" : "2 pods", cordoned, cordoned), nodeB(full ? `too small: ${fit}` : fit, full)], edges: EDGES,
        tokens: [{ id: "pod", from: "api", to: "sched", at: p, label: "pod/api-7f4", tone: "normal" }],
        caption: "A pod object exists with no node assigned. That is all Pending means.",
        detail: "Nothing has been rejected. The pod is simply a row in etcd with an empty nodeName, and the scheduler's whole job is to fill that one field in." };
    }

    if (s === 1) {
      if (feasible === 0) {
        return { nodes: [api("pod: Pending"), sched("0 feasible"), nodeA("cordoned", true, true), nodeB("insufficient memory", true, true)], edges: EDGES, tokens: [],
          caption: "Both nodes are filtered out. Nothing can run this pod.",
          detail: "The event says 0/2 nodes are available and names the reason per node. That event is the answer to the ticket, and it is the first thing to read rather than the last.",
          fault: "You removed every place this pod could go." };
      }
      return { nodes: [api("pod: Pending"), sched(`${feasible} feasible`), nodeA(cordoned ? "filtered: cordoned" : "fits", cordoned), nodeB(full ? `filtered: ${fit}` : `fits: ${fit}`, full)], edges: EDGES,
        tokens: [{ id: "f", from: "sched", to: cordoned ? "nodeB" : "nodeA", at: p, label: "can you fit this?", tone: "normal" }],
        caption: "The scheduler filters: which nodes could run this pod at all?",
        detail: "Filtering is on requests, not on what is actually being used. A node at 90% real memory with nothing requested still looks empty here, which is how a cluster ends up overcommitted and surprised.",
        fault: cordoned || full ? "A node has been taken out of the running." : undefined };
    }

    if (s === 2) {
      if (feasible === 0) {
        return { nodes: [api("pod: Pending 4m"), sched("nothing to score"), nodeA("cordoned", true, true), nodeB("insufficient memory", true, true)], edges: EDGES, tokens: [],
          caption: "There is nothing to score. The pod stays Pending.",
          detail: "It will sit here indefinitely and retry. Kubernetes does not fail this pod, because from its point of view nothing has failed yet - capacity might appear.",
          fault: "Pending is not an error state. That is why nothing alerts." };
      }
      return { nodes: [api("pod: Pending"), sched("scoring"), nodeA(cordoned ? "out" : "score 74", cordoned), nodeB(full ? "out" : "score 61", full)], edges: EDGES, tokens: [],
        caption: `Feasible nodes are scored. ${feasible === 1 ? "Only one is left, so it wins by default." : "Spread, affinity and image locality all weigh in."}`,
        detail: "Scoring is a preference, not a guarantee. A pod that must land somewhere specific needs a rule that filters, like a nodeSelector or a taint, not one that merely scores." };
    }

    if (s === 3) {
      if (feasible === 0) {
        return { nodes: [api("pod: Pending 4m"), sched("no binding"), nodeA("cordoned", true, true), nodeB("insufficient memory", true, true)], edges: EDGES, tokens: [],
          caption: "No binding is written. Nothing changes.",
          detail: "Every loop the scheduler tries again and writes the same event. The pod is not lost and is not running, which is the least useful pair of facts a system can give you.",
          fault: "Uncordon a node or lower the request to break the loop." };
      }
      return { nodes: [api("nodeName set"), sched("bound"), nodeA(target === "nodeA" ? "assigned" : "out", cordoned), nodeB(target === "nodeB" ? "assigned" : "out", full)], edges: EDGES,
        tokens: [{ id: "bind", from: "sched", to: "api", at: p, label: "bind -> " + (target === "nodeA" ? "node-a" : "node-b"), tone: "normal" }],
        caption: "The scheduler writes the binding back to the API server.",
        detail: "The scheduler never contacts the node. It sets a field. The kubelet on that node is watching for its own name and picks the work up from there - the whole system is that pattern repeated." };
    }

    if (s === 4) {
      if (feasible === 0) {
        return { nodes: [api("pod: Pending 6m"), sched("still nothing to bind"), nodeA("cordoned", true, true), nodeB("insufficient memory", true, true)], edges: EDGES, tokens: [],
          caption: "No kubelet has anything to start. There is no container.",
          detail: "Every step past scheduling is a step this pod never reaches. That is what makes Pending so easy to misread as a slow start: the sequence has not stalled somewhere in the middle, it never began.",
          fault: "Nothing was bound, so nothing is starting." };
      }
      return { nodes: [api("pod: ContainerCreating"), sched("done"), nodeA(target === "nodeA" ? "pulling image" : "", cordoned), nodeB(target === "nodeB" ? "pulling image" : "", full)], edges: EDGES,
        tokens: [{ id: "start", from: "api", to: target, at: p, label: "kubelet: start", tone: "normal" }],
        caption: "The kubelet on the assigned node pulls the image and starts the container.",
        detail: "Running is not Ready. The container has a process; nothing yet says that process can serve traffic, and the Service will not send it any until something does." };
    }

    if (feasible === 0) {
      return { nodes: [api("pod: Pending 6m"), sched("no binding"), nodeA("cordoned", true, true), nodeB("insufficient memory", true, true)], edges: EDGES, tokens: [],
        caption: "Still Pending. Readiness is not a question that gets asked of a pod that never ran.",
        detail: "A Service with no Ready endpoints returns connection refused, and the pod that would have served is still a row in etcd with an empty nodeName. Nothing here will change on its own.",
        // Named rather than swallowed. A probe setting that cannot matter because nothing is
        // running is its own lesson, and a toggle that changes nothing on screen teaches that the
        // thing you changed does not matter - which is the opposite of true here.
        fault: tight
          ? "Uncordon a node or lower the request. The probe timeout you also set is real and completely invisible from here: a probe cannot fail against a container that was never created, so fixing scheduling will reveal a second outage rather than end this one."
          : "Uncordon a node or lower the request. Nothing else in this sequence can start." };
    }

    if (tight) {
      return { nodes: [api("pod: Running 0/1 Ready"), sched("done"), nodeA(target === "nodeA" ? "probe failing" : "", cordoned, target === "nodeA"), nodeB(target === "nodeB" ? "probe failing" : "", full, target === "nodeB")], edges: EDGES,
        tokens: [{ id: "probe", from: target, to: "api", at: Math.min(p, 0.4), label: "probe timeout", tone: "fault" }],
        caption: "The container started. The readiness probe times out before the process finishes booting.",
        detail: "The pod restarts, boots for twenty seconds, gets asked at one, fails, and restarts. Nothing is wrong with the image or the node. The fix is a startupProbe, or a timeout that matches reality.",
        fault: "0/1 Ready, forever. The Service has no endpoints and callers get connection refused." };
    }

    return { nodes: [api("pod: Running 1/1"), sched("done"), nodeA(target === "nodeA" ? "serving" : "", cordoned), nodeB(target === "nodeB" ? "serving" : "", full)], edges: EDGES,
      tokens: [{ id: "ready", from: target, to: "api", at: p, label: "Ready", tone: "normal" }],
      caption: "The readiness probe passes and the pod is added to the Service endpoints.",
      detail: "This is the moment traffic can arrive. Everything before it was setup, and the gap between Running and Ready is where most bad deploys actually live." };
  },
};
