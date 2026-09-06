import { NextResponse } from "next/server";
import curriculum from "@/data/curriculum.json";

type Subtopic = { minutes: number };
type Syllabus = { i: number; topic: string; track: string; month: number; hours: number; subtopics: Subtopic[] };
const topics = (curriculum as { topics: Record<string, Syllabus> }).topics;

// The merged syllabus is ~2.5MB, so it is never sent whole. The dashboard asks for
// ?summary=1 to label collapsed rows, then ?i=<plan row index> for one topic on expand.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "private, max-age=600" };

  const i = params.get("i");
  if (i !== null) {
    const topic = topics[i];
    if (!topic) return NextResponse.json({ error: "No syllabus for that topic yet." }, { status: 404 });
    return NextResponse.json(topic, { headers });
  }

  if (params.get("summary") !== null) {
    const summary = Object.values(topics).map((s) => ({ i: s.i, parts: s.subtopics.length, minutes: s.subtopics.reduce((n, x) => n + (Number(x.minutes) || 0), 0) }));
    return NextResponse.json({ summary }, { headers });
  }

  return NextResponse.json({ error: "Pass ?summary=1 or ?i=<index>." }, { status: 400 });
}
