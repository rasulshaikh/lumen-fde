"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { StoredArtifact } from "@/lib/artifacts";
import { planRows } from "./shared";

export function RecordArtifact({ initialRow, onSaved }: { initialRow: number; onSaved: (artifact: StoredArtifact) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(initialRow >= 1 ? initialRow : 1);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (saved) trigger.current?.focus(); }, [saved]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(null); setSaved(false);
    try {
      const response = await fetch("/api/artifacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, title: title.trim(), url: url.trim(), notes: notes.trim() }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!response.ok || !body.saved || !body.artifact || !body.path) throw new Error(body.error || "The save could not be confirmed. Check your recorded proof before trying again.");
      onSaved({ ...body.artifact, path: body.path, fileUrl: body.url ?? null });
      setTitle(""); setUrl(""); setNotes(""); setOpen(false); setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error && reason.name !== "TimeoutError" && reason.name !== "TypeError" ? reason.message : "The save could not be confirmed. Your entries are kept here. Check your recorded proof before trying again.");
    } finally { busy.current = false; setSaving(false); }
  };

  return <div className="artifact-recorder">
    <button ref={trigger} className="primary-button" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => { setOpen(!open); setSaved(false); }} disabled={saving}>{open ? "Close form" : "Record proof"}</button>
    {saved && <p className="artifact-result" role="status">Proof recorded. It is now part of your shipped work.</p>}
    {open && <form id={`${id}-form`} className="artifact-form" onSubmit={submit} aria-busy={saving}>
      <p className="home-sub">Add a repository, demo, or write-up that shows what you built. This records evidence without changing a topic’s study status.</p>
      <label htmlFor={`${id}-row`}>Topic<select id={`${id}-row`} value={row} onChange={(event) => setRow(Number(event.target.value))} disabled={saving}>{planRows.map((topic, index) => <option key={index} value={index + 1}>{index + 1}. {String(topic[2])}</option>)}</select></label>
      <label htmlFor={`${id}-title`}>What did you build?<input id={`${id}-title`} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. A shell CLI with cleanup and failure tests" disabled={saving} /></label>
      <label htmlFor={`${id}-url`}>Link to your work<input id={`${id}-url`} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/you/project" disabled={saving} /></label>
      <label htmlFor={`${id}-notes`}>What does it demonstrate? <span className="home-note">Optional</span><textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} /></label>
      {error && <p className="artifact-result artifact-error" role="alert">{error}</p>}
      <div className="artifact-form-actions"><button type="submit" className="primary-button" disabled={saving || !title.trim() || !url.trim()}>{saving ? "Recording…" : "Save proof"}</button><button type="button" className="text-button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button></div>
    </form>}
  </div>;
}
