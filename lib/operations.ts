import { readJson, writeJson } from "./market/store";

export const DIGEST_HEARTBEAT = "reports/operations/daily-digest.json";
/** Called only after the email provider accepts delivery. Never invent a successful run. */
export async function recordDigestDelivery(at = new Date()): Promise<boolean> {
  const previous = await readJson(DIGEST_HEARTBEAT);
  if (!previous.synced) return false;
  const saved = await writeJson(DIGEST_HEARTBEAT, { version: 1, acceptedAt: at.toISOString() }, previous.sha, "ops: record accepted daily digest");
  return saved.ok;
}
