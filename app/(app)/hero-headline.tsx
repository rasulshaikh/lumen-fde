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
export function HeroHeadline({ lines }: { lines: string[] }) {
  const [pick, setPick] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const seed = Math.floor(Math.random() * 0xffffffff);
    setPick(lines.indexOf(shuffle(lines, seed)[0]));
  }, [lines]);
  return <h1>{lines[pick] ?? lines[0]}</h1>;
}
