/**
 * A stream that survives its own connection dropping.
 *
 * Explains plan row 34, "Real-time transports: SSE, WebSockets, streaming at scale".
 *
 * Streaming is easy to demonstrate and hard to operate, and the gap between those two is entirely
 * about what happens when the connection dies - which it will, on mobile, behind a corporate proxy,
 * at the ninety-second mark of an idle timeout nobody configured. Server-sent events have an answer
 * built into the protocol: give every event an id, and on reconnect the browser sends the last one
 * it saw back in a Last-Event-ID header. Two lines of server code turn a stream that loses data into
 * one that resumes.
 *
 * The first fault is the one everybody hits and nobody predicts: a proxy in the middle buffering the
 * response, so the stream works perfectly in development and arrives all at once in production. It
 * is not a bug in your code and no amount of reading your code will find it.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const PROXY_BUFFERS = "proxy-buffers";
const NO_EVENT_IDS = "no-event-ids";
const BUFFER_EVICTED = "buffer-evicted";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["client", "Browser", 28, 86, "actor"],
  ["proxy", "Proxy", 112, 86, "service"],
  ["server", "Server", 200, 86, "service"],
  ["buf", "Replay buffer", 272, 138, "store"],
  ["src", "Event source", 272, 36, "service"],
];

const EDGES = [
  { from: "client", to: "proxy", dashed: true },
  { from: "proxy", to: "client", dashed: true },
  { from: "proxy", to: "server", dashed: true },
  { from: "server", to: "proxy", dashed: true },
  { from: "src", to: "server", dashed: true },
  { from: "server", to: "buf", dashed: true },
  { from: "buf", to: "server", dashed: true },
];

export const sseResume: Machine = {
  id: "sse-resume",
  title: "A stream that survives the connection dropping",
  short: "SSE resume",
  subtitle: "Every event gets an id. On reconnect the browser sends the last one back. That is the entire mechanism.",
  topicIndices: [34],
  steps: ["Connect", "Events flow", "The connection drops", "Reconnect with Last-Event-ID", "Resume from the buffer", "Caught up"],
  faults: [
    { id: PROXY_BUFFERS, label: "The proxy buffers the response", blurb: "Works perfectly on localhost. In production nothing arrives until the stream ends, which for a long-lived stream is never." },
    { id: NO_EVENT_IDS, label: "Events have no id", blurb: "Reconnect succeeds and looks healthy. Everything that happened during the gap is gone, and nothing anywhere records that it was." },
    { id: BUFFER_EVICTED, label: "The outage outlasts the buffer", blurb: "The client asks to resume from an id the server no longer holds. What it does next is a design decision, and silence is the wrong one." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const buffers = faults.includes(PROXY_BUFFERS);
    const noIds = faults.includes(NO_EVENT_IDS);
    const evicted = faults.includes(BUFFER_EVICTED);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ client: "EventSource", server: "text/event-stream" }),
        tokens: [{ id: "open", from: "client", to: "proxy", at: p, label: "GET /events", tone: "normal" }],
        caption: "One ordinary GET that never finishes.",
        detail: "That is the whole of SSE: a response with Content-Type text/event-stream and no end. It travels over plain HTTP, so it survives proxies, keeps compression and auth headers, and needs no protocol upgrade - which is why it is the right default for one-way streams and why WebSockets are the wrong reflex for them." };
    }

    if (s === 1) {
      if (buffers) {
        return { ...base, nodes: nodes({ proxy: "holding 42 events", client: "nothing yet" }, ["proxy"]),
          tokens: [{ id: "ev", from: "server", to: "proxy", at: p, label: "id: 42", tone: "slow" }],
          caption: "The server is sending. The proxy is holding it all until the response ends.",
          detail: "A proxy buffering a response is correct behaviour for every other kind of response, and for a stream it is indistinguishable from a hang. The tell is that it works on localhost and fails through the ingress, so the investigation starts in the wrong place - the code is fine and the code is what gets read. Set X-Accel-Buffering: no, disable proxy buffering for the route, and send a comment line as a keepalive so any remaining idle timeout has something to reset on.",
          fault: "Buffered in the middle. The stream is invisible." };
      }
      return { ...base, nodes: nodes({ server: noIds ? "no id field" : "id: 42", client: "42 received" }, noIds ? ["server"] : []),
        tokens: [{ id: "ev", from: "server", to: "proxy", at: p,
          label: noIds ? "data only" : "id: 42", tone: noIds ? "fault" : "normal" }],
        caption: noIds
          ? "Events are flowing, with nothing to identify them by."
          : "Events flow, each carrying an id the browser remembers.",
        detail: noIds
          ? "This works and will keep working until the first disconnection, which is why it ships. The browser stores the last id it saw and sends it back automatically on reconnect - with no id there is nothing to store, and the resume mechanism that was free is simply not there."
          : "The browser tracks the last id it received without being asked to. The only thing the server has to do is emit the field, which makes this the rare resilience feature that costs one line and needs no client code at all.",
        fault: noIds ? "No id means no resume point." : undefined };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ client: "disconnected", proxy: "60s idle timeout" }, ["client"]),
        tokens: [],
        caption: "The connection drops. A tunnel, a laptop lid, an idle timeout on a load balancer.",
        detail: "This is not an edge case, it is the normal life of a long-lived connection, and a stream design that treats it as one will be wrong most days. The browser reconnects on its own after a short delay; what it can recover depends entirely on decisions made before the drop." };
    }

    if (s === 3) {
      if (noIds) {
        return { ...base, nodes: nodes({ client: "reconnected, no header", server: "starts from now" }, ["server"]),
          tokens: [{ id: "re", from: "client", to: "proxy", at: p, label: "GET /events", tone: "fault" }],
          caption: "The browser reconnects and asks for nothing in particular.",
          detail: "The stream resumes from the present. Events 43 through 61 happened while nobody was listening and there is no record anywhere that they were missed - the client is connected, the server is sending, every dashboard is green. Silent data loss that looks exactly like health is the worst failure shape there is, and the fix was an id field.",
          fault: "Reconnected, with a hole nobody can see." };
      }
      return { ...base, nodes: nodes({ client: "Last-Event-ID: 42" }),
        tokens: [{ id: "re", from: "client", to: "proxy", at: p, label: "Last-Event-ID: 42", tone: "retry" }],
        caption: "The browser reconnects automatically and says where it got to.",
        detail: "Nobody wrote this. The EventSource implementation retries on its own schedule, which the server can tune with a retry field, and it sends the last id it saw as a header. The server's job is to honour it - which means holding recent events somewhere it can read them." };
    }

    if (s === 4) {
      if (noIds) {
        return { ...base, nodes: nodes({ server: "sending from 62", client: "43-61 lost" }, ["client"]),
          tokens: [{ id: "res", from: "server", to: "proxy", at: p, label: "id-less events", tone: "fault" }],
          caption: "The stream is live again and nineteen events never arrive.",
          detail: "Whether this matters depends on what the events are. A progress percentage can skip; an append-only log of what an agent did cannot, and the difference has to be decided before the transport is chosen rather than after the first complaint.",
          fault: `Nineteen events, gone without a trace.${evicted ? " The replay buffer being too short is moot here: with no ids there is no resume request for it to fail." : ""}` };
      }
      if (evicted) {
        return { ...base, nodes: nodes({ buf: "holds 63-90 only", server: "409 + resync" }, ["buf"]),
          tokens: [{ id: "res", from: "buf", to: "server", at: Math.min(p, 0.5), label: "42 evicted", tone: "fault" }],
          caption: "The outage lasted longer than the buffer. Event 42 is gone.",
          detail: "A replay buffer is finite and an outage is not, so this case is certain rather than unlikely, and the only real question is what the server does about it. Silently starting from the present reproduces the no-id failure with extra steps. Say so instead - a distinct event telling the client it has a gap, so it can refetch state from scratch. A client that knows it is stale is recoverable; a client that is stale and confident is not.",
          fault: "Resume point outside the buffer." };
      }
      return { ...base, nodes: nodes({ buf: "43-61 replayed", client: "caught up" }),
        tokens: [{ id: "res", from: "buf", to: "server", at: p, label: "replay 43-61", tone: "retry" }],
        caption: "The server replays everything after event 42, then continues live.",
        detail: "The buffer needs to cover the longest disconnection you intend to survive, which is a product decision with a memory cost attached. It also has to be reachable from whichever instance the client reconnects to - a per-process buffer behind a load balancer resumes correctly only by luck." };
    }

    return { ...base, nodes: nodes({ client: noIds ? "live, 19 short" : "live and complete", src: "streaming" }, noIds ? ["client"] : []),
      tokens: [{ id: "live", from: "src", to: "server", at: p, label: "id: 91", tone: "normal" }],
      caption: noIds
        ? "Live again, permanently missing the nineteen events from the gap."
        : "Live again, with nothing missing.",
      detail: noIds
        ? "From the outside this is identical to a healthy stream, and that is the point worth carrying away: the test that distinguishes them is not 'is it connected' but 'is the sequence of ids contiguous', and the client can only check that if the ids exist."
        : "Worth knowing where the ceiling is. SSE is one-way and browsers cap connections per origin over HTTP/1.1, so several tabs on the same origin will starve each other; over HTTP/2 that limit effectively disappears. When you genuinely need the client to send as well, that is the argument for WebSockets - not the streaming itself." };
  },
};
