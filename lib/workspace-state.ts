import { GTM_MODULES, parseGtmChecks, parseGtmStatuses } from "./gtm/path";
import workbook from "@/data/workbook.json";

export type WorkspaceEntry = { value: unknown; revision: string; updatedAt: string };
export type WorkspaceSnapshot = Record<string, WorkspaceEntry>;
export const WORKSPACE_PATH = "reports/workspace/state.json";
const PATHS = new Set(["india", "gulf", "us", "own"]);
const mockRows = workbook.Mocks.slice(1).filter((r) => r[0] && r.length >= 9 && String(r[0]).trim().toLowerCase() !== "total");
export const mockStorageKey = (title: string) => `mocks.${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100)}`;
export function validWorkspaceValue(key: string, value: unknown): boolean {
  if (key === "settings.theme") return value === "light" || value === "dark";
  if (key === "settings.display") return value === "standard" || value === "large";
  if (key === "settings.weeklyHours") return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 80;
  if (key === "settings.aim") return value === null || (typeof value === "string" && PATHS.has(value));
  if (key.startsWith("mocks.")) {
    const row = mockRows.find((item) => mockStorageKey(String(item[0])) === key);
    return !!row && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= Number(row[1]);
  }
  if (key.startsWith("gtm.")) {
    const id = key.slice(4), module = GTM_MODULES.find((item) => item.id === id);
    if (!module || !value || typeof value !== "object" || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return Object.keys(v).sort().join(",") === "checks,draft,status"
      && !!parseGtmStatuses(JSON.stringify({ [id]: v.status }))[id]
      && typeof v.draft === "string" && v.draft.length <= 16000
      && !!parseGtmChecks(JSON.stringify({ [id]: v.checks }))[id];
  }
  return false;
}
export function validWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 40
    && Object.entries(value).every(([key, entry]) => !!entry && typeof entry === "object"
      && typeof entry.revision === "string" && /^[\da-f-]{36}$/.test(entry.revision)
      && typeof entry.updatedAt === "string" && !Number.isNaN(Date.parse(entry.updatedAt))
      && validWorkspaceValue(key, entry.value));
}
export function sameValue(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
