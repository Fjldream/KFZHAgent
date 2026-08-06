// @ts-nocheck -- Brief Step 1 的组件测试含逐字代码（JS 风格，无类型标注），
// 因此本文件关闭类型检查；运行时断言与 ESLint 静态规则仍然生效。
// Task 9 Step 3：同步新设计（ApprovalSheet / PreviewBar / TopBar / ContextPanel）。
// 组件测试不进真实浏览器。
import { mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router";
import { useSession } from "../stores/session";
import ApprovalSheet from "./ApprovalSheet.vue";
import ConversationPanel from "./ConversationPanel.vue";
import PreviewBar from "./PreviewBar.vue";
import TopBar from "./TopBar.vue";
import ContextPanel from "./ContextPanel.vue";
import RevisionList from "./RevisionList.vue";
import ValidationReport from "./ValidationReport.vue";
import ProjectTree from "./ProjectTree.vue";

/** 组件测试共享的确认计划摘要（含破坏性删除操作）。 */
const confirmedPlanSummary = {
  operations: [
    { op: "create", entityType: "control", entityId: "Button1", properties: { x: 10, y: 10, text: "确定" } },
    { op: "update", entityId: "Text1", changes: [{ path: "/text", value: "欢迎" }] },
    { op: "delete", entityId: "OldPage", destructiveConfirmed: true },
  ],
};

// ApprovalSheet / 删除弹层用 WAAPI 做进入动画；jsdom 无 element.animate，
// 用「prefers-reduced-motion: reduce」短路跳过（组件内已处理该分支）。
beforeAll(() => {
  const matchMediaMock = vi.fn().mockReturnValue({
    matches: true,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", { writable: true, value: matchMediaMock });
});

// ---------------------------------------------------------------------------
// Brief Step 1 逐字用例
// ---------------------------------------------------------------------------

describe("brief step 1 verbatim assertions", () => {
  it("disables approval until a plan hash is present", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: undefined }
    });
    expect(wrapper.get('[data-testid="approve-plan"]').attributes("disabled")).toBeDefined();
  });

  it("never renders model output through v-html", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: "<img src=x onerror=alert(1)>" }] }
    });
    expect(wrapper.html()).not.toContain("onerror=");
  });
});

// ---------------------------------------------------------------------------
// 路由守卫（shell）
// ---------------------------------------------------------------------------

