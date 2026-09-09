const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function toBase64Url(value: string) { return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string) { return atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)); }
/**
 * Constant-time string comparison, for the three secrets this gate compares.
 *
 * `===` on a secret returns as soon as two bytes differ, so how long it took is a measurement of
 * how much of the secret was right. mcp/server.js already decided that mattered and uses
 * `crypto.timingSafeEqual` for MCP_API_KEY; the session HMAC, LUMEN_INTERNAL_API_KEY and
 * CRON_SECRET guard the same trust boundary - the internal key unlocks Quaere *and*
 * saveAskReport, which commits a file into the repo, and /api/ask has no rate limit of its own.
 * Node's timingSafeEqual is not available in the proxy's edge runtime, so this is the same
 * fold-and-compare over Web APIs. Length is folded in rather than short-circuited on.
 */
export function timingSafeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i % (y.length || 1)];
  return diff === 0;
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(String.fromCharCode(...new Uint8Array(bytes)));
}
export async function createSession(username: string, password: string) { const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS; const payload = `${username}.${expires}`; return `${toBase64Url(payload)}.${await signature(payload, password)}`; }
export async function isValidSession(token: string | undefined, username: string, password: string) {
  if (!token || !password) return false;
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return false;
  try { const payload = fromBase64Url(encoded); const [tokenUser, expires] = payload.split("."); if (tokenUser !== username || Number(expires) < Math.floor(Date.now() / 1000)) return false; return timingSafeEqual(provided, await signature(payload, password)); } catch { return false; }
}
export const sessionCookie = "lumen_session";
export const sessionTtl = SESSION_TTL_SECONDS;

// Best effort only: this map lives in one serverless instance's memory, so it slows a
// brute force rather than stopping one, and it resets on cold start. Proportionate for a
// single-user dashboard; swap for a shared store if this ever has more than one user.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginAttempts = new Map<string, number[]>();
function recentAttempts(key: string) { const now = Date.now(); const recent = (loginAttempts.get(key) || []).filter((at) => now - at < LOGIN_WINDOW_MS); if (recent.length) loginAttempts.set(key, recent); else loginAttempts.delete(key); return recent; }
export function loginBlockedFor(key: string) { const recent = recentAttempts(key); return recent.length < LOGIN_LIMIT ? 0 : Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (Date.now() - recent[0])) / 1000)); }
export function recordLoginFailure(key: string) { const recent = recentAttempts(key); recent.push(Date.now()); loginAttempts.set(key, recent); }
export function clearLoginFailures(key: string) { loginAttempts.delete(key); }
