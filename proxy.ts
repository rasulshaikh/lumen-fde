import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (!process.env.LUMEN_PASSWORD || request.nextUrl.pathname.startsWith("/api/cron")) return NextResponse.next();
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(":");
    const username = separator >= 0 ? decoded.slice(0, separator) : "";
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";
    if (username === (process.env.LUMEN_USERNAME || "rasul") && password === process.env.LUMEN_PASSWORD) return NextResponse.next();
  }
  return new NextResponse("Lumen is private. Sign in with your dashboard credentials.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Lumen"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
