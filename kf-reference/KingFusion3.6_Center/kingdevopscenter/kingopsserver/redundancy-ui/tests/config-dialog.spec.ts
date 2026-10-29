// modified by jinlong.feng at 0901 冗余功能开发
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import ConfigDialog from "../src/modules/redundancy/components/ConfigDialog.vue";
import { redundancyRuntimeKey } from "../src/modules/redundancy/runtime";
import { createMockRuntime } from "../src/demo/mock-runtime";

describe("新建冗余配置流程", () => {
  it("以三个明确步骤引导用户完成配置", async () => {
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("基础与节点")).toBeTruthy();
    });
    expect(screen.getByText("选择 APP")).toBeTruthy();
    expect(screen.getByText("激活与确认")).toBeTruthy();
    expect(screen.getByRole("button", { name: "下一步" })).toBeTruthy();
  });

  it("各步骤保留编号分割线，第一步按名称和节点分组", async () => {
    renderDialog();

    await screen.findByText("基础与节点");

    expect(
      Array.from(document.querySelectorAll(".step-index")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["01", "02", "03"]);
    expect(
      Array.from(document.querySelectorAll(".form-section-title h3")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["冗余名称", "节点配置"]);
    expect(
      document.querySelector(".basic-form .el-form-item__label"),
    ).toBeNull();
    expect(screen.getByLabelText("冗余名称")).toBeTruthy();
    expect(
      screen.queryByText(
        "每个节点只能加入一套冗余配置，离线或已占用节点不可选择。",
      ),
    ).toBeNull();
    expect(screen.queryByText("选择受管 APP")).toBeNull();
    expect(screen.queryByText("首次激活与配置确认")).toBeNull();
  });

  it("基础信息不完整时停留在第一步并显示校验信息", async () => {
    renderDialog();
    await screen.findByText("基础与节点");

    await fireEvent.click(screen.getByRole("button", { name: "下一步" }));

    expect(await screen.findByText("请输入冗余名称")).toBeTruthy();
    expect(screen.getAllByText("请选择主节点").length).toBeGreaterThan(0);
    expect(screen.getAllByText("请选择从节点").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "下一步" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "上一步" })).toBeNull();
  });
});

function renderDialog() {
  return render(ConfigDialog, {
    props: { modelValue: true },
    global: {
      plugins: [createPinia(), ElementPlus],
      provide: {
        [redundancyRuntimeKey as symbol]: createMockRuntime(),
      },
    },
  });
}
// end
