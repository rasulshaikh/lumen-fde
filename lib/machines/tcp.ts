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
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CLIENT = { id: "client", label: "Client", x: 52, y: 80, kind: "actor" as const };
const SERVER = { id: "server", label: "Server", x: 268, y: 80, kind: "service" as const };

const DROP_SYNACK = "drop-synack";
const DROP_DATA = "drop-data";

/** Where a dropped packet dies. Short of halfway, so it reads as "did not get there". */
const LOST_AT = 0.45;

export const tcp: Machine = {
  id: "tcp",
  title: "TCP: a connection, and a packet that never arrives",
  subtitle: "Three segments to open a connection. Then break one and watch what the client can and cannot know.",
  topicIndices: [2],
  steps: [
    "SYN",
    "SYN-ACK",
    "ACK",
    "Data",
    "Data ACK",
  ],
  faults: [
    { id: DROP_SYNACK, label: "Drop the SYN-ACK", blurb: "The server answers and the answer is lost. Watch what the client does with no information at all." },
    { id: DROP_DATA, label: "Drop a data segment", blurb: "The connection is open and the payload vanishes. This is where the retransmission timer earns its keep." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 5);
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
        return { ...base, nodes: [{ ...CLIENT, note: "RTO running" }, { ...SERVER, note: "SYN-RECEIVED" }], tokens: [],
          caption: "Nothing is in flight. The client is waiting on a timer.",
          detail: "This is the part worth saying out loud in an interview: the client cannot tell a lost packet from a slow server from a server that has gone away. It has no signal. Only a timer.",
          fault: "No acknowledgement is coming." };
      }
      if (s === 3) {
        return { ...base, nodes: [{ ...CLIENT, note: "retransmit 1" }, SERVER], tokens: [{ id: "syn2", from: "client", to: "server", at: p, label: "SYN (retry)", tone: "retry" }],
          caption: "The timer fires. The client sends the same SYN again.",
          detail: "The wait doubles after each attempt. Exponential backoff is how a network full of retrying clients avoids becoming a network full of retrying clients." };
      }
      return { ...base, tokens: [{ id: "synack2", from: "server", to: "client", at: p, label: "SYN-ACK", tone: "normal" }],
        caption: "The second answer gets through. The connection opens, late.",
        detail: "Nothing above this layer saw a failure. It saw latency. That is the entire promise TCP makes, and the reason a slow API call and a lossy link look identical from the application." };
    }

    // --- the happy handshake, then optionally a lost payload ---
    if (s === 0) {
      return { ...base, tokens: [{ id: "syn", from: "client", to: "server", at: p, label: "SYN", tone: "normal" }],
        caption: "The client sends a SYN, proposing a starting sequence number.",
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
        detail: "Three segments, one round trip before a single byte of payload. This is the cost TLS then pays again, and why connection reuse and HTTP/2 exist at all." };
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
