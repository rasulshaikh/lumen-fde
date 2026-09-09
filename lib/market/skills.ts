/**
 * Job-description text to skill ids. Pure - no network, no filesystem, no clock. The same
 * text and the same config always produce the same ids.
 *
 * The determinism is the feature, not an implementation detail. The spec rejects
 * model-written extraction because it is non-deterministic run to run, which makes
 * week-over-week movement uninterpretable: "MCP servers 28% -> 33%" has to mean the market
 * moved, not that the extractor had a different day. Everything below is literal string work
 * against data/market-skill-map.json, so a number that looks wrong can be traced to a phrase.
 *
 * Pipeline order, and it matters: htmlToText -> stripBoilerplate -> matchSkills.
 */

export type SkillProximity = { terms: string[]; window: number };

export type SkillDef = {
  id: string;
  label: string;
  include: string[];
  exclude: string[];
  /**
   * Optional and nullable so `import skillMap from "@/data/market-skill-map.json"` is
   * assignable without a cast: `python` is the one skill in the map with no proximity block.
   */
  proximity?: SkillProximity | null;
  minDistinctForms: number;
  primaryRow: number | null;
  supportRows: number[];
  evidence: string;
};

export type SkillGap = {
  id: string;
  label: string;
  nearestRow: number | null;
  whyNotCovered: string;
  statedFrequency: string;
  /** "partial" when the plan does cover it in part. Six entries claimed "none" and were wrong. */
  planCoverage?: string;
};
export type OverInvestedTrack = { rowRange: string; measuredJdFrequency: string; note: string };
export type SkillMap = { skills: SkillDef[]; gaps: SkillGap[]; overInvested: OverInvestedTrack[] };

/** The only part of a market-sources.json board this module reads. */
export type BoilerplateConfig = { boilerplate?: string[] | null };

/**
 * One normalizer for the body AND for every pattern, which is what makes the spec's
 * protected-token list unnecessary: "llm-as-a-judge", "soc 2" and "fine-tune" survive because
 * the pattern is flattened exactly like the text, so "fine-tune" and "fine tune" become the
 * same string on both sides. Nothing hyphenated is special-cased anywhere.
 *
 * "%" is kept and promoted to its own token rather than dropped with the rest of the
 * punctuation: the `travel` skill's proximity set contains the literal "%", and it has to be
 * able to anchor on the "%" in "travel up to 25% to customer sites".
 */
function normalize(value: string) {
  return value.toLowerCase().replace(/%/g, " % ").replace(/[^a-z0-9%]+/g, " ").trim();
}

/** End of the word a match landed in, so a stem match still reports the whole surface form. */
function wordEnd(body: string, from: number) {
  const at = body.indexOf(" ", from);
  return at < 0 ? body.length : at;
}

/**
 * Start offsets of every occurrence of `phrase`, anchored at a word start but free to run
 * past the end of the pattern.
 *
 * The map is authored for exactly these semantics: `evaluation methodolog` and the proximity
 * term `capabilit` are deliberate stems, and the `evals` exclude list ("performance
 * evaluation", "candidate evaluation", "annual evaluation", "evaluation period") only guards
 * anything at all if the include "eval" reaches into "evaluation". Requiring a trailing word
 * boundary would silently disable both halves of that design - the stems would never fire and
 * the exclusions would have nothing to exclude.
 */
