import { execFileSync } from "node:child_process";

// Reports are read from GitHub at request time. Compare with the last deployed SHA,
// not HEAD^: a report commit may follow code whose deployment failed or was cancelled.
// Unknown history, a first deployment, and explicit redeploys must always build.
const base = process.env.VERCEL_GIT_PREVIOUS_SHA;
if (process.env.VERCEL_FORCE_BUILD === "1" || !/^[a-f0-9]{40}$/i.test(base ?? "")) process.exit(1);
try {
  execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"], { stdio: "pipe" });
  const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const skip = paths.length > 0 && paths.every((path) => path.startsWith("reports/"));
  console.log(skip ? "Only runtime reports changed; skipping build." : "Application changes or redeploy; building.");
  process.exit(skip ? 0 : 1);
} catch {
  console.log("Deployment history unavailable; building.");
  process.exit(1);
}
