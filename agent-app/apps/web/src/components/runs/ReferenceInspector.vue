<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
defineProps<{ active: string }>();
const emit = defineEmits<{ action: [] }>();
</script>
<template><div class="insp-body">

        <div class="insp-pane on" v-show="active === 'plan'">
          <span class="task-badge tb-inside">T13</span>
          <div class="insp-card">
            <h4>当前方案</h4>
            <div class="kv"><span class="k">页面</span><span class="v">能耗对比（1 页）</span></div>
            <div class="kv"><span class="k">生成模式</span><span class="v">图生工程</span></div>
            <div class="kv"><span class="k">基线版本</span><span class="v">v1.3</span></div>
            <div class="kv"><span class="k">planHash</span><span class="v mono">a3f9…c21e ✓已签名</span></div>
            <div class="kv"><span class="k">分析版本</span><span class="v mono">9f2a…01cc</span></div>
          </div>
          <div class="insp-card">
            <h4>控件清单（12）</h4>
            <div class="ctrl-list">
              <div class="row"><span>卡片容器</span><span>×3 · 已验证</span></div>
              <div class="row"><span>XY 曲线</span><span>×1 · 未验证</span></div>
              <div class="row"><span>表格</span><span>×2 · 已验证</span></div>
              <div class="row"><span>按钮</span><span>×2 · 已验证</span></div>
              <div class="row"><span>容器·导航/侧栏</span><span>×2 · 已验证</span></div>
              <div class="row"><span>文本</span><span>×2 · 已验证</span></div>
            </div>
          </div>
        </div>

        <div class="insp-pane on" v-show="active === 'project'">
          <div class="insp-card">
            <h4>工程结构</h4>
            <div class="tree">
              <div class="t-node"><span class="t-ico">📁</span>水处理监控工程</div>
              <div class="t-node sub"><span class="t-ico">📄</span>能耗对比（生成中…）</div>
              <div class="t-node sub"><span class="t-ico">🖼</span>res/images（1 项素材）</div>
              <div class="t-node sub"><span class="t-ico">⚙️</span>交互脚本（2 项）</div>
            </div>
            <div class="note-ok">✓ 参考图（reference）未打包进工程，仅业务素材（material）进入资源目录</div>
          </div>
          <div class="insp-card">
            <h4>构建状态</h4>
            <div class="kv"><span class="k">工作区锁</span><span class="v">本会话持有</span></div>
            <div class="kv"><span class="k">构建队列</span><span class="v">方案确认后入队</span></div>
            <div class="kv"><span class="k">stale-base 检测</span><span class="v">已启用</span></div>
          </div>
        </div>

        <div class="insp-pane on" v-show="active === 'revision'">
          <span class="task-badge tb-inside">T17</span>
          <div class="insp-card" style="background:transparent;border:none;padding:0">
            <div class="rev-item">
              <div class="rev-top"><span class="rv">v1.4</span><span class="tag-src">来自「锅炉监控大屏」</span><span class="cur">最新</span></div>
              <div class="rev-vb"><span class="mini-v g">schema ✓</span><span class="mini-v g">compiled ✓</span><span class="mini-v n">runtime –</span></div>
              <div class="rev-actions"><button type="button" @click="emit('action')" class="mini-btn">下载</button><button type="button" @click="emit('action')" class="mini-btn">检查</button><button type="button" @click="emit('action')" class="mini-btn link">从这里开始对话</button></div>
            </div>
            <div class="rev-item current">
              <div class="rev-top"><span class="rv">v1.3</span><span class="tag-src">本会话</span><span class="cur">本轮基线</span></div>
              <div class="rev-vb"><span class="mini-v g">schema ✓</span><span class="mini-v g">compiled ✓</span><span class="mini-v y">visual ⚠</span></div>
              <div class="rev-actions"><button type="button" @click="emit('action')" class="mini-btn">下载</button><button type="button" @click="emit('action')" class="mini-btn">检查</button><button type="button" @click="emit('action')" class="mini-btn link">从这里开始对话</button></div>
            </div>
            <div class="rev-item">
              <div class="rev-top"><span class="rv">v1.2</span><span class="tag-src">10-16</span></div>
              <div class="rev-vb"><span class="mini-v g">schema ✓</span><span class="mini-v g">compiled ✓</span></div>
              <div class="rev-actions"><button type="button" @click="emit('action')" class="mini-btn">下载</button><button type="button" @click="emit('action')" class="mini-btn link">从这里开始对话</button></div>
            </div>
            <div class="rev-item">
              <div class="rev-top"><span class="rv">v1.0</span><span class="tag-src">历史导入</span></div>
              <div class="rev-note">无生成快照（snapshot）· 局部修改不可用，可「重新规划可编辑版本」</div>
              <div class="rev-actions"><button type="button" @click="emit('action')" class="mini-btn">下载</button><button type="button" @click="emit('action')" class="mini-btn link">重新规划</button></div>
            </div>
          </div>
        </div>

        <div class="insp-pane on" v-show="active === 'usage'">
          <span class="task-badge tb-inside">T01/T02</span>
          <div class="usage-num">
            <div class="unum"><div class="n">5<small>/8</small></div><div class="d">模型调用 / 预算</div></div>
            <div class="unum"><div class="n">¥0.42</div><div class="d">费用估算 · 2026-10a 价</div></div>
            <div class="unum"><div class="n">42.3k<small>/120k</small></div><div class="d">输入 token</div></div>
            <div class="unum"><div class="n">6.1k<small>/80k</small></div><div class="d">输出 token</div></div>
          </div>
          <div class="insp-card">
            <h4>本轮预算（RunBudget）</h4>
            <div class="usage-bars">
              <div class="ubar"><div class="lbl"><span>物理调用</span><b>5 / 8</b></div><div class="track"><div class="fill orange" style="width:62%"></div></div></div>
              <div class="ubar"><div class="lbl"><span>缓存命中</span><b>71%</b></div><div class="track"><div class="fill green" style="width:71%"></div></div></div>
              <div class="ubar"><div class="lbl"><span>修复调用</span><b>1 / 1</b></div><div class="track"><div class="fill" style="width:100%"></div></div></div>
            </div>
          </div>
          <div class="unknown-note">⚠ 1 次调用 usage 未知（provider 未返回），已按保守上限占用预算；费用为估算值，非账单。</div>
          <div class="insp-card">
            <h4>调用明细</h4>
            <div class="ctrl-list">
              <div class="row"><span>视觉结构分析</span><span>缓存命中 · 0 次</span></div>
              <div class="row"><span>方案生成 ×2</span><span>42.3k → 6.1k</span></div>
              <div class="row"><span>决策摘要</span><span>1.8k → 0.4k</span></div>
              <div class="row"><span>组件实施（执行中）</span><span>—</span></div>
            </div>
          </div>
        </div></div></template>
<!-- end -->

