<script setup lang="ts">
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import type {
  AppCandidate,
  ConfigInput,
  NodeCandidate,
  RedundancyConfigSummary,
} from "../types/redundancy";
import { useRedundancyRuntime } from "../runtime";

type NodeSide = "primary" | "standby";

interface FormErrors {
  name: string;
  primaryNodeId: string;
  standbyNodeId: string;
  primaryAppIds: string;
  standbyAppIds: string;
  initialActiveNodeId: string;
}

const props = defineProps<{
  modelValue: boolean;
  configuration?: RedundancyConfigSummary | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();
const runtime = useRedundancyRuntime();
const nodes = ref<NodeCandidate[]>([]);
const usedNodeIds = ref(new Set<string>());
const primaryApps = ref<AppCandidate[]>([]);
const standbyApps = ref<AppCandidate[]>([]);
const primarySearch = ref("");
const standbySearch = ref("");
const currentStep = ref(0);
const saving = ref(false);
const loading = ref(false);
const form = reactive<ConfigInput>(emptyInput());
const errors = reactive<FormErrors>(emptyErrors());
const editing = computed(() => Boolean(props.configuration));
const primaryNode = computed(() => findNode(form.primaryNodeId));
const standbyNode = computed(() => findNode(form.standbyNodeId));
const filteredPrimaryApps = computed(() =>
  filterApps(primaryApps.value, primarySearch.value),
);
const filteredStandbyApps = computed(() =>
  filterApps(standbyApps.value, standbySearch.value),
);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    resetDialog();
    loading.value = true;
    try {
      const [nodeResult, configurations] = await Promise.all([
        runtime.nodeCatalog.listNodes(),
        runtime.api.list(),
      ]);
      nodes.value = nodeResult;
      usedNodeIds.value = collectUsedNodeIds(configurations);
      Object.assign(
        form,
        props.configuration
          ? fromConfiguration(props.configuration)
          : emptyInput(),
      );
      await Promise.all([loadApps("primary"), loadApps("standby")]);
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : "节点和 APP 信息加载失败",
      );
    } finally {
      loading.value = false;
    }
  },
);

/** 收集已被其他冗余配置占用的节点，避免用户提交必然失败的组合。 */
function collectUsedNodeIds(
  configurations: RedundancyConfigSummary[],
): Set<string> {
  const currentId = props.configuration?.redundancyId;
  return new Set(
    configurations
      .filter((configuration) => configuration.redundancyId !== currentId)
      .flatMap((configuration) => [
        configuration.primaryNodeId,
        configuration.standbyNodeId,
      ]),
  );
}

/** 重置弹窗的临时状态，保证每次打开都从第一步开始。 */
function resetDialog(): void {
  currentStep.value = 0;
  primarySearch.value = "";
  standbySearch.value = "";
  Object.assign(errors, emptyErrors());
}

/** 根据当前节点加载对应 APP 候选。 */
async function loadApps(side: NodeSide): Promise<void> {
  const nodeId = side === "primary" ? form.primaryNodeId : form.standbyNodeId;
  const target = side === "primary" ? primaryApps : standbyApps;
  if (!nodeId) {
    target.value = [];
    return;
  }
  target.value = await runtime.api.candidates(
    props.configuration?.redundancyId ?? "_new",
    nodeId,
  );
}

/** 节点改变后清空该侧 APP，并同步首次激活节点。 */
async function nodeChanged(side: NodeSide): Promise<void> {
  if (side === "primary") {
    form.primaryAppIds = [];
    errors.primaryNodeId = "";
  } else {
    form.standbyAppIds = [];
    errors.standbyNodeId = "";
  }
  if (
    ![form.primaryNodeId, form.standbyNodeId].includes(form.initialActiveNodeId)
  ) {
    form.initialActiveNodeId = "";
  }
  await loadApps(side);
}

/** 返回节点不可选原因；空字符串表示允许选择。 */
function nodeDisabledReason(node: NodeCandidate, side: NodeSide): string {
  if (!node.online) return "节点离线";
  if (usedNodeIds.value.has(node.nodeId)) return "已加入其他冗余配置";
  const oppositeId =
    side === "primary" ? form.standbyNodeId : form.primaryNodeId;
  if (node.nodeId === oppositeId) return "已被另一侧选择";
  return "";
}

