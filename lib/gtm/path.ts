/**
 * The GTM / RevOps path.
 *
 * This is not a row in the FDE plan and it is not a catalog. Two modules live here because that
 * is what the page renders: one written module, and the outline of the module that follows it.
 * Ask context is built from this same data, so a question cannot be told about a video list,
 * a reading list, or a source catalog this tab does not have.
 */

export const GTM_STATUS_KEY = "lumen-gtm-status";
export const GTM_DRAFT_KEY = "lumen-gtm-drafts";
export const GTM_CHECK_KEY = "lumen-gtm-checks";

export const GTM_STATUSES = ["Not started", "In progress", "Done"] as const;
export type GtmStatus = (typeof GTM_STATUSES)[number];

export type GtmTerm = { term: string; meaning: string };
export type GtmArtifact = { file: string; holds: string };
export type GtmMetric = { name: string; numerator: string; denominator: string; window: string };

type GtmModuleBase = { id: string; title: string; blurb: string };

export type GtmReadyModule = GtmModuleBase & {
  kind: "ready";
  /** What finishing the module produces, in one sentence. */
  promise: string;
  /** The practice company the exercise is about. Not the learner's employer. */
  company: string;
  terms: GtmTerm[];
  lifecycle: string[];
  dealStages: string[];
  handoffs: string[];
  artifacts: GtmArtifact[];
  metrics: GtmMetric[];
  reviewQuestion: string;
  acceptance: string[];
  /** The measurement the review question is training, shown on the page. */
  example: string;
};

export type GtmOutlineModule = GtmModuleBase & {
  kind: "outline";
  /** Title of the module this one assumes. */
  follows: string;
  steps: string[];
};

export type GtmModule = GtmReadyModule | GtmOutlineModule;

export const GTM_MODULES: GtmModule[] = [
  {
    id: "map-the-revenue-system",
    kind: "ready",
    title: "Map the revenue system",
    blurb: "How a stranger becomes a paying customer, with every handoff owned and every metric traceable.",
    promise: "A written map of that path for the practice company, before anyone proposes another tool.",
    company: "OrbitDesk",
    terms: [
      { term: "ICP", meaning: "Ideal Customer Profile. The short list of who you actually sell to, not a wish list." },
      { term: "Lifecycle stage", meaning: "The contact's status as a person: subscriber, lead, MQL, SQL, customer. It is independent of any single deal." },
      { term: "Deal stage", meaning: "Where one specific opportunity sits: qualified, proposal, closed-won. A contact can change lifecycle stage without a deal moving." },
      { term: "MQL", meaning: "Marketing-qualified lead. Fits the ICP and has shown interest. Marketing still owns it." },
      { term: "SQL", meaning: "Sales-qualified lead. Sales has accepted the contact as worth working." },
      { term: "Handoff", meaning: "The moment ownership passes. It needs a rule that triggers the move and a person accountable for what happens after." },
    ],
    lifecycle: ["Subscriber", "Lead", "MQL", "SQL", "Customer"],
    dealStages: ["Qualified", "Proposal", "Closed-won", "Closed-lost"],
    handoffs: [
      "Marketing owns the contact through MQL. Sales either accepts it as an SQL or rejects it.",
      "A rejection carries a reason from a fixed list — wrong size, no budget, no timing, duplicate, spam — and a route back to marketing. “Bad leads” without a reason is a feeling.",
      "Closed-won makes the contact a customer. Lifecycle stage and deal stage are two updates, not one field doing both jobs.",
    ],
    artifacts: [
      { file: "revenue-map.md", holds: "The path from stranger to customer, with each handoff named and owned." },
      { file: "metric-dictionary.csv", holds: "Every metric with a numerator, a denominator, and a time window." },
      { file: "lifecycle diagram", holds: "Lifecycle stages drawn beside deal stages, so the two lists cannot collapse into one." },
    ],
    metrics: [
      { name: "Lead → SQL", numerator: "Leads sales accepted as SQL", denominator: "Leads sent in the window", window: "90 days" },
      { name: "SQL → close", numerator: "Closed-won", denominator: "SQLs created in the window, not all leads", window: "90 days" },
      { name: "Rejection rate", numerator: "Leads rejected", denominator: "Leads sent in the window", window: "90 days" },
    ],
    reviewQuestion: "A sales team says marketing sends bad leads. What would you measure before buying another tool?",
    acceptance: [
      "A rejected lead has a reason and a route back to marketing.",
      "You can explain why a contact lifecycle is different from a deal stage.",
      "Every metric has a denominator and a time window.",
    ],
    example: "Pull the last 90 days and count four things: leads sent, leads accepted as SQL, leads rejected, and closed-won regardless of acceptance. Lead-to-SQL uses every lead sent in the window as its denominator. SQL-to-close uses SQLs created in the window, not every lead. Mixing those two denominators inflates the win rate, and the sales team will trust that number less than they trust the leads. Measure first. The tool is not the measurement.",
  },
  {
    id: "hubspot-data-contract",
    kind: "outline",
    title: "Build the HubSpot data contract",
    blurb: "Turn the company, contact, and deal keys from the revenue map into a schema an integration could follow.",
    follows: "Map the revenue system",
    steps: [
      "Name three objects only: Company, Contact, and Deal. One primary key each.",
      "Say which properties marketing may write, and which only sales may write.",
      "Put lifecycle stage on the contact and deal stage on the deal. Do not add a property that tries to be both.",
      "Require a rejection reason, who rejected the lead, and the route back, on every contact sales returns.",
      "State the associations: a deal points at one primary contact and one company. A contact may exist with no open deal.",
    ],
  },
];

