// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { startAgentWorker } from "./runs/agent-worker-bootstrap.js";

void startAgentWorker().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
// end
