import { Sandbox } from "@vercel/sandbox";

/**
 * A real Linux shell for the plan's hands-on tracks, run in a Firecracker microVM
 * that is not this app.
 *
 * The rejected design was node-pty on the Render MCP host. That box holds
 * GITHUB_TOKEN (write access to the plan itself), MINIMAX_API_KEY, RESEND_API_KEY
 * and MCP_API_KEY, so a single auth bug there is a full credential compromise plus
 * write access to the study plan. Isolation here is structural rather than earned:
 * the sandbox is a separate VM with its own filesystem and network, and `env: {}`
 * below is load-bearing -- no Lumen secret is reachable from inside it even if the
 * shell is fully owned.
 *
 * ONE named sandbox, not one per request. `getOrCreate` plus the SDK's default
 * persistence means files, installed packages and shell history survive between
 * sessions, so a half-finished exercise is still there tomorrow. That is the
 * difference between a toy and somewhere work actually happens.
 *
 * Cost, measured against the published Hobby allowance (5 CPU-hours and 420
 * GB-hours a month): Active CPU bills real computation, not the minutes spent
 * typing, so a session is dominated by provisioned memory -- 1 vCPU for 15 minutes
 * is 0.5 GB-hours, about 800 sessions a month. One vCPU is deliberate.
 */
const NAME = "lumen-study";
const VCPUS = 1;
const SESSION_MS = 15 * 60 * 1000;
const COMMAND_MS = 120_000;
// A runaway `yes` or a cat of a binary should end the request, not the process.
const MAX_OUTPUT = 256 * 1024;

// `cd` cannot persist across runCommand calls -- each one is a fresh process. The
// cwd therefore lives in the sandbox's own filesystem rather than in this app's
// memory, so it also survives a redeploy of this app. Written after the command so
// a failing command does not lose your place.
//
// Deliberately under /tmp, which is NOT captured by the snapshot: your files and
// installed packages come back after a stop, but a new session opens at home the
// way a new shell does. Verified -- after a stop/resume, ~/kata and a pip-installed
// scikit-learn were both still there while the cwd had reset.
//
// Home is asked for, never assumed. Hardcoding it as /vercel/sandbox printed
// "cd: no such file or directory" before every single command on the first real
// run -- the universal image puts $HOME at /vercel and runs as `ubuntu`. Reading
// $HOME from inside the sandbox means a future image change cannot reintroduce that.
const CWD_FILE = "/tmp/.lumen-cwd";
const FALLBACK_HOME = "~";
const wrap = (cmd: string) =>
  `cd "$(cat ${CWD_FILE} 2>/dev/null || echo "$HOME")" 2>/dev/null || cd "$HOME"\n${cmd}\n__lumen_ec=$?\npwd > ${CWD_FILE} 2>/dev/null\nexit $__lumen_ec\n`;

// One round trip for both, tab-separated: where the user now is, and what counts
// as home so the client can abbreviate it to `~`.
const WHERE = `printf '%s\\t%s' "$(cat ${CWD_FILE} 2>/dev/null || echo "$HOME")" "$HOME"`;

/**
 * Deliberately no pre-flight "is it configured" check.
 *
 * The obvious guard is `if (!process.env.VERCEL_OIDC_TOKEN) return 503`, and it is
 * wrong: the docs promise only that OIDC is handled automatically in production,
 * not that it surfaces under that exact variable name, and the SDK also accepts
 * team/project/token credentials. Guessing the credential mechanism would invent a
 * failure mode the SDK does not have and 503 a working deployment. The SDK is the
 * authority on whether it can authenticate; we just translate its failure.
 */
function authHint(message: string) {
  return /oidc|token|unauthor|auth|credential/i.test(message)
    ? " Locally this needs `vercel env pull` (the OIDC token expires every 12 hours). On Vercel it should be automatic, unless OIDC is disabled in project settings."
    : "";
}

async function open() {
  return Sandbox.getOrCreate({
    name: NAME,
    timeout: SESSION_MS,
    resources: { vcpus: VCPUS },
    // Explicitly empty. Inheriting process.env here would hand the shell the
    // GitHub token and undo the entire reason this runs off-host.
    env: {},
  });
}

export async function POST(request: Request) {
  let body: { action?: string; cmd?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const action = body.action || "run";

  if (action === "stop") {
    try {
      const sandbox = await Sandbox.get({ name: NAME });
      const result = await sandbox.stop();
      return Response.json({ stopped: true, activeCpuMs: result.activeCpuDurationMs ?? null });
    } catch (error) {
      // Already stopped or never created -- both mean "nothing is running", which
      // is what the caller wanted.
      return Response.json({ stopped: true, note: String((error as Error).message || error) });
    }
  }

  const cmd = String(body.cmd ?? "").trim();
  if (!cmd) return Response.json({ error: "cmd is required." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let sent = 0;
      try {
        const sandbox = await open();
        const running = await sandbox.runCommand({
          cmd: "bash",
          args: ["-lc", wrap(cmd)],
          detached: true,
          timeoutMs: COMMAND_MS,
        });

        for await (const log of running.logs()) {
          if (sent >= MAX_OUTPUT) continue;
          const data = String(log.data ?? "");
          sent += data.length;
          send({ s: log.stream, d: sent >= MAX_OUTPUT ? data + "\n[output truncated at 256KB]\n" : data });
        }

        const done = await running.wait();
        // Read the cwd back so the prompt reflects a `cd` the user just ran.
        let cwd = FALLBACK_HOME;
        let home = FALLBACK_HOME;
        try {
          const where = await sandbox.runCommand({ cmd: "bash", args: ["-lc", WHERE], timeoutMs: 10_000 });
          const [w, h] = (await where.stdout()).split("\t");
          if (w?.trim()) cwd = w.trim();
          if (h?.trim()) home = h.trim();
        } catch { /* the prompt is cosmetic; a failure here must not fail the command */ }
        send({ s: "exit", code: done.exitCode, ms: done.durationMs ?? null, cwd, home });
      } catch (error) {
        const message = String((error as Error).message || error);
        send({ s: "stderr", d: `lumen: ${message}${authHint(message)}\n` });
        send({ s: "exit", code: 1, cwd: FALLBACK_HOME, home: FALLBACK_HOME });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
