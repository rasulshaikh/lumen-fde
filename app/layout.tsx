import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Lumen · Senior FDE Plan", description: "Rasul's Senior FDE preparation command center." };
// Runs before first paint. Without it the light palette renders, then React hydrates and
// swaps to dark — a full-page flash on every load for anyone who prefers dark.
const themeScript = `(function(){try{var s=localStorage.getItem('lumen-theme');var d=s==='dark'||(!s&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
