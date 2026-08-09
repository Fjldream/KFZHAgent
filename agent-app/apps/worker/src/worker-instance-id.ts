import { randomUUID } from "node:crypto";
import { hostname as systemHostname } from "node:os";

/** A startup-scoped lease owner that stays unique across hosts and containers. */
export function createWorkerInstanceId(
  hostname = systemHostname(),
  pid = process.pid,
  nonce = randomUUID(),
): string {
  return `worker-${hostname}-${pid}-${nonce}`;
}