describe("WorkspaceView shell", () => {
  // 路由守卫测试会操纵模块级 session state，跑完清理以免影响其他用例。
  afterEach(() => {
    const session = useSession();
    session.state.user = null;
    session.state.restored = false;
  });

  it("redirects unauthenticated visitors to /login via the real router guard", async () => {
    const session = useSession();
    session.state.user = null;
    session.state.restored = true;
    const router = createAppRouter(createMemoryHistory());
    await router.push("/workspaces/ws-1");
    await router.isReady();
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("keeps authenticated users on the workspace route", async () => {
    const session = useSession();
    session.state.user = { id: "u1", username: "alice", role: "member", tenantId: "t1" };
    session.state.restored = true;
    const router = createAppRouter(createMemoryHistory());
    await router.push("/workspaces/ws-1");
    await router.isReady();
    expect(router.currentRoute.value.name).toBe("workspace");
  });

  it("awaits session restore before judging the guard (refresh race)", async () => {
    const session = useSession();
    session.state.user = { id: "u1", username: "alice", role: "member", tenantId: "t1" };
    session.state.restored = false; // 模拟刷新后 /api/me 尚未返回
    const router = createAppRouter(createMemoryHistory());
    await router.push("/workspaces/ws-1");
    await router.isReady();
    // 守卫先 await ensureRestored()：已登录用户刷新后不被误重定向到 /login。
    expect(router.currentRoute.value.name).toBe("workspace");
  });
});

// ---------------------------------------------------------------------------
// ApprovalSheet（原 ChangePlanPanel 的全屏弹层重设计，Task 7）
// ---------------------------------------------------------------------------

describe("ApprovalSheet", () => {
  it("shows plan summary, operations, and the destructive warning", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: "a".repeat(64), summary: "修改按钮与文本，删除旧页" },
    });
    expect(wrapper.get('[data-testid="plan-summary"]').text()).toContain("修改按钮与文本，删除旧页");
    const html = wrapper.html();
    expect(html).toContain("create");
    expect(html).toContain("update");
    expect(html).toContain("delete");
    expect(wrapper.get('[data-testid="destructive-warning"]').text()).toContain("破坏性");
    expect(wrapper.get('[data-testid="plan-hash"]').text()).toContain("a".repeat(64));
  });

  it("gates every action behind a plan hash", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: undefined },
    });
    expect(wrapper.get('[data-testid="approve-plan"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="revise-plan"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="cancel-plan"]').attributes("disabled")).toBeDefined();
  });

  it("enables approval once a plan hash is present", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: "a".repeat(64) },
    });
    expect(wrapper.get('[data-testid="approve-plan"]').attributes("disabled")).toBeUndefined();
  });

  it("emits approve with only the displayed plan hash", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: "b".repeat(64) },
    });
    await wrapper.get('[data-testid="approve-plan"]').trigger("click");
    expect(wrapper.emitted("approve")).toBeTruthy();
    // 批准只发 planHash（安全约束：不发计划正文）。
    expect(wrapper.emitted("approve")[0]).toEqual(["b".repeat(64)]);
  });

  it("emits revise and cancel actions", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: { plan: confirmedPlanSummary, planHash: "c".repeat(64) },
    });
    await wrapper.get('[data-testid="revise-plan"]').trigger("click");
    expect(wrapper.emitted("revise")[0]).toEqual(["c".repeat(64)]);
    await wrapper.get('[data-testid="cancel-plan"]').trigger("click");
    expect(wrapper.emitted("cancel")[0]).toEqual(["c".repeat(64)]);
  });
});

