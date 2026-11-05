"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { validWorkspaceSnapshot, validWorkspaceValue, type WorkspaceSnapshot, type WorkspaceEntry } from "@/lib/workspace-state";
type Job = { key: string; value: unknown; expected: string | null; mutationId: string };
type Status = "loading" | "ready" | "saving" | "error" | "conflict";
type Context = { entries: WorkspaceSnapshot; status: Status; update: (key: string, value: unknown) => void; retry: () => void };
const WorkspaceContext = createContext<Context>({ entries: {}, status: "loading", update() {}, retry() {} });
const PENDING = "lumen-workspace-pending";
export const useWorkspace = () => useContext(WorkspaceContext);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<WorkspaceSnapshot>({});
  const [status, setStatus] = useState<Status>("loading");
  const snapshot = useRef<WorkspaceSnapshot>({}), pending = useRef(new Map<string, Job>()), busy = useRef(false), connected = useRef(false);
  const persist = () => { try { localStorage.setItem(PENDING, JSON.stringify([...pending.current.values()])); } catch { /* Existing feature device copies remain available. */ } };
  const flush = useCallback(async () => {
    if (busy.current || !connected.current) return;
    busy.current = true;
    try {
      while (pending.current.size) {
        setStatus("saving");
        const job = pending.current.values().next().value!;
        const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) { setStatus(response.status === 409 ? "conflict" : "error"); connected.current = false; return; }
        const result = await response.json() as { entry: WorkspaceEntry };
        if (!validWorkspaceSnapshot({ [job.key]: result.entry })) throw new Error("Invalid sync response");
        snapshot.current = { ...snapshot.current, [job.key]: result.entry }; setEntries(snapshot.current);
        const latest = pending.current.get(job.key);
        if (latest?.mutationId === job.mutationId) pending.current.delete(job.key);
        else if (latest?.expected === job.expected) latest.expected = result.entry.revision;
        persist();
      }
      setStatus("ready");
    } catch { connected.current = false; setStatus("error"); }
    finally { busy.current = false; }
  }, []);
  const load = useCallback(async (discard = false) => {
    if (busy.current) return;
    setStatus("loading"); connected.current = false;
    try {
      const response = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (!response.ok || !validWorkspaceSnapshot(result.entries)) throw new Error("Sync unavailable");
      if (discard) { pending.current.clear(); persist(); }
      snapshot.current = result.entries; setEntries(result.entries); connected.current = true;
      setStatus("ready"); void flush();
    } catch { setStatus("error"); }
  }, [flush]);
  useEffect(() => {
    try {
      const jobs = JSON.parse(localStorage.getItem(PENDING) || "[]");
      if (Array.isArray(jobs)) for (const job of jobs.slice(0, 40)) if (job && validWorkspaceValue(job.key, job.value) && /^[\da-f-]{36}$/.test(job.mutationId) && (job.expected === null || /^[\da-f-]{36}$/.test(job.expected))) pending.current.set(job.key, job);
    } catch { /* Corrupt pending copies never enter a request. */ }
    void load();
  }, [load]);
  const update = useCallback((key: string, value: unknown) => {
    if (!validWorkspaceValue(key, value)) return;
    const previous = pending.current.get(key);
    pending.current.set(key, { key, value, expected: previous ? previous.expected : snapshot.current[key]?.revision ?? null, mutationId: crypto.randomUUID() });
    persist(); void flush();
  }, [flush]);
  return <WorkspaceContext.Provider value={{ entries, status, update, retry: () => void load(status === "conflict") }}>
    {children}
    {(status === "error" || status === "conflict") && <div className="workspace-sync-status" role="status"><span>{status === "conflict" ? "A newer workspace edit exists. Load latest discards these pending cloud edits; device drafts remain." : "Workspace changes are kept on this device while sync is unavailable."}</span><button onClick={() => void load(status === "conflict")}>{status === "conflict" ? "Load latest" : "Retry sync"}</button></div>}
  </WorkspaceContext.Provider>;
}
