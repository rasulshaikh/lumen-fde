import workbook from "@/data/workbook.json";
import curriculum from "@/data/curriculum.json";
import library from "@/data/library-context.json";
import catalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";
import { GTM_MODULES } from "@/lib/gtm/path";
import type { Passage, SourceKind } from "./types";
const STOP = new Set("a an the of to for from and or in on at is are was be been this that my me i you your how what which why can should do does with without about please explain tell have has it as by".split(" "));
const ALIASES: Record<string, string[]> = { rag: ["retrieval", "embeddings", "reranking"], ml: ["machine", "learning"], k8s: ["kubernetes"], evals: ["evaluation", "eval"], bash: ["shell"], sso: ["saml", "authentication"], crm: ["contact", "company", "deal"], postgres: ["postgresql", "database"], ai: ["agents", "model"] };
export function tokens(text: string): string[] { return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_+-]*/gu)?.filter((word) => word.length > 1 && !STOP.has(word)) ?? []; }
function build(): Passage[] {
  const docs: Passage[] = [];
  const add = (doc: Passage) => { if (doc.text.trim()) docs.push(doc); };
  for (const [index, row] of workbook.Plan.slice(1).entries()) {
    add({ id: `plan:${index + 1}`, title: `Plan row ${index + 1}: ${row[2]}`, url: `/plan?row=${index + 1}`, kind: "plan", text: `${row[2]} | ${row[0]} | Month ${row[1]} | ${row[13]} hours. Baseline status ${row[15]}; live progress is a separate source. Goal: ${row[3]}. Deliverable: ${row[14]}. Resources: ${row[4]} ${row[5]} | ${row[7]} ${row[8]} | ${row[10]} ${row[11]}` });
  }
  for (const [index, syllabus] of Object.entries(curriculum.topics)) {
    const row = Number(index) + 1, url = `/plan?row=${row}`;
    add({ id: `curriculum:${row}:overview`, title: `${syllabus.topic}: goals and prerequisites`, url, kind: "curriculum", text: `${syllabus.why}\nPrerequisites: ${syllabus.prerequisites.join("; ")}\nOutcomes: ${syllabus.outcomes.join("; ")}` });
    syllabus.subtopics.forEach((part, n) => add({ id: `curriculum:${row}:part:${n}`, title: `${syllabus.topic}: ${part.name}`, url, kind: "curriculum", text: `${part.name}\n${part.learn}` }));
    syllabus.failureModes.forEach((text, n) => add({ id: `curriculum:${row}:failure:${n}`, title: `${syllabus.topic}: production failure ${n + 1}`, url, kind: "curriculum", text }));
    syllabus.interviewQuestions?.forEach((text, n) => add({ id: `curriculum:${row}:question:${n}`, title: `${syllabus.topic}: interview question ${n + 1}`, url, kind: "curriculum", text }));
    if (syllabus.proofOfWork) add({ id: `curriculum:${row}:proof`, title: `${syllabus.topic}: proof of work`, url, kind: "curriculum", text: syllabus.proofOfWork });
  }
  for (const book of library) {
    const chapters = catalog.sources.find((source) => source.title.toLowerCase().includes(book.title.toLowerCase().slice(0, 25)))?.chapters.filter((chapter) => /^chapter\s+\d|^part\s+[iv\d]/i.test(chapter) && !/unavailable/i.test(chapter)).slice(0, 18) ?? [];
    add({ id: `library:${book.id}`, title: `${book.title} — reference map`, url: `/library#${book.id}`, kind: "library", text: `Reference metadata only; the PDF text is not available. ${book.title}, ${book.author}. Role: ${book.role}. Topics: ${book.topics.join("; ")}. Catalog chapter names: ${chapters.join("; ")}. Do not quote pages or pretend to have read the book text.` });
  }
  for (const repo of repositories) add({ id: `library:repo:${repo.id}`, title: `${repo.name}: build reference`, url: repo.url, kind: "library", text: `${repo.role}. ${repo.summary}\nTopics: ${repo.topics.join("; ")}. FDE connections: ${repo.fdeConnections.join("; ")}. This is a curated map, not the repository source code.` });
  for (const module of GTM_MODULES) if (module.kind === "ready") {
    add({ id: `gtm:${module.id}`, title: module.title, url: `/gtm?m=${module.id}`, kind: "gtm", text: `${module.blurb}\n${module.promise}\n${module.terms.map((term) => `${term.term}: ${term.meaning}`).join("\n")}\n${module.handoffs.join("\n")}\n${JSON.stringify(module.contract ?? [])}\nReview: ${module.reviewQuestion}\n${module.example}` });
  }
  return docs;
}
let corpus: Passage[] | undefined;
export const workspaceCorpus = () => corpus ??= build();

/** BM25 with title weighting and small query expansions. The model can reformulate and
 * search again; no embeddings service or private-content upload is needed to index. */
export function searchPassages(query: string, docs: Passage[], kind?: SourceKind, limit = 6): Passage[] {
  const base = [...new Set(tokens(query))].slice(0, 36);
  const terms = [...new Set(base.flatMap((word) => [word, ...(ALIASES[word] ?? [])]))];
  if (!terms.length) return [];
  const selected = kind ? docs.filter((doc) => doc.kind === kind) : docs;
  const candidates = selected.flatMap((doc) => {
    if (doc.text.length <= 1600) return [doc];
    const chunks: string[] = []; let chunk = "";
    for (const unit of doc.text.split(/\n+|(?<=[.!?])\s+/)) {
      if (chunk && chunk.length + unit.length > 1500) { chunks.push(chunk); chunk = ""; }
      if (unit.length > 1600) {
        if (chunk) { chunks.push(chunk); chunk = ""; }
        for (let at = 0; at < unit.length; at += 1500) chunks.push(unit.slice(at, at + 1500));
      } else chunk += (chunk ? "\n" : "") + unit;
    }
    if (chunk) chunks.push(chunk);
    return chunks.map((text, index) => ({ ...doc, id: `${doc.id}:chunk:${index}`, title: `${doc.title} (part ${index + 1})`, text }));
  });
  const indexed = candidates.map((doc) => ({ doc, words: tokens(`${doc.title} ${doc.title} ${doc.text}`) }));
  const average = indexed.reduce((n, d) => n + d.words.length, 0) / (indexed.length || 1);
  const frequencies = new Map(terms.map((term) => [term, indexed.filter((d) => d.words.includes(term)).length]));
  return indexed.map(({ doc, words }) => {
    let score = 0;
    for (const term of terms) {
      const frequency = words.filter((word) => word === term).length;
      if (!frequency) continue;
      const df = frequencies.get(term)!;
      const idf = Math.log(1 + (indexed.length - df + .5) / (df + .5));
      score += idf * frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * words.length / (average || 1)));
    }
    if (doc.id.includes(":question:") && !/interview|quiz|question|test/i.test(query)) score *= .65;
    if (doc.id.includes(":part:")) score *= 1.1;
    if (doc.id.includes(":failure:") && /fail|error|debug|broken/i.test(query)) score *= 1.2;
    return { doc, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id)).slice(0, Math.max(1, Math.min(limit, 8))).map(({ doc }) => doc);
}
