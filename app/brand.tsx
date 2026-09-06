/**
 * The Lumen mark, inlined so it paints with the first frame instead of arriving as a
 * second request. app/icon.svg is the source of truth — it is what the favicon, the
 * Apple icon and the link-preview card are all rasterised from by
 * scripts/build-icons.mjs. If the path below changes, change it there too and re-run
 * that script, or the tab icon and the header will drift apart.
 */
/**
 * The Ask Lumen mark — deliberately NOT the L, so the assistant reads as a distinct
 * thing rather than a second logo. A six-armed printer's asterisk: it belongs to the
 * type family the brand is built on, and it avoids the four-point "AI sparkle" (✦) this
 * previously used, which is the single most overused generative-AI tell. Three crossed
 * strokes survive 14px, where anything with interior detail turns to mud.
 */
export function AskMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    >
      <line x1="12" y1="3.5" x2="12" y2="20.5" />
      <line x1="4.64" y1="7.75" x2="19.36" y2="16.25" />
      <line x1="4.64" y1="16.25" x2="19.36" y2="7.75" />
    </svg>
  );
}

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Lumen"
      focusable="false"
    >
      <rect width="32" height="32" rx="12" fill="var(--primary)" />
      <path d="M6 8 H18 V10 Q14 10 14 13 V20 H24 V24 H10 V13 Q10 10 6 10 Z" fill="var(--surface)" />
    </svg>
  );
}
