/**
 * KV cache, and the number that actually decides how many users fit.
 *
 * Plan rows 11 and 49: "Serving models on Kubernetes and GPUs" and "LLM fundamentals". One lesson
 * for both, because it is one piece of arithmetic and building it twice would be building the same
 * lesson twice.
 *
 * The misconception: "80GB card, 14GB model, so we have plenty of headroom for fifty users." The
 * weights are the small, fixed number. The KV cache is per token per sequence, so concurrency is
 * (VRAM - weights) divided by something that grows with context - a hyperbola, not a slope. Double
 * the context and you halve the users, every time.
 *
 * The slider is the one architectural decision that moves it: grouped-query attention. Going from
 * 32 KV heads to 8 divides the cache by four, which is the entire reason GQA exists.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const VRAM_GB = 80;
const PARAMS_B = 7;
const BYTES_PER_PARAM = 2;
const LAYERS = 32;
const D_HEAD = 128;
const KV_DTYPE = 2;

export const weightsGB = () => (PARAMS_B * 1e9 * BYTES_PER_PARAM) / 1e9;
export const freeGB = () => VRAM_GB - weightsGB();
/** Bytes of KV cache per token, per sequence: 2 (K and V) * layers * kv_heads * d_head * dtype. */
export const kvBytesPerToken = (kvHeads: number) => 2 * LAYERS * kvHeads * D_HEAD * KV_DTYPE;
/** How many sequences of this context fit in what the weights left behind. */
export const concurrency = (context: number, kvHeads: number) =>
  (freeGB() * 1e9) / (kvBytesPerToken(kvHeads) * Math.max(context, 1));
/** The context at which exactly one sequence fits. Past it the model cannot serve its own window. */
export const contextCeiling = (kvHeads: number) => (freeGB() * 1e9) / kvBytesPerToken(kvHeads);

const gb = (b: number) => `${(b / 1e9).toFixed(1)} GB`;
const k = (n: number) => (n >= 1000 ? `${(n / 1024).toFixed(0)}k` : `${n}`);

export const kvCache: Lesson = {
  id: "kv-cache",
  title: "KV cache, and the number that decides how many users fit",
  prompt: "Drag the context length. Watch concurrency collapse, then halve the KV heads.",
  topicIndices: [11, 49],
  view: { x0: 512, x1: 32768, y0: 0, y1: 260 },

  params: [
    { id: "context", label: "Context per request", min: 512, max: 32768, step: 256, unit: " tok", value: 4096, slider: false,
      hint: "Drag the ball. How much history each concurrent request is carrying." },
    { id: "kvHeads", label: "KV heads", min: 1, max: 32, step: 1, unit: "", value: 8, slider: true,
      hint: "32 is multi-head attention, 8 is grouped-query, 1 is multi-query. This is the only lever here that is an architecture choice rather than a product one." },
  ],
  handles: [{ id: "ball", param: "context", axis: "x" }],

  scene(params: Params): LessonScene {
    const context = paramValue(kvCache, params, "context");
    const kvHeads = paramValue(kvCache, params, "kvHeads");
    const users = concurrency(context, kvHeads);
    const perToken = kvBytesPerToken(kvHeads);
    const perSeq = perToken * context;
    const ceiling = contextCeiling(kvHeads);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 512 + (32256 * i) / 200;
      curve.push([x, Math.min(260, concurrency(x, kvHeads))]);
    }

    const cacheExceedsWeights = perSeq * Math.max(1, Math.floor(users)) > weightsGB() * 1e9;
    const single = users < 2;

    const caption = single
      ? `${users.toFixed(1)} sequences at ${k(context)} context. One request now needs ${gb(perSeq)} of cache.`
      : `${Math.floor(users)} concurrent sequences at ${k(context)} context, ${gb(perSeq)} of cache each.`;

    const detail = single
      ? `The card has ${gb(freeGB() * 1e9)} left after ${gb(weightsGB() * 1e9)} of weights, and one sequence at this context wants ${gb(perSeq)} of it. Past ${k(ceiling)} tokens a single request does not fit, so the model cannot serve its own advertised context window on this card at all - which is a sentence that appears in no model card.`
      : `Concurrency is free VRAM divided by cache-per-sequence, and cache-per-sequence is linear in context. So concurrency goes as one over context: it is a hyperbola. Doubling the context halves the users, every time, and there is no configuration that changes that shape - only the constant in front of it.`;

    const arrived = cacheExceedsWeights && context >= 8192
      ? `At ${k(context)} context the cache for ${Math.floor(users)} sequences is larger than the model itself. The weights are the number in every capacity plan and the small one; the cache is the number nobody plans for and the one that runs out. Dropping KV heads from 32 to 8 divides this by four and costs almost nothing in quality, which is why every model shipped since 2023 does it.`
      : undefined;

    return {
      paths: [
        { id: "users", kind: "curve", points: curve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: context, y: Math.min(260, users), label: `${Math.floor(users)} users` },
        ...(ceiling <= 32768 ? [{ id: "ceiling", kind: "marker" as const, x: ceiling, y: 1 }] : []),
      ],
      readouts: [
        { label: "context", value: k(context) },
        { label: "concurrency", value: users >= 1 ? `${Math.floor(users)}` : users.toFixed(2) },
        { label: "cache/seq", value: gb(perSeq) },
        { label: "weights", value: gb(weightsGB() * 1e9) },
        { label: "free", value: gb(freeGB() * 1e9) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
