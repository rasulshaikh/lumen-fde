"use client";

import { DesignGuide } from "@/components/DesignGuide";

/**
 * /design - the visual identity, rendered from the tokens rather than described.
 *
 * A client route because every number on it is a `getComputedStyle` reading taken from the
 * running document: the palette, the type scale and the five contrast floors are measured in the
 * browser, in whichever theme is on screen. There is nothing here to prerender - a server render
 * would have to guess at values the page exists to stop anyone guessing at.
 */
export default function DesignPage() { return <DesignGuide />; }
