// modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/** 读取前端源码文件，路径相对本测试文件解析。 */
function readSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("两侧都选择 APP 时返回 null", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(typeof utils.findEmptyAppSide, "function");
  assert.equal(
    utils.findEmptyAppSide({ primary: ["app-1"], standby: ["app-2"] }),
    null,
  );
});

test("任一侧被清空时返回该侧", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(
    utils.findEmptyAppSide({ primary: [], standby: ["app-2"] }),
    "primary",
  );
  assert.equal(
    utils.findEmptyAppSide({ primary: ["app-1"], standby: [] }),
    "standby",
  );
  assert.equal(utils.findEmptyAppSide({ primary: [], standby: [] }), "primary");
});

test("草稿缺失或字段异常时按空侧处理", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(utils.findEmptyAppSide(undefined), "primary");
  assert.equal(utils.findEmptyAppSide({}), "primary");
  assert.equal(
    utils.findEmptyAppSide({ primary: "app-1", standby: ["app-2"] }),
    "primary",
  );
});

test("修改 APP 列表保存前先做每侧至少一个的校验", async () => {
  const source = await readSource(
    "src/components/Redundancy/AppManagerDialog.vue",
  );
  const saveStart = source.indexOf("async function save()");

  assert.ok(saveStart > 0, "未找到 save 函数");
  const saveBody = source.slice(saveStart, saveStart + 800);
  const guardIndex = saveBody.indexOf("if (emptyAppSide.value)");
  const requestIndex = saveBody.indexOf("redundancyAPI.updateApps");

  assert.ok(guardIndex >= 0, "save 前缺少两侧非空校验");
  assert.ok(
    requestIndex > guardIndex,
    "两侧非空校验必须发生在提交请求之前",
  );
  assert.match(saveBody, /redundancy\.validation\.apps/);
});

test("四套语言资源都提供两侧至少各选一个 APP 的提示", async () => {
  const localeModules = await Promise.all(
    ["zh", "en", "ja", "ko"].map((locale) =>
      import(`../src/i18n/i18nLaguage/${locale}.js`),
    ),
  );

  for (const { default: messages } of localeModules) {
    const message = messages.redundancy?.validation?.apps;
    assert.equal(typeof message, "string", "两侧至少一个 APP 的提示缺失");
    assert.ok(message.length > 0);
  }
});
// end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
