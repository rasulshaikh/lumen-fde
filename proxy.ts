import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookie } from "@/lib/auth";

// App Router serves metadata files (app/icon.svg, app/apple-icon.png, opengraph-image)
// as real routes, and the gate was catching them: /icon.svg 307'd to /login, so the tab
// icon resolved to a login page instead of an image. These are branding, not secrets —
// the login screen itself needs the favicon — so they stay public. Matches the optional
// content hash Next appends to generated variants (/apple-icon-a1b2c3.png).
const publicAsset = /^\/(favicon\.ico|icon[\w-]*\.(svg|png|ico)|apple-icon[\w-]*\.png|(opengraph|twitter)-image[\w-]*(\.\w+)?|manifest\.webmanifest|robots\.txt|sitemap\.xml)$/;

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!process.env.LUMEN_PASSWORD || path === "/login" || path.startsWith("/api/auth") || path.startsWith("/_next/") || publicAsset.test(path) || path.startsWith("/api/cron")) return NextResponse.next();
  if (path === "/api/ask" && process.env.LUMEN_INTERNAL_API_KEY && request.headers.get("x-lumen-internal-key") === process.env.LUMEN_INTERNAL_API_KEY) return NextResponse.next();
  const username = process.env.LUMEN_USERNAME || "rasul";
  if (await isValidSession(request.cookies.get(sessionCookie)?.value, username, process.env.LUMEN_PASSWORD)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml).*)"] };