describe("ApprovalSheet script changes (I5)", () => {
  it("marks a linkMng update as 脚本类变更 and shows the dedicated block", async () => {
    const plan = {
      operations: [
        {
          op: "update",
          entityId: "Button1",
          changes: [
            { path: "/linkMng/linkList", value: [{ action: "navigatePage", pageId: "p2" }] },
          ],
        },
      ],
    };
    const wrapper = mount(ApprovalSheet, {
      props: {
        plan,
        planHash: "a".repeat(64),
        scriptChanges: [
          { op: "update", entityId: "Button1", paths: ["/linkMng/linkList"] },
        ],
      },
    });
    expect(wrapper.get('[data-testid="script-changes"]').text()).toContain(
      "脚本类变更（自由脚本最终构建前单独展示）",
    );
    expect(wrapper.get('[data-testid="script-change"]').text()).toContain("Button1");
    expect(wrapper.get('[data-testid="script-change"]').text()).toContain("/linkMng/linkList");
    // 操作列表里也带脚本徽标。
    expect(wrapper.text()).toContain("脚本类变更");
  });

  it("shows no script block when the plan has no linkMng changes", async () => {
    const wrapper = mount(ApprovalSheet, {
      props: {
        plan: confirmedPlanSummary,
        planHash: "b".repeat(64),
        scriptChanges: [],
      },
    });
    expect(wrapper.find('[data-testid="script-changes"]').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TopBar 状态胶囊（Task 4）
// ---------------------------------------------------------------------------

describe("TopBar", () => {
  it.each([
    ["idle", "对话中"],
    ["approval", "待确认"],
    ["building", "构建中"],
    ["ready", "已完成"],
    ["error", "出错"],
  ])("renders stage chip %s -> %s", (stage, label) => {
    const wrapper = mount(TopBar, {
      props: { workspaceName: "客户展示大屏", stage },
    });
    const chip = wrapper.get('[data-stage]');
    expect(chip.attributes("data-stage")).toBe(stage);
    expect(chip.text()).toContain(label);
  });

  it("shows the breadcrumb and emits back from the back-to-list button", async () => {
    const wrapper = mount(TopBar, {
      props: { workspaceName: "客户展示大屏", stage: "idle" },
    });
    expect(wrapper.text()).toContain("工程列表");
    expect(wrapper.get('[data-testid="back-to-list"]').attributes("aria-label")).toBe("返回工程列表");
    await wrapper.get('[data-testid="back-to-list"]').trigger("click");
    expect(wrapper.emitted("back")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ContextPanel 情境面板 stage 分支（Task 6）
// ---------------------------------------------------------------------------

describe("ContextPanel", () => {
  const tree = {
    label: "解决方案",
    children: [{ label: "客户端工程", domain: "kingclient", supported: true, children: [] }],
  };
  const revisions = [
    { id: "r1", revisionNumber: 1, kind: "initial", createdAt: "2026-08-05T11:00:00.000Z" },
  ];
  const baseProps = {
    workspace: null,
    mode: "new",
    tree,
    revisions: [],
    currentRevisionId: null,
    report: null,
    artifact: undefined,
    jobStatus: null,
    uploadPending: false,
  };

  it("idle: shows the project tree and revision list", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "idle", revisions },
    });
    expect(wrapper.get('[data-testid="project-tree"]').text()).toContain("客户端工程");
    expect(wrapper.get('[data-testid="revision-list"]').text()).toContain("R1");
  });

  it("idle: shows the project overview card", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "idle", revisions, currentRevisionId: null },
    });
    expect(wrapper.text()).toContain("工程概况");
    expect(wrapper.text()).toContain("模式：新建工程");
    expect(wrapper.text()).toContain("修订：未开始");
  });

  it("idle: shows an in-progress revision state once a revision exists", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "idle", revisions, currentRevisionId: "r1" },
    });
    expect(wrapper.text()).toContain("修订：进行中");
  });

  it("idle upload mode with a pending upload shows the upload guide", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "idle", mode: "upload", uploadPending: true },
    });
    expect(wrapper.get('[data-testid="upload-guide"]').exists()).toBe(true);
  });

  it("building: shows the build progress status", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "building", jobStatus: "RUNNING" },
    });
    expect(wrapper.get('[data-testid="build-status"]').text()).toContain("正在生成工程…");
  });

  it("building: shows the four build steps with the active one highlighted", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "building", jobStatus: "RUNNING" },
    });
    const steps = wrapper.get('[data-testid="build-steps"]');
    const items = steps.findAll("li");
    expect(items.length).toBe(4);
    expect(steps.text()).toContain("排队");
    expect(steps.text()).toContain("编译");
    expect(steps.text()).toContain("校验");
    expect(steps.text()).toContain("完成");
    expect(items[1].classes()).toContain("on");
  });

  it("approval: shows the pending plan hint", async () => {
    const wrapper = mount(ContextPanel, {
      props: { ...baseProps, stage: "approval" },
    });
    expect(wrapper.text()).toContain("待确认计划");
  });

  it("ready: shows download only for successful builds with an artifact", async () => {
    const withArtifact = mount(ContextPanel, {
      props: {
        ...baseProps,
        stage: "ready",
        jobStatus: "SUCCEEDED",
        artifact: { id: "artifact-1", kind: "client-package", storageKey: "k", sizeBytes: 1, sha256: null },
      },
    });
    expect(withArtifact.get('[data-testid="download-artifact"]').exists()).toBe(true);

    const withoutArtifact = mount(ContextPanel, {
      props: { ...baseProps, stage: "ready", jobStatus: "SUCCEEDED", artifact: undefined },
    });
    expect(withoutArtifact.find('[data-testid="download-artifact"]').exists()).toBe(false);
  });

  it("ready: hides download while the build has not succeeded", async () => {
    const wrapper = mount(ContextPanel, {
      props: {
        ...baseProps,
        stage: "building",
        jobStatus: "RUNNING",
        artifact: { id: "artifact-1", kind: "client-package", storageKey: "k", sizeBytes: 1, sha256: null },
      },
    });
    expect(wrapper.find('[data-testid="download-artifact"]').exists()).toBe(false);
  });

  it("emits download when the download button is clicked", async () => {
    const wrapper = mount(ContextPanel, {
      props: {
        ...baseProps,
        stage: "ready",
        jobStatus: "SUCCEEDED",
        artifact: { id: "artifact-2", kind: "client-package", storageKey: "k", sizeBytes: 1, sha256: null },
      },
    });
    await wrapper.get('[data-testid="download-artifact"]').trigger("click");
    expect(wrapper.emitted("download")[0]).toEqual(["artifact-2"]);
  });
});

