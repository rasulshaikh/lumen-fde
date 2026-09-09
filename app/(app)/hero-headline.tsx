"use client";

import { useEffect, useState } from "react";
import { shuffle } from "@/lib/hero";

/**
 * The hero's headline, chosen once per visit.
 *
 * Chosen, not rotated. The sub-line under this cycles every 7s because it is a status line; doing
 * that to a 42px sentence would be a carousel, and a carousel in the first screen of a tool opened
 * every morning for two years is the thing the field-notebook spec was right to rule out.
 *
 * The seed is drawn in an effect for the reason every other seed in this codebase is: choosing
 * during render gives the server one headline and the client another, which is a hydration
 * mismatch. The server always renders `lines[0]`, the canonical one that the link-preview card
 * also carries, and the swap costs a single frame after mount.
 */
/** Milliseconds per character. 25 characters lands in about 0.7s, 47 in about 1.3s. */
const PER_CHAR = 28;

export function HeroHeadline({ lines }: { lines: string[] }) {
  const [pick, setPick] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const text = lines[pick] ?? lines[0] ?? "";

  useEffect(() => {
    if (lines.length < 2) return;
    const seed = Math.floor(Math.random() * 0xffffffff);
    setPick(lines.indexOf(shuffle(lines, seed)[0]));
  }, [lines]);

  /**
   * The type-on, which is the whole point of the effect and also the thing most likely to be
   * unpleasant, so it is bounded three ways.
   *
   * `prefers-reduced-motion: reduce` prints the whole line immediately. A headline assembling
   * itself under someone who asked for no motion is exactly what that setting is about.
   *
   * It runs once per visit, on the headline chosen for that visit. It does not re-run on a theme
   * toggle or a re-render, because a headline that retypes itself every time state changes would
   * be unusable.
   *
   * And it never reflows: the full sentence is always in the DOM holding the box open, with the
   * typed copy laid over it in the same grid cell. Growing the h1 character by character would
   * push the entire page down for a second on every load.
   */
  useEffect(() => {
    if (!text) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(text.length); return; }
    setShown(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= text.length) window.clearInterval(id);
    }, PER_CHAR);
    return () => window.clearInterval(id);
  }, [text]);

  const typed = shown === null ? text : text.slice(0, shown);
  const done = shown === null || shown >= text.length;

  return (
    // The full sentence is the accessible name, so a screen reader is handed one finished
    // headline rather than a stream of partial words from a live region.
    <h1 className="hero-h1" aria-label={text}>
      <span className="hero-h1-ghost" aria-hidden="true">{text}</span>
      <span className="hero-h1-typed" aria-hidden="true">
        {typed}
        {!done && <span className="hero-caret" />}
      </span>
    </h1>
  );
}
