import type {
  AppMembershipChange,
  RedundancyConfigDetail,
} from "../types/redundancy";

/**
 * 将界面上的两侧完整 APP 选择结果转换为后端要求的增删差量。
 *
 * 页面只维护“最终希望保留哪些 APP”，避免让组件理解后端任务协议；
 * 后端仍可根据差量只操作新增 APP，并对移出 APP 执行纯解除管控。
 */
export function buildAppMembershipChanges(
  configuration: RedundancyConfigDetail,
  primaryAppIds: string[],
  standbyAppIds: string[],
): AppMembershipChange[] {
  return [
    buildNodeChange(
      configuration.primaryNodeId,
      configuration.primaryAppIds,
      primaryAppIds,
    ),
    buildNodeChange(
      configuration.standbyNodeId,
      configuration.standbyAppIds,
      standbyAppIds,
    ),
  ];
}

/** 判断差量中是否至少包含一次新增或移出。 */
export function hasAppMembershipChanges(
  changes: AppMembershipChange[],
): boolean {
  return changes.some(
    (change) => change.addAppIds.length > 0 || change.removeAppIds.length > 0,
  );
}

function buildNodeChange(
  nodeId: string,
  currentAppIds: string[],
  desiredAppIds: string[],
): AppMembershipChange {
  const current = new Set(currentAppIds);
  const desired = new Set(desiredAppIds);
  return {
    nodeId,
    addAppIds: desiredAppIds.filter((appId) => !current.has(appId)),
    removeAppIds: currentAppIds.filter((appId) => !desired.has(appId)),
  };
}
