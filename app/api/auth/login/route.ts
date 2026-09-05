import { NextResponse } from "next/server";
import { createSession, sessionCookie, sessionTtl } from "@/lib/auth";

export async function POST(request: Request) {
  const expectedUser = process.env.LUMEN_USERNAME || "rasul";
  const expectedPassword = process.env.LUMEN_PASSWORD;
  if (!expectedPassword) return NextResponse.json({ error: "Sign in is not configured yet." }, { status: 503 });
  const body = await request.json() as { username?: string; password?: string };
  if (body.username !== expectedUser || body.password !== expectedPassword) return NextResponse.json({ error: "That username or password is not correct." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, await createSession(expectedUser, expectedPassword), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionTtl });
  return response;
}
