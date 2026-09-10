/**
 * Throughput, and the number that is not on the invoice.
 *
 * Plan row 2: "Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls".
 *
 * The misconception: "the transfer is slow, so the pipe is too small." Bandwidth is the one number
 * on the bill and the one that stopped being the constraint. A single TCP flow cannot go faster
 * than window/RTT no matter how wide the link is, and with any loss at all the Mathis ceiling
 * arrives well below that.
 *
 * Drag the round-trip time. Below the crossover the link is the limit and buying more helps. Past
 * it the link is flat and irrelevant, and the only thing that moves the number is distance.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const LINK_GBPS = 10;
/** A well-tuned socket buffer. Anything smaller moves the crossover further left, not further right. */
const WINDOW_BYTES = 4 * 1024 * 1024;
const MSS_BYTES = 1460;

/** Mbps a single flow reaches on window/RTT alone. */
export const windowLimit = (rttMs: number) => (WINDOW_BYTES * 8) / (rttMs * 1000);
/** Mathis: MSS / (RTT * sqrt(p)), in Mbps. Infinite at zero loss, which is why it is guarded. */
export const mathisLimit = (rttMs: number, loss: number) =>
  loss <= 0 ? Infinity : (MSS_BYTES * 8) / (rttMs * 1000 * Math.sqrt(loss));
export const throughput = (rttMs: number, loss: number) =>
  Math.min(LINK_GBPS * 1000, windowLimit(rttMs), mathisLimit(rttMs, loss));
/** RTT at which window/RTT drops under the link rate. Closed form: window bits / link bits per ms. */
export const bdpCrossoverMs = () => (WINDOW_BYTES * 8) / (LINK_GBPS * 1000 * 1000);

const mbps = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${v.toFixed(0)} Mbps`);

export const bandwidthDelay: Lesson = {
  id: "bandwidth-delay",
  title: "Throughput, and the number that is not on the invoice",
  prompt: "Drag the round-trip time. Find where a 10 Gbps link stops being 10 Gbps.",
  topicIndices: [2],
  view: { x0: 0, x1: 300, y0: 0, y1: 10000 },

  params: [
    { id: "rtt", label: "Round-trip time", min: 1, max: 300, step: 1, unit: "ms", value: 4, slider: false,
      hint: "Drag the ball. 1ms is the same rack, 80ms is London to New York, 300ms is a satellite." },
    { id: "loss", label: "Packet loss", min: 0, max: 1, step: 0.01, unit: "%", value: 0, slider: true,
      hint: "A tenth of a percent is a link nobody would call broken. Watch what it does anyway." },
  ],
  handles: [{ id: "ball", param: "rtt", axis: "x" }],

  scene(params: Params): LessonScene {
    const rtt = paramValue(bandwidthDelay, params, "rtt");
    const lossPct = paramValue(bandwidthDelay, params, "loss");
    const loss = lossPct / 100;
    const t = throughput(rtt, loss);
    const cross = bdpCrossoverMs();

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 1 + (299 * i) / 200;
      curve.push([x, Math.min(10000, throughput(x, loss))]);
    }

    const linkBound = t >= LINK_GBPS * 1000 - 1e-9;
    const lossBound = loss > 0 && mathisLimit(rtt, loss) < windowLimit(rtt);
    const share = t / (LINK_GBPS * 1000);

    const caption = linkBound
      ? `${mbps(t)}. The link is the limit here, which is the only place buying a wider one helps.`
      : lossBound
        ? `${mbps(t)} on a 10 Gbps link. Loss is the limit, not width.`
        : `${mbps(t)} on a 10 Gbps link - ${(share * 100).toFixed(1)}% of what you are paying for.`;

    const detail = lossBound
      ? `At ${lossPct.toFixed(2)}% loss the Mathis ceiling is MSS / (RTT * sqrt(p)), which does not contain the link rate at all. A link nobody would call broken has taken a 10 Gbps path down to ${mbps(t)}, and no amount of extra bandwidth changes it - only shorter paths or fewer drops.`
      : linkBound
        ? `Below ${cross.toFixed(2)}ms the window drains faster than the link can carry it, so the link is genuinely the constraint. This is the region everyone's intuition was formed in, and almost no production path is in it.`
        : `A single flow can have at most one window of data unacknowledged, so its ceiling is window/RTT and the link rate does not appear. Past ${cross.toFixed(2)}ms that ceiling is under 10 Gbps and the width of the pipe stops mattering.`;

    const arrived = rtt >= 60 && loss >= 0.0005
      ? `${mbps(t)} on a link sold as 10 Gbps, at ${rtt}ms and ${lossPct.toFixed(2)}% loss. Neither of the two numbers doing the damage appears on the invoice, and the one that does is not the constraint. This is why the answer to a slow transfer is usually more streams, a closer endpoint, or finding the drops - not a bigger pipe.`
      : undefined;

    return {
      paths: [
        { id: "throughput", kind: "curve", points: curve },
        { id: "link", kind: "guide", points: [[0, 10000], [300, 10000]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: rtt, y: Math.min(10000, t), label: `${rtt}ms` },
        { id: "cross", kind: "marker", x: cross, y: 10000 },
      ],
      readouts: [
        { label: "rtt", value: `${rtt}ms` },
        { label: "throughput", value: mbps(t) },
        { label: "of the link", value: `${(share * 100).toFixed(1)}%` },
        { label: "window limit", value: mbps(windowLimit(rtt)) },
        { label: "loss limit", value: loss > 0 ? mbps(mathisLimit(rtt, loss)) : "none" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
