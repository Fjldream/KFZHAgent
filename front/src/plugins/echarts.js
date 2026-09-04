import ECharts from 'vue-echarts';
import { use } from 'echarts/core';

// 渲染器
import { CanvasRenderer } from 'echarts/renderers';

// 图表类型
import { LineChart } from 'echarts/charts';

// 组件
import { GridComponent, TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';

// 注册组件到 ECharts 核心
use([CanvasRenderer, LineChart, GridComponent, TitleComponent, TooltipComponent, LegendComponent]);

export default ECharts;
