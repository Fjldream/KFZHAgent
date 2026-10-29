<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { ref } from "vue";
// 仅由开发环境显式 preview=workbench 加载，不参与真实工程交付。
const expanded = ref(true);
const activeRegion = ref<string | null>(null);
const emit = defineEmits<{ action: [event: MouseEvent] }>();
</script>
<template>


        <!-- 用户消息 + 参考图附件 T16 -->
        <div class="msg-user" data-task="T16">
          <div class="attach-tray">
            <div class="attach">
              <div class="thumb" style="background:linear-gradient(135deg,#cfe0f5,#a8c4e8)">
                <span style="font-size:22px">🖼</span>
              </div>
              <div class="meta"><span class="purpose-tag">参考图</span><span>dashboard-v2.png · 1.2 MB</span></div>
            </div>
            <div class="attach">
              <div class="thumb" style="background:linear-gradient(135deg,#d7ecd6,#b0d9ad)">
                <span style="font-size:22px">📊</span>
              </div>
              <div class="meta"><span class="purpose-tag material">业务素材</span><span>logo.png · 84 KB</span></div>
            </div>
          </div>
          <div class="bubble-user">参考这张图做一个能耗对比页面，顶部 3 个指标卡，中间趋势图，下面数据表。用我们现有的控件。</div>
          <div class="attach-note">参考图默认不打包进交付工程 · 仅业务素材进入资源目录</div>
        </div>

        <!-- 决策摘要 T15（decision.summary ≤600 字） -->
        <div class="msg-assistant" data-task="T15">
          <div class="bubble-ai">
            <div class="ds-label">📌 决策摘要</div>
            识别到 <b>7 个区域</b>：6 个可由现有 KF 控件实现（其中 5 个有 3.6 运行时验证证据），1 个（趋势图）当前仅有静态实现记录。截图未体现数据来源，需要你确认绑定方式。
          </div>
        </div>

        <!-- 运行时间线 T15 -->
        <div class="timeline-card" :class="{ open: expanded }" data-task="T15">
          <div class="timeline-head" role="button" tabindex="0" :aria-expanded="expanded" @click="expanded = !expanded" @keydown.enter="expanded = !expanded" @keydown.space.prevent="expanded = !expanded">
            <span class="chev-t">▶</span>
            <span class="spinner"></span>
            <span class="t-main">正在生成组件方案</span>
            <span class="t-elapsed">
              <span class="t-status">步骤 4/5</span>
              <span>已用时 12 秒</span>
            </span>
          </div>
          <div class="timeline-body">
            <div class="step">
              <div class="rail"><span class="dot done">✓</span></div>
              <div class="s-body">
                <div class="s-title"><b>上传校验</b><span class="dur">0.3s</span></div>
                <div class="s-detail">PNG · 1440×900 · 未超限，派生图已生成（长边 2048）</div>
              </div>
            </div>
            <div class="step">
              <div class="rail"><span class="dot done">✓</span></div>
              <div class="s-body">
                <div class="s-title"><b>视觉结构分析</b><span class="dur">4.2s</span><span class="tag cache">缓存命中</span></div>
                <div class="s-detail">同图 30 天内已分析过，复用结果（spec v1 · hash 9f2a…01cc）</div>
              </div>
            </div>
            <div class="step">
              <div class="rail"><span class="dot done">✓</span></div>
              <div class="s-body">
                <div class="s-title"><b>控件能力匹配</b><span class="dur">1.1s</span></div>
                <div class="s-detail">能力目录 v3.6-rc2 · 6/7 区域匹配，趋势图暂无运行时证据</div>
              </div>
            </div>
            <div class="step">
              <div class="rail"><span class="dot warn">!</span></div>
              <div class="s-body">
                <div class="s-title"><b>方案生成（首次输出未通过 schema 校验）</b><span class="dur">8.4s</span><span class="tag attempt">第 2 次尝试</span><span class="tag repair">修复 ×1</span></div>
                <div class="s-detail">自动修复 1 次后通过；修复调用已计入本轮预算（5/8）</div>
              </div>
            </div>
            <div class="step">
              <div class="rail"><span class="dot run"></span></div>
              <div class="s-body">
                <div class="s-title"><b>组件方案实施</b><span class="t-status">执行中…</span></div>
                <div class="s-detail">生成语义组件计划 → 布局编译（desktop 1440 规则）</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 视觉识别确认 T22（WAITING_INPUT） -->
        <div class="wait-card" data-task="T22">
          <div class="wait-head">
            <span class="icon">👁</span>
            <b>请确认识别结果</b>
            <span class="hint">任务已暂停等待输入 · 不会超时丢失 · 分析版本 9f2a…01cc</span>
          </div>
          <div class="wait-body">
            <div class="review-grid">
              <div class="ref-shot" style="aspect-ratio:16/10">
                <span class="shot-label">参考图 · dashboard-v2.png</span>
                <div class="figma">
                  <div class="f-head">⚡ 能源管理系统</div>
                  <div class="f-row">
                    <div class="f-side"><i></i><i style="width:80%"></i><i style="width:70%"></i><i style="width:85%"></i><i style="width:60%"></i></div>
                    <div class="f-main">
                      <div class="f-cards">
                        <div class="f-card"><b>今日用电</b><span>12,480 kWh</span></div>
                        <div class="f-card"><b>同比</b><span>-6.2%</span></div>
                        <div class="f-card"><b>峰值负荷</b><span>1,204 kW</span></div>
                      </div>
                      <div class="f-chart">
                        <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                          <polyline points="0,50 20,42 40,46 60,30 80,36 100,22 120,28 140,14 160,20 180,10 200,16" fill="none" stroke="#1f6feb" stroke-width="2"/>
                          <polyline points="0,55 20,50 40,52 60,44 80,48 100,40 120,44 140,34 160,38 180,30 200,34" fill="none" stroke="#34c759" stroke-width="1.5" stroke-dasharray="3 2"/>
                        </svg>
                      </div>
                      <div class="f-table"><i></i><i></i><i></i><i></i></div>
                    </div>
                  </div>
                </div>
                <!-- 区域叠层 -->
                <div class="region" :class="{ hl: activeRegion === 'rg1' }" @mouseenter="activeRegion = 'rg1'" @mouseleave="activeRegion = null" style="left:0;top:0;width:100%;height:14%"><span class="r-no">1</span></div>
                <div class="region" :class="{ hl: activeRegion === 'rg2' }" @mouseenter="activeRegion = 'rg2'" @mouseleave="activeRegion = null" style="left:0;top:14%;width:16%;height:86%"><span class="r-no">2</span></div>
                <div class="region" :class="{ hl: activeRegion === 'rg3' }" @mouseenter="activeRegion = 'rg3'" @mouseleave="activeRegion = null" style="left:16%;top:14%;width:84%;height:20%"><span class="r-no">3</span></div>
                <div class="region lowconf" :class="{ hl: activeRegion === 'rg4' }" @mouseenter="activeRegion = 'rg4'" @mouseleave="activeRegion = null" style="left:16%;top:34%;width:84%;height:40%"><span class="r-no">4</span></div>
                <div class="region" :class="{ hl: activeRegion === 'rg5' }" @mouseenter="activeRegion = 'rg5'" @mouseleave="activeRegion = null" style="left:16%;top:74%;width:84%;height:26%"><span class="r-no">5</span></div>
              </div>
              <div class="mapping">
                <div class="map-row" :class="{ hl: activeRegion === 'rg1' }" @mouseenter="activeRegion = 'rg1'" @mouseleave="activeRegion = null">
                  <span class="r-no-s">1</span><span class="m-name">顶部导航栏</span><span class="m-ctrl">容器·导航</span>
                  <span class="sup verified">✓ 已验证</span><span class="conf">0.96</span>
                </div>
                <div class="map-row" :class="{ hl: activeRegion === 'rg2' }" @mouseenter="activeRegion = 'rg2'" @mouseleave="activeRegion = null">
                  <span class="r-no-s">2</span><span class="m-name">左侧菜单</span><span class="m-ctrl">容器·侧栏</span>
                  <span class="sup verified">✓ 已验证</span><span class="conf">0.93</span>
                </div>
                <div class="map-row" :class="{ hl: activeRegion === 'rg3' }" @mouseenter="activeRegion = 'rg3'" @mouseleave="activeRegion = null">
                  <span class="r-no-s">3</span><span class="m-name">指标卡片 ×3</span><span class="m-ctrl">卡片容器</span>
                  <span class="sup verified">✓ 已验证</span><span class="conf">0.91</span>
                </div>
                <div class="map-row" :class="{ hl: activeRegion === 'rg4' }" @mouseenter="activeRegion = 'rg4'" @mouseleave="activeRegion = null">
                  <span class="r-no-s">4</span><span class="m-name">能耗趋势图</span><span class="m-ctrl">XY 曲线</span>
                  <span class="sup unverified">⚠ 未验证</span><span class="conf">0.62</span>
                </div>
                <div class="map-row" :class="{ hl: activeRegion === 'rg5' }" @mouseenter="activeRegion = 'rg5'" @mouseleave="activeRegion = null">
                  <span class="r-no-s">5</span><span class="m-name">能耗明细表</span><span class="m-ctrl">表格</span>
                  <span class="sup verified">✓ 已验证</span><span class="conf">0.88</span>
                </div>
                <div class="map-note">
                  <span>❓</span>
                  <span>待确认：截图未体现趋势图与数据表的数据源。继续前请选择「演示数据」或「绑定真实变量」；未验证控件（XY 曲线）可选择保留并记录确认，或改用数据表替代。</span>
                </div>
              </div>
            </div>
            <div class="wait-actions">
              <button type="button" @click="emit('action', $event)" class="btn primary">按当前理解继续</button>
              <button type="button" @click="emit('action', $event)" class="btn secondary">修改区域 / 绑定</button>
              <button type="button" @click="emit('action', $event)" class="btn danger-ghost">取消任务</button>
              <span class="fine">低置信区域（4）需确认后才会进入方案生成</span>
            </div>
          </div>
        </div>

        <!-- 方案审批卡（T07/T22 后续 blueprint 确认） -->
        <div class="approve-card" data-task="T15">
          <div class="approve-head">🧭 方案待确认</div>
          <div class="approve-body">
            <div class="plan-grid">
              <div class="plan-cell"><div class="k">页面</div><div class="v">能耗对比</div></div>
              <div class="plan-cell"><div class="k">控件数</div><div class="v">12</div></div>
              <div class="plan-cell"><div class="k">布局</div><div class="v">Desktop 1440</div></div>
              <div class="plan-cell"><div class="k">基线版本</div><div class="v">v1.3</div></div>
            </div>
            <div class="plan-hash">planHash a3f9…c21e <span class="sig">已签名</span> 确认后才进入编译构建</div>
          </div>
        </div>

        <!-- 冲突提示（S06 stale-base）T17 -->
        <div class="conflict-banner" data-task="T17">
          <span class="c-ico">⚠️</span>
          <div>
            <b>检测到工程已被其他会话更新（当前 v1.4，本轮基于 v1.3）</b><br>
            <span style="color:var(--color-text-secondary)">为避免覆盖，排队任务不会自动换基线。可基于最新版本重新规划，或查看两版差异。</span>
          </div>
          <div class="c-actions">
            <button type="button" @click="emit('action', $event)" class="btn secondary" style="padding:6px 12px;font-size:12px">查看差异</button>
            <button type="button" @click="emit('action', $event)" class="btn primary" style="padding:6px 12px;font-size:12px">基于 v1.4 重新规划</button>
          </div>
        </div>

        <!-- 完成交付卡 T24（验证等级） -->
        <div class="done-card" data-task="T24">
          <div class="done-head">
            <span class="icon">✓</span>
            <b>已交付</b>
            <span class="rev">revision v1.3 · artifact 8c1d…77ab</span>
          </div>
          <div class="done-body">
            <div class="verify-row">
              <span class="vbadge pass"><span class="v-ico">✓</span>结构验证通过</span>
              <span class="vbadge pass"><span class="v-ico">✓</span>编译验证通过</span>
              <span class="vbadge nc"><span class="v-ico">–</span>原生运行未验证</span>
              <span class="vbadge warn"><span class="v-ico">!</span>视觉相似度警告</span>
            </div>
            <div class="v-desc">未接入 KF 测试环境，runtime 级验证未执行（非「通过」）；趋势图字体与参考图存在差异，可发起一轮局部修订，不影响本次下载。</div>
            <div class="done-actions">
              <button type="button" @click="emit('action', $event)" class="btn primary">⬇ 下载工程包</button>
              <button type="button" @click="emit('action', $event)" class="btn secondary">继续修改</button>
              <button type="button" @click="emit('action', $event)" class="btn secondary">从此版本新建对话</button>
            </div>
          </div>
        </div>
</template>
<!-- end -->

