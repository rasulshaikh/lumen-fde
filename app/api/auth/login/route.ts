import { NextResponse } from "next/server";
import { clearLoginFailures, createSession, loginBlockedFor, recordLoginFailure, sessionCookie, sessionTtl } from "@/lib/auth";

export async function POST(request: Request) {
  const expectedUser = process.env.LUMEN_USERNAME || "rasul";
  const expectedPassword = process.env.LUMEN_PASSWORD;
  if (!expectedPassword) return NextResponse.json({ error: "Sign in is not configured yet." }, { status: 503 });
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const blockedFor = loginBlockedFor(client);
  if (blockedFor) return NextResponse.json({ error: `Too many sign-in attempts. Try again in ${Math.ceil(blockedFor / 60)} minute(s).` }, { status: 429, headers: { "Retry-After": String(blockedFor) } });
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  if (body.username !== expectedUser || body.password !== expectedPassword) { recordLoginFailure(client); return NextResponse.json({ error: "That username or password is not correct." }, { status: 401 }); }
  clearLoginFailures(client);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, await createSession(expectedUser, expectedPassword), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionTtl });
  return response;
}
