export type SourceKind = "plan" | "curriculum" | "library" | "records" | "market" | "gtm" | "web";
export type Passage = { id: string; title: string; url: string; kind: SourceKind; text: string; date?: string };
export type CitedSource = Passage & { label: string };
export type RetrievalSummary = { mode: "agentic" | "retrieval"; searches: number; passages: number; cited: number; limited: boolean; warnings: string[] };
