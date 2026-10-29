<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed } from "vue";
import { parseCustomerEffectBlueprint } from "../../types.js";
/** 消息气泡：用户右对齐强调色，助手浅色卡片；助手可选「决策摘要」label（≤600 字，来自受限业务结果）。 */
const props = withDefaults(defineProps<{
  role: "user" | "assistant";
  text: string;
  label?: string;
  attachments?: Array<{ name: string; kind: "reference" | "material" }>;
}>(), { attachments: () => [] });
const blueprint = computed(() => props.role === "assistant" ? parseCustomerEffectBlueprint(props.text) : null);
const readable = computed(() => props.text.startsWith("KF_BLUEPRINT_CONFIRM/1\n") ? "已确认当前蓝图，继续生成工程。" : props.text);
</script>

<template>
  <div class="msg" :class="role === 'user' ? 'msg-user' : 'msg-assistant'">
    <div v-if="role === 'user' && (attachments?.length ?? 0) > 0" class="attach-tray tray">
      <span v-for="file in attachments" :key="file.name" class="attach">
        <span class="kind" :class="file.kind">{{ file.kind === "reference" ? "参考图" : "业务素材" }}</span>
        <span class="name">{{ file.name }}</span>
      </span>
    </div>

    <div :class="role === 'user' ? 'bubble-user' : 'bubble-ai'">
      <div v-if="label" class="ds-label">{{ label }}</div>
      <template v-if="blueprint">
        <h3>{{ blueprint.displayName }} · 蓝图 v{{ blueprint.revision }}</h3>
        <p>{{ blueprint.schema === 'kf-design-plan/v3' ? blueprint.objective : blueprint.overview.objective }}</p>
        <template v-if="blueprint.schema === 'kf-design-plan/v3'">
          <!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
          <section v-for="page in blueprint.pages" :key="page.id"><h4>{{ page.title }}</h4><p>{{ page.purpose }}</p><ul><li v-for="region in page.regions" :key="region.id">{{ region.purpose }}：{{ region.content.join('、') }}<p v-if="region.visualRegionIds">参考图来源：{{ region.visualRegionIds.join('、') }}</p></li></ul></section>
          <!-- end -->
          <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
          <section v-for="journey in blueprint.journeys" :key="journey.id" class="blueprint-journey">
            <h4>验收旅程：{{ journey.goal }}</h4>
            <ol>
              <li v-for="(step, stepIndex) in journey.steps" :key="stepIndex">
                <span>{{ step.kind === 'observe' ? '观察内容' : '执行交互' }}：{{ step.action }} → {{ step.result }}</span>
                <p v-if="step.kind === 'observe'">应看到的文字：{{ step.expectedTexts?.join('、') }}</p>
              </li>
            </ol>
          </section>
          <!-- end -->
        </template>
        <ul v-else><li v-for="module in blueprint.modules" :key="module.id">{{ module.name }}：{{ module.purpose }}</li></ul>
        <p>视觉方向：{{ blueprint.visualDirection.tone }}</p>
        <ul v-if="blueprint.openQuestions.length"><li v-for="question in blueprint.openQuestions" :key="question">待确认：{{ question }}</li></ul>
      </template>
      <template v-else>{{ readable }}</template>
    </div>

    <div v-if="role === 'user' && (attachments?.length ?? 0) > 0" class="attach-note note">
      参考图默认不打包进交付工程 · 仅业务素材进入资源目录
    </div>
  </div>
</template>


<!-- end -->
