/** The incident registry. Ordered by where the system they exercise sits in the plan. */
import { pendingPod } from "./pending-pod";
import { vagueRag } from "./vague-rag";
import type { Incident } from "./types";

export const INCIDENTS: Incident[] = [pendingPod, vagueRag];

export const incidentById = (id: string): Incident | null => INCIDENTS.find((i) => i.id === id) ?? null;

// Named rather than `export * from`, which resolved but carried none of the helpers through
// under tsx's ESM transform - the suite failed on "does not provide an export named 'fixById'".
export { resolvingFix, probeById, fixById } from "./types";
export type { Incident, Probe, Fix } from "./types";
