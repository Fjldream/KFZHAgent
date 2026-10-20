// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { ref, shallowRef } from "vue";
import {
  fetchRunSnapshot,
  isTerminalRun,
  streamRunEvents,
  type RunEventLike,
  type RunStatusLike,
} from "../runs-api.js";
import type { TimelineStep } from "../components/runs/RunTimeline.vue";

type Deps = {
  stream?: typeof streamRunEvents;
  snapshot?: typeof fetchRunSnapshot;
  reconnectDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
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
  const delay = deps.reconnectDelayMs ?? 800;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const events = shallowRef<RunEventLike[]>([]);
  const status = ref<RunStatusLike>("QUEUED");
  const lastSeq = ref(0);
  const connected = ref(false);
  let aborted = false;
  const controller = new AbortController();

  const stop = (): void => {
    aborted = true;
    controller.abort();
  };

  const start = async (): Promise<void> => {
    while (!aborted && !isTerminalRun(status.value)) {
      try {
        connected.value = true;
        for await (const event of stream({ runId, after: lastSeq.value, signal: controller.signal })) {
          events.value = [...events.value, event];
          lastSeq.value = Math.max(lastSeq.value, event.seq);
        }
      } catch {
        if (aborted) break;
      }
      connected.value = false;
      if (aborted) break;

      const snap = await snapshot(runId).catch(() => null);
      if (snap !== null) status.value = snap.status;
      if (snap !== null && isTerminalRun(snap.status) && lastSeq.value >= snap.lastSeq) break;
      if (snap === null) {
        // 连快照都取不到，退避后重试一次，避免打爆服务端。
        await sleep(delay);
      }
    }
  };

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
