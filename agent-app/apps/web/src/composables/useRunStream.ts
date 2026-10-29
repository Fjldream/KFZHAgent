// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { ref, shallowRef } from "vue";
import {
  fetchRunSnapshot,
  isTerminalRun,
  streamRunEvents,
  type RunEventLike,
  type RunStatusLike,
} from "../runs-api.js";
import type { TimelineStep } from "../components/runs/types.js";
import { ApiError } from "../api.js";

type Deps = {
  stream?: typeof streamRunEvents;
  snapshot?: typeof fetchRunSnapshot;
  reconnectDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onUpdate?: () => void;
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * 把事件流折叠成时间线。
 *
 * 规则：`step.started` 建行，`step.completed` 收尾并写入真实耗时，
 * `step.failed` 标失败；同一 stepKey 重复出现时以最后一次为准（重试会重建行）。
 */
export function toTimelineSteps(events: readonly RunEventLike[]): TimelineStep[] {
  const order: string[] = [];
  const byKey = new Map<string, TimelineStep>();

  for (const event of events) {
    const stepKey = asString(event.payload.stepKey) ?? event.type;
    const label = asString(event.payload.label) ?? stepKey;

    if (event.type === "step.started") {
      if (!byKey.has(stepKey)) order.push(stepKey);
      byKey.set(stepKey, { stepKey, label, status: "running" });
      continue;
    }
    if (event.type === "step.completed") {
      if (!byKey.has(stepKey)) order.push(stepKey);
      byKey.set(stepKey, {
        stepKey,
        label,
        status: "done",
        ...(asNumber(event.payload.durationMs) === undefined
          ? {}
          : { durationMs: asNumber(event.payload.durationMs) as number }),
        ...(asString(event.payload.safeSummary) === undefined
          ? {}
          : { detail: asString(event.payload.safeSummary) as string }),
      });
      continue;
    }
    if (event.type === "step.failed") {
      if (!byKey.has(stepKey)) order.push(stepKey);
      byKey.set(stepKey, {
        stepKey,
        label,
        status: "failed",
        ...(asNumber(event.payload.durationMs) === undefined
          ? {}
          : { durationMs: asNumber(event.payload.durationMs) as number }),
        ...(asString(event.payload.failureCode) === undefined
          ? {}
          : { detail: asString(event.payload.failureCode) as string }),
      });
    }
    if (event.type === "input.required" || event.type === "approval.required") {
      for (const step of byKey.values()) if (step.status === "running") step.status = "done";
    }
    if (event.type === "decision.summary") {
      const key = `node-${event.seq}`;
      order.push(key);
      byKey.set(key, { stepKey: key, label: asString(event.payload.summary) ?? "流程节点已完成", status: "done" });
    }
  }

  return order.map((key) => byKey.get(key) as TimelineStep);
}

/**
 * 订阅一个 run：持续读事件、累积、按 seq 续传，直到 run 进入终态。
 *
 * 服务端每 30 秒主动断开是设计行为，这里把它当作「继续重连」的信号，
 * 而不是错误——否则用户会看到莫名其妙的失败。
 */
export function useRunStream(runId: string, deps: Deps = {}) {
  const stream = deps.stream ?? streamRunEvents;
  const snapshot = deps.snapshot ?? fetchRunSnapshot;
  const delay = deps.reconnectDelayMs ?? 1000;
  const random = deps.random ?? Math.random;

  const events = shallowRef<RunEventLike[]>([]);
  const status = ref<RunStatusLike>("QUEUED");
  const lastSeq = ref(0);
  const connected = ref(false);
  let aborted = false;
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  const nonRetryable = (error: unknown) => (error instanceof ApiError && [400, 401, 403, 404].includes(error.status))
    || (error instanceof Error && error.message === "RUN_EVENT_FRAME_TOO_LARGE");
  const reconnect = (waitMs: number) => new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); };
    controller.signal.addEventListener("abort", finish, { once: true });
    if (deps.sleep) void deps.sleep(waitMs).then(finish, finish);
    else timer = setTimeout(finish, waitMs);
    if (controller.signal.aborted) finish();
  });

  const stop = (): void => {
    aborted = true;
    connected.value = false;
    controller.abort();
  };

  const consume = async (): Promise<void> => {
    let failures = 0;
    while (!aborted) {
      const previousSeq = lastSeq.value;
      let streamFailed = false;
      try {
        connected.value = true;
        for await (const event of stream({ runId, after: lastSeq.value, signal: controller.signal })) {
          if (aborted) break;
          if (event.seq <= lastSeq.value) continue;
          if (event.seq !== lastSeq.value + 1) throw new Error("RUN_EVENT_SEQUENCE_GAP");
          events.value = [...events.value, event];
          lastSeq.value = Math.max(lastSeq.value, event.seq);
          if (event.type === "run.started") status.value = "RUNNING";
          if (event.type === "build.updated" && status.value !== "CANCEL_REQUESTED") status.value = "BUILDING";
          if (event.type === "run.cancel_requested") status.value = "CANCEL_REQUESTED";
          if (event.type === "run.completed") status.value = "SUCCEEDED";
          if (event.type === "run.failed") status.value = "FAILED";
          if (event.type === "run.cancelled") status.value = "CANCELLED";
          deps.onUpdate?.();
        }
      } catch (error) {
        if (aborted) break;
        if (nonRetryable(error)) {
          connected.value = false;
          throw error;
        }
        streamFailed = true;
      } finally {
        connected.value = false;
      }
      if (aborted) break;

      const snap = await snapshot(runId, { signal: controller.signal }).catch(error => {
        if (!aborted && nonRetryable(error)) throw error;
        return null;
      });
      if (aborted) break;
      if (snap !== null) status.value = snap.status;
      if (snap !== null && isTerminalRun(snap.status) && lastSeq.value >= snap.lastSeq) break;
      if (snap !== null && ["WAITING_INPUT", "WAITING_APPROVAL"].includes(snap.status) && lastSeq.value >= snap.lastSeq) break;
      if (snap === null || !isTerminalRun(snap.status) || lastSeq.value < snap.lastSeq) {
        const failed = streamFailed || snap === null;
        if (!failed || lastSeq.value > previousSeq) failures = 0;
        const nominalMs = Math.min(15_000, delay * 2 ** Math.min(failures, 10));
        const waitMs = Math.min(15_000, Math.max(1, Math.round(nominalMs * (0.8 + random() * 0.4))));
        if (failed) failures += 1;
        // 正常窗口/有进展时重置，连续暂时性故障指数退避并加抖动，避免重连齐步冲击。
        await reconnect(waitMs);
      }
    }
  };
  const start = (): Promise<void> => { running ??= consume(); return running; };

  return {
    events,
    status,
    lastSeq,
    connected,
    start,
    stop,
    steps: () => toTimelineSteps(events.value),
  };
}
// end
