// modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const configurations = [
  { redundancyId: "redundancy-1", name: "冗余配置 1" },
  { redundancyId: "redundancy-2", name: "冗余配置 2" },
];

/** 读取前端源码文件，路径相对本测试文件解析。 */
function readSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("新建配置时与其他配置同名会被识别为重名", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(typeof utils.isRedundancyNameDuplicated, "function");
  assert.equal(
    utils.isRedundancyNameDuplicated(configurations, "冗余配置 1"),
    true,
  );
  assert.equal(
    utils.isRedundancyNameDuplicated(configurations, "全新配置"),
    false,
  );
});

test("编辑配置时自身名称不算重名", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(
    utils.isRedundancyNameDuplicated(
      configurations,
      "冗余配置 1",
      "redundancy-1",
    ),
    false,
  );
  assert.equal(
    utils.isRedundancyNameDuplicated(
      configurations,
      "冗余配置 2",
      "redundancy-1",
    ),
    true,
  );
});

test("名称比较忽略首尾空格，空名称交给非空校验处理", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(
    utils.isRedundancyNameDuplicated(configurations, " 冗余配置 1 "),
    true,
  );
  assert.equal(utils.isRedundancyNameDuplicated(configurations, ""), false);
  assert.equal(utils.isRedundancyNameDuplicated(configurations, "   "), false);
  assert.equal(utils.isRedundancyNameDuplicated(undefined, "冗余配置 1"), false);
});

test("四套语言资源均提供带 {name} 参数的重名提示", async () => {
  const localeModules = await Promise.all(
    ["zh", "en", "ja", "ko"].map((locale) =>
      import(`../src/i18n/i18nLaguage/${locale}.js`),
    ),
  );

  for (const { default: messages } of localeModules) {
    const message = messages.redundancy?.validation?.nameDuplicated;
    assert.equal(typeof message, "string", "重名提示缺失");
    assert.ok(message.includes("{name}"), "重名提示必须带 {name} 占位符");
  }
});

test("配置弹窗进入下一步前执行重名预检并展示重名文案", async () => {
  const source = await readSource(
    "src/components/Redundancy/ConfigDialog.vue",
  );

  assert.match(source, /isRedundancyNameDuplicated/);
  assert.match(source, /redundancy\.validation\.nameDuplicated/);
  assert.match(source, /props\.editing\?\.redundancyId/);
});
// end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验

// modified by jinlong.feng at 2026-10-14 冗余配置名称校验
test("冗余配置名称复用工程名称校验规则和已有提示", async () => {
  const source = await readSource(
    "src/components/Redundancy/ConfigDialog.vue",
  );

  assert.match(source, /regexValidator/);
  assert.match(source, /regexValidator\(["']safaText["'],\s*t\(["']rulesName["']\)\)/);
  assert.match(source, /validateField\(["']name["']\)/);
});
// end
