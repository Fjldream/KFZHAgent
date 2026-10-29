import type {
  AppCandidate,
  AppChangeInput,
  ConfigInput,
  OperationTask,
  RedundancyConfigDetail,
  RedundancyConfigSummary,
  RedundancyEvent,
} from "../types/redundancy";
import { RedundancyHttpClient } from "./http-client";

export class RedundancyApi {
  constructor(private readonly http: RedundancyHttpClient) {}

  list() {
    return this.http.request<RedundancyConfigSummary[]>({
      method: "GET",
      url: "/redundancies",
    });
  }

  detail(id: string) {
    return this.http.request<RedundancyConfigDetail>({
      method: "GET",
      url: `/redundancies/${id}`,
    });
  }

  create(input: ConfigInput) {
    return this.http.request<RedundancyConfigSummary>({
      method: "POST",
      url: "/redundancies",
      data: input,
    });
  }

  update(id: string, expectedRevision: number, input: ConfigInput) {
    return this.http.request<RedundancyConfigSummary>({
      method: "PUT",
      url: `/redundancies/${id}`,
      data: { ...input, expectedRevision },
    });
  }

  remove(id: string, expectedRevision: number) {
    return this.http.request<void>({
      method: "DELETE",
      url: `/redundancies/${id}`,
      params: { expectedRevision },
    });
  }

  candidates(id: string, nodeId: string) {
    return this.http.request<AppCandidate[]>({
      method: "GET",
      url: `/redundancies/${id}/app-candidates`,
      params: { nodeId },
    });
  }

  enable(id: string, expectedRevision: number, requestId: string) {
    return this.operation(id, "enable", { expectedRevision, requestId });
  }

  disable(id: string, expectedRevision: number, requestId: string) {
    return this.operation(id, "disable", { expectedRevision, requestId });
  }

  switchNode(
    id: string,
    input: {
      expectedRevision: number;
      requestId: string;
      targetNodeId: string;
      force: boolean;
      reason?: string;
    },
  ) {
    return this.operation(id, "switch", input);
  }

  updateApps(id: string, input: AppChangeInput) {
    return this.http.request<OperationTask>({
      method: "POST",
      url: `/redundancies/${id}/app-changes`,
      data: input,
    });
  }

  listEvents(params: Record<string, string | number | undefined> = {}) {
    return this.http.request<RedundancyEvent[]>({
      method: "GET",
      url: "/redundancy-events",
      params,
    });
  }

  acknowledge(id: string, eventId: string) {
    return this.http.request<RedundancyEvent>({
      method: "POST",
      url: `/redundancies/${id}/events/${eventId}/ack`,
    });
  }

  task(id: string, taskId: string) {
    return this.http.request<OperationTask>({
      method: "GET",
      url: `/redundancies/${id}/operation-tasks/${taskId}`,
    });
  }

  private operation(id: string, action: string, data: Record<string, unknown>) {
    return this.http.request<OperationTask>({
      method: "POST",
      url: `/redundancies/${id}/${action}`,
      data,
    });
  }
}