/** 校验当前步骤，校验通过后才允许继续。 */
function validateStep(step: number): boolean {
  if (step === 0) {
    errors.name = form.name.trim() ? "" : "请输入冗余名称";
    errors.primaryNodeId = form.primaryNodeId ? "" : "请选择主节点";
    errors.standbyNodeId = form.standbyNodeId ? "" : "请选择从节点";
    if (form.primaryNodeId && form.primaryNodeId === form.standbyNodeId) {
      errors.standbyNodeId = "主节点和从节点必须是两个不同节点";
    }
    return !errors.name && !errors.primaryNodeId && !errors.standbyNodeId;
  }
  if (step === 1) {
    errors.primaryAppIds = form.primaryAppIds.length
      ? ""
      : "主节点至少选择一个 APP";
    errors.standbyAppIds = form.standbyAppIds.length
      ? ""
      : "从节点至少选择一个 APP";
    return !errors.primaryAppIds && !errors.standbyAppIds;
  }
  errors.initialActiveNodeId = [
    form.primaryNodeId,
    form.standbyNodeId,
  ].includes(form.initialActiveNodeId)
    ? ""
    : "请选择首次激活节点";
  return !errors.initialActiveNodeId;
}

/** 进入下一步。 */
function nextStep(): void {
  if (!validateStep(currentStep.value)) return;
  currentStep.value = Math.min(2, currentStep.value + 1);
}

/** 切换一条 APP 的选中状态。 */
function toggleApp(side: NodeSide, appId: string, checked: boolean): void {
  const key = side === "primary" ? "primaryAppIds" : "standbyAppIds";
  const selected = new Set(form[key]);
  if (checked) selected.add(appId);
  else selected.delete(appId);
  form[key] = [...selected];
  errors[key] = "";
}

/** 对当前搜索结果执行全选或取消全选。 */
function toggleVisibleApps(side: NodeSide, checked: boolean): void {
  const visible =
    side === "primary" ? filteredPrimaryApps.value : filteredStandbyApps.value;
  const key = side === "primary" ? "primaryAppIds" : "standbyAppIds";
  const selected = new Set(form[key]);
  visible.forEach((app) =>
    checked ? selected.add(app.appId) : selected.delete(app.appId),
  );
  form[key] = [...selected];
  errors[key] = "";
}

/** 当前搜索结果是否已经全部选中。 */
function allVisibleSelected(side: NodeSide): boolean {
  const visible =
    side === "primary" ? filteredPrimaryApps.value : filteredStandbyApps.value;
  const selected = side === "primary" ? form.primaryAppIds : form.standbyAppIds;
  return (
    visible.length > 0 && visible.every((app) => selected.includes(app.appId))
  );
}

