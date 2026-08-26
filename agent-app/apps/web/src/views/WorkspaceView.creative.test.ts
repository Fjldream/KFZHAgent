// @ts-nocheck -- focused integration fixture exercises the real Vue view with a server delivery snapshot.
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({
  state: {
    workspaceId: "ws-creative",
    workspace: {
      id: "ws-creative",
      name: "创意工程",
      mode: "new",
      generationWorkflow: "creative-v2",
      currentRevisionId: "rev-creative",
    },
    loading: false,
    error: null,
    conversationId: "conv-creative",
    messages: [],
    streaming: false,
    phaseHint: null,
    resuming: false,
    pendingApproval: null,
    lastDone: null,
    buildJobId: "job-creative",
    buildJobStatus: "SUCCEEDED",
    artifacts: [{ id: "art-creative", kind: "client-package" }],
    previewArtifactId: undefined,
    validationReport: null,
    revisions: [],
    currentRevisionId: "rev-creative",
    moduleDeliveryResult: null,
    projectDelivery: {
      workflow: "creative-v2",
      projectKey: "creative",
      status: "downloadable",
      artifactId: "art-creative",
      revisionId: "rev-creative",
      download: { available: true, tokenEndpoint: "/api/artifacts/art-creative/download-token" },
      kf36RuntimeVerification: {
        status: "not_performed",
        notice: "尚未经过人工 KingFusion 3.6 运行态验证",
      },
    },
  },
  load: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn(),
  resumeApproval: vi.fn(),
  downloadArtifact: vi.fn().mockResolvedValue(undefined),
  deleteWorkspace: vi.fn(),
  uploadSource: vi.fn(),
  createPreviewUrl: vi.fn(() => "/api/artifacts/art-creative/preview"),
}));

vi.mock("../stores/workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("../stores/session", () => ({
  useSession: () => ({ logout: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../stores/stage", () => ({ useWorkflowStage: () => "ready" }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "ws-creative" } }),
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}));

import PreviewBar from "../components/PreviewBar.vue";
import WorkspaceView from "./WorkspaceView.vue";

describe("WorkspaceView creative-v2 delivery", () => {
  it("renders download and exact manual-runtime status without mounting or requesting preview", async () => {
    const wrapper = mount(WorkspaceView, { props: { workspaceId: "ws-creative" } });

    workspace.state.previewArtifactId = "art-creative";
    await nextTick();

    expect(wrapper.findComponent(PreviewBar).exists()).toBe(false);
    expect(workspace.createPreviewUrl).not.toHaveBeenCalled();
    const delivery = wrapper.get('[data-testid="creative-project-delivery"]');
    expect(delivery.text()).toContain("not_performed");
    expect(delivery.text()).toContain("尚未经过人工 KingFusion 3.6 运行态验证");
    expect(wrapper.text()).not.toContain("页面预览");
    expect(wrapper.find('[data-testid="download-artifact"]').exists()).toBe(false);

    await wrapper.get('[data-testid="creative-project-download"]').trigger("click");
    expect(workspace.downloadArtifact).toHaveBeenCalledWith("art-creative");
  });
});
