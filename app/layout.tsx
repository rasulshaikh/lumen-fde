import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Lumen · Senior FDE Plan", description: "Rasul's Senior FDE preparation command center." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
