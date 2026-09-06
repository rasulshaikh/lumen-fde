"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "../brand";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("rasul"); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); const data = await response.json(); if (!response.ok) { setError(data.error || "Could not sign in."); return; } router.replace("/"); router.refresh(); } catch { setError("The sign-in service is unavailable. Try again."); } finally { setLoading(false); }
  }
  return <main className="login-shell"><div className="login-orbit" /><section className="login-card"><div className="login-brand"><LogoMark className="brand-mark" /><span>Lumen</span></div><p className="login-kicker">Rasul&apos;s Senior FDE command center</p><h1>Pick up where the work left off.</h1><p className="login-copy">Your plan, practice loops, private library, and learning guide in one focused space.</p><form onSubmit={submit} className="login-form"><label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="login-button" disabled={loading || !username || !password}>{loading ? "Opening Lumen..." : "Sign in"}<span>→</span></button></form><p className="login-foot">Private workspace · MiniMax M3 stays server-side</p></section></main>;
}
