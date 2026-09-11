/**
 * Authorization code with PKCE, and the three places it is usually got wrong.
 *
 * Explains plan row 29, "Auth: OAuth2, OIDC, JWT, RBAC, multi-tenant claims".
 *
 * The flow is taught as a diagram with five arrows and remembered as "you get a token". What
 * actually matters is why each arrow is shaped the way it is: the authorization code travels back
 * through the browser, in a URL, where a malicious app on the same device can read it - so the code
 * alone must not be enough. PKCE is the fix, and it is the one step people skip because the flow
 * works perfectly without it.
 *
 * The other two faults are the ones that survive a code review. A token with a valid signature is
 * not a token for you: `aud` says who it was minted for. And a tenant identifier taken from the
 * request body rather than the token is the whole of multi-tenant isolation handed to the caller.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const NO_PKCE = "no-pkce";
const AUD_UNCHECKED = "aud-unchecked";
const TENANT_FROM_BODY = "tenant-from-body";

const PLACES: Array<[string, string, number, number, "actor" | "service"]> = [
  ["browser", "Browser", 30, 45, "actor"],
  ["client", "Your app", 118, 45, "service"],
  ["authz", "/authorize", 232, 45, "service"],
  ["token", "/token", 232, 118, "service"],
  ["api", "Your API", 118, 118, "service"],
];

const EDGES = [
  { from: "browser", to: "client", dashed: true },
  { from: "client", to: "browser", dashed: true },
  { from: "browser", to: "authz", dashed: true },
  { from: "authz", to: "browser", dashed: true },
  { from: "client", to: "token", dashed: true },
  { from: "token", to: "client", dashed: true },
  { from: "client", to: "api", dashed: true },
  { from: "api", to: "client", dashed: true },
];

export const oauthPkce: Machine = {
  id: "oauth-pkce",
  title: "Authorization code with PKCE, arrow by arrow",
  subtitle: "The code travels back through the browser, in a URL. Everything else in the flow is a consequence of that.",
  topicIndices: [29],
  steps: ["Redirect to /authorize", "You sign in", "Code comes back", "Exchange the code", "Validate the claims", "Call the API"],
  faults: [
    { id: NO_PKCE, label: "Skip PKCE", blurb: "No code_challenge, no verifier. The flow completes normally, which is exactly why this ships - nothing fails until someone is listening." },
    { id: AUD_UNCHECKED, label: "Do not check aud", blurb: "The signature verifies, the issuer is right, the token is in date - and it was minted for a different application entirely." },
    { id: TENANT_FROM_BODY, label: "Read the tenant from the request", blurb: "tenant_id comes from the JSON body rather than the token. Every isolation guarantee is now a value the caller types." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const noPkce = faults.includes(NO_PKCE);
    const noAud = faults.includes(AUD_UNCHECKED);
    const bodyTenant = faults.includes(TENANT_FROM_BODY);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base,
        nodes: nodes({ client: noPkce ? "no challenge" : "S256 challenge", authz: "waiting" }, noPkce ? ["client"] : []),
        tokens: [{ id: "go", from: "browser", to: "authz", at: p,
          label: noPkce ? "client_id + redirect_uri" : "+ code_challenge", tone: noPkce ? "fault" : "normal" }],
        caption: noPkce
          ? "The app sends the user off to sign in, and commits to nothing."
          : "The app invents a secret, sends only its hash, and keeps the secret.",
        detail: noPkce
          ? "Without a code_challenge the authorization server has no way to tell, later, whether the thing redeeming the code is the same thing that started the flow. The redirect is identical either way and the user sees no difference, which is why this omission survives review."
          : "code_challenge is SHA-256 of a random code_verifier the app generated and did not send. The server stores the hash against this authorization request. That single line is what makes the code useless to anyone who steals it, because redeeming it later requires the preimage.",
        fault: noPkce ? "No code_challenge sent." : undefined };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ authz: "user authenticates", browser: "password + MFA" }), tokens: [],
        caption: "The user signs in to the identity provider, not to your app.",
        detail: "This is the part of the flow your application must never see. The credentials go to the authorization server directly, which is why OAuth is worth the complexity at all: the app gets access without ever being in a position to store a password." };
    }

    if (s === 2) {
      return { ...base,
        nodes: nodes({ browser: noPkce ? "code in the URL, unprotected" : "code in the URL" }, noPkce ? ["browser"] : []),
        tokens: [{ id: "code", from: "authz", to: "browser", at: p, label: "?code=8f21c", tone: noPkce ? "fault" : "normal" }],
        caption: "The code comes back as a query parameter on a redirect.",
        detail: noPkce
          ? "A URL is not a private channel. It lands in browser history, in the Referer header, in proxy logs, and on a mobile device in the hands of any app that registered the same custom scheme. With no PKCE, whoever reads it can redeem it, and the real user's sign-in looks entirely successful."
          : "The code is still visible - history, logs, the Referer header, a rival app claiming the same redirect scheme. PKCE does not hide it. It makes reading it insufficient, which is a much easier property to guarantee than secrecy.",
        fault: noPkce ? "An interceptable code with nothing binding it to this client." : undefined };
    }

    if (s === 3) {
      return { ...base,
        nodes: nodes({ token: noPkce ? "no verifier to check" : "hash matches" }, noPkce ? ["token"] : []),
        tokens: [{ id: "ex", from: "client", to: "token", at: p,
          label: noPkce ? "code" : "code + code_verifier", tone: noPkce ? "fault" : "normal" }],
        caption: noPkce
          ? "The code is redeemed. Possession of the code was the entire proof."
          : "The app sends the verifier. The server hashes it and compares.",
        detail: noPkce
          ? "The exchange succeeds, a real token comes back, and the user is signed in - for the attacker exactly as readily as for the user. Nothing in your logs distinguishes the two requests. This is the failure that has no symptom until it is someone else's session."
          : "The server hashes the verifier and compares it to the challenge it stored in step one. An attacker holding the code has the hash, not the preimage, so the exchange fails for them and succeeds for you. This is the whole of PKCE: one hash, stored for the length of one flow.",
        fault: noPkce ? "Anyone holding the code can complete this step." : undefined };
    }

    if (s === 4) {
      const wrong = noAud;
      return { ...base,
        nodes: nodes({ client: wrong ? "aud: another-app" : "iss, aud, exp checked" }, wrong ? ["client"] : []),
        tokens: [{ id: "jwt", from: "token", to: "client", at: p, label: "access_token", tone: wrong ? "fault" : "normal" }],
        caption: wrong
          ? "The signature verifies. The token was not minted for this API."
          : "Issuer, audience and expiry are checked before the token is trusted.",
        detail: wrong
          ? "A valid signature proves the identity provider issued the token. It proves nothing about who was meant to receive it. Any other application sharing the same provider can hand you a perfectly genuine token for itself, and if you only verify the signature you will accept it. `aud` is the claim that makes a token yours rather than merely real."
          : "Verifying the signature is necessary and is not the check. `iss` pins which provider, `aud` pins which application, `exp` pins when - and `exp` needs a little skew allowance, because two machines that disagree by three seconds will reject valid tokens at a rate nobody can reproduce.",
        fault: wrong ? "aud not validated." : undefined };
    }

    return { ...base,
      nodes: nodes({ api: bodyTenant ? "tenant from body" : "tenant from the token" }, bodyTenant ? ["api"] : []),
      tokens: [{ id: "call", from: "client", to: "api", at: p,
        label: bodyTenant ? "tenant_id: 42" : "sub + tid claim", tone: bodyTenant ? "fault" : "normal" }],
      caption: bodyTenant
        ? "The API reads which tenant to serve from the request body."
        : "The API reads the tenant from the signed claims and ignores the body.",
      detail: bodyTenant
        ? "The token is valid, the user is real, and the tenant identifier is a number the caller typed. Changing it is a text edit. Every row-level check downstream is now enforcing a boundary chosen by the person it is meant to constrain, and the request looks completely ordinary in the access log."
        : "The tenant lives in the token because the token is signed and the body is not. Once that is true, an attempt to reach another tenant requires forging a signature rather than editing a field, and the difference between those two is the entire security of a multi-tenant system.",
      fault: bodyTenant ? "Tenant taken from caller-controlled input." : undefined };
  },
};
