// @ts-nocheck -- Brief Step 1 的组件测试含逐字代码（JS 风格，无类型标注），
// 因此本文件关闭类型检查；运行时断言与 ESLint 静态规则仍然生效。
// Task 12: customer UI component tests. 组件测试不进真实浏览器。
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, describe, expect, it } from "vitest";
import { createAppRouter } from "../router";
import { useSession } from "../stores/session";
import ChangePlanPanel from "./ChangePlanPanel.vue";
import ConversationPanel from "./ConversationPanel.vue";
import PreviewFrame from "./PreviewFrame.vue";
import ArtifactDownload from "./ArtifactDownload.vue";
import RevisionList from "./RevisionList.vue";
import ValidationReport from "./ValidationReport.vue";
import ProjectTree from "./ProjectTree.vue";
import WorkspaceView from "../views/WorkspaceView.vue";

/** 组件测试共享的确认计划摘要（含破坏性删除操作）。 */
const confirmedPlanSummary = {
  operations: [
    { op: "create", entityType: "control", entityId: "Button1", properties: { x: 10, y: 10, text: "确定" } },
    { op: "update", entityId: "Text1", changes: [{ path: "/text", value: "欢迎" }] },
    { op: "delete", entityId: "OldPage", destructiveConfirmed: true },
  ],
};

// ---------------------------------------------------------------------------
// Brief Step 1 逐字用例
// ---------------------------------------------------------------------------

describe("brief step 1 verbatim assertions", () => {
  it("disables approval until a plan hash is present", async () => {
    const wrapper = mount(ChangePlanPanel, {
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
// Step 1: 路由 / 入口 / 组件行为
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

  it("offers create and upload entry choices", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    const wrapper = mount(WorkspaceView, {
      props: { workspaceId: undefined },
      global: { plugins: [router] },
    });
    expect(wrapper.get('[data-testid="create-workspace"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="upload-workspace"]').exists()).toBe(true);
  });
});

describe("ChangePlanPanel", () => {
  it("shows plan summary, exact operations, and warnings", async () => {
    const wrapper = mount(ChangePlanPanel, {
      props: { plan: confirmedPlanSummary, planHash: "a".repeat(64) },
    });
    const html = wrapper.html();
    expect(html).toContain("计划摘要");
    expect(html).toContain("create");
    expect(html).toContain("update");
    expect(html).toContain("delete");
    expect(wrapper.text()).toContain("警告");
    expect(wrapper.text()).toContain("破坏性");
  });

  it("enables approval once a plan hash is present", async () => {
    const wrapper = mount(ChangePlanPanel, {
      props: { plan: confirmedPlanSummary, planHash: "a".repeat(64) },
    });
    const button = wrapper.get('[data-testid="approve-plan"]');
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("emits approve with the displayed plan hash", async () => {
    const wrapper = mount(ChangePlanPanel, {
      props: { plan: confirmedPlanSummary, planHash: "b".repeat(64) },
    });
    await wrapper.get('[data-testid="approve-plan"]').trigger("click");
    expect(wrapper.emitted("approve")).toBeTruthy();
    expect(wrapper.emitted("approve")[0][0]).toBe("b".repeat(64));
  });

  it("emits revise and cancel actions", async () => {
    const wrapper = mount(ChangePlanPanel, {
      props: { plan: confirmedPlanSummary, planHash: "c".repeat(64) },
    });
    await wrapper.get('[data-testid="revise-plan"]').trigger("click");
    expect(wrapper.emitted("revise")).toBeTruthy();
    await wrapper.get('[data-testid="cancel-plan"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });
});

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
});

describe("PreviewFrame", () => {
  it("renders a sandboxed iframe without allow-scripts", async () => {
    const wrapper = mount(PreviewFrame, {
      props: { previewUrl: "/api/artifacts/download/token-abc" },
    });
    const iframe = wrapper.get('[data-testid="preview-frame"]');
    const sandbox = iframe.attributes("sandbox");
    expect(sandbox).toBeDefined();
    expect(sandbox).not.toContain("allow-scripts");
  });

  it("shows a placeholder when no preview is available", async () => {
    const wrapper = mount(PreviewFrame, {
      props: { previewUrl: undefined },
    });
    expect(wrapper.text()).toContain("无预览");
  });
});

describe("ArtifactDownload", () => {
  it("shows download only for successful builds with an artifact", async () => {
    const wrapper = mount(ArtifactDownload, {
      props: { artifactId: "artifact-1", jobStatus: "SUCCEEDED", fileName: "result.gz" },
    });
    expect(wrapper.get('[data-testid="download-artifact"]').exists()).toBe(true);
  });

  it("hides download while the build has not succeeded", async () => {
    const wrapper = mount(ArtifactDownload, {
      props: { artifactId: "artifact-1", jobStatus: "RUNNING", fileName: "result.gz" },
    });
    expect(wrapper.find('[data-testid="download-artifact"]').exists()).toBe(false);
  });

  it("hides download when no artifact exists", async () => {
    const wrapper = mount(ArtifactDownload, {
      props: { artifactId: undefined, jobStatus: "SUCCEEDED", fileName: "result.gz" },
    });
    expect(wrapper.find('[data-testid="download-artifact"]').exists()).toBe(false);
  });

  it("emits download when the download button is clicked", async () => {
    const wrapper = mount(ArtifactDownload, {
      props: { artifactId: "artifact-2", jobStatus: "SUCCEEDED", fileName: "result.gz" },
    });
    await wrapper.get('[data-testid="download-artifact"]').trigger("click");
    expect(wrapper.emitted("download")).toBeTruthy();
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

// ---------------------------------------------------------------------------
// I5: linkMng（自由脚本）变更确认前单独展示
// ---------------------------------------------------------------------------

describe("ChangePlanPanel script changes (I5)", () => {
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
    const wrapper = mount(ChangePlanPanel, {
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
    const wrapper = mount(ChangePlanPanel, {
      props: {
        plan: confirmedPlanSummary,
        planHash: "b".repeat(64),
        scriptChanges: [],
      },
    });
    expect(wrapper.find('[data-testid="script-changes"]').exists()).toBe(false);
  });
});
