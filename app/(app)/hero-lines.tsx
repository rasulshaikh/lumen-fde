"use client";

import { useEffect, useRef, useState } from "react";

const INTERVAL_MS = 7000;

/**
 * The hero's second line, rotating.
 *
 * The field-notebook spec says a study tool opened daily for two years should not animate, and
 * that is the right instinct about *decoration*. What rotates here is not decoration: every line
 * is arithmetic over the same `useAppState()` values the footer and Overview read, so this is a
 * status line that happens to cycle rather than a carousel that happens to contain words. If a
 * line ever cannot be derived, it is not shown - an undated placeholder in a rotation is worse
 * than a shorter rotation.
 *
 * Three things here are not preferences:
 *
 * - The lines are stacked in ONE grid cell, so the tallest sets the height. Swapping text in a
 *   normally-flowing <p> would change the hero's height every 7s and push the whole page down
 *   under whatever the reader was looking at.
 * - The timer stops while the tab is hidden. An interval left running in a background tab wakes
 *   the machine to advance something nobody is looking at, and then the line has jumped several
 *   places by the time you come back.
 * - `prefers-reduced-motion: reduce` gets one line and no interval at all. Not a slower fade -
 *   no rotation. The reduced-motion contract is about vestibular safety, not about taste, and a
 *   thing that changes under you while you read is exactly what it covers.
 */
export function HeroLines({ lines }: { lines: string[] }) {
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(true);
  const paused = useRef(false);

  // Read the media query in an effect, not during render: the server has no matchMedia, and
  // deciding this during the first client render would disagree with the server's HTML and
  // hydrate into a mismatch. Starting "still" and relaxing after mount is the safe direction -
  // it errs toward not moving.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (still || lines.length < 2) return;
    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return;
      setIndex((current) => (current + 1) % lines.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [still, lines.length]);

  if (!lines.length) return null;
  if (still || lines.length < 2) return <p className="hero-copy">{lines[0]}</p>;

  return (
    <div
      className="hero-rotator"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={() => { paused.current = false; }}
    >
      <div className="hero-lines">
        {lines.map((line, i) => (
          // aria-hidden on the inactive lines so a screen reader reads one sentence, not five
          // stacked ones. They stay in the DOM because they are what holds the height open.
          <p className={i === index ? "hero-copy is-current" : "hero-copy"} key={line} aria-hidden={i === index ? undefined : true}>
            {line}
          </p>
        ))}
      </div>
      <div className="hero-dots" role="tablist" aria-label="Plan facts">
        {lines.map((line, i) => (
          <button
            key={line}
            role="tab"
            aria-selected={i === index}
            aria-label={line}
            className={i === index ? "hero-dot on" : "hero-dot"}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
