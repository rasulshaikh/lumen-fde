/**
 * "The new version never came up."
 *
 * Plan rows 7 and 8, and the same system the Kubernetes machine walks through. The ticket says
 * the deploy failed; the deploy did not fail. The pod was never scheduled, because someone
 * cordoned a node for maintenance last week and never uncordoned it, and the remaining node cannot
 * fit a request that was raised in the same PR.
 *
 * Chosen because both halves are individually invisible. A cordoned node looks fine in
 * `get nodes` unless you read the STATUS column properly, and a raised memory request looks like a
 * diff nobody reviews. Neither is a bug. Together they are an outage.
 */
import type { Incident } from "./types";

export const pendingPod: Incident = {
  id: "pending-pod",
  title: "The new version never came up",
  ticket:
    "Customer says: we deployed 40 minutes ago and the new version still is not serving. " +
    "Rollback did not help. Nothing in the app logs. Can you look?",
  topicIndices: [7, 8],
  machineId: "k8s",
  cause:
    "node-a was cordoned for maintenance nine days ago and never uncordoned, and the same PR that " +
    "shipped the new version raised the memory request from 2Gi to 6Gi. node-b has 4Gi free. " +
    "Neither change alone would have stopped the deploy.",
  probes: [
    {
      id: "pods",
      cmd: "kubectl get pods -n checkout",
      hint: "Start where the customer is looking.",
      output:
        "NAME                        READY   STATUS    RESTARTS   AGE\n" +
        "checkout-7d9f4c8b5-2xk4p    0/1     Pending   0          41m\n" +
        "checkout-6b8c7d5f9-mn2qr    1/1     Running   0          9d",
      decisive: true,
    },
    {
      id: "logs",
      cmd: "kubectl logs checkout-7d9f4c8b5-2xk4p -n checkout",
      hint: "The app logs the customer says are empty.",
      output:
        "Error from server (BadRequest): container \"checkout\" in pod \"checkout-7d9f4c8b5-2xk4p\" is waiting to start: ContainerCreating\n\n" +
        "(There are no logs because there is no container. Nothing has been scheduled to run.)",
    },
    {
      id: "describe",
      cmd: "kubectl describe pod checkout-7d9f4c8b5-2xk4p -n checkout",
      hint: "The events at the bottom are the answer to most Pending tickets.",
      output:
        "Requests:\n      memory:  6Gi\n      cpu:     500m\n\n" +
        "Events:\n" +
        "  Type     Reason            Age                 From               Message\n" +
        "  ----     ------            ----                ----               -------\n" +
        "  Warning  FailedScheduling  41m (x9 over 41m)   default-scheduler  0/2 nodes are available:\n" +
        "           1 node(s) were unschedulable, 1 Insufficient memory.",
      decisive: true,
    },
    {
      id: "nodes",
      cmd: "kubectl get nodes",
      hint: "Two nodes. Read the STATUS column, not the count.",
      output:
        "NAME     STATUS                     ROLES    AGE   VERSION\n" +
        "node-a   Ready,SchedulingDisabled   <none>   94d   v1.29.4\n" +
        "node-b   Ready                      <none>   94d   v1.29.4",
      decisive: true,
    },
    {
      id: "top",
      cmd: "kubectl describe node node-b | grep -A5 Allocated",
      hint: "What node-b has left, in requests rather than usage.",
      output:
        "Allocated resources:\n" +
        "  Resource   Requests      Limits\n" +
        "  --------   --------      ------\n" +
        "  cpu        1400m (35%)   3200m (80%)\n" +
        "  memory     11Gi (73%)    14Gi (93%)\n\n" +
        "(16Gi allocatable. 4Gi of requests left. The pod asks for 6Gi.)",
      decisive: true,
    },
    {
      id: "rollout",
      cmd: "kubectl rollout history deploy/checkout -n checkout",
      hint: "What changed in the deploy the customer is blaming.",
      output:
        "REVISION  CHANGE-CAUSE\n" +
        "11        image checkout:1.42.0\n" +
        "12        image checkout:1.43.0, resources.requests.memory 2Gi -> 6Gi",
      decisive: true,
    },
  ],
  fixes: [
    {
      id: "restart",
      label: "Restart the deployment",
      cmd: "kubectl rollout restart deploy/checkout -n checkout",
      resolves: false,
      effect:
        "A new pod is created. It is Pending, for the same reason, with the same event. Restarting " +
        "changes which pod is waiting, not whether anything can schedule it.",
    },
    {
      id: "rollback",
      label: "Roll back to the previous revision",
      cmd: "kubectl rollout undo deploy/checkout -n checkout",
      resolves: false,
      effect:
        "Revision 11 is redeployed and its pod schedules onto node-b, because it only asks for 2Gi. " +
        "The customer is served again on the OLD version, which is what they already told you they " +
        "tried. The new version still cannot be deployed and nothing has been fixed.",
    },
    {
      id: "uncordon",
      label: "Uncordon node-a",
      cmd: "kubectl uncordon node-a",
      resolves: true,
      effect:
        "node-a returns to Ready and the scheduler binds the pending pod to it within seconds. " +
        "Readiness passes, the endpoint is added, and the new version serves.",
    },
    {
      id: "lower",
      label: "Lower the memory request back to 2Gi",
      cmd: "kubectl set resources deploy/checkout -n checkout --requests=memory=2Gi",
      resolves: false,
      effect:
        "The pod schedules onto node-b and serves. It is also now requesting less memory than the " +
        "version was raised to need, on the only node still accepting work. It survives the " +
        "afternoon and is OOMKilled under evening load.",
    },
    {
      id: "scale",
      label: "Add a node to the cluster",
      cmd: "eksctl scale nodegroup --cluster prod --name workers --nodes 3",
      resolves: false,
      effect:
        "A third node joins in about four minutes and the pod schedules onto it. The incident ends. " +
        "node-a is still cordoned, nobody has noticed, and the cluster now costs a third more per " +
        "month for a maintenance window that finished nine days ago.",
    },
    {
      id: "evict",
      label: "Delete a pod on node-b to make room",
      cmd: "kubectl delete pod checkout-6b8c7d5f9-mn2qr -n checkout",
      resolves: false,
      effect:
        "You have deleted the only Running pod. Its 2Gi is freed, which is not the 6Gi needed, so " +
        "the new pod still does not schedule. The customer has gone from a stale version to no " +
        "version at all.",
    },
  ],
};
