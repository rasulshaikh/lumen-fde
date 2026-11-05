/** Policy shared by the proxy and acceptance tests. No credentials are returned. */
export const MAX_REQUEST_BYTES = 128 * 1024;
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function sameOrigin(request: Request): boolean {
  try { return new URL(request.headers.get("origin") || "").origin === new URL(request.url).origin; }
  catch { return false; }
}

export function mutationPolicy(request: Request): { status: number; error: string } | null {
  if (SAFE_METHODS.has(request.method)) return null;
  if (!sameOrigin(request)) return { status: 403, error: "A same-origin request is required." };
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { status: 415, error: "Content-Type must be application/json." };
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) return { status: 413, error: "Request is too large." };
  return null;
}

/** Check actual bytes as well as Content-Length, including chunked requests. */
export async function bodyWithinLimit(request: Request): Promise<boolean> {
  const reader = request.clone().body?.getReader();
  if (!reader) return true;
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return true;
      bytes += part.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) { void reader.cancel().catch(() => {}); return false; }
    }
  } finally { reader.releaseLock(); }
}

export function contentSecurityPolicy(nonce: string, development = false): string {
  return [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:", `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(!development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
