"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MACHINES } from "@/lib/machines";
import { MACHINE_STATE_KEY, readUnfinished, unfinishedNote, type UnfinishedNote } from "@/lib/machines/unfinished";

/**
 * The machine you left broken, offered back.
 *
 * This is the pull, and it is deliberately a weak one. There is no count of days away, no streak to
 * protect, no score to recover and nothing that got worse while you were gone. The pod is Pending;
 * it was Pending yesterday and it will be Pending in March. Coming back costs exactly what it cost
 * when you left, which is the whole point - an open loop rather than a debt.
 *
 * The recall question rides along with it. That is the actual job: the bank holds 1,710 prompts and
 * the hard part was never answering one, it was opening the thing. A question about the system
 * already on your screen is a much shorter walk than "go and practise".
 *
 * Renders nothing at all when nothing is broken. A strip that appears every visit saying "nothing
 * to pick up" is a strip you stop reading by Thursday.
 */

type Prompt = { i: number; k: string; p: string };

export function Unfinished() {
  const [note, setNote] = useState<UnfinishedNote | null>(null);
  const [question, setQuestion] = useState<Prompt | null>(null);

  // localStorage in an effect, never during render. Reading it while rendering makes the server
  // and the client disagree about what is on the page, which is the hydration mismatch this
  // codebase has written down in four separate files.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(MACHINE_STATE_KEY); } catch { return; }
    setNote(unfinishedNote(readUnfinished(raw, MACHINES)));
  }, []);

  useEffect(() => {
    if (!note) return;
    let live = true;
    fetch(`/api/recall?topics=${note.topicIndex}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { prompts?: Prompt[] }) => {
        // Silence rather than a placeholder. The strip's own content stands on its own, and
        // "could not load a question" is a sentence about our plumbing, not about the reader.
        if (live && data.prompts?.length) setQuestion(data.prompts[0]);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [note]);

  if (!note) return null;

  return (
    <section className="panel unfin">
      <p className="eyebrow">Still open</p>
      <h2 className="unfin-title">{note.title} is still broken, where you left it.</h2>
      <p className="unfin-broken">You set: {note.broken}.</p>
      <p className="unfin-standing">{note.standing}</p>

      {question ? (
        <div className="unfin-q">
          <p className="label">One question on this, while it is in front of you</p>
          <p className="unfin-q-text">{question.p}</p>
        </div>
      ) : null}

      <div className="unfin-actions">
        <Link className="unfin-cta" href="/machines">Pick it back up</Link>
        {question ? <Link className="text-button" href="/practice">Or sit a full paper</Link> : null}
      </div>
    </section>
  );
}
