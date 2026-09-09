import { NextResponse } from "next/server";
import bank from "@/data/recall-bank.json";

type Prompt = { i: number; k: string; kind: string; p: string };
type Meta = { topic: string; track: string; outcomes: string[] };
const typed = bank as unknown as { meta: Record<string, Meta>; prompts: Prompt[] };

// The bank is ~600KB. Importing it into the client bundle to show at most five cards a day
// would be absurd, so it stays server-side and this route returns only the topics actually
// in play. Early in the plan that is one or two topics - a few KB.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("topics") ?? "";
  const wanted = new Set(
    raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0),
  );
  if (!wanted.size) return NextResponse.json({ meta: {}, prompts: [] });

  const prompts = typed.prompts.filter((p) => wanted.has(p.i));
  const meta: Record<string, Meta> = {};
  for (const i of wanted) {
    const m = typed.meta[String(i)];
    if (m) meta[String(i)] = m;
  }
  return NextResponse.json(
    { meta, prompts },
    // The bank only changes when the curriculum is rebuilt and redeployed, so it is
    // immutable for the life of a deployment.
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
