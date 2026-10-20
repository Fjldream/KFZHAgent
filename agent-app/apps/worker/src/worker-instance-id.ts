import { randomUUID } from "node:crypto";
import { hostname as systemHostname } from "node:os";

/** 一个初创租户的租户所有者，它在主机和容器之间保持独特。 */
export function createWorkerInstanceId(
  hostname = systemHostname(),
  pid = process.pid,
  nonce = randomUUID(),
): string {
  return `worker-${hostname}-${pid}-${nonce}`;
}
