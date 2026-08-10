// 特殊节点 L5 验收工程：CustomCharts + TrendChart + AlarmWindow + BarChart + PieChart + XYChart。
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compileClientProject } from "../packages/domain-client/src/compile/client-compiler.js";
import { packageNativeClientProject } from "../packages/domain-client/src/package/native-client-package.js";

const build = { seed: "special-node-acceptance-20260810" };

const controls = [
  // CustomCharts：objectType=1 容器型，几何在 pageProperty
  {
    id: "CustomCharts1",
    type: "prototype",
    x: 12, y: 12, width: 460, height: 320,
    prototypeName: "CustomCharts",
    pageProperty: {
      name: "CustomCharts1",
      pagePos: { x: 12, y: 12 },
      pageSize: { width: 460, height: 320 },
      windowSize: { width: 1440, height: 900 },
    },
    objects: ['{"name":"echart","bordershow":false,"customChartsType":1,"leftTopPt":{"x":0,"y":0},"width":460,"height":320,"option":{"title":{"text":"供气占比","x":20,"y":0,"textStyle":{"color":"#fff","fontSize":18}},"color":["#37C6E5","#2F8DF4"],"tooltip":{"trigger":"item"},"series":[{"type":"pie","roseType":"radius","radius":["30%","50%"],"data":[{"name":"区域A","value":1200},{"name":"区域B","value":800},{"name":"区域C","value":1500},{"name":"区域D","value":900}],"label":{"normal":{"textStyle":{"color":"#fff"}}}}]},"scriptTxt":""}'],
    modlePrototype: { name: "", guid: "k" + "modle-custom", version: "1.0.0.1.1", type: 1 },
    region: "center",
    objectType: 1,
  },
  // TrendChart：图表型，几何在顶层
  {
    id: "TrendChart1",
    type: "prototype",
    x: 492, y: 12, width: 460, height: 320,
    prototypeName: "TrendChart",
    title: { show: true, text: "趋势图", textStyle: { color: "#fff", fontSize: 18 } },
    areas: [{
      top: 0, left: 0, width: 460, height: 320,
      series: [{ name: "曲线1", data: [120, 200, 150, 280, 190, 320, 260] }],
      xAxis: [{ show: true, data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] }],
      yAxis: [{ show: true }],
    }],
    areasNumStr: "1,0,0,0",
    chartComponentType: 2,
    trendMode: true,
    refreshFrequance: 1000,
  },
  // BarChart：图表型（title/areas 兜底测试）
  {
    id: "BarChart1",
    type: "prototype",
    x: 972, y: 12, width: 460, height: 320,
    prototypeName: "BarChart",
    chartComponentType: 3,
    title: { show: true, text: "柱状图", textStyle: { color: "#fff", fontSize: 18 } },
    areas: [{
      top: 0, left: 0, width: 460, height: 320,
      series: [{ name: "产量", data: [320, 450, 280, 510, 390, 460] }],
      xAxis: [{ show: true, data: ["一月", "二月", "三月", "四月", "五月", "六月"] }],
      yAxis: [{ show: true }],
    }],
  },
  // AlarmWindow：告警窗口
  {
    id: "AlarmWindow1",
    type: "prototype",
    x: 12, y: 352, width: 700, height: 300,
    prototypeName: "AlarmWindow",
    alarmWindowType: "实时报警窗",
    columns: [{ field: "alarmTime", title: "报警时间", width: 150, align: "center" }],
    dateSource: "KS",
    titleName: "实时报警",
  },
  // PieChart
  {
    id: "PieChart1",
    type: "prototype",
    x: 732, y: 352, width: 460, height: 300,
    prototypeName: "PieChart",
    chartComponentType: 4,
    title: { show: true, text: "饼图" },
    areas: [{
      top: 0, left: 0, width: 460, height: 300,
      series: [{ name: "占比", data: [{ name: "类别A", value: 350 }, { name: "类别B", value: 210 }, { name: "类别C", value: 140 }] }],
    }],
  },
  // XYChart
  {
    id: "XYChart1",
    type: "prototype",
    x: 1212, y: 352, width: 460, height: 300,
    prototypeName: "XYChart",
    chartComponentType: 5,
    title: { show: true, text: "XY曲线" },
    areas: [{
      top: 0, left: 0, width: 460, height: 300,
      series: [{ name: "样本", data: [10, 25, 18, 42, 30, 55, 47] }],
      xAxis: [{ show: true, data: ["点1", "点2", "点3", "点4", "点5", "点6", "点7"] }],
      yAxis: [{ show: true }],
    }],
  },
];

const ir = {
  schema: "kf-client-project-ir/v1",
  id: "special-node-acceptance",
  name: "特殊节点验收",
  version: "1.0.0.1",
  pages: [
    { id: "page-1", name: "特殊节点验收页", width: 1440, height: 900, controls: controls as never },
  ],
  variables: [],
};

const ws = await compileClientProject(ir as never, build);
const pkg = await packageNativeClientProject(ws.path);
const outDir = "/tmp/special-node-acceptance";
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "built-special-node.gz"), pkg);
console.log(`wrote ${path.join(outDir, "built-special-node.gz")} (${pkg.length} bytes)`);
