export type ConfigLifecycle = "DISABLED" | "ENABLING" | "ENABLED" | "DISABLING";
export type HealthStatus = "NORMAL" | "ABNORMAL" | "DISABLED";
export type NodeRole = "ACTIVE" | "INACTIVE" | "UNMANAGED" | null;
export type OperationType =
  "ENABLE" | "DISABLE" | "SWITCH" | "APP_CHANGE" | "RECONCILE";
export type OperationStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "INTERRUPTED";

export interface RedundancyApp {
  appId: string;
  appName: string;
  nodeId: string;
  exists: boolean;
  deployed: boolean;
  running: boolean;
  port?: number;
  appType?: string;
}

export interface RedundancyNode {
  nodeId: string;
  nodeName: string;
  nodeIp?: string;
  online: boolean;
  role: NodeRole;
  syncedRevision?: number | null;
  apps: RedundancyApp[];
}

export interface AppSummary {
  total: number;
  running: number;
  stopped: number;
  abnormal: number;
}

export interface HealthReason {
  key: string;
  code: string;
  nodeId?: string;
  appId?: string;
  summary: string;
}

export interface RedundancyEvent {
  eventId: string;
  tenantId: string;
  redundancyId: string;
  redundancyName?: string;
  status: "OPEN" | "RECOVERED";
  reasonCode: string;
  summary: string;
  detail?: Record<string, unknown>;
  openedAt: string;
  recoveredAt?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
}

export interface OperationAppStep {
  stepId: string;
  nodeId: string;
  appId: string;
  appName?: string;
  action: string;
  status: OperationStatus;
  message?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface OperationTask {
  taskId: string;
  redundancyId: string;
  operationType: OperationType;
  status: OperationStatus;
  currentStage?: string | null;
  message?: string | null;
  input?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  appSteps?: OperationAppStep[];
}

export interface RedundancyConfigSummary {
  redundancyId: string;
  tenantId: string;
  name: string;
  lifecycle: ConfigLifecycle;
  revision: number;
  primaryNodeId: string;
  standbyNodeId: string;
  initialActiveNodeId: string;
  activeNodeId: string | null;
  primaryAppIds: string[];
  standbyAppIds: string[];
  healthStatus: HealthStatus;
  healthReasons: HealthReason[];
  primaryNode: Omit<RedundancyNode, "apps">;
  standbyNode: Omit<RedundancyNode, "apps">;
  primaryAppSummary: AppSummary;
  standbyAppSummary: AppSummary;
  openEventCount: number;
  primaryOpenEvent?: RedundancyEvent | null;
  currentTask?: OperationTask | null;
  lastSwitchAt?: string | null;
  allowedActions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RedundancyConfigDetail extends RedundancyConfigSummary {
  nodes: {
    primary: RedundancyNode;
    standby: RedundancyNode;
  };
  openEvents: RedundancyEvent[];
  recentTasks: OperationTask[];
}

export interface NodeCandidate {
  nodeId: string;
  nodeName: string;
  nodeIp?: string;
  online: boolean;
}

export interface AppCandidate extends RedundancyApp {
  selected: boolean;
}

export interface ConfigInput {
  name: string;
  primaryNodeId: string;
  standbyNodeId: string;
  initialActiveNodeId: string;
  primaryAppIds: string[];
  standbyAppIds: string[];
}

export interface AppChangeInput {
  expectedRevision: number;
  requestId: string;
  reason?: string;
  changes: AppMembershipChange[];
}

export interface AppMembershipChange {
  nodeId: string;
  addAppIds: string[];
  removeAppIds: string[];
}

export interface ApiEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
  sentAt: string;
}
