/**
 * The Ask Lumen mark - deliberately NOT the L, so the assistant reads as a distinct
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

/**
 * The Lumen mark - an aperture, matching app/icon.svg exactly. Inlined so it paints with
 * the first frame rather than arriving as a second request. app/icon.svg is the source of
 * truth: the favicon, the Apple icon and the link-preview card are all rasterised from it
 * by scripts/build-icons.mjs. If the path below changes, change it there too and re-run
 * that script, or the tab icon and the header drift apart.
 */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
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
      <path
        fill="var(--primary)"
        fillRule="evenodd"
        d="M8 4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm8 6 6 6-6 6-6-6 6-6Z"
      />
    </svg>
  );
}