function hits(body: string, phrase: string): number[] {
  const out: number[] = [];
  if (!phrase) return out;
  let from = 0;
  for (;;) {
    const at = body.indexOf(phrase, from);
    if (at < 0) return out;
    if (at === 0 || body[at - 1] === " ") out.push(at);
    from = at + 1;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "-", mdash: "-", minus: "-", lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
  bull: "*", middot: "*", hellip: "...", times: "x", deg: " ", reg: " ", copy: " ", trade: " ", nbs: " ",
};

/** Never throws: an entity it does not know is left exactly as it was found. */
function unescapeEntities(html: string) {
  return html.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,9});/gi, (whole: string, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Lone surrogates make String.fromCodePoint throw, and this function is on the path of
      // every Greenhouse body in the corpus - one malformed entity must not fail a board.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return String.fromCodePoint(code);
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/**
 * Greenhouse's `content` is HTML-entity-escaped HTML. Unescape entities THEN strip tags: the
 * markup only becomes markup after unescaping, so the other order leaves "&lt;p&gt;" in the
 * body as visible text with every paragraph run together.
 *
 * Exactly one unescape pass. Genuinely double-escaped "&amp;lt;" must end up as the literal
 * text "&lt;" rather than being re-read as a tag and deleted.
 *
 * Block tags become newlines rather than spaces because the two passes downstream are
 * line-based: the 60%-frequency boilerplate detector has nothing to count if the body is one
 * line, and section scoping cannot find a heading that has been glued to the paragraph
 * underneath it.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return unescapeEntities(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|ol|tr|td|table|h[1-6]|section|article|header|footer|blockquote)\b[^>]*>/gi, "\n")
    // Only "<" followed by a tag name or "/" is markup. A bare /<[^>]*>/ also eats
    // "< 200ms ... >" out of a latency requirement, because JDs really do ship escaped
    // comparison operators and unescaping has just turned them back into angle brackets.
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A line has to be this long to be boilerplate; below it, collisions are just short bullets. */
const MIN_BOILERPLATE_LINE = 40;
/** Share of a company's postings a line must appear in before it is treated as boilerplate. */
const AUTO_SHARE = 0.6;
/**
 * Below this many postings the automatic rule is off and the static list is the only
 * mechanism. At n=2 (Anyscale ships 2 matched reqs) every line of a posting appears in 100%
 * of that company's corpus, so the rule would delete the entire body and report zero skills.
 */
const MIN_CORPUS_FOR_AUTO = 5;
/**
 * If the automatic rule wants to remove more than this share of one posting's long lines, the
 * corpus is near-identical rather than boilerplate-heavy - LangChain ships 15 "Deployed
 * Engineer (City)" clones with the same body. The caller is supposed to hand over the
 * dedupe-collapsed corpus; if it did not, dropping the static blocks only understates that
 * company's skills, whereas dropping the shared body zeroes them.
 */
const MAX_AUTO_DROP = 0.8;

/**
 * Keyed on the corpus array's identity, so the frequency map is built once per company rather
 * than once per posting. Identity-keyed rather than company-keyed on purpose: a new corpus
 * array is a new key, so there is no way to serve a stale map out of a warm container.
 */
const frequentCache = new WeakMap<readonly string[], Set<string>>();

function frequentLines(corpus: readonly string[]): Set<string> {
  const cached = frequentCache.get(corpus);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const doc of corpus) {
    // per posting, presence not occurrence - a line repeated twice in one JD is not evidence
    const seen = new Set<string>();
    for (const line of doc.split("\n")) {
      const key = normalize(line);
      if (key.length >= MIN_BOILERPLATE_LINE) seen.add(key);
    }
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const frequent = new Set<string>();
  for (const [key, n] of counts) if (n / corpus.length >= AUTO_SHARE) frequent.add(key);
  frequentCache.set(corpus, frequent);
  return frequent;
}

/**
 * Remove the parts of a posting that describe the company rather than the job.
 *
 * Two mechanisms, because static lists rot:
 *  1. The per-company blocks in market-sources.json (Anthropic's "reliable, interpretable,
 *     and steerable AI systems", Applied Intuition's "is powering the future of physical AI",
 *     the EEO paragraphs). The taxonomy work verified that leaving Anthropic's mission
 *     sentence in corrupts naive term counts - it puts "reliable" and "AI systems" into every
 *     one of that company's reqs.
 *  2. Automatic: any normalized line of >= 40 chars present in >= 60% of that company's
 *     matched postings. This is what keeps the stripper working when a company rewrites its
 *     boilerplate, which is the failure the static list cannot survive.
 *
 * The whole line goes, not just the matched phrase: these are sentences inside paragraphs, and
 * leaving the remainder of an EEO paragraph leaves the noise it was there to remove.
 *
 * `corpus` must be that company's matched postings in the same plain-text form as `text` (i.e.
 * already through htmlToText), deduped, and must not contain another company's postings - a
 * shared EEO paragraph counted across companies would be dropped from all of them at once.
 * `company` is carried for symmetry with the rest of lib/market and for call-site legibility;
 * the corpus, not the name, is what scopes the rule.
 */
export function stripBoilerplate(text: string, company: string, corpus: string[], source: BoilerplateConfig | null): string {
  if (!text) return "";
  const statics = (source?.boilerplate ?? []).map(normalize).filter((b) => b.length > 0);
  const staticOnly = text.split("\n").filter((line) => {
    const key = normalize(line);
    return !(key && statics.some((b) => key.includes(b)));
  });

  if (corpus.length < MIN_CORPUS_FOR_AUTO) return staticOnly.join("\n").trim();

  const frequent = frequentLines(corpus);
  const long = staticOnly.filter((line) => normalize(line).length >= MIN_BOILERPLATE_LINE);
  // frequent only ever holds keys of >= MIN_BOILERPLATE_LINE, so short lines cannot be dropped
  const kept = staticOnly.filter((line) => !frequent.has(normalize(line)));
  const droppedLong = long.filter((line) => frequent.has(normalize(line))).length;
  if (long.length > 0 && droppedLong / long.length > MAX_AUTO_DROP) return staticOnly.join("\n").trim();
  return kept.join("\n").trim();
}

const HEAD_MARKERS = ["what you'll do", "responsibilities", "you may be a good fit", "requirements", "qualifications", "about the role"].map(normalize);
/** Boilerplate wherever it appears, heading-shaped or not - the EEO and comp blocks are long paragraphs, not headings. */
const TAIL_ANYWHERE = ["salary range", "equal opportunity", "we are an equal"].map(normalize);
/**
 * Only when the line is heading-shaped. "benefits" and "compensation" appear inside real
 * requirement sentences, and cutting the body at the first one would silently drop everything
 * after it - an understated skill count that looks exactly like a successful parse.
 */
const TAIL_HEADINGS = ["benefits", "compensation", "how we're different"].map(normalize);
const HEADING_MAX = 80;

/**
 * Keep from the first responsibilities/requirements heading to the first tail heading. This
 * alone removes most of the perks-and-values noise that survives boilerplate stripping,
 * because that noise is unique per company and so never reaches the 60% threshold.
 *
 * If the markers leave nothing, the whole body is used. Scoping is a noise filter, not a gate:
 * over-counting a little on an oddly formatted posting is a smaller lie than reporting zero
 * skills for a real requisition.
 */
function sectionScope(text: string) {
  const lines = text.split("\n");
  const norm = lines.map(normalize);
  const headingShaped = (i: number) => norm[i].length > 0 && norm[i].length <= HEADING_MAX;

  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (headingShaped(i) && HEAD_MARKERS.some((m) => norm[i].includes(m))) { start = i; break; }
  }
  // The tail cut runs from `start` whether or not a head marker was found, so a posting with
  // no "Responsibilities" heading still loses its comp and EEO blocks.
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const strong = TAIL_ANYWHERE.some((m) => norm[i].includes(m));
    const weak = headingShaped(i) && TAIL_HEADINGS.some((m) => norm[i].includes(m));
    if (strong || weak) { end = i; break; }
  }

  const kept = lines.slice(start, end).join("\n");
  return kept.trim() ? kept : text;
}

