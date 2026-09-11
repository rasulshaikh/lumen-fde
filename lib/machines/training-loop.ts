/**
 * A bad loss curve, and naming the cause from the shape.
 *
 * Explains plan row 111, "Training deep nets: optimisers, batch norm, schedules, mixed precision,
 * bad loss curves".
 *
 * The objective for this row is diagnostic rather than theoretical: given a loss curve that is
 * misbehaving, say which of a handful of things caused it. That is a symptom-to-cause problem, and
 * the right way through it is to step the loop and break it, because each cause has a signature at a
 * specific stage and the stage is what narrows it down.
 *
 * Three signatures, three very different causes. A loss that becomes NaN is arithmetic - the step
 * was too large and the weights went to infinity, and it happens within a few dozen iterations. A
 * training loss that falls while validation loss is flat or worse is not overfitting when it happens
 * from the very first epoch, it is a train/eval mismatch. And a loss that descends beautifully in a
 * staircase is a batch composition problem: sorted data means every batch is one class, so the model
 * learns the current class rather than the task.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const LR_TOO_HIGH = "lr-too-high";
const EVAL_MODE = "eval-mode";
const NO_SHUFFLE = "no-shuffle";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["data", "Batch", 30, 44, "store"],
  ["fwd", "Forward", 110, 44, "service"],
  ["loss", "Loss", 190, 44, "service"],
  ["bwd", "Backward", 262, 104, "service"],
  ["opt", "Optimiser", 160, 132, "service"],
  ["val", "Validation", 42, 124, "actor"],
];

const EDGES = [
  { from: "data", to: "fwd", dashed: true },
  { from: "fwd", to: "loss", dashed: true },
  { from: "loss", to: "bwd", dashed: true },
  { from: "bwd", to: "opt", dashed: true },
  { from: "opt", to: "data", dashed: true },
  { from: "opt", to: "val", dashed: true },
  { from: "val", to: "data", dashed: true },
];

export const trainingLoop: Machine = {
  id: "training-loop",
  title: "A bad loss curve, and naming the cause",
  short: "Training loop",
  subtitle: "Three shapes, three causes, three different stages. The stage is what narrows it down.",
  topicIndices: [111],
  steps: ["Take a batch", "Forward", "Loss", "Backward", "Optimiser step", "Validate"],
  faults: [
    { id: NO_SHUFFLE, label: "The data is sorted by label", blurb: "Every batch is one class. The loss descends in a staircase and the model learns whichever class it is currently being shown." },
    { id: LR_TOO_HIGH, label: "Learning rate 10x too large", blurb: "Loss to NaN inside fifty iterations. Once the weights are NaN, every subsequent number is NaN and the curve tells you nothing more." },
    { id: EVAL_MODE, label: "Forgot model.eval()", blurb: "Dropout and batch norm behave differently in training. Validation loss is worse than training loss from the very first epoch, which is not what overfitting looks like." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const hotLr = faults.includes(LR_TOO_HIGH);
    const wrongMode = faults.includes(EVAL_MODE);
    const sorted = faults.includes(NO_SHUFFLE);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // Once the weights are NaN, everything downstream is NaN and no other symptom is observable.
    // Named rather than hidden: an unreadable curve is itself the diagnostic, and the other two
    // problems are still there waiting.
    if (hotLr && s >= 4) {
      const hidden = [sorted ? "the sorted batches" : "", wrongMode ? "the missing model.eval()" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ opt: "weights = NaN", val: "NaN" }, ["opt", "val"]), tokens: [],
        caption: "Every weight is NaN. Nothing after this measures anything.",
        detail: "NaN propagates through every operation it touches, so the loss, the gradients and the validation metric are all NaN and the curve has stopped carrying information. Fix the learning rate first, because until the numbers are finite no other diagnosis is possible - which is why 'my loss is NaN' is the one symptom with a fixed first move rather than a differential.",
        fault: `NaN everywhere.${hidden.length ? ` ${hidden.join(" and ")} will still be there once the numbers are finite again, and neither is visible from here.` : ""}` };
    }

    if (s === 0) {
      if (sorted) {
        return { ...base, nodes: nodes({ data: "batch 12: all class 3" }, ["data"]),
          tokens: [{ id: "b", from: "data", to: "fwd", at: p, label: "64 identical labels", tone: "fault" }],
          caption: "The data was never shuffled, so this batch is one class from end to end.",
          detail: "A gradient computed from a batch that is all one class points at 'predict this class', and the next batch of a different class points somewhere else entirely. The model chases each batch in turn instead of learning the task, and the loss falls in a staircase - low while a class runs, jumping at each boundary - which looks like progress at a glance. The batch is meant to be a sample of the distribution; sorted data makes it a sample of one point in it.",
          fault: "The batch is not a sample." };
      }
      return { ...base, nodes: nodes({ data: "shuffled, mixed classes" }),
        tokens: [{ id: "b", from: "data", to: "fwd", at: p, label: "64 mixed", tone: "normal" }],
        caption: "A shuffled batch: a small random sample of the training distribution.",
        detail: "The whole premise of stochastic gradient descent is that a batch's gradient is a noisy estimate of the true gradient over the dataset. Shuffling is what makes it unbiased, and it is one line that is easy to omit when data arrives already grouped - which it usually does." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ fwd: wrongMode ? "dropout active" : "activations cached" }, wrongMode ? ["fwd"] : []),
        tokens: [{ id: "f", from: "data", to: "fwd", at: p, label: "forward", tone: "normal" }],
        caption: "Activations are computed and kept, because the backward pass needs them.",
        detail: "This is where the memory goes: the activations for every layer, for every item in the batch, held until the gradients that need them have been computed. It is why batch size is the first thing to reduce when a run will not fit, and why gradient checkpointing - recomputing activations instead of storing them - trades time for memory rather than saving anything outright." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ loss: hotLr ? "2.31, still finite" : "2.31" }),
        tokens: [{ id: "l", from: "fwd", to: "loss", at: p, label: "cross-entropy", tone: "normal" }],
        caption: "One number summarising how wrong the batch was.",
        detail: "At initialisation the loss should be close to a value you can predict - for ten balanced classes with cross-entropy, the natural log of ten, about 2.30. A starting loss far from that means the output layer or the labels are wrong, and checking it takes one line and rules out a whole category of bug before any training happens." };
    }

    if (s === 3) {
      return { ...base, nodes: nodes({ bwd: hotLr ? "gradients large" : "gradients computed" }, hotLr ? ["bwd"] : []),
        tokens: [{ id: "g", from: "loss", to: "bwd", at: p, label: "backprop", tone: hotLr ? "slow" : "normal" }],
        caption: "The chain rule, applied backwards through every layer.",
        detail: hotLr
          ? "The gradients here are perfectly ordinary. That is the point worth noticing: a learning rate problem is not a gradient problem, the direction is correct and only the distance travelled along it is wrong. Gradient clipping bounds the step and is a genuine safety net, but it is a bound on a symptom rather than a cure for the rate."
          : "Every parameter gets a number saying how the loss would change if it changed. Nothing has been updated yet - computing the gradients and applying them are separate steps, which is what makes gradient accumulation possible and why the optimiser is a distinct object." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ opt: "AdamW, lr 3e-4" }),
        tokens: [{ id: "o", from: "bwd", to: "opt", at: p, label: "step", tone: "normal" }],
        caption: "Weights move against the gradient, scaled by the learning rate and the schedule.",
        detail: "Adam keeps a running estimate of each parameter's gradient scale, so parameters that see rare, large gradients get treated differently from ones that see constant small ones. A warmup over the first few hundred steps exists because those estimates are meaningless at the start, and skipping it is a common cause of a run that diverges in its first minute and trains fine on restart." };
    }

    if (wrongMode) {
      return { ...base, nodes: nodes({ val: "val 0.94 vs train 0.31", fwd: "dropout still on" }, ["val"]),
        tokens: [{ id: "v", from: "opt", to: "val", at: p, label: "worse from epoch 1", tone: "fault" }],
        caption: "Validation loss is far worse than training loss, from the very first epoch.",
        detail: `Dropout is still randomly zeroing activations and batch norm is still using the current batch's statistics instead of its running averages, so the model being evaluated is not the model that will be deployed. The shape is the diagnostic: overfitting starts with the two curves together and separates later, and this gap is present at epoch one and never closes.${sorted ? " The sorted batches make batch norm's statistics worse still, because each batch's mean and variance describe a single class." : ""} One line - switching to evaluation mode, and back afterwards - and it is worth asserting rather than remembering.`,
        fault: "Evaluating a different model from the one you trained." };
    }

    return { ...base, nodes: nodes({ val: sorted ? "val flat, train staircase" : "val 0.38, train 0.31" }, sorted ? ["val"] : []),
      tokens: [{ id: "v", from: "opt", to: "val", at: p, label: sorted ? "not learning" : "tracking", tone: sorted ? "fault" : "normal" }],
      caption: sorted
        ? "Training loss descends in steps. Validation loss barely moves."
        : "Both curves fall together, with validation a little above training.",
      detail: sorted
        ? "The training curve looks like progress and the validation curve is the honest one: the model is fitting whichever class is currently in front of it rather than learning to separate them. Reading the two curves against each other is the whole diagnostic skill for this row - the training loss alone can be made to look good by several different bugs."
        : "This is what healthy looks like, and knowing it precisely is what makes the other shapes diagnosable. Validation slightly above training and both still falling; when validation turns upward while training keeps falling, that is overfitting, and it is the only one of these shapes that more data actually fixes.",
      fault: sorted ? "Learning the batch, not the task." : undefined };
  },
};
