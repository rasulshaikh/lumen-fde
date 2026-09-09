"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Start a session, end a session, and confirm what gets recorded.
 *
 * ## Nothing is written until it is confirmed
 *
 * This is the decision the design records with its reason. A progress marker in this repo was
 * silently overwritten once - a browser session wrote `not_started` over `in_progress` on a real
 * row, and the fix was to append a correction rather than edit history. A loop that writes
 * progress automatically at the end of every session points that same hazard at that same file,
 * and it fires on the sessions nobody meant to have: the abandoned tab, the accidental click,
 * the evening that turned into nothing. So ending a session opens a PROPOSAL, and Record is the
 * only thing that writes.
 *
 * ## The running session survives a reload
 *
 * Held in localStorage, not in React state alone. A refresh, a crash or a closed laptop
 * mid-session would otherwise lose the clock and - worse - silently start a fresh one at zero,
 * so the reader would record twenty minutes for two hours of work and the number would be wrong
 * in the direction that discourages.
 *
 * ## The clock is bounded where it is read, not here
 *
 * `validateSession` refuses anything over twelve hours, which is what stops a tab left open
 * overnight recording a nineteen-hour sitting and poisoning every average built on it. This
 * component shows the elapsed time honestly and lets the server refuse it.
 */

const KEY = "lumen-session";

type Running = { row: number; topic: string; intention: string; startedAt: number };

const minutesSince = (startedAt: number, now: number) => Math.max(0, Math.floor((now - startedAt) / 60000));

export function SessionLoop({ row, topic, status, setStatus }: {
  row: number;
  topic: string;
  status: string;
  setStatus: (status: string) => void;
}) {
  const [running, setRunning] = useState<Running | null>(null);
  const [intention, setIntention] = useState("");
  const [ending, setEnding] = useState(false);
  const [learned, setLearned] = useState("");
  const [markInProgress, setMarkInProgress] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const restored = useRef(false);

  // Restore before anything else, and only once. Reading localStorage during render would
  // disagree with the server render; reading it on every render would fight the user's typing.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Running;
        if (parsed && Number.isInteger(parsed.row) && Number.isFinite(parsed.startedAt)) setRunning(parsed);
      }
    } catch { /* a corrupt value is not worth a broken panel; start fresh */ }
  }, []);

  // Re-render once a minute so the elapsed figure is not stale. Cheap, and stopped when idle.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => {
    const next: Running = { row, topic, intention: intention.trim(), startedAt: Date.now() };
    setRunning(next);
    setEnding(false);
    setResult(null);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const discard = () => {
    setRunning(null);
    setEnding(false);
    setLearned("");
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  };

  const record = async () => {
    if (!running) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row: running.row,
          intention: running.intention,
          learned: learned.trim(),
          minutes: minutesSince(running.startedAt, Date.now()),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        // The session is not recorded, so the running state is KEPT. Clearing it here would
        // discard the clock along with the failure and leave nothing to retry with.
        setResult(body?.error ? `Not recorded: ${body.error}` : "Not recorded. The session is still open, so you can try again.");
        return;
      }
      // Progress goes through the existing path, and only when asked. Separate from the session
      // write on purpose: /api/progress owns its own validation and write-guard.
      if (markInProgress && status !== "Done" && status !== "In progress") setStatus("In progress");
      setResult("Recorded.");
      discard();
    } catch {
      setResult("Not recorded. The session is still open, so you can try again.");
    } finally {
      setSaving(false);
    }
  };

  const elapsed = running ? minutesSince(running.startedAt, Date.now()) : 0;
  void tick; // the interval above exists purely to re-read the clock

  if (!running) {
    return (
      <div className="session-box">
        <p className="eyebrow">Session</p>
        <div className="session-start">
          <input
            value={intention}
            onChange={(event) => setIntention(event.target.value)}
            placeholder={`What will you do on ${topic}?`}
            aria-label="What will you do this session?"
          />
          <button className="primary-button" onClick={start}>Start session</button>
        </div>
        {result && <p className="session-result">{result}</p>}
      </div>
    );
  }

  return (
    <div className="session-box">
      <p className="eyebrow">Session · running</p>
      <p className="session-running">
        <strong>{elapsed === 0 ? "Just started" : `${elapsed} min`}</strong>
        <span>{running.intention || running.topic}</span>
      </p>

      {!ending ? (
        <div className="session-actions">
          <button className="primary-button" onClick={() => setEnding(true)}>End session</button>
          <button className="text-button" onClick={discard}>Discard</button>
        </div>
      ) : (
        <div className="session-confirm">
          <label>
            What did you learn?
            <textarea value={learned} onChange={(event) => setLearned(event.target.value)} rows={3} placeholder="One or two lines is enough." />
          </label>
          <label className="session-check">
            <input type="checkbox" checked={markInProgress} onChange={(event) => setMarkInProgress(event.target.checked)} />
            <span>Also mark <b>{running.topic}</b> as in progress</span>
          </label>
          <p className="session-proposal">
            This records a session of {elapsed} min against row {running.row}. Nothing is written until you press Record.
          </p>
          <div className="session-actions">
            <button className="primary-button" onClick={record} disabled={saving}>{saving ? "Recording…" : "Record"}</button>
            <button className="text-button" onClick={() => setEnding(false)} disabled={saving}>Back</button>
            <button className="text-button" onClick={discard} disabled={saving}>Discard without recording</button>
          </div>
        </div>
      )}
      {result && <p className="session-result">{result}</p>}
    </div>
  );
}
