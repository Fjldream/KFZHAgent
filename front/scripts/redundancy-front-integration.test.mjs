// modified by jinlong.feng at 0901 冗余功能开发
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("冗余源码归入现有前端目录且不保留 modules", async () => {
  const expectedFiles = [
    "src/api/redundancyAPI.js",
    "src/api/redundancySocket.js",
    "src/stores/redundancyStore.js",
    "src/utils/redundancyUtils.js",
    "src/utils/redundancyMessage.js",
    "src/utils/operationTaskProgress.js",
    "src/styles/redundancy-tables.scss",
    "src/components/Redundancy/AppManagerDialog.vue",
    "src/components/Redundancy/ConfigDialog.vue",
    "src/components/Redundancy/CurrentExceptionDialog.vue",
    "src/components/Redundancy/NodeAppPanel.vue",
    "src/components/Redundancy/OperationTaskDrawer.vue",
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
    "src/components/Redundancy/RedundancyStatusTag.vue",
    "src/components/Redundancy/SwitchDialog.vue",
    "src/views/Main/RedundancyView/RedundancyEventsView.vue",
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  ];

  await Promise.all(
    expectedFiles.map((file) => access(new URL(`../${file}`, import.meta.url))),
  );
  await assert.rejects(access(new URL("../src/modules", import.meta.url)));
});

test("公共资源 Store 支持按 nodeId 更新 APP 状态且保留原接口", async () => {
  const source = await readSource("src/stores/opsResourceStore.js");

  assert.match(source, /function updateNodeAppListStatus\(nodeId, data\)/);
  assert.match(source, /function updateAppListStatus\(data\)/);
  assert.match(source, /updateNodeAppListStatus,/);
});

test("冗余模块复用公共请求、公共资源 Store 和公共表格", async () => {
  const api = await readSource("src/api/redundancyAPI.js");
  const store = await readSource(
    "src/stores/redundancyStore.js",
  );
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const events = await readSource(
    "src/views/Main/RedundancyView/RedundancyEventsView.vue",
  );
  const appDialog = await readSource(
    "src/components/Redundancy/AppManagerDialog.vue",
  );

  assert.match(api, /axiosRequest/);
  assert.match(store, /useOpsResourceStore/);
  for (const source of [management, events, appDialog]) {
    assert.match(source, /CustomStyleTable/);
    assert.doesNotMatch(source, /<el-table(?:\s|>)/);
    assert.doesNotMatch(source, /<table(?:\s|>)/);
  }
});