// ---------------------------------------------------------------------------
// 对话面板（安全：模型输出纯文本渲染）
// ---------------------------------------------------------------------------

describe("ConversationPanel", () => {
  it("renders user and assistant messages as escaped text", async () => {
    const wrapper = mount(ConversationPanel, {
      props: {
        messages: [
          { role: "user", content: "请新建一个页面" },
          { role: "assistant", content: "<b>计划已生成</b>" },
        ],
      },
    });
    const text = wrapper.text();
    expect(text).toContain("请新建一个页面");
    // 模型输出以实体形式安全显示（用户看到的是转义后的字面文本）。
    expect(text).toContain("&lt;b&gt;计划已生成&lt;/b&gt;");
    // 模型输出按纯文本渲染：内容可见但绝不产生真实 HTML 元素。
    expect(wrapper.find("b").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("<b>计划已生成</b>");
  });

  it("emits send with the typed message and clears the input", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [], streaming: false },
    });
    await wrapper.get('[data-testid="message-input"]').setValue("请修改按钮颜色");
    await wrapper.get('[data-testid="send-message"]').trigger("click");
    expect(wrapper.emitted("send")).toBeTruthy();
    expect(wrapper.emitted("send")[0][0]).toBe("请修改按钮颜色");
    expect(wrapper.get('[data-testid="message-input"]').element.value).toBe("");
  });

  it("disables the send button while streaming", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [], streaming: true },
    });
    expect(wrapper.get('[data-testid="send-message"]').attributes("disabled")).toBeDefined();
  });

  it("shows the welcome screen with suggestions when empty", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [], streaming: false },
    });
    expect(wrapper.get('[data-testid="conversation-welcome"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("用一句话，生成你的 KingFusion 工程");
    expect(wrapper.findAll(".suggestion").length).toBe(3);
  });

  it("fills the draft from a suggestion without sending", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [], streaming: false },
    });
    await wrapper.get(".suggestion").trigger("click");
    expect(wrapper.get('[data-testid="message-input"]').element.value).toBe("新建一个设备监控大屏");
    expect(wrapper.emitted("send")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PreviewBar（原 PreviewFrame 的底部预览条，Task 6）
// ---------------------------------------------------------------------------

describe("PreviewBar", () => {
  it("renders a sandboxed iframe without allow-scripts when a preview exists", async () => {
    const wrapper = mount(PreviewBar, {
      props: { previewUrl: "/api/artifacts/download/token-abc" },
    });
    expect(wrapper.get('[data-testid="preview-panel"]').exists()).toBe(true);
    const iframe = wrapper.get('[data-testid="preview-frame"]');
    const sandbox = iframe.attributes("sandbox");
    expect(sandbox).toBeDefined();
    expect(sandbox).not.toContain("allow-scripts");
  });

  it("renders nothing when no preview is available", async () => {
    const wrapper = mount(PreviewBar, {
      props: { previewUrl: undefined },
    });
    expect(wrapper.find('[data-testid="preview-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="preview-frame"]').exists()).toBe(false);
  });

  it("emits toggle-fullscreen when the fullscreen button is clicked", async () => {
    const wrapper = mount(PreviewBar, {
      props: { previewUrl: "/api/artifacts/download/token-abc" },
    });
    await wrapper.get('[data-testid="preview-fullscreen"]').trigger("click");
    expect(wrapper.emitted("toggle-fullscreen")).toBeTruthy();
    // fullscreen 文案随 prop 切换（退出全屏 / 全屏）。
    await wrapper.setProps({ fullscreen: true });
    expect(wrapper.get('[data-testid="preview-fullscreen"]').text()).toBe("退出全屏");
  });

  it("toggles the zoom label between 适应宽度 and 100%", async () => {
    const wrapper = mount(PreviewBar, {
      props: { previewUrl: "/api/artifacts/download/token-abc" },
    });
    const zoomBtn = wrapper.get('[data-testid="preview-zoom"]');
    expect(zoomBtn.text()).toBe("适应宽度");
    await zoomBtn.trigger("click");
    expect(zoomBtn.text()).toBe("100%");
    await zoomBtn.trigger("click");
    expect(zoomBtn.text()).toBe("适应宽度");
  });
});

describe("RevisionList", () => {
  it("renders revisions newest first and highlights the current one", async () => {
    const revisions = [
      { id: "r2", revisionNumber: 2, kind: "built", createdAt: "2026-08-05T12:00:00.000Z" },
      { id: "r1", revisionNumber: 1, kind: "initial", createdAt: "2026-08-05T11:00:00.000Z" },
    ];
    const wrapper = mount(RevisionList, {
      props: { revisions, currentRevisionId: "r2" },
    });
    expect(wrapper.text()).toContain("R2");
    expect(wrapper.text()).toContain("R1");
    expect(wrapper.get('[data-revision-id="r2"]').classes()).toContain("current");
  });

  it("emits select when a revision is chosen", async () => {
    const revisions = [
      { id: "r1", revisionNumber: 1, kind: "initial", createdAt: "2026-08-05T11:00:00.000Z" },
    ];
    const wrapper = mount(RevisionList, {
      props: { revisions, currentRevisionId: "r1" },
    });
    await wrapper.get('[data-revision-id="r1"]').trigger("click");
    expect(wrapper.emitted("select")).toBeTruthy();
    expect(wrapper.emitted("select")[0][0]).toBe("r1");
  });
});

describe("ValidationReport", () => {
  it("displays a failed validation report with its details", async () => {
    const wrapper = mount(ValidationReport, {
      props: {
        report: { outcome: "fail", summary: "validation failed", details: { error: { message: "bad field" } } },
      },
    });
    expect(wrapper.text()).toContain("校验未通过");
    expect(wrapper.text()).toContain("bad field");
  });

  it("displays a passing report", async () => {
    const wrapper = mount(ValidationReport, {
      props: { report: { outcome: "pass", summary: "validation passed", details: {} } },
    });
    expect(wrapper.text()).toContain("校验通过");
  });

  it("shows nothing when no report exists", async () => {
    const wrapper = mount(ValidationReport, {
      props: { report: undefined },
    });
    expect(wrapper.text()).toBe("");
  });
});

describe("ProjectTree", () => {
  it("shows 客户端工程 as the first child of the solution tree", async () => {
    const tree = {
      label: "解决方案",
      children: [{ label: "客户端工程", domain: "kingclient", supported: true, children: [] }],
    };
    const wrapper = mount(ProjectTree, { props: { tree } });
    const firstChild = wrapper.find(".tree-children > .tree-node");
    expect(firstChild.text()).toContain("客户端工程");
  });

  it("renders unsupported registered domains as disabled capabilities", async () => {
    const tree = {
      label: "解决方案",
      children: [
        { label: "客户端工程", domain: "kingclient", supported: true, children: [] },
        { label: "计算域", domain: "calculation", supported: false, children: [] },
      ],
    };
    const wrapper = mount(ProjectTree, { props: { tree } });
    const nodes = wrapper.findAll(".tree-children > .tree-node");
    expect(nodes.length).toBe(2);
    const unsupported = wrapper.find('.capability[data-domain="calculation"]');
    expect(unsupported.attributes("disabled")).toBeDefined();
    expect(unsupported.text()).toContain("未支持");
  });
});
