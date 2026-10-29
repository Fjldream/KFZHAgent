// modified by jinlong.feng at 0901 冗余功能开发
/** 创建接口幂等请求标识。 */
export function createRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `redundancy-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
/** 根据当前配置创建互不影响的主、从节点 APP 选择草稿。 */
export function createAppSelectionDrafts(configuration) {
  return {
    primary: [...(configuration?.primaryAppIds || [])],
    standby: [...(configuration?.standbyAppIds || [])],
  };
}

/** 比较主、从节点 APP 草稿，生成一次接口请求所需的全部实际变更。 */
export function buildAppMembershipChanges(configuration, drafts) {
  return ["primary", "standby"].flatMap((side) => {
    const originalIds = configuration?.[`${side}AppIds`] || [];
    const selectedIds = drafts?.[side] || [];
    const addAppIds = selectedIds.filter((id) => !originalIds.includes(id));
    const removeAppIds = originalIds.filter((id) => !selectedIds.includes(id));

    if (!addAppIds.length && !removeAppIds.length) return [];
    return [
      {
        nodeId: configuration?.[`${side}NodeId`] || "",
        addAppIds,
        removeAppIds,
      },
    ];
  });
}
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交

// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
/** 汇总其他冗余配置已经占用的主、从节点 ID。 */
export function getOccupiedRedundancyNodeIds(
  configurations,
  currentRedundancyId = "",
) {
  const occupiedNodeIds = new Set();
  for (const configuration of Array.isArray(configurations)
    ? configurations
    : []) {
    if (configuration.redundancyId === currentRedundancyId) continue;
    if (configuration.primaryNodeId) {
      occupiedNodeIds.add(configuration.primaryNodeId);
    }
    if (configuration.standbyNodeId) {
      occupiedNodeIds.add(configuration.standbyNodeId);
    }
  }
  return occupiedNodeIds;
}
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点

// modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
/**
 * 判断配置名称是否已被其他冗余配置占用。
 * 与后端一致：名称去首尾空格后区分大小写比较，当前配置自身不参与比较。
 *
 * @param {Array<object>} configurations 冗余配置列表。
 * @param {string} name 待校验的名称。
 * @param {string} [currentRedundancyId] 编辑时排除的当前配置 ID。
 * @returns {boolean} 是否已被其他配置占用。
 */
export function isRedundancyNameDuplicated(
  configurations,
  name,
  currentRedundancyId = "",
) {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) return false;
  return (Array.isArray(configurations) ? configurations : []).some(
    (configuration) =>
      configuration.redundancyId !== currentRedundancyId &&
      String(configuration.name ?? "").trim() === normalizedName,
  );
}
// end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验

// modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
/**
 * 找出 APP 选择草稿中为空的一侧。
 * 两侧都不能为空：两侧全空配置名存实亡却仍占用两个节点，单侧为空则切换后目标端没有可启动的 APP。
 *
 * @param {{primary?: string[], standby?: string[]}} drafts 主、从两侧的选择草稿。
 * @returns {"primary"|"standby"|null} 第一个为空的一侧；两侧都不为空时返回 null。
 */
export function findEmptyAppSide(drafts) {
  for (const side of ["primary", "standby"]) {
    const appIds = drafts?.[side];
    if (!Array.isArray(appIds) || appIds.length === 0) return side;
  }
  return null;
}
// end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个

/** 创建从异常通知进入对应冗余配置的路由位置。 */
export function createRedundancyManagementLocation(redundancyId) {
  return {
    name: "redundancy",
    query: { redundancyId },
  };
}

/** 根据通知请求、当前选择和列表顺序解析管理页选中项。 */
export function resolveRedundancySelectionId(
  configurations,
  requestedId,
  currentId,
) {
  const rows = Array.isArray(configurations) ? configurations : [];
  for (const candidate of [requestedId, currentId]) {
    if (candidate && rows.some((item) => item.redundancyId === candidate)) {
      return candidate;
    }
  }
  return rows[0]?.redundancyId || "";
}

/** 格式化后端时间，空值统一显示短横线。 */
export function formatDateTime(value, _locale = "zh-CN") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

/** 判断 KF APP 状态是否为运行。 */
export function isAppRunning(app) {
  if (typeof app?.running === "boolean") return app.running;
  return app?.appStatus === "running" || app?.appStatus === 1;
}

/** 判断运维节点当前是否在线。 */
export function isNodeOnline(node) {
  return (
    node?.online === true || ["online", "running", 1].includes(node?.nodeStatus)
  );
}

/** 根据当前激活节点解析切换源端和目标端。 */
export function getSwitchNodeContext(configuration) {
  if (!configuration?.nodes) return { source: null, target: null };
  const activeIsPrimary =
    configuration.activeNodeId === configuration.primaryNodeId;
  return {
    source: activeIsPrimary
      ? configuration.nodes.primary
      : configuration.nodes.standby,
    target: activeIsPrimary
      ? configuration.nodes.standby
      : configuration.nodes.primary,
  };
}

/**
 * 构造人工切换请求；源节点离线时要求风险确认，并自动记录固定原因。
 */
export function createSwitchRequest(
  configuration,
  { riskAcknowledged = false } = {},
) {
  const { source, target } = getSwitchNodeContext(configuration);
  if (!source || !target?.nodeId) {
    const error = new Error("REDUNDANCY_SWITCH_NODE_INVALID");
    error.code = "REDUNDANCY_SWITCH_NODE_INVALID";
    throw error;
  }
  const sourceOffline = !isNodeOnline(source);
  if (sourceOffline && !riskAcknowledged) {
    const error = new Error("REDUNDANCY_FORCE_CONFIRMATION_REQUIRED");
    error.code = "REDUNDANCY_FORCE_CONFIRMATION_REQUIRED";
    throw error;
  }
  return {
    targetNodeId: target.nodeId,
    force: sourceOffline,
    ...(sourceOffline ? { reason: "用户已确认强制切换" } : {}),
  };
}

/** 生成冗余配置弹窗使用的节点连接详情。 */
export function getNodeConnectionDetails(node, translate) {
  if (!node) return [];
  const online = isNodeOnline(node);
  return [
    {
      key: "status",
      label: translate("redundancy.nodeStatus"),
      value: translate(online ? "online" : "offline"),
      online,
    },
    {
      key: "address",
      label: translate("redundancy.nodeAddress"),
      value: node.address || node.nodeIp || "—",
    },
    {
      key: "port",
      label: translate("redundancy.servicePort"),
      value:
        node.port === null || node.port === undefined || node.port === ""
          ? "—"
          : String(node.port),
    },
  ];
}

/** KF 工程类型与系统既有国际化文案的映射。 */
const PROJECT_TYPE_I18N_KEYS = Object.freeze({
  0: "calculationProject",
  1: "clientProject",
  2: "collectProject",
  3: "dataSourceProject",
  4: "alarmProject",
});

/**
 * 获取工程类型的本地化显示文本。
 *
 * @param {number|string|null|undefined} projectType KF 工程类型编码。
 * @param {(key: string) => string} translate vue-i18n 的翻译函数。
 * @returns {string} 本地化工程类型；未知编码保留原值，空值显示短横线。
 */
export function getProjectTypeText(projectType, translate) {
  if (projectType === null || projectType === undefined || projectType === "") {
    return "—";
  }
  const translationKey = PROJECT_TYPE_I18N_KEYS[Number(projectType)];
  return translationKey ? translate(translationKey) : String(projectType);
}

/** 冗余状态与 Element Plus 标签语义色的映射。 */
const REDUNDANCY_STATUS_TAG_TYPES = Object.freeze({
  NORMAL: "success",
  ENABLED: "success",
  SUCCEEDED: "success",
  ACTIVE: "success",
  OPEN: "danger",
  ABNORMAL: "danger",
  FAILED: "danger",
  INTERRUPTED: "danger",
  ENABLING: "warning",
  DISABLING: "warning",
  RUNNING: "warning",
  PENDING: "warning",
  OBSERVING: "warning",
  UNKNOWN: "warning",
  RECONNECTING: "warning",
});

/**
 * 获取冗余状态标签的 Element Plus 语义类型。
 *
 * @param {string} status 冗余生命周期、健康状态或事件状态。
 * @returns {"success"|"danger"|"warning"|"info"} 标签语义类型。
 */
export function getRedundancyStatusTagType(status) {
  return REDUNDANCY_STATUS_TAG_TYPES[status] || "info";
}

/**
 * 创建当前冗余未恢复异常的查询参数。
 *
 * @param {string} redundancyId 当前选择的冗余配置 ID。
 * @returns {{redundancyId: string, status: "OPEN"}} 当前异常查询参数。
 */
export function createCurrentExceptionQuery(redundancyId) {
  return {
    redundancyId,
    status: "OPEN",
  };
}

/**
 * 从全局异常快照中选出当前冗余的未恢复事件。
 *
 * @param {Array<object>} events 全局异常事件快照。
 * @param {string} redundancyId 当前选择的冗余配置 ID。
 * @returns {Array<object>} 当前冗余的未恢复事件。
 */
export function selectCurrentOpenEvents(events, redundancyId) {
  return (Array.isArray(events) ? events : []).filter(
    (event) => event.redundancyId === redundancyId && event.status === "OPEN",
  );
}

/** 根据公共资源 Store 补齐冗余详情中的节点和 APP 实时状态。 */
export function joinResourceStatus(detail, nodeResources) {
  if (!detail?.nodes) return detail;
  const clone = {
    ...detail,
    nodes: {
      primary: {
        ...detail.nodes.primary,
        apps: (detail.nodes.primary?.apps || []).map((app) => ({ ...app })),
      },
      standby: {
        ...detail.nodes.standby,
        apps: (detail.nodes.standby?.apps || []).map((app) => ({ ...app })),
      },
    },
  };
  for (const side of ["primary", "standby"]) {
    const target = clone.nodes[side];
    const resource = nodeResources.find(
      (node) => node.nodeId === target.nodeId,
    );
    if (!resource) continue;
    target.online =
      ["online", "running", 1].includes(resource.nodeStatus) ||
      resource.online === true;
    target.nodeIp = target.nodeIp || resource.nodeIp || resource.address;
    target.apps = (target.apps || []).map((app) => {
      const live = resource.apps?.find((item) => item.appId === app.appId);
      return live ? { ...app, ...live, running: isAppRunning(live) } : app;
    });
  }
  return clone;
}
// end
