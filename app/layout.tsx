import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Lumen · Senior FDE Plan", description: "Rasul's Senior FDE preparation command center." };
// Runs before first paint. Without it the light palette renders, then React hydrates and
// swaps to dark — a full-page flash on every load for anyone who prefers dark.
const themeScript = `(function(){try{var s=localStorage.getItem('lumen-theme');var d=s==='dark'||(!s&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Bricolage Grotesque (display), Atkinson Hyperlegible (body/UI), Martian Mono
            (data). This has to be a <link> and not the @import that globals.css used for
            Geist: Next's CSS pipeline strips a remote @import out of the emitted chunk, so
            Geist had never actually been downloading. Verified by the absence of any
            fonts.googleapis.com request and by a measured advance width identical to a
            nonexistent family. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,300..800;1,300..800&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Martian+Mono:wdth,wght@75..112.5,300..700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
