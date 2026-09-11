/**
 * Raft, and the leader who does not know he has been replaced.
 *
 * Explains plan row 44, "MIT 6.824: Raft, linearizability, transactions".
 *
 * Consensus is usually remembered as "a majority agrees", which is true and is not the interesting
 * part. The interesting part is what the minority side looks like from the inside: a leader that is
 * still a leader as far as it knows, still accepting writes, still returning success to a client,
 * and permanently unable to commit any of it. Nothing there is faulty. Every node is running correct
 * code and the operator on that side of the partition sees a healthy cluster.
 *
 * The five nodes are drawn in two groups on purpose - the gap between them is where the partition
 * goes, so the split is a place on the diagram rather than a word in a caption.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const PARTITION = "partition";
const SPLIT_VOTE = "split-vote";
const STALE_READ = "stale-read";

const PLACES: Array<[string, string, number, number, "actor" | "service"]> = [
  ["client", "Client", 24, 86, "actor"],
  ["a", "A", 86, 52, "service"],
  ["b", "B", 86, 122, "service"],
  ["c", "C", 218, 34, "service"],
  ["d", "D", 218, 88, "service"],
  ["e", "E", 218, 142, "service"],
];

const EDGES = [
  { from: "client", to: "a", dashed: true },
  { from: "a", to: "client", dashed: true },
  { from: "a", to: "b", dashed: true },
  { from: "b", to: "a", dashed: true },
  { from: "a", to: "c", dashed: true },
  { from: "c", to: "a", dashed: true },
  { from: "a", to: "d", dashed: true },
  { from: "d", to: "a", dashed: true },
  { from: "a", to: "e", dashed: true },
  { from: "e", to: "a", dashed: true },
  { from: "c", to: "d", dashed: true },
  { from: "d", to: "c", dashed: true },
  { from: "c", to: "e", dashed: true },
  { from: "e", to: "c", dashed: true },
];

export const raft: Machine = {
  id: "raft",
  title: "Raft, and the leader who does not know",
  short: "Raft",
  subtitle: "Five nodes. Cut the network and watch the minority side accept writes it can never commit.",
  topicIndices: [44],
  steps: ["Election timeout", "RequestVote", "A majority answers", "AppendEntries", "Commit index advances", "A read arrives"],
  faults: [
    { id: SPLIT_VOTE, label: "Two candidates in the same term", blurb: "Nobody wins. The term burns and the cluster is leaderless until a randomised timeout breaks the tie - which is the whole reason the timeout is randomised." },
    { id: PARTITION, label: "Cut the network between A,B and C,D,E", blurb: "Two sides, both convinced they are fine. Only one of them has a majority, and it is not the one holding the old leader." },
    { id: STALE_READ, label: "Serve the read from the leader's own log", blurb: "The obvious optimisation, and it is not linearizable. A deposed leader does not find out it was deposed until someone contacts it." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const split = faults.includes(SPLIT_VOTE);
    const cut = faults.includes(PARTITION);
    const stale = faults.includes(STALE_READ);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // Term bookkeeping, which is the part of Raft that does the actual work. A split vote burns a
    // term; a partition makes the majority side elect at a higher one, and that higher number is
    // what eventually tells A it is finished.
    const term = split ? 8 : 7;
    // A split vote does not end the story, it costs a term. Steps 0-2 show the tie; from step 3 the
    // cluster is running on the election AFTER it, because a reader stepping forward from "nobody
    // became leader" to "the leader appends" would be watching a gap the caption never admits to.
    const settled = split ? term + 1 : term;
    const majorityTerm = cut ? settled + 1 : settled;

    if (s === 0) {
      return { ...base, nodes: nodes({ a: `candidate, term ${term}`, b: "follower", c: "follower", d: "follower", e: "follower" }),
        tokens: [],
        caption: `A heard nothing from a leader in time, so it became a candidate in term ${term}.`,
        detail: "An election is started by silence, not by a signal - there is no failure detector anywhere in Raft beyond a clock that ran out. That is why the timeout has to be comfortably longer than a normal heartbeat round trip, and why a cluster across regions elects leaders it did not need to." };
    }

    if (s === 1) {
      if (split) {
        return { ...base, nodes: nodes({ a: `candidate, term ${term}`, d: `candidate, term ${term}`, b: "voted A", c: "voted D", e: "voted D" }, ["a", "d"]),
          tokens: [
            { id: "rv1", from: "a", to: "b", at: p, label: `RequestVote ${term}`, tone: "fault" },
            { id: "rv2", from: "d", to: "c", at: p, label: `RequestVote ${term}`, tone: "fault" },
          ],
          caption: `A and D both timed out and both stood in term ${term}.`,
          detail: "A node votes at most once per term, so two candidates split the followers between them and neither reaches three. Nothing is broken and nothing will resolve on its own, which is exactly why the election timeout is randomised: identical timeouts would produce identical elections forever.",
          fault: "Split vote." };
      }
      return { ...base, nodes: nodes({ a: `candidate, term ${term}` }),
        tokens: [
          { id: "rv1", from: "a", to: "b", at: p, label: `RequestVote ${term}`, tone: "normal" },
          { id: "rv2", from: "a", to: "c", at: p, label: `RequestVote ${term}`, tone: "normal" },
          { id: "rv3", from: "a", to: "d", at: p, label: `RequestVote ${term}`, tone: "normal" },
          { id: "rv4", from: "a", to: "e", at: p, label: `RequestVote ${term}`, tone: "normal" },
        ],
        caption: "A asks every peer for a vote, and tells each one how up to date its log is.",
        detail: "A vote is refused if the candidate's log is behind the voter's. That one rule is what guarantees a new leader already holds every committed entry, so nothing committed can ever be lost by an election - the leader is chosen from the nodes that could not have missed anything." };
    }

    if (s === 2) {
      if (split) {
        return { ...base, nodes: nodes({ a: "2 votes", d: "2 votes", b: "waiting", c: "waiting", e: "waiting" }, ["a", "d"]),
          tokens: [
            { id: "v1", from: "b", to: "a", at: p, label: "vote", tone: "fault" },
            { id: "v2", from: "c", to: "d", at: p, label: "vote", tone: "fault" },
          ],
          caption: "Two votes each. Three are needed, so nobody becomes leader and the term is wasted.",
          detail: `Term ${term} ends with no leader and the cluster serves nothing until someone times out again. Because the timeouts are drawn at random from a range, the next election is very unlikely to tie the same way - the fix for a split vote is not coordination, it is deliberate jitter. Step forward and the cluster is on the next term, with a leader. This is also why an unavailability window in Raft is measured in election timeouts rather than in round trips.`,
          fault: "No leader this term." };
      }
      return { ...base, nodes: nodes({ a: `leader, term ${term}`, b: "voted A", c: "voted A", d: "voted A" }),
        tokens: [
          { id: "v1", from: "b", to: "a", at: p, label: "vote", tone: "normal" },
          { id: "v2", from: "c", to: "a", at: p, label: "vote", tone: "normal" },
          { id: "v3", from: "d", to: "a", at: p, label: "vote", tone: "normal" },
        ],
        caption: "Three of five is a majority. A is the leader for this term.",
        detail: "Majority rather than unanimity is what lets the cluster survive two failures out of five, and any two majorities must overlap in at least one node - that overlap is the entire safety argument, and it is why cluster sizes are odd." };
    }

    if (s === 3) {
      const reran = split ? ` A later election in term ${settled} produced a leader, which is what randomised timeouts are for.` : "";
      if (cut) {
        return { ...base,
          nodes: nodes({ a: `leader, term ${settled}`, b: "follows A", c: `leader, term ${majorityTerm}`, d: `follows C`, e: "follows C" }, ["a"]),
          tokens: [
            { id: "ae1", from: "a", to: "b", at: p, label: "set x=5", tone: "slow" },
            { id: "ae2", from: "a", to: "c", at: Math.min(p, 0.42), label: "set x=5", tone: "fault" },
            { id: "ae3", from: "c", to: "d", at: p, label: `term ${majorityTerm}`, tone: "normal" },
            { id: "ae4", from: "c", to: "e", at: p, label: `term ${majorityTerm}`, tone: "normal" },
          ],
          caption: `The network is cut. C, D and E elect C. A is still leader as far as A knows.${reran}`,
          detail: `A's messages to the other side do not arrive, and a message that does not arrive is indistinguishable from a slow one - so A keeps waiting rather than concluding anything. Meanwhile C, D and E have three nodes, hold an election, and A's term ${settled} is now behind their term ${majorityTerm}. Two leaders exist at once and that is not a bug: Raft never promised one leader, it promised one leader per term and that only a majority can commit.`,
          fault: "Two leaders, in different terms." };
      }
      return { ...base, nodes: nodes({ a: `leader, term ${settled}`, b: "x=5", c: "x=5", d: "x=5", e: "x=5" }),
        tokens: [
          { id: "ae1", from: "a", to: "b", at: p, label: "set x=5", tone: "normal" },
          { id: "ae2", from: "a", to: "c", at: p, label: "set x=5", tone: "normal" },
          { id: "ae3", from: "a", to: "d", at: p, label: "set x=5", tone: "normal" },
          { id: "ae4", from: "a", to: "e", at: p, label: "set x=5", tone: "normal" },
        ],
        caption: `The leader appends the entry to its own log and sends it to everyone.${reran}`,
        detail: "AppendEntries carries the new entry and doubles as the heartbeat, so a leader that has nothing to say still says it. Each message names the previous index and term, and a follower that disagrees refuses - which is how a follower with a divergent tail gets rewound rather than quietly diverging." };
    }

    if (s === 4) {
      if (cut) {
        return { ...base,
          nodes: nodes({ a: "1 of 5 - never commits", b: "has it, uncommitted", c: `leader, term ${majorityTerm}`, d: "committed", e: "committed" }, ["a", "b"]),
          tokens: [{ id: "ack", from: "b", to: "a", at: p, label: "ack (2 of 5)", tone: "fault" }],
          caption: "A has two nodes. It will never reach three, so the entry never commits.",
          detail: "This is the shape of the failure worth carrying out of this machine. A is not down, not slow, not misconfigured, and not returning errors - it is accepting writes it can never acknowledge as durable. The correct behaviour is that A holds the client's request open rather than confirming it, and the bug people actually ship is a leader that replies 'ok' on append instead of on commit. Meanwhile C's side has three nodes and is committing normally, so the cluster is simultaneously healthy and stuck depending on which node you asked.",
          fault: "Accepted, and permanently uncommitted." };
      }
      return { ...base, nodes: nodes({ a: "commitIndex 12", b: "12", c: "12", d: "12", e: "12" }),
        tokens: [{ id: "ok", from: "a", to: "client", at: p, label: "committed", tone: "normal" }],
        caption: "A majority has the entry, so it is committed and the client is told.",
        detail: "Committed means a majority stored it, not that everyone did - E can be hours behind and the entry is still safe, because any future leader must come from a majority and any two majorities share a node. The client is answered here, at commit, and not when the entry was appended." };
    }

    if (stale) {
      return { ...base,
        nodes: nodes(cut
          ? { a: `answering from term ${settled}`, c: `leader, term ${majorityTerm}`, d: "x=9", e: "x=9" }
          : { a: "answering from its own log" }, ["a"]),
        tokens: [{ id: "rd", from: "a", to: "client", at: p, label: cut ? "x=5 (stale)" : "x=5", tone: "fault" }],
        caption: cut
          ? "A answers from a log that stopped being the truth when C was elected."
          : "A answers the read from its own log without checking it is still leader.",
        detail: cut
          ? `A was deposed the moment C won term ${majorityTerm}, and nothing told it - a deposed leader finds out by receiving a message with a higher term, and it is receiving no messages at all. It returns a confidently wrong value, fast, with no error. The fix is that a read must prove leadership at the time of the read: bounce a heartbeat off a majority first, or serve reads through the log like any write. Both cost a round trip, which is why the fast path exists and why it is not linearizable.`
          : "Leadership is a lease that nobody renews explicitly, so 'I am the leader' is a belief about the recent past. Under a partition that belief can be stale for a full election timeout while the node has no way to notice. Confirm with a majority before answering, or accept that the read is eventually consistent and say so in the API rather than in a comment.",
        fault: "Stale read from a leader that may no longer be one." };
    }

    return { ...base, nodes: nodes(cut
      ? { c: `leader, term ${majorityTerm}`, a: "no longer leader" }
      : { a: `leader, term ${settled}`, c: "confirmed", d: "confirmed" }, cut ? ["a"] : []),
      tokens: [{ id: "rd", from: "a", to: "client", at: p, label: cut ? "not the leader" : "x=5", tone: cut ? "retry" : "normal" }],
      caption: cut
        ? "A confirms with a majority first, cannot reach one, and refuses the read."
        : "A confirms it is still leader with a majority, then answers.",
      detail: cut
        ? "Refusing is the correct answer and it is the one that looks like an outage. This is the trade in one screen: the same partition either produces a wrong answer quickly or no answer at all, and choosing between those two is not a technical decision - it is a question about what the data is for."
        : "A read that has been confirmed against a majority is linearizable: it reflects every write that had committed before it started. That guarantee costs one round trip, every time, which is what a lease-based read is trying to avoid and what it gives up when a clock drifts." };
  },
};
