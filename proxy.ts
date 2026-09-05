import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookie } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!process.env.LUMEN_PASSWORD || path === "/login" || path.startsWith("/api/auth") || path.startsWith("/_next/") || path === "/favicon.ico" || path.startsWith("/api/cron")) return NextResponse.next();
  const username = process.env.LUMEN_USERNAME || "rasul";
  if (await isValidSession(request.cookies.get(sessionCookie)?.value, username, process.env.LUMEN_PASSWORD)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