test("路由、侧栏和全局通知中心完成最小接入", async () => {
  const router = await readSource("src/router/index.js");
  const menus = await readSource("src/stores/mainLeftMenusStore.js");
  const title = await readSource("src/components/Main/MainTitle.vue");
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const iconRegistry = await readSource("src/plugins/svg-icons-register.js");
  const redundancyIcon = await readSource(
    "src/assets/icons/redundancy.svg",
  ).catch(() => "");

  assert.match(router, /path: ["']redundancy["']/);
  assert.match(router, /path: ["']redundancy\/events["']/);
  assert.match(menus, /title\.redundancy/);
  assert.match(menus, /icon:\s*["']redundancy["']/);
  assert.match(management, /icon-name="redundancy"/);
  assert.match(iconRegistry, /redundancy\.svg\?raw/);
  assert.match(redundancyIcon, /id="icon-redundancy"/);
  assert.match(title, /RedundancyNotificationCenter/);
});

test("新冗余异常使用紧凑 warning Notification 并保留详情跳转", async () => {
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );

  assert.match(
    notificationCenter,
    /ElNotification\(\{[\s\S]*type:\s*["']warning["']/,
  );
  // modified by jinlong.feng at 2026-10-09 冗余事件列与通知时长调整 弹窗停留 120000ms -> 20000ms
  assert.match(notificationCenter, /duration:\s*20000/);
  // end modified by jinlong.feng at 2026-10-09 冗余事件列与通知时长调整
  assert.match(notificationCenter, /onClick:\s*\(\)\s*=>\s*openEvent\(event\)/);
  assert.match(
    notificationCenter,
    /customClass:\s*["']redundancy-alert-notification["']/,
  );
  assert.match(notificationCenter, /message:\s*createAlertMessage\(event\)/);
  assert.match(notificationCenter, /function createAlertMessage\(event\)/);
  assert.match(notificationCenter, /redundancy\.viewDetail/);
  assert.match(notificationCenter, /formatDateTime\(event\.openedAt/);
  assert.match(
    notificationCenter,
    /\.redundancy-alert-notification\.el-notification\s*\{[\s\S]*width:\s*392px;[\s\S]*padding:\s*0;/,
  );
  assert.match(notificationCenter, /\.redundancy-alert__status/);
  assert.match(notificationCenter, /\.redundancy-alert__footer/);
  assert.doesNotMatch(notificationCenter, /notification\?\.close/);
  assert.doesNotMatch(
    notificationCenter,
    /\.redundancy-alert-notification\.el-notification\s*\{[^}]*border-left:/,
  );
  assert.match(notificationCenter, /class="notice-count"/);
  assert.match(notificationCenter, /class="notice-icon"/);
  assert.match(notificationCenter, /class="notice-chevron"/);
  assert.match(notificationCenter, /class="notice-footer"/);
  assert.match(notificationCenter, /redundancy\.viewAllNotifications/);
  assert.doesNotMatch(
    notificationCenter,
    /class="notice-title"[\s\S]*redundancy\.viewAll/,
  );
  assert.doesNotMatch(notificationCenter, /border-left:\s*[1-9]/);
});

test("通知中心弹层通过短间距和可见箭头衔接铃铛", async () => {
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );

  assert.match(notificationCenter, /:offset="6"/);
  assert.match(notificationCenter, /:show-arrow="true"/);
  assert.match(
    notificationCenter,
    /\.redundancy-notification-popover\.el-popover\.el-popper\s*\{[\s\S]*overflow:\s*visible/,
  );
});

test("通知中心固定展示四条高度且仅中间异常列表滚动", async () => {
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );

  assert.match(notificationCenter, /v-for="event in store\.openEvents"/);
  assert.doesNotMatch(notificationCenter, /store\.openEvents\.slice/);
  assert.match(
    notificationCenter,
    /\.notice-list\s*\{[\s\S]*max-height:\s*348px;[\s\S]*overflow-y:\s*auto;/,
  );
  assert.doesNotMatch(
    notificationCenter,
    /\.redundancy-notification-popover[\s\S]*overflow-y:\s*auto/,
  );
});

test("通知中心铃铛覆盖全局按钮压缩样式并保持清晰点击区域", async () => {
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );

  assert.match(
    notificationCenter,
    /\.notification-trigger\.el-button\s*\{[\s\S]*width:\s*34px;[\s\S]*height:\s*34px;[\s\S]*padding:\s*0;[\s\S]*font-size:\s*20px;/,
  );
  assert.match(
    notificationCenter,
    /\.notification-trigger\.el-button[\s\S]*svg\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/,
  );
});

test("通知铃铛与语言图标垂直居中且数字角标采用紧凑尺寸", async () => {
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );

  assert.match(
    notificationCenter,
    /\.notification-badge\s*\{[\s\S]*--el-badge-size:\s*16px;[\s\S]*--el-badge-font-size:\s*10px;[\s\S]*--el-badge-padding:\s*4px;[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;/,
  );
  assert.doesNotMatch(
    notificationCenter,
    /\.notification-badge\s*\{[^}]*margin-top:/,
  );
});

test("冗余菜单紧跟负载均衡且页面滚动由内部表格持有", async () => {
  const menus = await readSource("src/stores/mainLeftMenusStore.js");
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const events = await readSource(
    "src/views/Main/RedundancyView/RedundancyEventsView.vue",
  );
  const loadBalancerIndex = menus.search(/id:\s*["']loadBalancer["']/);
  const redundancyIndex = menus.search(/id:\s*["']redundancy["']/);
  const maintenanceLogIndex = menus.search(/id:\s*["']maintenanceLog["']/);

  assert.ok(loadBalancerIndex < redundancyIndex);
  assert.ok(redundancyIndex < maintenanceLogIndex);
  assert.match(management, /\.redundancy-page\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(
    management,
    /class="redundancy-manager"[\s\S]*class="redundancy-detail"/,
  );
  assert.match(events, /:page-sizes="\[15, 30, 50, 100\]"/);
  assert.match(events, /class="search-button"/);
  assert.match(events, /IEpArrowLeft/);
  assert.doesNotMatch(events, /IEpRefresh/);
  assert.match(events, /event\.isComposing/);
  assert.match(events, /\.events-page\s*\{[\s\S]*overflow:\s*hidden/);
});

test("冗余配置列表采用负载均衡工具栏密度并默认显示五条", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const mainLayout = await readSource("src/views/Main/MainIndex.vue");

  assert.match(
    mainLayout,
    /route\.name === ["']redundancy["'][\s\S]*redundancy-layout/,
  );
  assert.match(management, /class="button"/);
  assert.match(management, /class="search-box"/);
  assert.match(management, /class="search-input"/);
  assert.match(management, /:page-sizes="\[5, 10, 20, 50\]"/);
  assert.match(
    management,
    /\.configuration-table[\s\S]*\.custom-row[\s\S]*height:\s*40px/,
  );
  assert.match(
    management,
    /\.redundancy-manager\s+:deep\(\.table-container\)[\s\S]*min-height:\s*0/,
  );
  assert.match(
    management,
    /\.redundancy-manager[\s\S]*flex:\s*0 0 calc\(50% - 6px\)/,
  );
});

test("冗余标题和操作区位于表格容器外并复用负载均衡标题规格", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );

  assert.match(management, /import CustomCard from/);
  assert.match(
    management,
    /<CustomCard[\s\S]*:title="t\('redundancy\.management'\)"[\s\S]*icon-name="redundancy"[\s\S]*class="redundancy-manager"[\s\S]*<header class="toolbar">[\s\S]*<CustomStyleTable/,
  );
  assert.match(
    management,
    /<CustomCard[\s\S]*:title="t\('redundancy\.configurationDetail'\)"[\s\S]*class="redundancy-detail"/,
  );
  assert.doesNotMatch(management, /<header class="page-title">/);
});

test("冗余列表默认突出当前配置且详情只跟随选中项显示", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const store = await readSource(
    "src/stores/redundancyStore.js",
  );

  assert.match(
    store,
    /selectedId\.value\s*=\s*configurations\.value\[0\]\?\.redundancyId/,
  );
  assert.match(
    management,
    /const liveDetail = computed\([\s\S]*store\.selectedId/,
  );
  assert.match(management, /function configurationRowClass\(\{ row \}\)/);
  assert.match(management, /:cal-row-class-name="configurationRowClass"/);
  assert.match(management, /selected-redundancy-row/);
});

test("冗余工具栏提供语义图标和全局事件入口并移除重复操作列", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );

  for (const icon of [
    "IEpCirclePlus",
    "IEpEdit",
    "IEpCircleCheck",
    "IEpCircleClose",
    "IEpGrid",
    "IEpSwitch",
    "IEpDeleteFilled",
    "IEpBell",
  ]) {
    assert.match(management, new RegExp(`<${icon}`));
  }
  assert.equal((management.match(/<el-icon class="mr-6">/g) || []).length, 8);
  const toolbar = management.slice(
    management.indexOf('<div class="button">'),
    management.indexOf('<div class="search-box">'),
  );
  assert.ok(
    toolbar.indexOf('t("redundancy.switchNode")') <
      toolbar.indexOf('t("delete")'),
  );
  assert.ok(
    toolbar.indexOf('t("delete")') <
      toolbar.indexOf('t("redundancy.appManagement")'),
  );
  assert.ok(
    toolbar.indexOf('t("redundancy.appManagement")') <
      toolbar.indexOf('t("redundancy.eventRecords")'),
  );
  assert.match(
    management,
    /router\.push\(\{ name: ["']redundancyEvents["'] \}\)/,
  );
  assert.doesNotMatch(management, /class="refresh-button"/);
  assert.doesNotMatch(management, /async function refresh\(\)/);
  assert.doesNotMatch(management, /:label="t\('operation'\)"/);
});

test("四套语言资源都包含完整冗余命名空间", async () => {
  for (const locale of ["zh", "en", "ja", "ko"]) {
    const source = await readSource(`src/i18n/i18nLaguage/${locale}.js`);
    assert.match(source, /redundancy:\s*\{/);
    assert.match(source, /notificationCenter:/);
    assert.match(source, /currentAbnormalCount:/);
    assert.match(source, /viewAllNotifications:/);
    assert.match(source, /eventRecords:/);
  }
});

test("状态联合函数可以处理 Pinia 响应式代理对象", async () => {
  const { joinResourceStatus } = await import(
    "../src/utils/redundancyUtils.js"
  );
  const detail = new Proxy(
    {
      nodes: {
        primary: { nodeId: "node-1", apps: [{ appId: "app-1" }] },
        standby: { nodeId: "node-2", apps: [] },
      },
    },
    {},
  );

  assert.doesNotThrow(() => joinResourceStatus(detail, []));
  const merged = joinResourceStatus(detail, [
    {
      nodeId: "node-1",
      nodeStatus: "running",
      address: "192.168.3.32",
      apps: [],
    },
  ]);
  assert.equal(merged.nodes.primary.online, true);
  assert.equal(merged.nodes.primary.nodeIp, "192.168.3.32");
});

test("冗余 APP 列表按系统既有定义显示本地化工程类型", async () => {
  const { getProjectTypeText } = await import(
    "../src/utils/redundancyUtils.js"
  );
  const appDialog = await readSource(
    "src/components/Redundancy/AppManagerDialog.vue",
  );

  assert.equal(
    getProjectTypeText(0, (key) => key),
    "calculationProject",
  );
  assert.equal(
    getProjectTypeText(1, (key) => key),
    "clientProject",
  );
  assert.equal(
    getProjectTypeText("2", (key) => key),
    "collectProject",
  );
  assert.equal(
    getProjectTypeText(3, (key) => key),
    "dataSourceProject",
  );
  assert.equal(
    getProjectTypeText(4, (key) => key),
    "alarmProject",
  );
  assert.equal(
    getProjectTypeText(99, (key) => key),
    "99",
  );
  assert.equal(
    getProjectTypeText(null, (key) => key),
    "—",
  );
  assert.equal(
    (appDialog.match(/getProjectTypeText\(row\.projectType, t\)/g) || [])
      .length,
    2,
  );
});

test("冗余事件状态使用正确的语义色", async () => {
  const { getRedundancyStatusTagType } = await import(
    "../src/utils/redundancyUtils.js"
  );

  assert.equal(getRedundancyStatusTagType("OPEN"), "danger");
  assert.equal(getRedundancyStatusTagType("RECOVERED"), "info");
  assert.equal(getRedundancyStatusTagType("NORMAL"), "success");
});

test("冗余配置节点卡片展示状态、地址和服务端口", async () => {
  const { getNodeConnectionDetails } = await import(
    "../src/utils/redundancyUtils.js"
  );
  const translations = {
    "redundancy.nodeStatus": "节点状态",
    "redundancy.nodeAddress": "节点地址",
    "redundancy.servicePort": "服务端口",
    online: "在线",
    offline: "离线",
  };
  const translate = (key) => translations[key] || key;

  assert.deepEqual(
    getNodeConnectionDetails(
      {
        nodeStatus: "running",
        address: "192.168.3.32",
        port: 13000,
      },
      translate,
    ),
    [
      { key: "status", label: "节点状态", value: "在线", online: true },
      {
        key: "address",
        label: "节点地址",
        value: "192.168.3.32",
      },
      { key: "port", label: "服务端口", value: "13000" },
    ],
  );

  const dialog = await readSource(
    "src/components/Redundancy/ConfigDialog.vue",
  );
  assert.match(dialog, /class="node-card-header"/);
  assert.match(dialog, /class="node-detail-grid"/);
  assert.equal(
    (
      dialog.match(
        /getNodeConnectionDetails\((?:primaryNode|standbyNode), t\)/g,
      ) || []
    ).length,
    2,
  );
  assert.match(dialog, /class="standby-connector"/);
});

test("当前异常弹窗只查询所选冗余的未恢复事件", async () => {
  const redundancyUtils = await import(
    "../src/utils/redundancyUtils.js"
  );

  assert.equal(typeof redundancyUtils.createCurrentExceptionQuery, "function");
  assert.deepEqual(
    redundancyUtils.createCurrentExceptionQuery("redundancy-1"),
    {
      redundancyId: "redundancy-1",
      status: "OPEN",
    },
  );
});

test("当前异常弹窗静默同步 Store 的实时事件", async () => {
  const { selectCurrentOpenEvents } = await import(
    "../src/utils/redundancyUtils.js"
  );
  const events = [
    { eventId: "1", redundancyId: "redundancy-1", status: "OPEN" },
    { eventId: "2", redundancyId: "redundancy-2", status: "OPEN" },
    { eventId: "3", redundancyId: "redundancy-1", status: "RECOVERED" },
  ];

  assert.deepEqual(selectCurrentOpenEvents(events, "redundancy-1"), [
    events[0],
  ]);
});

test("当前异常弹窗默认分页十条并保持十行表格高度", async () => {
  const dialog = await readSource(
    "src/components/Redundancy/CurrentExceptionDialog.vue",
  );
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );

  assert.match(dialog, /\.exception-table-region\s*\{[\s\S]*height:\s*520px;/);
  assert.match(dialog, /max-height="100%"/);
  assert.doesNotMatch(dialog, /Math\.min\(Math\.max\(rows\.value\.length/);
  assert.doesNotMatch(dialog, /:show-pagination="false"/);
  assert.match(dialog, /:page-sizes="\[10\]"/);
  assert.match(
    dialog,
    /<el-table-column[\s\S]*?type="index"[\s\S]*?:label="t\('index'\)"/,
  );
  assert.match(dialog, /redundancy\.exceptionContent/);
  assert.match(dialog, /redundancy\.occurredAt/);
  assert.match(dialog, /t\('operation'\)|t\("operation"\)/);
  assert.match(dialog, /:title="t\('redundancy\.exceptionEvents'\)"/);
  assert.doesNotMatch(dialog, /class="exception-dialog-summary"/);
  assert.doesNotMatch(dialog, /redundancy\.recoveredAt/);
  assert.doesNotMatch(dialog, /redundancy\.reasonCode/);
  assert.match(management, /<CurrentExceptionDialog/);
  assert.match(management, /@click="openCurrentExceptions"/);
});

test("冗余模块的八个业务表格统一使用模块级居中样式", async () => {
  const tableFiles = [
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
    "src/views/Main/RedundancyView/RedundancyEventsView.vue",
    "src/components/Redundancy/ConfigDialog.vue",
    "src/components/Redundancy/NodeAppPanel.vue",
    "src/components/Redundancy/AppManagerDialog.vue",
    "src/components/Redundancy/OperationTaskDrawer.vue",
    "src/components/Redundancy/CurrentExceptionDialog.vue",
  ];
  let tableCount = 0;
  let centeredTableCount = 0;

  for (const tableFile of tableFiles) {
    const source = await readSource(tableFile);
    tableCount += (source.match(/<CustomStyleTable\b/g) || []).length;
    centeredTableCount += (
      source.match(/table-class="redundancy-centered-table"/g) || []
    ).length;
  }

  const management = await readSource(tableFiles[0]);
  const events = await readSource(tableFiles[1]);
  const centeredStyles = await readSource(
    "src/styles/redundancy-tables.scss",
  ).catch(() => "");

  assert.equal(tableCount, 8);
  assert.equal(centeredTableCount, tableCount);
  assert.match(management, /redundancy-tables\.scss/);
  assert.match(events, /redundancy-tables\.scss/);
  assert.match(
    centeredStyles,
    /\.redundancy-centered-table[\s\S]*\.el-table__cell[\s\S]*text-align:\s*center/,
  );
});

test("冗余操作消息使用模块专属样式并保持视口顶部居中", async () => {
  const messageHelper = await readSource(
    "src/utils/redundancyMessage.js",
  ).catch(() => "");
  const centeredStyles = await readSource(
    "src/styles/redundancy-tables.scss",
  );
  const messageFiles = [
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
    "src/views/Main/RedundancyView/RedundancyEventsView.vue",
    "src/components/Redundancy/ConfigDialog.vue",
    "src/components/Redundancy/AppManagerDialog.vue",
    "src/components/Redundancy/CurrentExceptionDialog.vue",
  ];

  assert.match(messageHelper, /customClass:\s*["']redundancy-message["']/);
  assert.match(messageHelper, /ElMessage\(createRedundancyMessageOptions/);
  assert.match(
    centeredStyles,
    /\.el-message\.redundancy-message\.is-center\s*\{[\s\S]*right:\s*auto;[\s\S]*margin:\s*0;/,
  );

  for (const messageFile of messageFiles) {
    const source = await readSource(messageFile);
    assert.match(source, /showRedundancyMessage/);
    assert.doesNotMatch(source, /ElMessage(?:\.|\()/);
  }
});

test("点击异常通知进入冗余管理并优先选中事件所属配置", async () => {
  const { createRedundancyManagementLocation, resolveRedundancySelectionId } =
    await import("../src/utils/redundancyUtils.js");
  const notificationCenter = await readSource(
    "src/components/Redundancy/RedundancyNotificationCenter.vue",
  );
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const configurations = [
    { redundancyId: "redundancy-1" },
    { redundancyId: "redundancy-2" },
  ];

  assert.deepEqual(createRedundancyManagementLocation("redundancy-2"), {
    name: "redundancy",
    query: { redundancyId: "redundancy-2" },
  });
  assert.equal(
    resolveRedundancySelectionId(
      configurations,
      "redundancy-2",
      "redundancy-1",
    ),
    "redundancy-2",
  );
  assert.equal(
    resolveRedundancySelectionId(configurations, "missing", "redundancy-1"),
    "redundancy-1",
  );

  const openEvent = notificationCenter.slice(
    notificationCenter.indexOf("async function openEvent"),
    notificationCenter.indexOf("/** 打开全部冗余异常事件。 */"),
  );
  assert.match(openEvent, /async function openEvent/);
  assert.match(openEvent, /await router\.push/);
  assert.match(openEvent, /store\.loadDetail\(event\.redundancyId\)/);
  assert.match(openEvent, /createRedundancyManagementLocation/);
  assert.doesNotMatch(openEvent, /redundancyEvents/);
  assert.match(management, /const route = useRoute\(\)/);
  assert.match(management, /requestedSelectionId/);
  assert.match(management, /store\.loadList\(\{\s*requestedSelectionId/);
  assert.match(management, /watch\(\s*requestedSelectionId/);
});

test("冗余详情采用横向紧凑布局并补全 APP 工程信息", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const nodePanel = await readSource(
    "src/components/Redundancy/NodeAppPanel.vue",
  );

  assert.match(management, /class="configuration-summary"/);
  assert.match(management, /class="standby-bridge"/);
  assert.match(management, /side="primary"/);
  assert.match(management, /side="standby"/);
  assert.doesNotMatch(management, /<aside>/);
  assert.match(nodePanel, /getProjectTypeText/);
  assert.match(nodePanel, /prop="projectType"/);
  assert.match(nodePanel, /prop="port"/);
  assert.match(nodePanel, /function appRowClassName/);
  assert.match(nodePanel, /active-abnormal-row/);
});

test("冗余实时连接启用开发代理转发并记录安全的断线原因", async () => {
  const viteConfig = await readSource("vite.config.js");
  const nginxConfig = await readFile(
    new URL(
      "../../KingFusion3.6_Center/kingdevopscenter/www/nginx/win64/KingNginx.conf",
      import.meta.url,
    ),
    "utf8",
  );
  const socket = await readSource(
    "src/api/redundancySocket.js",
  );

  assert.match(viteConfig, /['"]\/opscenter['"]:\s*\{[\s\S]*?ws:\s*true/);
  assert.match(
    nginxConfig,
    /location \/opscenter\/ \{[\s\S]*?proxy_http_version 1\.1;[\s\S]*?proxy_set_header Upgrade \$http_upgrade;[\s\S]*?proxy_set_header Connection "upgrade";/,
  );
  assert.match(socket, /this\.socket\.onclose\s*=\s*\(event\)\s*=>/);
  assert.match(socket, /logUnexpectedClose\(event, this\.retryCount\)/);
  assert.match(socket, /code:\s*event\.code/);
  assert.match(socket, /reason:\s*event\.reason/);
  assert.match(socket, /wasClean:\s*event\.wasClean/);
  assert.doesNotMatch(socket, /console\.(?:warn|error)\([^\n]*access_token/);
});

test("冗余操作任务按真实阶段推进并在失败阶段停止", async () => {
  const {
    createTrackedOperationTask,
    getOperationTaskStages,
    mergeOperationTask,
  } = await import("../src/utils/operationTaskProgress.js");
  let task = createTrackedOperationTask({
    requestId: "request-1",
    operationType: "SWITCH",
    redundancyId: "redundancy-1",
    startedAt: "2026-09-04T14:00:00.000Z",
  });

  assert.deepEqual(
    getOperationTaskStages(task).map((stage) => stage.state),
    ["wait", "wait", "wait"],
  );
  task = mergeOperationTask(task, {
    requestId: "request-1",
    taskId: "task-1",
    status: "RUNNING",
    currentStage: "STOP_SOURCE_APPS",
  });
  assert.deepEqual(
    getOperationTaskStages(task).map((stage) => stage.state),
    ["process", "wait", "wait"],
  );
  task = mergeOperationTask(task, {
    taskId: "task-1",
    status: "RUNNING",
    currentStage: "START_TARGET_APPS",
  });
  task = mergeOperationTask(task, {
    taskId: "task-1",
    status: "FAILED",
    currentStage: "FAILED",
    failureMessage: "start failed",
  });
  assert.deepEqual(
    getOperationTaskStages(task).map((stage) => stage.state),
    ["success", "success", "error"],
  );
  assert.equal(task.failedStage, "START_TARGET_APPS");
  task = mergeOperationTask(task, {
    taskId: "task-1",
    status: "RUNNING",
    currentStage: "SYNC_ROLES",
  });
  assert.equal(task.status, "FAILED");
  assert.equal(task.failedStage, "START_TARGET_APPS");
});

test("强制切换任务将离线原节点阶段标记为已跳过", async () => {
  const { getOperationTaskStages, getOperationSkippedActions } = await import(
    "../src/utils/operationTaskProgress.js"
  );
  const drawer = await readSource(
    "src/components/Redundancy/OperationTaskDrawer.vue",
  );
  const task = {
    operationType: "SWITCH",
    status: "RUNNING",
    currentStage: "SYNC_ROLES",
    input: {
      skippedActions: [
        {
          action: "STOP_SOURCE_APPS",
          nodeId: "node-1",
          reasonCode: "SOURCE_NODE_OFFLINE",
        },
        {
          action: "CONFIRM_SOURCE_ROLE",
          nodeId: "node-1",
          reasonCode: "SOURCE_NODE_OFFLINE",
        },
      ],
    },
  };

  assert.deepEqual(getOperationSkippedActions(task), task.input.skippedActions);
  assert.deepEqual(getOperationTaskStages(task)[0], {
    key: "STOP_SOURCE_APPS",
    state: "success",
    skipped: true,
    nodeId: "node-1",
    reasonCode: "SOURCE_NODE_OFFLINE",
  });

  const skippedStep = drawer.slice(
    drawer.indexOf('<template #title>'),
    drawer.indexOf('</el-step>'),
  );
  const titleSlot = skippedStep.slice(
    skippedStep.indexOf('<template #title>'),
    skippedStep.indexOf('</template>'),
  );
  const descriptionSlot = skippedStep.slice(
    skippedStep.indexOf('#description'),
    skippedStep.lastIndexOf('</template>'),
  );
  assert.doesNotMatch(titleSlot, /<el-tag/);
  assert.match(descriptionSlot, /<el-tag[\s\S]*redundancy\.skipped/);
  assert.doesNotMatch(descriptionSlot, /offlineSourceStageSkipped/);
});

test("冗余操作任务只合并当前任务的 APP 步骤并复用节点 APP 名称", async () => {
  const {
    createTrackedOperationTask,
    mergeOperationAppStep,
    resolveOperationAppName,
  } = await import("../src/utils/operationTaskProgress.js");
  let task = createTrackedOperationTask({
    requestId: "request-2",
    operationType: "ENABLE",
    redundancyId: "redundancy-1",
  });
  task = { ...task, taskId: "task-2" };
  task = mergeOperationAppStep(task, {
    stepId: "step-1",
    taskId: "task-2",
    nodeId: "node-1",
    appId: "app-1",
    commandStatus: "PENDING",
  });
  task = mergeOperationAppStep(task, {
    stepId: "step-1",
    taskId: "task-2",
    nodeId: "node-1",
    appId: "app-1",
    commandStatus: "SUCCEEDED",
  });
  task = mergeOperationAppStep(task, {
    stepId: "step-other",
    taskId: "task-other",
    appId: "app-other",
  });

  assert.equal(task.appSteps.length, 1);
  assert.equal(task.appSteps[0].commandStatus, "SUCCEEDED");
  assert.equal(
    resolveOperationAppName(task.appSteps[0], [
      {
        nodeId: "node-1",
        apps: [{ appId: "app-1", appName: "KIO" }],
      },
    ]),
    "KIO",
  );
});

test("新增 APP 步骤才跟随最新项，状态更新不打断当前滚动", async () => {
  const { shouldFollowLatestAppStep } = await import(
    "../src/utils/operationTaskProgress.js"
  );

  assert.equal(shouldFollowLatestAppStep(1, 2), true);
  assert.equal(shouldFollowLatestAppStep(2, 2), false);
  assert.equal(shouldFollowLatestAppStep(2, 1), false);
});

test("批量 APP 进度区分已返回、确认中、失败和未确认", async () => {
  const { getOperationAppProgress } = await import(
    "../src/utils/operationTaskProgress.js"
  );
  const task = {
    operationType: "SWITCH",
    status: "RUNNING",
    currentStage: "START_TARGET_APPS",
    appSteps: [
      ...Array.from({ length: 8 }, (_, index) => ({
        stepId: `success-${index}`, action: "START", commandStatus: "SUCCEEDED",
      })),
      { stepId: "failed", action: "START", commandStatus: "FAILED" },
      { stepId: "unknown", action: "START", commandStatus: "UNKNOWN" },
      ...Array.from({ length: 7 }, (_, index) => ({
        stepId: `pending-${index}`, action: "START", commandStatus: "PENDING",
      })),
      { stepId: "old-stop", action: "STOP", commandStatus: "SUCCEEDED" },
    ],
  };

  assert.deepEqual(getOperationAppProgress(task), {
    action: "START", total: 17, returned: 10, succeeded: 8, failed: 1,
    unknown: 1, observing: 0, pending: 7, completed: 10, running: true,
  });
});

test("生效与切换接入实时任务抽屉且失效保持轻量反馈", async () => {
  const store = await readSource(
    "src/stores/redundancyStore.js",
  );
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const drawer = await readSource(
    "src/components/Redundancy/OperationTaskDrawer.vue",
  );

  assert.match(store, /REDUNDANCY_TASK_CHANGED[\s\S]*applyTaskUpdate/);
  assert.match(store, /REDUNDANCY_TASK_APP_CHANGED[\s\S]*applyTaskAppUpdate/);
  assert.match(store, /redundancyAPI\.task\(redundancyId, taskId\)/);
  assert.match(management, /executeTracked\("ENABLE"/);
  assert.match(management, /executeTracked\("SWITCH"/);
  assert.doesNotMatch(management, /executeTracked\("DISABLE"/);
  assert.match(management, /window\.setTimeout\([\s\S]*1500/);
  assert.match(drawer, /<el-steps/);
  assert.match(drawer, /getOperationTaskStages/);
  assert.match(drawer, /resolveOperationAppName/);
  assert.match(drawer, /:max-height="taskTableHeight"/);
});

test("四套语言资源完整覆盖操作进度界面", async () => {
  for (const locale of ["zh", "en", "ja", "ko"]) {
    const source = await readSource(`src/i18n/i18nLaguage/${locale}.js`);
    for (const key of [
      "taskProgress",
      "stageStopInactiveApps",
      "stageSyncRoles",
      "stageStartActiveApps",
      "stageStopSourceApps",
      "stageStartTargetApps",
      "waitingForAppSteps",
      "batchStartingApps",
      "batchStoppingApps",
      "waitingForAgentBatchResult",
      "confirmingObservedAppState",
      "returnedAppResults",
      "batchResultSummary",
      "unconfirmedAppResult",
      "OBSERVING",
      "enableSucceeded",
      "disableSucceeded",
      "switchSucceeded",
    ]) {
      assert.match(source, new RegExp(`${key}:`));
    }
  }
});

test("批量结果等待文案不向用户暴露运维代理实现", async () => {
  const localeModules = await Promise.all(
    ["zh", "en", "ja", "ko"].map((locale) =>
      import(`../src/i18n/i18nLaguage/${locale}.js`),
    ),
  );
  const expected = [
    "等待批量执行结果",
    "Waiting for batch execution results",
    "一括実行結果を待機中",
    "일괄 실행 결과 대기 중",
  ];

  assert.deepEqual(
    localeModules.map(
      ({ default: messages }) =>
        messages.redundancy.waitingForAgentBatchResult,
    ),
    expected,
  );
});

test("操作任务确认状态列为完整标签预留足够宽度", async () => {
  const drawer = await readSource(
    "src/components/Redundancy/OperationTaskDrawer.vue",
  );

  assert.match(
    drawer,
    /<el-table-column :label="t\('status'\)" width="120">/,
  );
  assert.match(
    drawer,
    /prop="displayMessage"[\s\S]*?min-width="133"/,
  );
});

test("冗余配置详情不展示内部 revision", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );
  const template = management.slice(
    management.indexOf("<template>"),
    management.lastIndexOf("</template>") + "</template>".length,
  );

  assert.doesNotMatch(template, /redundancy\.revision/);
  assert.doesNotMatch(template, /liveDetail\.revision/);
});

// modified by jinlong.feng at 2026-10-14 冗余配置生效时间显示
test("冗余配置详情仅在配置已生效时显示生效时间", async () => {
  const management = await readSource(
    "src/views/Main/RedundancyView/RedundancyManagementView.vue",
  );

  assert.match(
    management,
    /<template v-if="liveDetail\.lifecycle === 'ENABLED'">[\s\S]*?redundancy\.effectiveTime[\s\S]*?formatDateTime\(liveDetail\.updatedAt, locale\)[\s\S]*?<\/template>/,
  );
});
// end

// modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称
test("冗余 APP 表格的工程类型显示为名称而不是编码", async () => {
  for (const file of [
    "src/components/Redundancy/ConfigDialog.vue",
    "src/components/Redundancy/AppManagerDialog.vue",
    "src/components/Redundancy/NodeAppPanel.vue",
  ]) {
    const source = await readSource(file);

    assert.match(
      source,
      /getProjectTypeText\(row\.projectType, t\)/,
      `${file} 未把工程类型编码转换成名称`,
    );
  }

  // 配置弹窗的 APP 配置步骤曾用 prop 直接渲染编码，这里锁定不再出现自闭合写法
  const configDialog = await readSource(
    "src/components/Redundancy/ConfigDialog.vue",
  );
  assert.doesNotMatch(
    configDialog,
    /prop="projectType"[\s\S]{0,120}?\/>/,
    "ConfigDialog 的工程类型列又改回直接渲染编码了",
  );
  assert.match(
    configDialog,
    /prop="projectType"[\s\S]{0,200}?<template #default="\{ row \}">[\s\S]{0,120}?getProjectTypeText\(row\.projectType, t\)/,
  );
});
// end modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称
// end
