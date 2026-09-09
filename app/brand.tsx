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
 * The Lumen mark - a six-sided iris, matching app/icon.svg exactly. Inlined so it paints with
 * the first frame rather than arriving as a second request. app/icon.svg is the source of
 * truth: the favicon, the Apple icon and the link-preview card are all rasterised from it
 * by scripts/build-icons.mjs. If the paths below change, change them there too and re-run
 * that script, or the tab icon and the header drift apart.
 *
 * Two rings and an open centre. Here they take `var(--primary)`, so the header mark follows the
 * theme; the file cannot, so it carries the dark-theme accent as a literal.
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
        d="M16 1.6 28.5 8.8v14.4L16 30.4 3.5 23.2V8.8L16 1.6Zm0 4.4L7.3 11v10l8.7 5 8.7-5V11L16 6Z"
      />
      <path
        fill="var(--primary)"
        fillRule="evenodd"
        d="M16 10.2 21.9 13.6v6.8L16 23.8l-5.9-3.4v-6.8L16 10.2Zm0 3.5-2.9 1.7v3.4l2.9 1.7 2.9-1.7v-3.4L16 13.7Z"
      />
    </svg>
  );
}
