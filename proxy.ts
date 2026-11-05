import { NextRequest, NextResponse } from "next/server";
import { authenticationConfigured, isValidSession, sessionCookie, timingSafeEqual } from "@/lib/auth";

import { bodyWithinLimit, contentSecurityPolicy, mutationPolicy, SAFE_METHODS, securityHeaders } from "@/lib/security";

// App Router serves metadata files (app/icon.svg, app/apple-icon.png, opengraph-image)
// as real routes, and the gate was catching them: /icon.svg 307'd to /login, so the tab
// icon resolved to a login page instead of an image. These are branding, not secrets -
// the login screen itself needs the favicon - so they stay public. Matches the optional
// content hash Next appends to generated variants (/apple-icon-a1b2c3.png).
const publicAsset = /^\/(favicon\.ico|icon[\w-]*\.(svg|png|ico)|apple-icon[\w-]*\.png|(opengraph|twitter)-image[\w-]*(\.\w+)?|manifest\.webmanifest|robots\.txt|sitemap\.xml)$/;

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const api = path.startsWith("/api/");
  const development = process.env.NODE_ENV === "development";
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, development);
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: forwarded } });
  const finish = (response: NextResponse) => {
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    response.headers.set("Content-Security-Policy", csp);
    if (api || !["/", "/login", "/healthz"].includes(path)) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    }
    return response;
  };
  const reject = (error: string, status: number) => finish(NextResponse.json({ error }, { status }));
  if (path.startsWith("/api/cron/")) {
    const secret = process.env.CRON_SECRET;
    return secret && timingSafeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
      ? finish(next()) : reject("Unauthorized", 401);
  }
  // Service credentials are scoped to Ask only; they cannot access study writes.
  const internal = path === "/api/ask" && !!process.env.LUMEN_INTERNAL_API_KEY
    && timingSafeEqual(request.headers.get("x-lumen-internal-key") ?? "", process.env.LUMEN_INTERNAL_API_KEY);
  if (api && !internal) {
    if (request.headers.get("sec-fetch-site") === "cross-site") return reject("Cross-site API requests are not permitted.", 403);
    const policy = mutationPolicy(request);
    if (policy) return reject(policy.error, policy.status);
  }
  if (!SAFE_METHODS.has(request.method) && !(await bodyWithinLimit(request))) return reject("Request is too large.", 413);
  if (path === "/healthz" || publicAsset.test(path)) return finish(next());
  if (path === "/api/auth/login" || path === "/api/auth/logout") return finish(next());
  const configured = authenticationConfigured();
  const username = process.env.LUMEN_USERNAME || "rasul";
  const valid = configured && await isValidSession(request.cookies.get(sessionCookie)?.value, username, process.env.LUMEN_PASSWORD!);
  if (path === "/") return finish(valid ? NextResponse.redirect(new URL("/overview", request.url)) : next());
  if (path === "/login") return finish(next());
  // No configuration must never mean public access, including preview deployments.
  if (!configured) return reject("Private workspace authentication is not configured.", 503);
  if (internal || valid) return finish(next());
  return api ? reject("Sign in required.", 401) : finish(NextResponse.redirect(new URL("/login", request.url)));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml).*)"] };
