// 配置自定义icons
import './plugins/svg-icons-register.js'; // 必须放在最前面！
import { createApp } from 'vue';

// Pinia 相关
import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistence from 'pinia-plugin-persistedstate';

// 应用核心
import App from './App.vue';
import router from './router';
import i18n from '@/i18n/index.js';
// 样式
import './style.scss';
// echarts
import EChartsPlugin from '@/plugins/echarts';
import { dotSpinner } from 'ldrs';
dotSpinner.register();

const app = createApp(App);

// 初始化 Pinia
const pinia = createPinia();
pinia.use(piniaPluginPersistence);

// 创建应用

// 安装插件
app.use(pinia); // 状态管理
app.use(router); // 路由

app.use(i18n); // 国际化
app.component('ECharts', EChartsPlugin);
setActivePinia(pinia);

// 挂载应用
app.mount('#app');
