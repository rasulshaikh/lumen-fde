/**
 * TCP: the handshake, and what happens when a packet does not arrive.
 *
 * Explains plan row 2, "Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls".
 *
 * The handshake itself is the easy half and every diagram on the internet draws it. The half worth
 * building is the fault: a client that sent a SYN and heard nothing back cannot tell a lost packet
 * from a slow server from a server that is gone. It has no information. All it has is a timer, and
 * everything TCP does about loss follows from that one fact. Breaking the SYN-ACK and watching the
 * client sit there is the point of this machine.
 */
import { clamp01, dialValue, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CLIENT = { id: "client", label: "Client", x: 52, y: 80, kind: "actor" as const };
const SERVER = { id: "server", label: "Server", x: 268, y: 80, kind: "service" as const };

const DROP_SYNACK = "drop-synack";
const DROP_DATA = "drop-data";

/** Where a dropped packet dies. Short of halfway, so it reads as "did not get there". */
const LOST_AT = 0.45;

export const tcp: Machine = {
  id: "tcp",
  title: "TCP: a connection, and a packet that never arrives",
  short: "TCP",
  subtitle: "Three segments to open a connection. Then break one and watch what the client can and cannot know.",
  topicIndices: [2],
  steps: [
    "SYN",
    "SYN-ACK",
    "ACK",
    "Data",
    "Data ACK",
  ],
  /*
   * Round-trip time as a dial, because every timeout anyone has ever tuned sits on top of it and
   * almost nobody has watched the relationship move. Drag the link from datacentre-local to
   * intercontinental and the retransmission timer moves with it - which is why a timeout that is
   * generous in one region is a retry storm in another.
   */
  dials: [
    { id: "rtt", label: "Round-trip time", min: 5, max: 400, step: 5, unit: "ms", value: 40,
      hint: "5ms is the same rack. 40ms is a region away. 300ms is a satellite or a bad mobile link." },
  ],
  faults: [
    { id: DROP_SYNACK, label: "Drop the SYN-ACK", blurb: "The server answers and the answer is lost. Watch what the client does with no information at all." },
    { id: DROP_DATA, label: "Drop a data segment", blurb: "The connection is open and the payload vanishes. This is where the retransmission timer earns its keep." },
  ],

  scene(step, phase, faults, dials): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 5);
    const rtt = dialValue(tcp, dials, "rtt");
    // The initial retransmission timeout is derived from measured RTT, and doubles on each retry.
    // One times RTT is the floor nothing can beat; the first RTO in practice is several times it.
    const rto = Math.round(rtt * 3);
    const lostHandshake = faults.includes(DROP_SYNACK);
    const lostData = faults.includes(DROP_DATA);

    const nodes: SceneNode[] = [
      { ...CLIENT, note: "port 51000" },
      { ...SERVER, note: "listening :443" },
    ];
    const edges = [
      { from: "client", to: "server", dashed: true },
      { from: "server", to: "client", dashed: true },
    ];
    const base = { nodes, edges };

    // --- the SYN-ACK is lost: the handshake stalls and the client learns nothing ---
    if (lostHandshake) {
      if (s === 0) {
        return { ...base, tokens: [{ id: "syn", from: "client", to: "server", at: p, label: "SYN", tone: "normal" }],
          caption: "The client sends a SYN and starts a timer.",
          detail: "The timer is started before anything can go wrong, because by the time something has gone wrong there is nothing left to start it with." };
      }
      if (s === 1) {
        return { ...base, tokens: [{ id: "synack", from: "server", to: "client", at: Math.min(p, LOST_AT), label: "SYN-ACK", tone: "fault" }],
          caption: "The server answers. The answer does not arrive.",
          detail: "The server believes the connection is half-open and is now waiting too. Both sides are wrong about different things.",
          fault: "You dropped the SYN-ACK." };
      }
      if (s === 2) {
        if (lostData) {
          return { ...base, nodes: [{ ...CLIENT, note: "retransmit 1" }, { ...SERVER, note: "ESTABLISHED" }],
            tokens: [{ id: "syn2", from: "client", to: "server", at: p, label: "SYN (retry)", tone: "retry" }],
            caption: "The timer fires, the client resends, and this time the connection opens.",
            detail: "One lost packet cost a whole retransmission timeout before any payload could move. This is why a lossy link shows up as latency rather than as errors, and why tail latency is the number worth watching.",
            fault: "Recovered from the dropped SYN-ACK. The data segment you also dropped is still ahead." };
        }
        return { ...base, nodes: [{ ...CLIENT, note: `RTO ${rto}ms` }, { ...SERVER, note: "SYN-RECEIVED" }], tokens: [],
          caption: "Nothing is in flight. The client is waiting on a timer.",
          detail: `This is the part worth saying out loud in an interview: the client cannot tell a lost packet from a slow server from a server that has gone away. It has no signal, only a timer - and at ${rtt}ms round trip that timer is about ${rto}ms, doubling on every retry. Every timeout you have ever tuned sits on top of this number.`,
          fault: "No acknowledgement is coming." };
      }
      if (s === 3) {
        if (lostData) {
          return { ...base, nodes: [{ ...CLIENT, note: "RTO running" }, { ...SERVER, note: "ESTABLISHED" }],
            tokens: [{ id: "data", from: "client", to: "server", at: Math.min(p, LOST_AT), label: "1460 bytes", tone: "fault" }],
            caption: "Now the payload is lost too, on a connection that was already late.",
            detail: "Two timeouts on one request. The application still sees one slow call, and the only place either loss is visible is a retransmission counter nobody has open.",
            fault: "You dropped both the SYN-ACK and the data." };
        }
        return { ...base, nodes: [{ ...CLIENT, note: "retransmit 1" }, SERVER], tokens: [{ id: "syn2", from: "client", to: "server", at: p, label: "SYN (retry)", tone: "retry" }],
          caption: "The timer fires. The client sends the same SYN again.",
          detail: "The wait doubles after each attempt. Exponential backoff is how a network full of retrying clients avoids becoming a network full of retrying clients." };
      }
      if (lostData) {
        return { ...base, nodes: [{ ...CLIENT, note: "retransmit 2" }, { ...SERVER, note: "ESTABLISHED" }],
          tokens: [{ id: "data2", from: "client", to: "server", at: p, label: "1460 bytes (retry)", tone: "retry" }],
          caption: "The client resends the bytes. This time they land.",
          detail: "Every backoff doubled the wait, so a request that should have taken one round trip took several. Nothing above the socket ever learned why, which is the whole reason a timeout budget is guesswork until you measure the link.",
          fault: "Both losses recovered. The caller only ever saw one slow request." };
      }
      return { ...base, tokens: [{ id: "synack2", from: "server", to: "client", at: p, label: "SYN-ACK", tone: "normal" }],
        caption: "The second answer gets through. The connection opens, late.",
        detail: "Nothing above this layer saw a failure. It saw latency. That is the entire promise TCP makes, and the reason a slow API call and a lossy link look identical from the application." };
    }

    // --- the happy handshake, then optionally a lost payload ---
    if (s === 0) {
      return { ...base, tokens: [{ id: "syn", from: "client", to: "server", at: p, label: "SYN", tone: "normal" }],
        caption: `The client sends a SYN, proposing a starting sequence number. One round trip is ${rtt}ms.`,
        detail: "Nothing is established yet. The client has spoken and has no idea whether anything heard it." };
    }
    if (s === 1) {
      return { ...base, tokens: [{ id: "synack", from: "server", to: "client", at: p, label: "SYN-ACK", tone: "normal" }],
        caption: "The server acknowledges and proposes its own sequence number.",
        detail: "Two directions, two sequence numbers. A TCP connection is two independent streams that happen to share a socket." };
    }
    if (s === 2) {
      return { ...base, nodes: [{ ...CLIENT, note: "ESTABLISHED" }, { ...SERVER, note: "ESTABLISHED" }],
        tokens: [{ id: "ack", from: "client", to: "server", at: p, label: "ACK", tone: "normal" }],
        caption: "The client acknowledges. Both sides now agree the connection exists.",
        detail: `Three segments and one full round trip - ${rtt}ms - before a single byte of payload moves. TLS then pays it again. That is the whole argument for connection reuse, and the reason it matters more the further apart the two ends are.` };
    }
    if (s === 3) {
      if (lostData) {
        return { ...base, nodes: [{ ...CLIENT, note: "RTO running" }, { ...SERVER, note: "ESTABLISHED" }],
          tokens: [{ id: "data", from: "client", to: "server", at: Math.min(p, LOST_AT), label: "1460 bytes", tone: "fault" }],
          caption: "The client sends data. The segment is lost.",
          detail: "The server is not waiting for this and does not know it existed. Only the sender knows something is outstanding, which is why only the sender can fix it.",
          fault: "You dropped the data segment." };
      }
      return { ...base, nodes: [{ ...CLIENT, note: "ESTABLISHED" }, { ...SERVER, note: "ESTABLISHED" }],
        tokens: [{ id: "data", from: "client", to: "server", at: p, label: "1460 bytes", tone: "normal" }],
        caption: "The client sends a full segment of data.",
        detail: "1460 bytes is a normal Ethernet MSS. Send more than the path allows and something in the middle fragments it or drops it, which is the whole of the path-MTU conversation." };
    }
    if (lostData) {
      return { ...base, nodes: [{ ...CLIENT, note: "retransmit 1" }, { ...SERVER, note: "ESTABLISHED" }],
        tokens: [{ id: "data2", from: "client", to: "server", at: p, label: "1460 bytes (retry)", tone: "retry" }],
        caption: "The timer fires and the client sends the same bytes again.",
        detail: "The application never learns any of this happened. It sees one slow write. Every timeout you have ever tuned sits on top of this timer.",
        fault: "Recovering from the drop you caused." };
    }
    return { ...base, nodes: [{ ...CLIENT, note: "ESTABLISHED" }, { ...SERVER, note: "ESTABLISHED" }],
      tokens: [{ id: "dack", from: "server", to: "client", at: p, label: "ACK 1461", tone: "normal" }],
      caption: "The server acknowledges the bytes it received.",
      detail: "The ACK names the next byte expected, not the last one received. Off-by-one here is the classic interview trip-up." };
  },
};