/** Character ranges a hit may not start inside. Extended to the end of the word so a plural of an excluded phrase still voids. */
function excludedRanges(body: string, phrases: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const raw of phrases) {
    const phrase = normalize(raw);
    for (const at of hits(body, phrase)) out.push([at, wordEnd(body, at + phrase.length)]);
  }
  return out;
}

/**
 * Text in, skill ids out. Boolean per requisition - presence, not occurrence count, because
 * a JD that says "agent" nine times is not nine times more an agent job.
 *
 * The exclusion is per hit, not per document: "performance evaluation" voids the hit inside
 * it and nothing else, so a posting that mentions both an annual performance evaluation and an
 * eval harness still counts for evals.
 *
 * Returned in skill-map order rather than match order, so the fingerprint stored in
 * index.json is stable and a day-over-day diff of that file shows real movement only.
 */
export function matchSkills(text: string, skillMap: { skills: SkillDef[] }): string[] {
  const body = normalize(sectionScope(text || ""));
  if (!body) return [];

  const found: string[] = [];
  for (const skill of skillMap.skills) {
    const voids = excludedRanges(body, skill.exclude ?? []);
    // Anchor positions are collected once over the whole body and compared by offset rather
    // than by slicing a window around each hit: slicing can cut a word in half and turn
    // "rapid" into a false "api" anchor at the edge of the slice.
    const window = skill.proximity?.window ?? 0;
    const anchors = skill.proximity ? skill.proximity.terms.flatMap((t) => hits(body, normalize(t))) : null;

    // Distinct SURFACE forms, not distinct include entries. Counting entries would let one
    // occurrence of "agents" satisfy minDistinctForms: 2 by matching both "agent" and
    // "agents" - precisely the lone-mention case the guard exists to reject.
    const forms = new Set<string>();
    for (const raw of skill.include) {
      const phrase = normalize(raw);
      for (const at of hits(body, phrase)) {
        const end = wordEnd(body, at + phrase.length);
        if (voids.some(([from, to]) => at >= from && at < to)) continue;
        if (anchors && !anchors.some((p) => p >= at - window && p <= end + window)) continue;
        forms.add(body.slice(at, end));
      }
    }
    if (forms.size >= Math.max(1, skill.minDistinctForms || 1)) found.push(skill.id);
  }
  return found;
}
