/**
 * Rotating a secret without an outage, which is an overlap window and nothing else.
 *
 * Explains plan row 67, "Threat modelling and secrets lifecycle".
 *
 * Rotation is usually described as "replace the old key with a new one", and described that way it
 * is impossible to do without dropping traffic. The working version is a window: for a period, both
 * secrets are valid. You issue the new one, make the verifier accept either, push the new one out,
 * wait until nothing is using the old one, and only then revoke it. Every step is boring and the
 * whole design lives in the word "until".
 *
 * The two failures are both about that window. Revoking before the slowest consumer has noticed
 * turns a maintenance task into live 401s, and having no overlap at all turns it into a hard cutover
 * that can only be done during a deliberate outage. The third is quieter and is the reason the first
 * happens: with no signal for who is still using the old secret, "wait until nothing uses it" is a
 * guess dressed up as a step.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const REVOKE_EARLY = "revoke-early";
const NO_DUAL_ACCEPT = "no-dual-accept";
const NO_USAGE_SIGNAL = "no-usage-signal";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["ops", "You", 26, 88, "actor"],
  ["vault", "Secret manager", 108, 40, "store"],
  ["verifier", "Verifier", 232, 40, "service"],
  ["fast", "Service A", 104, 136, "service"],
  ["slow", "Service B", 230, 136, "service"],
];

const EDGES = [
  { from: "ops", to: "vault", dashed: true },
  { from: "vault", to: "verifier", dashed: true },
  { from: "vault", to: "fast", dashed: true },
  { from: "vault", to: "slow", dashed: true },
  { from: "fast", to: "verifier", dashed: true },
  { from: "slow", to: "verifier", dashed: true },
  { from: "verifier", to: "ops", dashed: true },
];

export const secretRotation: Machine = {
  id: "secret-rotation",
  title: "Rotating a secret without an outage",
  short: "Secret rotation",
  subtitle: "The whole design is an overlap window. Every failure is a way of not having one.",
  topicIndices: [67],
  steps: ["Issue the new secret", "Accept both", "Propagate", "Check the old one is idle", "Revoke the old", "Confirm"],
  faults: [
    { id: NO_DUAL_ACCEPT, label: "The verifier accepts one secret at a time", blurb: "No window exists at all, so rotation becomes a hard cutover. This is a design constraint discovered on the day you try to rotate." },
    { id: NO_USAGE_SIGNAL, label: "No metric for which secret was used", blurb: "The waiting step has nothing to wait on, so the decision to revoke gets made from a cache TTL somebody remembered." },
    { id: REVOKE_EARLY, label: "Revoke before the slow consumer refreshes", blurb: "Service B caches for fifteen minutes. Revoking at ten produces five minutes of 401s on live traffic, from a change that was supposed to be invisible." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const noDual = faults.includes(NO_DUAL_ACCEPT);
    const blind = faults.includes(NO_USAGE_SIGNAL);
    const early = faults.includes(REVOKE_EARLY);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ vault: "v2 created, v1 live" }),
        tokens: [{ id: "new", from: "ops", to: "vault", at: p, label: "create v2", tone: "normal" }],
        caption: "A second secret is created. Nothing uses it yet and nothing has changed.",
        detail: "Creating is free and reversible, which is why it goes first. The version label matters more than it looks: without one, nobody downstream can say which secret they are holding, and every later step in this sequence depends on being able to ask that question." };
    }

    if (s === 1) {
      if (noDual) {
        return { ...base, nodes: nodes({ verifier: "one key only" }, ["verifier"]),
          tokens: [{ id: "acc", from: "vault", to: "verifier", at: Math.min(p, 0.45), label: "v2 replaces v1", tone: "fault" }],
          caption: "The verifier holds one key. Accepting the new one means refusing the old one.",
          detail: "There is no overlap window to have, so the rotation is a cutover: every consumer must switch in the same instant, which nothing distributed can do. This is a property of the verifier, not of your procedure, and it is almost always discovered on the day of the first rotation rather than on the day the verifier was chosen. Anything holding a credential should be able to hold two - a JWKS with two keys, a database user per version, a pair of API keys - and if it cannot, that is the thing to fix before scheduling anything.",
          fault: "No overlap window is possible." };
      }
      return { ...base, nodes: nodes({ verifier: "accepts v1 and v2" }),
        tokens: [{ id: "acc", from: "vault", to: "verifier", at: p, label: "trust v1 + v2", tone: "normal" }],
        caption: "The verifier is told to accept either secret. The window is now open.",
        detail: "This is the step that makes the rest safe, and it has to happen before anything starts using the new secret - the opposite order produces a brief period where valid requests are refused. Widening what is accepted is always the safe direction; narrowing it is the one that needs care." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ fast: "v2 within 30s", slow: "v2 at next refresh" }),
        tokens: [{ id: "push", from: "vault", to: "slow", at: p, label: "v2", tone: "slow" }],
        caption: "Consumers pick up the new secret at their own pace, not yours.",
        detail: "Service A watches for changes and switches in seconds. Service B reads its secret at startup and caches for fifteen minutes, so it is still presenting the old one long after the rollout looks complete. The rotation is finished when the slowest consumer has moved, and nobody has a list of the slowest consumers." };
    }

    if (s === 3) {
      if (blind) {
        return { ...base, nodes: nodes({ verifier: "no per-version counter" }, ["verifier"]),
          tokens: [{ id: "chk", from: "verifier", to: "ops", at: p, label: "no signal", tone: "fault" }],
          caption: "Nothing can tell you whether the old secret is still being used.",
          detail: "This is the step that turns a safe procedure into a guess. Without a counter labelled by key version, the only available evidence is a TTL somebody remembers and a belief about which services exist, and both of those are how the next fault happens. The fix is small and belongs in the verifier: count verifications per key version, and treat 'last use of v1 was over an hour ago' as the gate rather than a timer.",
          fault: "Revoking would be a guess." };
      }
      return { ...base, nodes: nodes({ verifier: early ? "v1: 40/min, still live" : "v1: 0 in 60 min" }, early ? ["verifier"] : []),
        tokens: [{ id: "chk", from: "verifier", to: "ops", at: p, label: early ? "v1 still in use" : "v1 idle", tone: early ? "slow" : "normal" }],
        caption: early
          ? "The old secret is still being used forty times a minute."
          : "Nothing has presented the old secret for an hour.",
        detail: early
          ? "The signal exists and it says wait. Service B has not refreshed yet, and the number on the screen is the only thing standing between a routine change and an incident. A rotation runbook whose last step is a clock rather than this number will eventually be run by someone in a hurry."
          : "This is the actual gate, and it is a measurement rather than a duration. An hour of zero is evidence; fifteen minutes because the TTL is fifteen minutes is an assumption about a system that has more consumers than anyone remembers." };
    }

    if (s === 4) {
      if (early) {
        return { ...base, nodes: nodes({ vault: "v1 revoked", slow: "401 on every call" }, ["slow"]),
          tokens: [{ id: "rev", from: "slow", to: "verifier", at: Math.min(p, 0.55), label: "v1 - rejected", tone: "fault" }],
          caption: "The old secret is revoked while Service B is still presenting it.",
          detail: `Every request from Service B now fails authentication until its cache expires, and the errors point at the authentication layer rather than at the change that caused them - so the first ten minutes of the incident are spent looking at the verifier. Revocation is the one step in this sequence that is not reversible in any useful sense: re-issuing the old secret is a new secret with the old value, and by then someone has already started a rollback.${noDual ? " With no overlap window in the first place this was never a question of timing - the traffic would have broken at whichever moment you chose." : ""}`,
          fault: "Revoked into live traffic." };
      }
      return { ...base, nodes: nodes({ vault: "v1 revoked", verifier: "v2 only" }),
        tokens: [{ id: "rev", from: "ops", to: "vault", at: p, label: "revoke v1", tone: "normal" }],
        caption: "The old secret is revoked, after the evidence said nothing was using it.",
        detail: "Revoking is the point of the exercise. A rotation that stops at 'the new secret works' has doubled the number of valid credentials rather than replaced one, and the old value is still in a CI variable, a laptop, and whatever logged it the day it was created." };
    }

    return { ...base, nodes: nodes({ verifier: "v2 only", fast: "v2", slow: "v2" }),
      tokens: [{ id: "ok", from: "verifier", to: "ops", at: p, label: "one live secret", tone: "normal" }],
      caption: "One secret is live and the old one is gone from the verifier.",
      detail: "The last thing worth doing is the least popular: rotate again next month, deliberately, while nothing is wrong. A procedure that has only ever been run during an incident is not a procedure, and the point of rehearsing it is to find the consumer nobody remembered at a time when finding it is free." };
  },
};
