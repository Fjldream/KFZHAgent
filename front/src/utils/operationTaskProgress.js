// modified by jinlong.feng at 0901 冗余功能开发
const OPERATION_STAGE_KEYS = Object.freeze({
  ENABLE: ["STOP_INACTIVE_APPS", "SYNC_ROLES", "START_ACTIVE_APPS"],
  SWITCH: ["STOP_SOURCE_APPS", "SYNC_ROLES", "START_TARGET_APPS"],
});

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED"]);

/**
 * 创建前端任务跟踪对象，使任务抽屉可以在接口返回前立即展示。
 *
 * @param {object} params 任务初始化参数。
 * @returns {object} 可由 WebSocket 与 HTTP 结果持续合并的任务对象。
 */
export function createTrackedOperationTask({
  requestId,
  operationType,
  redundancyId,
  configurationName = "",
  startedAt = new Date().toISOString(),
}) {
  return {
    requestId,
    operationType,
    redundancyId,
    configurationName,
    status: "PENDING",
    currentStage: "CREATED",
    startedAt,
    appSteps: [],
  };
}

/**
 * 判断任务更新是否属于当前正在跟踪的任务。
 *
 * @param {object|null} current 当前任务。
 * @param {object|null} update 后端任务更新。
 * @returns {boolean} 是否允许合并。
 */
function isSameTask(current, update) {
  if (!current || !update) return false;
  if (current.taskId && update.taskId) return current.taskId === update.taskId;
  if (current.requestId && update.requestId) {
    return current.requestId === update.requestId;
  }
  return false;
}

/**
 * 合并任务主记录，保留已经接收的 APP 步骤和实际失败阶段。
 *
 * @param {object|null} current 当前任务。
 * @param {object|null} update 后端任务更新。
 * @returns {object|null} 合并后的任务；非当前任务更新会返回原对象。
 */
export function mergeOperationTask(current, update) {
  if (!current)
    return update ? { ...update, appSteps: update.appSteps || [] } : null;
  if (!isSameTask(current, update)) return current;
  if (
    TERMINAL_STATUSES.has(current.status) &&
    !TERMINAL_STATUSES.has(update.status)
  ) {
    return current;
  }

  const failedStage =
    update.status === "FAILED" && update.currentStage === "FAILED"
      ? current.failedStage || current.currentStage
      : update.failedStage || current.failedStage;

  return {
    ...current,
    ...update,
    failedStage,
    appSteps: update.appSteps || current.appSteps || [],
  };
}

/**
 * 将 APP 步骤按 stepId 幂等写入当前任务，避免 WebSocket 重发产生重复行。
 *
 * @param {object|null} current 当前任务。
 * @param {object|null} step APP 执行步骤更新。
 * @returns {object|null} 合并后的任务。
 */
export function mergeOperationAppStep(current, step) {
  if (!current || !step || !current.taskId || current.taskId !== step.taskId) {
    return current;
  }
  const steps = [...(current.appSteps || [])];
  const index = steps.findIndex((item) => item.stepId === step.stepId);
  if (index >= 0) steps[index] = { ...steps[index], ...step };
  else steps.push(step);
  return { ...current, appSteps: steps };
}

/** 仅在收到新的 APP 执行步骤时跟随最新项，既有步骤状态更新不改变滚动位置。 */
export function shouldFollowLatestAppStep(previousCount, nextCount) {
  return nextCount > previousCount;
}

/** 返回后端持久化的任务跳过动作。 */
export function getOperationSkippedActions(task) {
  const actions = task?.input?.skippedActions;
  return Array.isArray(actions)
    ? actions.filter((item) => item && typeof item.action === "string")
    : [];
}

/** 为阶段附加可持久化的跳过信息。 */
function createStage(key, state, skippedActions) {
  const skipped = skippedActions.find((item) => item.action === key);
  return skipped
    ? {
        key,
        state,
        skipped: true,
        nodeId: skipped.nodeId,
        reasonCode: skipped.reasonCode,
      }
    : { key, state };
}

/**
 * 计算三阶段展示状态。状态只来自后端 currentStage，不生成虚假百分比。
 *
 * @param {object|null} task 操作任务。
 * @returns {Array<{key: string, state: string}>} 三阶段状态列表。
 */
export function getOperationTaskStages(task) {
  const keys = OPERATION_STAGE_KEYS[task?.operationType] || [];
  if (!task) return [];
  const skippedActions = getOperationSkippedActions(task);
  if (task.status === "SUCCEEDED" || task.currentStage === "COMPLETED") {
    return keys.map((key) => createStage(key, "success", skippedActions));
  }

  const effectiveStage =
    task.status === "FAILED" ? task.failedStage : task.currentStage;
  const currentIndex = keys.indexOf(effectiveStage);
  return keys.map((key, index) => {
    if (currentIndex < 0) return createStage(key, "wait", skippedActions);
    if (index < currentIndex) return createStage(key, "success", skippedActions);
    if (index > currentIndex) return createStage(key, "wait", skippedActions);
    return createStage(
      key,
      task.status === "FAILED" ? "error" : "process",
      skippedActions,
    );
  });
}

/**
 * 返回 APP 步骤完成数量，供任务进度摘要展示。
 *
 * @param {object|null} task 操作任务。
 * @returns {{completed: number, total: number}} APP 步骤完成统计。
 */
export function getOperationAppProgress(task) {
  const allSteps = task?.appSteps || [];
  const running = !isOperationTaskTerminal(task);
  const stage = task?.currentStage || "";
  const action = stage.startsWith("STOP_")
    ? "STOP"
    : stage.startsWith("START_")
      ? "START"
      : null;
  const steps = running && action
    ? allSteps.filter((step) => step.action === action)
    : running
      ? []
      : allSteps;
  const statuses = steps.map(
    (step) => step.commandStatus || step.status || "PENDING",
  );
  const succeeded = statuses.filter((status) => status === "SUCCEEDED").length;
  const failed = statuses.filter((status) => status === "FAILED").length;
  const unknown = statuses.filter((status) => status === "UNKNOWN").length;
  const observing = statuses.filter((status) => status === "OBSERVING").length;
  const pending = statuses.filter((status) => status === "PENDING").length;
  const returned = succeeded + failed + unknown + observing;
  return {
    action,
    total: steps.length,
    returned,
    succeeded,
    failed,
    unknown,
    observing,
    pending,
    completed: succeeded + failed + unknown,
    running,
  };
}

/**
 * 从已有节点资源 Store 中解析 APP 名称，避免冗余模块重复维护状态。
 *
 * @param {object} step APP 执行步骤。
 * @param {Array<object>} nodeResources 公共节点资源列表。
 * @returns {string} APP 可读名称。
 */
export function resolveOperationAppName(step, nodeResources) {
  const node = (nodeResources || []).find(
    (item) => item.nodeId === step?.nodeId,
  );
  const app = (node?.apps || []).find((item) => item.appId === step?.appId);
  return app?.appName || app?.name || step?.appName || step?.appId || "—";
}

/** 判断任务是否已经进入成功或失败终态。 */
export function isOperationTaskTerminal(task) {
  return TERMINAL_STATUSES.has(task?.status);
}
// end
