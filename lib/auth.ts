const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function toBase64Url(value: string) { return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string) { return atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)); }
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
  try { const payload = fromBase64Url(encoded); const [tokenUser, expires] = payload.split("."); if (tokenUser !== username || Number(expires) < Math.floor(Date.now() / 1000)) return false; return provided === await signature(payload, password); } catch { return false; }
}
export const sessionCookie = "lumen_session";
export const sessionTtl = SESSION_TTL_SECONDS;
