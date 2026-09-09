import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookie, timingSafeEqual } from "@/lib/auth";

// App Router serves metadata files (app/icon.svg, app/apple-icon.png, opengraph-image)
// as real routes, and the gate was catching them: /icon.svg 307'd to /login, so the tab
// icon resolved to a login page instead of an image. These are branding, not secrets -
// the login screen itself needs the favicon - so they stay public. Matches the optional
// content hash Next appends to generated variants (/apple-icon-a1b2c3.png).
const publicAsset = /^\/(favicon\.ico|icon[\w-]*\.(svg|png|ico)|apple-icon[\w-]*\.png|(opengraph|twitter)-image[\w-]*(\.\w+)?|manifest\.webmanifest|robots\.txt|sitemap\.xml)$/;

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Cron cannot present a session cookie, so it is exempt from the cookie gate - but exempt is
  // not public, and this used to be a bare `startsWith("/api/cron")` that let the request
  // through unchecked and left the whole trust boundary to two copy-pasted `Bearer CRON_SECRET`
  // checks inside the two route bodies. A third route under app/api/cron/ would have been open
  // from the moment it was created until someone remembered to paste them. Checking the secret
  // HERE closes the prefix instead of opening it: a new cron route is gated on the day it
  // exists. The routes keep their own identical check as the layer that survives the proxy
  // being skipped, and the trailing slash stops the prefix from also matching /api/crontab.
  if (path.startsWith("/api/cron/")) {
    const secret = process.env.CRON_SECRET;
    if (secret && timingSafeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.next();
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // `/` is the public front door, and it is a DIFFERENT page from the signed-in home: a visitor
  // gets the landing page, a request carrying a valid session is sent to /overview. Both halves
  // of that decision live here rather than in the page, because a page that reads the session
  // cookie itself is a second place to get authentication wrong, and this file is supposed to be
  // the only one. The landing renders from bundled JSON only - no progress, no current focus,
  // nothing personal - which is the same rule /login already documents and follows.
  if (path === "/") {
    if (!process.env.LUMEN_PASSWORD) return NextResponse.next();
    if (await isValidSession(request.cookies.get(sessionCookie)?.value, process.env.LUMEN_USERNAME || "rasul", process.env.LUMEN_PASSWORD)) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }
  if (!process.env.LUMEN_PASSWORD || path === "/login" || path.startsWith("/api/auth") || path.startsWith("/_next/") || publicAsset.test(path)) return NextResponse.next();
  if (path === "/api/ask" && process.env.LUMEN_INTERNAL_API_KEY && timingSafeEqual(request.headers.get("x-lumen-internal-key") ?? "", process.env.LUMEN_INTERNAL_API_KEY)) return NextResponse.next();
  const username = process.env.LUMEN_USERNAME || "rasul";
  if (await isValidSession(request.cookies.get(sessionCookie)?.value, username, process.env.LUMEN_PASSWORD)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml).*)"] };
