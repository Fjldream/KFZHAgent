// modified by jinlong.feng at 0901 冗余功能开发
import assert from "node:assert/strict";
import test from "node:test";

import { createRequestErrorMessageOptions } from "../src/api/requestErrorMessage.js";

test("冗余请求失败消息可以覆盖位置且普通页面保持默认配置", () => {
  assert.deepEqual(createRequestErrorMessageOptions("普通请求失败"), {
    message: "普通请求失败",
    type: "error",
  });

  assert.deepEqual(
    createRequestErrorMessageOptions("冗余请求失败", {
      requestErrorMessageOptions: {
        placement: "top",
        customClass: "redundancy-message",
      },
    }),
    {
      message: "冗余请求失败",
      type: "error",
      placement: "top",
      customClass: "redundancy-message",
    },
  );
});
// end
