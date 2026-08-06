import "./styles/tokens.css";
import "./styles/base.css";
import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { useSession } from "./stores/session";

const app = createApp(App);
app.use(createAppRouter());
app.mount("#app");
// 会话恢复不阻塞首屏渲染；失败时由路由守卫把用户带回登录页。
void useSession().restore();
