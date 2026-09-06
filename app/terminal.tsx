"use client";

import { useEffect, useRef, useState } from "react";

type Line = { kind: "in" | "out" | "err" | "meta"; text: string };

const HISTORY_KEY = "lumen-shell-history";

/**
 * A shell, not a terminal emulator.
 *
 * Vercel Sandbox executes commands, it does not hand back a PTY, so xterm.js would
 * be ~250KB of dependency wrapping a capability we do not have: no curses, no
 * interactive prompts, no ctrl-C into a running foreground process. Line-based
 * input against a streamed NDJSON response is what the backend actually offers, and
 * building exactly that keeps the surface honest.
 *
 * What this means in practice: `python3 script.py` and `pytest` work, `vim` and
 * `top` do not. The plan's hands-on work is the former.
 */
export function Terminal() {
  const [lines, setLines] = useState<Line[]>([
    { kind: "meta", text: "Linux microVM · Python 3.14, Node LTS, apt available · files persist between sessions" },
    { kind: "meta", text: "No Lumen credentials are reachable from in here. Type a command to start the sandbox." },
  ]);
  const [input, setInput] = useState("");
  // Both come from the sandbox itself on the first exit event. Hardcoding home
  // here is what produced a wrong prompt and a spurious `cd` error on every command.
  const [cwd, setCwd] = useState("~");
  const [home, setHome] = useState("~");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* a corrupt history should not take the shell down */ }
  }, []);

  // Follow the tail only. Scrolling up mid-command to read earlier output should
  // not be yanked back down on the next chunk.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const append = (kind: Line["kind"], text: string) =>
    setLines((prev) => {
      const last = prev[prev.length - 1];
      // Stream chunks arrive mid-line, so coalesce rather than emitting a <div>
      // per chunk -- otherwise a progress bar becomes a thousand rows.
      if (last && last.kind === kind && kind !== "in" && !last.text.endsWith("\n")) {
        return [...prev.slice(0, -1), { kind, text: last.text + text }];
      }
      return [...prev, { kind, text }];
    });

  async function run(cmd: string) {
    setBusy(true);
    append("in", `${short(cwd, home)} $ ${cmd}`);
    const next = [cmd, ...history.filter((h) => h !== cmd)].slice(0, 200);
    setHistory(next);
    setCursor(-1);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }

    if (cmd === "clear") { setLines([]); setBusy(false); return; }

    try {
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        append("err", `${detail.error || "The sandbox is unavailable."}\n`);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let event: { s: string; d?: string; code?: number; ms?: number; cwd?: string; home?: string };
          try { event = JSON.parse(part); } catch { continue; }
          if (event.s === "stdout") append("out", event.d ?? "");
          else if (event.s === "stderr") append("err", event.d ?? "");
          else if (event.s === "exit") {
            if (event.cwd) setCwd(event.cwd);
            if (event.home) setHome(event.home);
            if (event.code !== 0) append("meta", `exit ${event.code}${event.ms ? ` · ${(event.ms / 1000).toFixed(1)}s` : ""}`);
          }
        }
      }
    } catch {
      append("err", "Lost the connection to the sandbox.\n");
    } finally {
      setBusy(false);
      field.current?.focus();
    }
  }

  async function stop() {
    setBusy(true);
    append("meta", "stopping the sandbox…");
    try {
      const r = await fetch("/api/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      const d = await r.json();
      append("meta", d.stopped ? "Sandbox stopped. Your files are snapshotted and will be there next time." : "Could not stop it.");
      setCwd(home);
    } catch {
      append("err", "Could not reach the sandbox.\n");
    } finally {
      setBusy(false);
    }
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && input.trim() && !busy) { const c = input; setInput(""); run(c); return; }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const i = Math.min(cursor + 1, history.length - 1);
      if (i >= 0) { setCursor(i); setInput(history[i]); }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const i = cursor - 1;
      setCursor(i);
      setInput(i >= 0 ? history[i] : "");
    }
  }

  return (
    <section className="panel full-panel shell-panel" aria-label="Sandbox terminal">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Hands-on</p>
          <h2>Sandbox</h2>
        </div>
        <div className="shell-actions">
          <span className="panel-meta">isolated microVM · 15 min session</span>
          <button className="text-button" onClick={stop} disabled={busy}>End session</button>
        </div>
      </div>

      <div className="shell-out" ref={scroller} onClick={() => field.current?.focus()}>
        {lines.map((line, i) => <div key={i} className={`shell-line ${line.kind}`}>{line.text}</div>)}
        {busy && <div className="shell-line meta">running…</div>}
      </div>

      <div className="shell-in">
        <span className="shell-prompt">{short(cwd, home)} $</span>
        <input
          ref={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Shell command"
          placeholder={busy ? "" : "python3 -c 'print(1+1)'"}
        />
      </div>
      <p className="shell-foot">
        Line-based, so no vim or top. Nothing here can read your GitHub token, and files persist between sessions.
      </p>
    </section>
  );
}

const short = (path: string, home: string) =>
  home && home !== "~" && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
