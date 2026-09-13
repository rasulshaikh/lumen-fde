/**
 * A packet's path into a VPC, and the stateless rule that eats the reply.
 *
 * Explains plan row 14, "AWS networking and compute: VPC, subnets, SG, NACL, ALB, ECS/EKS, EC2".
 *
 * "Explain every rule in your VPC diagram" is really one question: what does a packet pass through,
 * in what order, and which of those things remembers it. The answer is a sequence, so it is a
 * machine rather than a curve.
 *
 * The fault worth building the whole thing for is the network ACL. A security group is STATEFUL -
 * it remembers the inbound connection and lets the reply out without being asked. A network ACL is
 * STATELESS and does not, so the reply is addressed BACK to the high ephemeral port the client
 * opened from, and the outbound rules were never written with that destination in mind. The request arrives, the server answers, and the answer is dropped on the way
 * out. From the client it looks identical to the server being down.
 */
import { clamp01, dialValue, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const NO_ROUTE = "no-route";
const NACL_EPHEMERAL = "nacl-ephemeral";
const SG_NO_RULE = "sg-no-rule";

const net = (note?: string): SceneNode => ({ id: "net", label: "Internet", x: 34, y: 82, kind: "actor", note });
const igw = (note?: string, down = false): SceneNode => ({ id: "igw", label: "IGW", x: 104, y: 82, kind: "service", note, down });
const rt = (note?: string, down = false): SceneNode => ({ id: "rt", label: "Route table", x: 168, y: 82, kind: "service", note, down });
const nacl = (note?: string, down = false): SceneNode => ({ id: "nacl", label: "NACL", x: 228, y: 82, kind: "service", note, down });
const sg = (note?: string, down = false): SceneNode => ({ id: "sg", label: "Security group", x: 288, y: 82, kind: "service", note, down });

const EDGES = [
  { from: "net", to: "igw", dashed: true },
  { from: "igw", to: "rt", dashed: true },
  { from: "rt", to: "nacl", dashed: true },
  { from: "nacl", to: "sg", dashed: true },
  { from: "sg", to: "nacl", dashed: true },
  { from: "nacl", to: "rt", dashed: true },
  { from: "rt", to: "igw", dashed: true },
  { from: "igw", to: "net", dashed: true },
];

export const vpcPath: Machine = {
  id: "vpc-path",
  title: "A packet into a VPC, and the stateless rule that eats the reply",
  short: "VPC packet path",
  subtitle: "Four things stand between the internet and your instance. Exactly one of them remembers the connection.",
  topicIndices: [14],
  steps: ["Arrives at the IGW", "Route table", "NACL inbound", "Security group inbound", "Server replies", "NACL outbound"],
  dials: [
    { id: "ephemeralLow", label: "NACL outbound allows destination ports from", min: 0, max: 49152, step: 1024, unit: "", value: 1024,
      hint: "The client opened the connection from its own ephemeral port and the reply is addressed back to it. Linux draws those from 32768 up, Windows from 49152, a NAT gateway from 1024 - which is why the standard outbound rule allows 1024-65535 rather than one OS's range. Set this above the client's port and the reply has nowhere to land." },
  ],
  faults: [
    { id: NO_ROUTE, label: "No route to the IGW", blurb: "The subnet's route table has no 0.0.0.0/0 entry. This is what makes a subnet private." },
    { id: NACL_EPHEMERAL, label: "NACL outbound is too narrow", blurb: "Outbound allows 80 and 443 only, which is what a firewall rule looks like when someone reasons about it as a server." },
    { id: SG_NO_RULE, label: "Security group has no inbound rule", blurb: "The default group allows nothing in. This is the boring failure, and it is the one people check first." },
  ],

  scene(step, phase, faults, dials): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const noRoute = faults.includes(NO_ROUTE);
    const narrow = faults.includes(NACL_EPHEMERAL);
    const noSg = faults.includes(SG_NO_RULE);
    const low = dialValue(vpcPath, dials, "ephemeralLow");
    // The CLIENT's source port, drawn from its own ephemeral range. The reply is addressed back to
    // it, so this is the number the outbound NACL rule is matched against.
    const replyPort = 43210;
    const replyBlocked = narrow || low > replyPort;

    const base = { edges: EDGES };
    const all = (a?: string, b?: string, c?: string, d?: string, downs: string[] = []) => [
      net(a), igw(b, downs.includes("igw")), rt(c, downs.includes("rt")), nacl(d, downs.includes("nacl")), sg(undefined, downs.includes("sg")),
    ];

    if (s === 0) {
      return { ...base, nodes: all("client :43210", "attached", undefined, undefined),
        tokens: [{ id: "req", from: "net", to: "igw", at: p, label: "SYN -> :443", tone: "normal" }],
        caption: "A packet arrives at the internet gateway, addressed to the instance's public IP.",
        detail: "The gateway does nothing clever - it is a one-to-one NAT between the public address and the private one. Everything that decides whether this packet lives happens after it." };
    }

    if (s === 1) {
      if (noRoute) {
        return { ...base, nodes: all(undefined, undefined, "no 0.0.0.0/0", undefined, ["rt"]),
          tokens: [{ id: "req", from: "igw", to: "rt", at: Math.min(p, 0.5), label: "SYN", tone: "fault" }],
          caption: "The subnet's route table has no default route. The packet has nowhere to go.",
          detail: "This is the actual definition of a private subnet - not a setting called private, but the absence of a route to the gateway. A subnet is public because its route table says so and for no other reason.",
          fault: "No route to the IGW." };
      }
      return { ...base, nodes: all(undefined, undefined, "0.0.0.0/0 -> igw"),
        tokens: [{ id: "req", from: "igw", to: "rt", at: p, label: "SYN", tone: "normal" }],
        caption: "The route table matches the destination and sends the packet on.",
        detail: "Route tables are attached to subnets, not to instances. Two instances in different subnets of the same VPC can have completely different reachability with identical security groups." };
    }

    /*
     * Once the packet is dead it stays dead.
     *
     * Without this the sequence carried on describing a NACL check and a reply for a packet that
     * had already been dropped two steps earlier - the same defect the Kubernetes machine had,
     * where a pod that could never be scheduled went Ready at the last step. A machine that keeps
     * narrating past its own failure teaches that the failure did not matter.
     */
    const dead = (why: string, detail: string, at: SceneNode[]) =>
      ({ ...base, nodes: at, tokens: [],
         caption: "Nothing is in flight. The packet was dropped before it got here.",
         detail, fault: why } satisfies Scene);

    if (noRoute && s >= 2) {
      // The downstream faults are named rather than swallowed. A misconfiguration that cannot
      // matter because something upstream already dropped the packet is its own lesson, and a
      // toggle that changes nothing on screen teaches that the thing you broke does not matter.
      const alsoBroken = [narrow ? "the NACL's outbound range" : "", noSg ? "the security group" : ""].filter(Boolean);
      return dead(
        `No route to the IGW, so nothing reached this point.${alsoBroken.length ? ` You also broke ${alsoBroken.join(" and ")}, which cannot matter from here - fixing the route will reveal that as a second, separate failure.` : ""}`,
        "Every device after the route table is still configured perfectly and none of them will ever see this packet. This is why reading security groups first is the wrong order: the packet may not be getting far enough to be refused by one.",
        all(undefined, undefined, "no 0.0.0.0/0", undefined, ["rt"]));
    }
    if (noSg && s >= 4) {
      return dead(`The security group dropped it, so there is no reply to send.${narrow ? " The NACL's outbound range is wrong too, and is not reached: there is no reply for it to drop." : ""}`,
        "The server process never received a connection, so nothing in its logs mentions this request at all. An absence in the application log is evidence about the network, not about the application.",
        all(undefined, undefined, undefined, undefined, ["sg"]));
    }

    if (s === 2) {
      return { ...base, nodes: all(undefined, undefined, undefined, "inbound: allow 443"),
        tokens: [{ id: "req", from: "rt", to: "nacl", at: p, label: "SYN :443", tone: "normal" }],
        caption: "The network ACL checks its inbound rules. 443 is allowed, so the packet passes.",
        detail: "A NACL is STATELESS. It is about to let this packet in and it will not remember doing so, which is the fact the last step of this sequence is built on." };
    }

    if (s === 3) {
      if (noSg) {
        return { ...base, nodes: all(undefined, undefined, undefined, undefined, ["sg"]),
          tokens: [{ id: "req", from: "nacl", to: "sg", at: Math.min(p, 0.5), label: "SYN", tone: "fault" }],
          caption: "The security group has no inbound rule for 443. The packet is dropped.",
          detail: "Dropped silently, with no reject - so the client sees a timeout rather than a refusal. That distinction is the fastest way to tell a security group from a service that is genuinely down: a closed port refuses, a security group says nothing at all.",
          fault: "No inbound rule." };
      }
      return { ...base, nodes: all(undefined, undefined, undefined, undefined),
        tokens: [{ id: "req", from: "nacl", to: "sg", at: p, label: "SYN :443", tone: "normal" }],
        caption: "The security group allows 443 inbound, and records the connection.",
        detail: "A security group is STATEFUL. It has just written down that this connection exists, so the reply will be allowed out without any outbound rule mentioning it. This is the difference that makes the next two steps interesting." };
    }

    if (s === 4) {
      return { ...base, nodes: all(undefined, undefined, undefined, undefined),
        tokens: [{ id: "rep", from: "sg", to: "nacl", at: p, label: `reply -> :${replyPort}`, tone: "normal" }],
        caption: `The server answers from 443, addressed to the client's ephemeral port ${replyPort}.`,
        detail: "This is the part that catches people. The reply's SOURCE port is 443 and its DESTINATION is the client's ephemeral port - and on the way out, the thing checking it cares about the destination." };
    }

    if (replyBlocked) {
      return { ...base, nodes: all(undefined, undefined, undefined, `outbound: from ${low}`, ["nacl"]),
        tokens: [{ id: "rep", from: "nacl", to: "rt", at: Math.min(p, 0.45), label: "reply", tone: "fault" }],
        caption: "The NACL's outbound rules do not cover the client's ephemeral port. The reply is dropped.",
        detail: "The security group let it out without being asked, because it remembered the connection. The NACL did not, because it never remembers anything. From the client this is indistinguishable from the server being down: the request left, nothing came back, and every log on the server says it answered.",
        fault: `Outbound allows from ${low} and the reply is going to ${replyPort}.` };
    }

    return { ...base, nodes: all(undefined, undefined, undefined, `outbound: from ${low}`),
      tokens: [{ id: "rep", from: "nacl", to: "rt", at: p, label: "reply", tone: "normal" }],
      caption: "The NACL's outbound rules cover the ephemeral range, so the reply leaves.",
      detail: "Both directions had to be allowed explicitly here, and only one of the two devices needed telling. That asymmetry is the whole practical difference between a security group and a network ACL." };
  },
};