/** 保存配置；创建仅落为未生效状态，不触发节点或 APP 操作。 */
async function save(): Promise<void> {
  for (const step of [0, 1, 2]) {
    if (!validateStep(step)) {
      currentStep.value = step;
      return;
    }
  }
  saving.value = true;
  try {
    const input = { ...form, name: form.name.trim() };
    if (props.configuration) {
      await runtime.api.update(
        props.configuration.redundancyId,
        props.configuration.revision,
        input,
      );
      ElMessage.success("冗余配置已更新");
    } else {
      await runtime.api.create(input);
      ElMessage.success("冗余配置已创建，当前为未生效状态");
    }
    emit("update:modelValue", false);
    emit("saved");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

function closeDialog(): void {
  emit("update:modelValue", false);
}

function findNode(nodeId: string): NodeCandidate | undefined {
  return nodes.value.find((node) => node.nodeId === nodeId);
}

function filterApps(apps: AppCandidate[], keyword: string): AppCandidate[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return apps;
  return apps.filter((app) =>
    [app.appName, app.appType, app.port].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(normalized),
    ),
  );
}

function emptyInput(): ConfigInput {
  return {
    name: "",
    primaryNodeId: "",
    standbyNodeId: "",
    initialActiveNodeId: "",
    primaryAppIds: [],
    standbyAppIds: [],
  };
}

function emptyErrors(): FormErrors {
  return {
    name: "",
    primaryNodeId: "",
    standbyNodeId: "",
    primaryAppIds: "",
    standbyAppIds: "",
    initialActiveNodeId: "",
  };
}

function fromConfiguration(
  configuration: RedundancyConfigSummary,
): ConfigInput {
  return {
    name: configuration.name,
    primaryNodeId: configuration.primaryNodeId,
    standbyNodeId: configuration.standbyNodeId,
    initialActiveNodeId: configuration.initialActiveNodeId,
    primaryAppIds: [...configuration.primaryAppIds],
    standbyAppIds: [...configuration.standbyAppIds],
  };
}
// end
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="editing ? '编辑冗余配置' : '新建冗余配置'"
    width="1120px"
    top="5vh"
    destroy-on-close
    append-to-body
    class="redundancy-config-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-steps
      :active="currentStep"
      finish-status="success"
      align-center
      class="wizard-steps"
    >
      <el-step title="基础与节点" description="命名并选择两个节点" />
      <el-step title="选择 APP" description="分别配置两侧受管 APP" />
      <el-step title="激活与确认" description="指定首次激活节点" />
    </el-steps>

    <div
      v-loading="loading"
      class="wizard-body"
      :class="{ 'wizard-body--compact': currentStep === 0 }"
    >
      <section v-show="currentStep === 0" class="wizard-section basic-step">
        <header class="section-heading section-heading--index-only">
          <span class="step-index">01</span>
        </header>
        <header class="form-section-title">
          <h3>冗余名称</h3>
        </header>
        <el-form label-position="top" class="basic-form">
          <el-form-item required :error="errors.name">
            <el-input
              v-model="form.name"
              aria-label="冗余名称"
              maxlength="64"
              show-word-limit
              placeholder="例如：生产线一冷备配置"
              @input="errors.name = ''"
            />
          </el-form-item>
        </el-form>
        <header class="form-section-title">
          <h3>节点配置</h3>
        </header>
        <div class="node-select-grid">
          <section class="node-select-card primary-card">
            <div class="card-title">
              <span>主</span>
              <div><strong>主节点</strong><small>默认业务节点</small></div>
            </div>
            <el-form-item required :error="errors.primaryNodeId">
              <el-select
                v-model="form.primaryNodeId"
                filterable
                placeholder="请选择主节点"
                @change="nodeChanged('primary')"
              >
                <el-option
                  v-for="node in nodes"
                  :key="node.nodeId"
                  :label="`${node.nodeName}  ${node.nodeIp || ''}`"
                  :value="node.nodeId"
                  :disabled="Boolean(nodeDisabledReason(node, 'primary'))"
                >
                  <div class="node-option">
                    <span
                      ><i :class="{ offline: !node.online }"></i
                      >{{ node.nodeName }} · {{ node.nodeIp }}</span
                    >
                    <small>{{
                      nodeDisabledReason(node, "primary") || "可选择"
                    }}</small>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
            <dl v-if="primaryNode" class="node-preview">
              <dt>节点状态</dt>
              <dd><span class="online-dot"></span>在线</dd>
              <dt>节点地址</dt>
              <dd>{{ primaryNode.nodeIp }}</dd>
            </dl>
            <div v-else class="node-placeholder">选择后将在此显示节点信息</div>
          </section>
          <div class="node-link" aria-hidden="true">
            <span></span><b>冷备</b><span></span>
          </div>
          <section class="node-select-card standby-card">
            <div class="card-title">
              <span>从</span>
              <div><strong>从节点</strong><small>备用接管节点</small></div>
            </div>
            <el-form-item required :error="errors.standbyNodeId">
              <el-select
                v-model="form.standbyNodeId"
                filterable
                placeholder="请选择从节点"
                @change="nodeChanged('standby')"
              >
                <el-option
                  v-for="node in nodes"
                  :key="node.nodeId"
                  :label="`${node.nodeName}  ${node.nodeIp || ''}`"
                  :value="node.nodeId"
                  :disabled="Boolean(nodeDisabledReason(node, 'standby'))"
                >
                  <div class="node-option">
                    <span
                      ><i :class="{ offline: !node.online }"></i
                      >{{ node.nodeName }} · {{ node.nodeIp }}</span
                    >
                    <small>{{
                      nodeDisabledReason(node, "standby") || "可选择"
                    }}</small>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
            <dl v-if="standbyNode" class="node-preview">
              <dt>节点状态</dt>
              <dd><span class="online-dot"></span>在线</dd>
              <dt>节点地址</dt>
              <dd>{{ standbyNode.nodeIp }}</dd>
            </dl>
            <div v-else class="node-placeholder">选择后将在此显示节点信息</div>
          </section>
        </div>
      </section>

      <section v-show="currentStep === 1" class="wizard-section app-step">
        <header class="section-heading section-heading--index-only">
          <span class="step-index">02</span>
        </header>
        <div class="app-grid">
          <section class="app-panel">
            <header>
              <div>
                <span class="role-chip primary">主</span
                ><strong>主节点 APP</strong
                ><small
                  >{{ primaryNode?.nodeName }} ·
                  {{ primaryNode?.nodeIp }}</small
                >
              </div>
              <b>已选 {{ form.primaryAppIds.length }} 个</b>
            </header>
            <div class="app-toolbar">
              <el-input
                v-model="primarySearch"
                clearable
                :prefix-icon="Search"
                placeholder="搜索名称、类型或端口"
              />
              <el-checkbox
                :model-value="allVisibleSelected('primary')"
                @change="toggleVisibleApps('primary', Boolean($event))"
                >全选当前结果</el-checkbox
              >
            </div>
            <div
              class="app-table"
              :class="{ 'has-error': errors.primaryAppIds }"
            >
              <div class="app-table__head">
                <span></span><span>APP 名称</span><span>工程类型</span
                ><span>端口</span><span>状态</span>
              </div>
              <label
                v-for="app in filteredPrimaryApps"
                :key="app.appId"
                class="app-row"
              >
                <el-checkbox
                  :model-value="form.primaryAppIds.includes(app.appId)"
                  @change="toggleApp('primary', app.appId, Boolean($event))"
                />
                <strong>{{ app.appName }}</strong
                ><span>{{ app.appType || "—" }}</span
                ><span>{{ app.port || "—" }}</span>
                <span
                  class="app-status"
                  :class="app.running ? 'running' : 'stopped'"
                  ><i></i>{{ app.running ? "运行" : "停止" }}</span
                >
              </label>
              <div v-if="!filteredPrimaryApps.length" class="app-empty">
                暂无匹配的 APP
              </div>
            </div>
            <p v-if="errors.primaryAppIds" class="field-error">
              {{ errors.primaryAppIds }}
            </p>
          </section>
          <section class="app-panel">
            <header>
              <div>
                <span class="role-chip standby">从</span
                ><strong>从节点 APP</strong
                ><small
                  >{{ standbyNode?.nodeName }} ·
                  {{ standbyNode?.nodeIp }}</small
                >
              </div>
              <b>已选 {{ form.standbyAppIds.length }} 个</b>
            </header>
            <div class="app-toolbar">
              <el-input
                v-model="standbySearch"
                clearable
                :prefix-icon="Search"
                placeholder="搜索名称、类型或端口"
              />
              <el-checkbox
                :model-value="allVisibleSelected('standby')"
                @change="toggleVisibleApps('standby', Boolean($event))"
                >全选当前结果</el-checkbox
              >
            </div>
            <div
              class="app-table"
              :class="{ 'has-error': errors.standbyAppIds }"
            >
              <div class="app-table__head">
                <span></span><span>APP 名称</span><span>工程类型</span
                ><span>端口</span><span>状态</span>
              </div>
              <label
                v-for="app in filteredStandbyApps"
                :key="app.appId"
                class="app-row"
              >
                <el-checkbox
                  :model-value="form.standbyAppIds.includes(app.appId)"
                  @change="toggleApp('standby', app.appId, Boolean($event))"
                />
                <strong>{{ app.appName }}</strong
                ><span>{{ app.appType || "—" }}</span
                ><span>{{ app.port || "—" }}</span>
                <span
                  class="app-status"
                  :class="app.running ? 'running' : 'stopped'"
                  ><i></i>{{ app.running ? "运行" : "停止" }}</span
                >
              </label>
              <div v-if="!filteredStandbyApps.length" class="app-empty">
                暂无匹配的 APP
              </div>
            </div>
            <p v-if="errors.standbyAppIds" class="field-error">
              {{ errors.standbyAppIds }}
            </p>
          </section>
        </div>
      </section>

      <section v-show="currentStep === 2" class="wizard-section confirm-step">
        <header class="section-heading section-heading--index-only">
          <span class="step-index">03</span>
        </header>
        <div class="activation-layout">
          <div class="activation-title">
            <strong>选择首次激活节点</strong><span>点击节点卡片进行选择</span>
          </div>
          <div class="role-strip">
            <button
              type="button"
              class="activation-card"
              :class="{
                selected: form.initialActiveNodeId === form.primaryNodeId,
              }"
              @click="
                form.initialActiveNodeId = form.primaryNodeId;
                errors.initialActiveNodeId = '';
              "
            >
              <span class="role-chip primary">主</span>
              <div>
                <strong>{{ primaryNode?.nodeName }}</strong
                ><small>{{ primaryNode?.nodeIp }}</small>
              </div>
              <b>{{ form.primaryAppIds.length }} 个 APP</b
              ><i>{{
                form.initialActiveNodeId === form.primaryNodeId
                  ? "首次激活"
                  : "设为激活"
              }}</i>
            </button>
            <div class="cold-standby-link">
              <span></span><b>人工冷切</b><span></span>
            </div>
            <button
              type="button"
              class="activation-card"
              :class="{
                selected: form.initialActiveNodeId === form.standbyNodeId,
              }"
              @click="
                form.initialActiveNodeId = form.standbyNodeId;
                errors.initialActiveNodeId = '';
              "
            >
              <span class="role-chip standby">从</span>
              <div>
                <strong>{{ standbyNode?.nodeName }}</strong
                ><small>{{ standbyNode?.nodeIp }}</small>
              </div>
              <b>{{ form.standbyAppIds.length }} 个 APP</b
              ><i>{{
                form.initialActiveNodeId === form.standbyNodeId
                  ? "首次激活"
                  : "设为激活"
              }}</i>
            </button>
          </div>
          <p
            v-if="errors.initialActiveNodeId"
            class="field-error activation-error"
          >
            {{ errors.initialActiveNodeId }}
          </p>
        </div>
        <div class="configuration-summary">
          <header><strong>配置摘要</strong><span>请确认后创建</span></header>
          <dl>
            <dt>冗余名称</dt>
            <dd>{{ form.name }}</dd>
            <dt>冗余方式</dt>
            <dd>人工冷切</dd>
            <dt>主节点</dt>
            <dd>{{ primaryNode?.nodeName }}（{{ primaryNode?.nodeIp }}）</dd>
            <dt>主节点 APP</dt>
            <dd>{{ form.primaryAppIds.length }} 个</dd>
            <dt>从节点</dt>
            <dd>{{ standbyNode?.nodeName }}（{{ standbyNode?.nodeIp }}）</dd>
            <dt>从节点 APP</dt>
            <dd>{{ form.standbyAppIds.length }} 个</dd>
          </dl>
        </div>
        <el-alert
          title="创建完成后配置状态为“未生效”。请返回列表选择该配置，并点击“生效”后再建立激活/失活角色。"
          type="info"
          show-icon
          :closable="false"
        />
      </section>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <span>第 {{ currentStep + 1 }} 步，共 3 步</span>
        <div>
          <el-button @click="closeDialog">取消</el-button>
          <el-button v-if="currentStep > 0" @click="currentStep -= 1"
            >上一步</el-button
          >
          <el-button
            v-if="currentStep < 2"
            type="primary"
            :disabled="loading"
            @click="nextStep"
            >下一步</el-button
          >
          <el-button
            v-else
            type="primary"
            :disabled="loading"
            :loading="saving"
            @click="save"
            >{{ editing ? "保存修改" : "创建配置" }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.wizard-steps {
  margin: 0 46px 22px;
}
.wizard-body {
  height: clamp(390px, calc(90vh - 250px), 560px);
  overflow: auto;
  padding: 2px 4px 4px;
}
.wizard-body--compact {
  height: auto;
  overflow: visible;
}
.wizard-section {
  min-height: 100%;
}
.basic-step {
  min-height: 0;
}
.form-section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
}
.form-section-title::before {
  width: 3px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 2px;
  background: var(--kf-primary);
  content: "";
}
.form-section-title h3 {
  margin: 0;
  color: var(--kf-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.basic-form + .form-section-title {
  margin-top: 20px;
  margin-bottom: 12px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--kf-border);
}
.section-heading--index-only {
  justify-content: flex-end;
}
.section-heading h3 {
  margin: 0;
  font-size: 16px;
  color: var(--kf-text-primary);
}
.section-heading p {
  margin: 6px 0 0;
  color: var(--kf-text-secondary);
  font-size: 13px;
}
.step-index {
  color: #d9e2f3;
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}
.basic-form {
  max-width: 520px;
}
.node-select-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px minmax(0, 1fr);
  align-items: stretch;
  gap: 16px;
  margin-top: 8px;
}
.basic-step .node-select-grid {
  align-items: start;
}
.node-select-card {
  min-height: 286px;
  padding: 20px;
  border: 1px solid #d8e1f0;
  border-radius: 10px;
  background: #fbfcff;
}
.basic-step .node-select-card {
  min-height: 0;
}
.node-select-card.primary-card {
  border-top: 3px solid var(--kf-primary);
}
.node-select-card.standby-card {
  border-top: 3px solid #7890b8;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 20px;
}
.card-title > span,
.role-chip {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.card-title > span,
.role-chip.primary {
  background: var(--kf-primary);
}
.standby-card .card-title > span,
.role-chip.standby {
  background: #7890b8;
}
.card-title div {
  display: grid;
  gap: 3px;
}
.card-title strong {
  font-size: 15px;
}
.card-title small {
  color: var(--kf-text-secondary);
}
.node-select-card :deep(.el-select) {
  width: 100%;
}
.node-preview {
  display: grid;
  grid-template-columns: 80px 1fr;
  min-height: 96px;
  box-sizing: border-box;
  align-content: center;
  gap: 13px 8px;
  margin: 23px 0 0;
  padding: 15px;
  border-radius: 7px;
  background: #f3f6fb;
  font-size: 13px;
}
.node-preview dt {
  color: var(--kf-text-secondary);
}
.node-preview dd {
  margin: 0;
}
.online-dot,
.node-option i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--kf-success);
}
.node-option i.offline {
  background: #a8b0bf;
}
.node-placeholder {
  display: grid;
  min-height: 94px;
  place-items: center;
  margin-top: 23px;
  border: 1px dashed #d9e1ef;
  border-radius: 7px;
  color: #98a2b3;
  font-size: 13px;
}
.node-link,
.cold-standby-link {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71809b;
  font-size: 12px;
}
.node-link {
  flex-direction: column;
}
.node-link span {
  width: 1px;
  height: 54px;
  background: #ccd6e7;
}
.node-link b {
  margin: 8px 0;
  padding: 5px 9px;
  border: 1px solid #ccd6e7;
  border-radius: 12px;
  font-weight: 500;
}
.node-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
}
.node-option small {
  color: #9aa4b4;
}
.app-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.app-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid #d8e1f0;
  border-radius: 10px;
  background: #fff;
}
.app-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.app-panel > header > div {
  display: grid;
  grid-template-columns: 30px auto;
  gap: 2px 9px;
  align-items: center;
}
.app-panel > header .role-chip {
  grid-row: 1 / 3;
}
.app-panel > header strong {
  font-size: 14px;
}
.app-panel > header small {
  color: var(--kf-text-secondary);
}
.app-panel > header b {
  padding: 4px 9px;
  border-radius: 12px;
  background: #edf3ff;
  color: var(--kf-primary);
  font-size: 12px;
  font-weight: 500;
}
.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.app-toolbar :deep(.el-input) {
  max-width: 285px;
}
.app-table {
  overflow: hidden;
  border: 1px solid var(--kf-border);
  border-radius: 7px;
}
.app-table.has-error {
  border-color: var(--kf-danger);
}
.app-table__head,
.app-row {
  display: grid;
  grid-template-columns: 34px minmax(120px, 1.4fr) minmax(90px, 1fr) 58px 66px;
  align-items: center;
  min-height: 43px;
  padding: 0 10px;
  gap: 6px;
}
.app-table__head {
  min-height: 38px;
  background: #f4f6fa;
  color: #657085;
  font-size: 12px;
  font-weight: 600;
}
.app-row {
  border-top: 1px solid #edf0f5;
  color: #4b5565;
  cursor: pointer;
  font-size: 12px;
}
.app-row:hover {
  background: #f7faff;
}
.app-row strong {
  overflow: hidden;
  color: #252b37;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-status {
  display: inline-flex;
  align-items: center;
}
.app-status i {
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
}
.app-status.running i {
  background: var(--kf-success);
}
.app-status.stopped i {
  background: #b7beca;
}
.app-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: #98a2b3;
}
.field-error {
  margin: 7px 0 0;
  color: var(--kf-danger);
  font-size: 12px;
}
.activation-layout {
  padding: 17px 22px 22px;
  border: 1px solid #d8e1f0;
  border-radius: 10px;
  background: #fbfcff;
}
.activation-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 15px;
}
.activation-title span {
  color: var(--kf-text-secondary);
  font-size: 12px;
}
.role-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
}
.activation-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 10px;
  padding: 17px;
  border: 1px solid #d5deec;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.activation-card:hover {
  border-color: #92aff7;
}
.activation-card.selected {
  border-color: var(--kf-primary);
  box-shadow: 0 0 0 2px rgb(3 72 221 / 10%);
  background: #f7faff;
}
.activation-card .role-chip {
  grid-row: 1 / 3;
}
.activation-card div {
  display: grid;
  gap: 3px;
}
.activation-card small {
  color: var(--kf-text-secondary);
}
.activation-card > b {
  font-size: 12px;
  font-weight: 500;
}
.activation-card > i {
  grid-column: 3;
  color: var(--kf-primary);
  font-size: 12px;
  font-style: normal;
}
.cold-standby-link {
  gap: 7px;
}
.cold-standby-link span {
  height: 1px;
  flex: 1;
  background: #cbd6e8;
}
.cold-standby-link b {
  color: #65738b;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.activation-error {
  text-align: center;
}
.configuration-summary {
  margin: 16px 0;
  border: 1px solid var(--kf-border);
  border-radius: 9px;
}
.configuration-summary header {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--kf-border);
  background: #f5f7fb;
}
.configuration-summary header span {
  color: var(--kf-text-secondary);
  font-size: 12px;
}
.configuration-summary dl {
  display: grid;
  grid-template-columns: 100px 1fr 100px 1fr;
  gap: 13px 12px;
  margin: 0;
  padding: 16px;
  font-size: 13px;
}
.configuration-summary dt {
  color: var(--kf-text-secondary);
}
.configuration-summary dd {
  margin: 0;
}
.wizard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wizard-footer > span {
  color: var(--kf-text-secondary);
  font-size: 12px;
}
@media (max-width: 900px) {
  .node-select-grid,
  .app-grid,
  .role-strip {
    grid-template-columns: 1fr;
  }
  .node-link {
    flex-direction: row;
  }
  .node-link span {
    width: 54px;
    height: 1px;
  }
  .role-strip .cold-standby-link {
    min-height: 24px;
  }
  .configuration-summary dl {
    grid-template-columns: 90px 1fr;
  }
}
</style>
