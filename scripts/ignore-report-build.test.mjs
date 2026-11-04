import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("report builds skip only when all changes since deployment are reports", () => {
  const dir = mkdtempSync(join(tmpdir(), "lumen-build-"));
  const script = resolve("scripts/ignore-report-build.mjs");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const commit = () => { git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "test"); return git("rev-parse", "HEAD"); };
  const check = (base, force = "") => spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_FORCE_BUILD: force } }).status;
  try {
    git("init", "-q");
    writeFileSync(join(dir, "app.ts"), "initial");
    const base = commit();
    assert.equal(check(base), 1, "redeploy builds");
    mkdirSync(join(dir, "reports"));
    writeFileSync(join(dir, "reports/scan.json"), "{}"); commit();
    assert.equal(check(base), 0, "reports only skip");
    assert.equal(check(base, "1"), 1, "force override builds");
    assert.equal(check(""), 1, "first deploy builds");
    assert.equal(check("a".repeat(40)), 1, "missing history builds");
    writeFileSync(join(dir, "app.ts"), "new code"); commit();
    writeFileSync(join(dir, "reports/scan.json"), "{\"new\":true}"); commit();
    assert.equal(check(base), 1, "report after unbuilt code still builds");
    const deployed = git("rev-parse", "HEAD");
    git("mv", "app.ts", "reports/app.ts"); commit();
    assert.equal(check(deployed), 1, "moving code into reports still builds");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