const STATUS_SET = new Set<string>(GTM_STATUSES);

export function moduleById(id: string | null | undefined): GtmModule | null {
  if (!id) return null;
  return GTM_MODULES.find((module) => module.id === id) ?? null;
}

function knownId(id: string): boolean {
  return GTM_MODULES.some((module) => module.id === id);
}

function readObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Status marks this browser has saved. Unknown ids and unknown labels are dropped. */
export function parseGtmStatuses(raw: string | null): Record<string, GtmStatus> {
  const object = readObject(raw);
  if (!object) return {};
  const statuses: Record<string, GtmStatus> = {};
  for (const [id, value] of Object.entries(object)) {
    if (knownId(id) && typeof value === "string" && STATUS_SET.has(value)) statuses[id] = value as GtmStatus;
  }
  return statuses;
}

/** Draft answers, keyed by module id. Non-strings and unknown modules are dropped. */
export function parseGtmDrafts(raw: string | null): Record<string, string> {
  const object = readObject(raw);
  if (!object) return {};
  const drafts: Record<string, string> = {};
  for (const [id, value] of Object.entries(object)) {
    if (knownId(id) && typeof value === "string") drafts[id] = value;
  }
  return drafts;
}

/**
 * Self-marks against a ready module's acceptance checks.
 *
 * The array has to be booleans and the same length as that module's checks. A shorter or longer
 * array is dropped rather than padded, because padding would look like the learner had answered
 * a check the page never showed them.
 */
export function parseGtmChecks(raw: string | null): Record<string, boolean[]> {
  const object = readObject(raw);
  if (!object) return {};
  const checks: Record<string, boolean[]> = {};
  for (const [id, value] of Object.entries(object)) {
    const module = moduleById(id);
    if (!module || module.kind !== "ready" || !Array.isArray(value)) continue;
    if (value.length !== module.acceptance.length || value.some((tick) => typeof tick !== "boolean")) continue;
    checks[id] = value;
  }
  return checks;
}

const DRAFT_CAP = 600;

function completedTitles(statuses: Record<string, GtmStatus>): string[] {
  return GTM_MODULES.filter((module) => statuses[module.id] === "Done").map((module) => module.title);
}

/**
 * What /api/ask receives as `body.context` while this tab is open.
 *
 * It names the tab and the selected module, then only what that module actually puts on screen.
 * `marksKnown` is false until localStorage has been read; saying "none" in that window would
 * report a completion state the page has not loaded yet.
 */
export function gtmPageContext(input: {
  moduleId: string;
  statuses: Record<string, GtmStatus>;
  draft?: string;
  checks?: boolean[];
  marksKnown: boolean;
}): string {
  const module = moduleById(input.moduleId);
  const done = completedTitles(input.statuses);
  const lines = [
    "GTM / RevOps tab. Section: path.",
    module
      ? `Selected module: ${module.title} (${module.id}). ${module.kind === "ready" ? "This is the written module on screen." : "This module is an outline only. It is not a finished lesson."}`
      : `Selected module: none. "${input.moduleId}" is not a module on this path.`,
    input.marksKnown
      ? `Learner-marked complete: ${done.length ? done.join("; ") : "none"}. These marks live in this browser only and are not plan progress.`
      : "Learner-marked complete: not read yet. Marks on this device load after the page mounts, so none means unknown here, not unfinished.",
  ];

  if (!module) {
    lines.push("There is no video catalog, reading list, or source catalog for this tab. Do not invent one.");
    return lines.join("\n");
  }

  lines.push(`On-screen summary: ${module.blurb}`);

  switch (module.kind) {
    case "ready": {
      lines.push(`Practice company named on the page: ${module.company}. It is an exercise company, not the learner's employer.`);
      lines.push(`Artifacts named on the page: ${module.artifacts.map((artifact) => artifact.file).join(", ")}.`);
      lines.push(`Review question on the page: ${module.reviewQuestion}`);
      lines.push("Acceptance checks on the page (a self-mark is not a grade):");
      module.acceptance.forEach((check, index) => {
        const marked = input.checks?.[index] === true ? "self-marked covered" : "not self-marked";
        lines.push(`- ${check} (${marked})`);
      });
      lines.push(`Worked measurement shown on the page: ${module.example}`);
      const draft = (input.draft ?? "").trim();
      if (!draft) lines.push("No written answer is on the page yet.");
      else {
        const cut = draft.length > DRAFT_CAP;
        lines.push(`Written answer currently on the page${cut ? `, first ${DRAFT_CAP} characters` : ""}:\n${draft.slice(0, DRAFT_CAP)}`);
      }
      break;
    }
    case "outline": {
      lines.push(`This outline follows "${module.follows}". It is not a second copy of that module.`);
      lines.push("Outline steps on the page:");
      module.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
      lines.push("No review question, artifact file, property list, or HubSpot connection is on screen for this module.");
      break;
    }
    default: {
      const unreachable: never = module;
      return unreachable;
    }
  }

  lines.push("There is no video catalog, reading list, or source catalog for this tab. The lines above are the module. Do not invent one.");
  return lines.join("\n");
}
