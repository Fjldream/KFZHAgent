// modified by jinlong.feng at 0901 冗余功能开发
import { render, screen } from "@testing-library/vue";
import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import AppManagerDialog from "../src/modules/redundancy/components/AppManagerDialog.vue";
import { redundancyRuntimeKey } from "../src/modules/redundancy/runtime";
import { createMockRuntime } from "../src/demo/mock-runtime";

describe("修改受管 APP 弹窗", () => {
  it("使用节点切换和穿梭列表呈现 APP 配置", async () => {
    const runtime = createMockRuntime();
    const configuration = await runtime.api.detail("rd-1");

    render(AppManagerDialog, {
      props: { modelValue: true, configuration },
      global: {
        plugins: [createPinia(), ElementPlus],
        provide: { [redundancyRuntimeKey as symbol]: runtime },
      },
    });

    expect(await screen.findByText("节点全部 APP")).toBeTruthy();
    expect(screen.getByText("已纳入冗余 APP")).toBeTruthy();
    expect(screen.getByRole("button", { name: "加入" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "移出" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "恢复原配置" })).toBeTruthy();
    expect(
      screen.queryByText("两侧 APP 列表独立维护，不要求 APP 一一对应。"),
    ).toBeNull();
    expect(
      screen.queryByText(
        "保存后将立即更新冗余配置，并按当前激活角色处理新增 APP。",
      ),
    ).toBeNull();
    expect(screen.queryByText("保存后立即执行在线更新")).toBeNull();
    expect(
      screen.queryAllByRole("columnheader", { name: "appId" }),
    ).toHaveLength(0);

    const dialogBody = document.querySelector<HTMLElement>(
      ".app-manager-dialog .el-dialog__body",
    );
    const dialog = document.querySelector<HTMLElement>(".app-manager-dialog");
    const tableFrames = document.querySelectorAll<HTMLElement>(".table-frame");
    expect(dialog).not.toBeNull();
    expect(dialog!.style.getPropertyValue("--el-dialog-width")).toBe("1440px");
    expect(dialogBody).not.toBeNull();
    expect(dialogBody!.classList.contains("app-manager-dialog__body")).toBe(
      true,
    );
    expect(tableFrames).toHaveLength(2);
    tableFrames.forEach((frame) => {
      expect(frame.dataset.scrollRegion).toBe("app-table");
    });
  });
});
// end
