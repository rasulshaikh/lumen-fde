/**
 * SAML, and the three tickets every SSO rollout generates.
 *
 * Explains plan row 68, "Enterprise SSO and directory integration: SAML 2.0 SP setup, SCIM
 * provisioning, group mapping".
 *
 * SAML is not hard. It is fiddly, it fails in ways that look like someone else's fault, and it is
 * almost always the first thing an enterprise customer asks a forward-deployed engineer to make
 * work. The protocol fits on one screen: the app redirects the browser to the identity provider, the
 * identity provider authenticates the person and hands back a signed XML document, the browser POSTs
 * that document to your assertion consumer service, and you check it.
 *
 * The value is entirely in that last step, because the three faults here are the three tickets. A
 * clock that drifted. An entity ID copied from another tenant. And the worst one, which is not an
 * error at all: everybody signs in perfectly and nobody can see anything, because the groups arrived
 * under names your authorisation model has never heard of.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CLOCK_SKEW = "clock-skew";
const WRONG_AUDIENCE = "wrong-audience";
const GROUP_MISMATCH = "group-mismatch";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["user", "Browser", 26, 88, "actor"],
  ["sp", "Your app", 104, 44, "service"],
  ["idp", "Identity provider", 236, 44, "service"],
  ["acs", "/saml/acs", 104, 132, "service"],
  ["dir", "Directory", 240, 132, "store"],
];

const EDGES = [
  { from: "sp", to: "user", dashed: true },
  { from: "user", to: "idp", dashed: true },
  { from: "idp", to: "user", dashed: true },
  { from: "user", to: "acs", dashed: true },
  { from: "acs", to: "sp", dashed: true },
  { from: "acs", to: "dir", dashed: true },
  { from: "dir", to: "acs", dashed: true },
];

export const samlSso: Machine = {
  id: "saml-sso",
  title: "SAML, and the three tickets it always generates",
  subtitle: "Four arrows and one validation step. Everything that goes wrong goes wrong in the validation step.",
  topicIndices: [68],
  steps: ["AuthnRequest", "The user authenticates", "A signed assertion", "POST to the ACS", "Validate it", "Session and groups"],
  faults: [
    { id: WRONG_AUDIENCE, label: "Audience names a different entity ID", blurb: "Copied from the last tenant's configuration. The assertion is genuine, correctly signed, and was not issued to you." },
    { id: CLOCK_SKEW, label: "Your clock is four minutes ahead", blurb: "Works for some users and not others, moves around during the day, and every log on both sides says the other side is wrong." },
    { id: GROUP_MISMATCH, label: "Groups arrive as display names", blurb: "No error anywhere. Sign-in succeeds, the app loads, and the user has no permissions at all - which gets reported as a broken app rather than as SSO." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const skew = faults.includes(CLOCK_SKEW);
    const aud = faults.includes(WRONG_AUDIENCE);
    const groups = faults.includes(GROUP_MISMATCH);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // Validation runs in a fixed order, so the first failing check is the only one the user ever
    // sees. The others are named rather than hidden: "we fixed the audience and it still fails" is
    // the second half of this ticket, and it should be predictable rather than a surprise.
    const rejected = aud || skew;

    if (s === 5 && rejected) {
      const alsoWrong = [aud && skew ? "the clock skew is real too and is the next thing you will hit" : "",
        groups ? "the group mapping is also wrong and has not been reached" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ acs: "no session created" }, ["acs"]), tokens: [],
        caption: "No session exists. The assertion was rejected before any of this ran.",
        detail: "A rejected assertion produces no user, no groups and no audit entry beyond the failure itself, which is why 'check whether they were provisioned' is the wrong first question on an SSO ticket. Read the validation error first; everything downstream of it is untouched.",
        fault: `Rejected at validation.${alsoWrong.length ? ` Note that ${alsoWrong.join(", and ")}.` : ""}` };
    }

    if (s === 0) {
      return { ...base, nodes: nodes({ sp: "entity ID + ACS URL", idp: "waiting" }),
        tokens: [{ id: "req", from: "user", to: "idp", at: p, label: "AuthnRequest", tone: "normal" }],
        caption: "The app redirects the browser to the identity provider.",
        detail: "Your application never speaks to the identity provider directly - every message in SAML travels through the browser, which is why this works across network boundaries with no firewall rules and why every payload is base64 in a form field. The AuthnRequest carries your entity ID, and that string has to match what the customer typed into their console exactly, including the trailing slash." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ idp: "password + MFA", dir: "user found" }), tokens: [],
        caption: "The identity provider authenticates the person. Your app is not involved.",
        detail: "This is the whole reason enterprises want SAML: their password policy, their MFA, their conditional access, their offboarding. When someone leaves, the identity provider stops letting them in, and that is a guarantee your application could never make on its own." };
    }

    if (s === 2) {
      return { ...base,
        nodes: nodes({ idp: aud ? "Audience: other-tenant" : "signed assertion" }, aud ? ["idp"] : []),
        tokens: [{ id: "asrt", from: "idp", to: "user", at: p,
          label: aud ? "Audience: sp.other-tenant" : "SAMLResponse", tone: aud ? "fault" : "normal" }],
        caption: aud
          ? "A perfectly valid assertion, addressed to somebody else."
          : "A signed XML assertion comes back, in a form the browser will POST.",
        detail: aud
          ? "The Audience element names who the assertion is for. It is the SAML equivalent of an aud claim, and it is wrong here because the configuration was copied from the previous customer - which is far and away the commonest way to get it wrong. The signature is genuine, so every 'is it signed' check passes."
          : "The assertion states who the user is, who it is for, and when it stops being valid, and the signature covers all of it. It is signed rather than encrypted, so anything in it is readable by the browser carrying it - never put anything in a SAML attribute that the user should not see.",
        fault: aud ? "Audience does not name your entity ID." : undefined };
    }

    if (s === 3) {
      return { ...base, nodes: nodes({ acs: "receiving" }),
        tokens: [{ id: "post", from: "user", to: "acs", at: p, label: "POST SAMLResponse", tone: "normal" }],
        caption: "The browser POSTs the assertion to your assertion consumer service.",
        detail: "An unauthenticated POST from a browser carrying a document that will create a session. That framing is worth keeping: the endpoint is public, the input is attacker-reachable, and the only thing standing between the two is the validation in the next step." };
    }

    if (s === 4) {
      if (aud) {
        return { ...base, nodes: nodes({ acs: `Audience mismatch${skew ? " (checked before the clock)" : ""}` }, ["acs"]),
          tokens: [{ id: "v", from: "acs", to: "sp", at: Math.min(p, 0.4), label: "reject", tone: "fault" }],
          caption: "Signature verifies. Audience does not match. Rejected.",
          detail: `Checking the signature and stopping there is the classic SAML vulnerability, because a signature only proves the identity provider issued the document - not that it issued it to you. An assertion minted for another service provider is genuine and must still be refused.${skew ? " The clock is four minutes out as well; that check sits after this one and has not run yet, so fixing the entity ID will produce a second, different failure rather than a working login." : ""}`,
          fault: "Audience restriction failed." };
      }
      if (skew) {
        return { ...base, nodes: nodes({ acs: "NotOnOrAfter in the past", sp: "clock +4m" }, ["acs", "sp"]),
          tokens: [{ id: "v", from: "acs", to: "sp", at: Math.min(p, 0.4), label: "reject", tone: "fault" }],
          caption: "The assertion expired four minutes before it was issued, according to your clock.",
          detail: "NotOnOrAfter is absolute time, and the assertion's validity window is often as short as five minutes. Four minutes of drift eats most of it, so the same configuration works for a user on a fast connection and fails for one who paused at the MFA prompt - which is exactly the shape of a bug nobody can reproduce. The answer is NTP on your side and a small, explicitly configured skew allowance, not a longer window from the customer.",
          fault: "NotOnOrAfter failed against a drifted clock." };
      }
      return { ...base, nodes: nodes({ acs: "signature, Audience, window: ok" }),
        tokens: [{ id: "v", from: "acs", to: "sp", at: p, label: "accepted", tone: "normal" }],
        caption: "Signature, Audience, InResponseTo and the validity window all check out.",
        detail: "Four checks, in that order, and a real implementation adds a replay cache keyed on the assertion ID - the document is a bearer token until it expires, and nothing else stops it being POSTed twice. Use a library. Every hand-rolled SAML parser has had the same XML signature wrapping bug." };
    }

    return { ...base,
      nodes: nodes(groups
        ? { acs: "0 roles matched", dir: "sends display names" }
        : { acs: "session created", dir: "engineering -> editor" }, groups ? ["acs"] : []),
      tokens: [{ id: "grp", from: "dir", to: "acs", at: p,
        label: groups ? '"Platform Engineering"' : "grp-9f2a -> editor", tone: groups ? "fault" : "normal" }],
      caption: groups
        ? "Sign-in succeeds. The user has no permissions, and nothing reported an error."
        : "Groups map onto roles and the session is created.",
      detail: groups
        ? "The identity provider is sending human-readable group names and your mapping is keyed on immutable identifiers, so nothing matches and the user lands in an application that looks broken. There is no error to find: authentication worked, provisioning worked, and the intersection of two correct lists is empty. Map on the immutable ID rather than the display name - display names get renamed by an administrator on a Tuesday and silently revoke everyone - and make an empty role set log loudly rather than resolve to no access, because a user with zero roles is far more often a mapping bug than a deliberate state."
        : "SAML carries group membership at sign-in; SCIM pushes it continuously, including removals. You want both, and the reason is offboarding: with SAML alone, a user removed from a group keeps whatever the last assertion granted until their session ends, which on a long-lived session is not a security posture anyone would choose deliberately.",
      fault: groups ? "Authenticated with no roles." : undefined };
  },
};
