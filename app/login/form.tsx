"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("rasul");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not sign in."); return; }
      window.location.replace("/overview");
    } catch {
      setError("The sign-in service is unavailable. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-button" disabled={loading || !username || !password}>
        {loading ? "Opening Lumen…" : "Sign in"}<span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
