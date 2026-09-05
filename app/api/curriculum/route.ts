import { NextResponse } from "next/server";
import curriculum from "@/data/curriculum.json";

// Serves the merged deep syllabus. ?i=<plan row index> returns one topic; no query returns all.
// Behind the session gate via proxy.ts like every other /api route.
export async function GET(request: Request) {
  const topics = (curriculum as { topics: Record<string, unknown> }).topics;
  const i = new URL(request.url).searchParams.get("i");
  if (i !== null) {
    const topic = topics[i];
    if (!topic) return NextResponse.json({ error: "No syllabus for that topic yet." }, { status: 404 });
    return NextResponse.json(topic, { headers: { "Cache-Control": "private, max-age=300" } });
  }
  return NextResponse.json({ topics }, { headers: { "Cache-Control": "private, max-age=300" } });
}
