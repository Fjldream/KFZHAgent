<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
import { useOpsResourceStore } from "@/stores/opsResourceStore.js";
// modified by jinlong.feng at 2026-10-14 冗余配置名称校验
import { regexValidator } from "@/utils/regexRules.js";
// end
// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
import { useRedundancyStore } from "@/stores/redundancyStore.js";
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";
// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
import {
  // modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称
  getProjectTypeText,
  // end modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称
  getNodeConnectionDetails,
  getOccupiedRedundancyNodeIds,
  // modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
  isRedundancyNameDuplicated,
  // end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
  isNodeOnline,
} from "@/utils/redundancyUtils.js";
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点

const props = defineProps({ editing: { type: Object, default: null } });
const visible = defineModel("visible", { type: Boolean, default: false });
const emit = defineEmits(["saved"]);
const { t } = useI18n();
const resourceStore = useOpsResourceStore();
// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
const redundancyStore = useRedundancyStore();
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
const step = ref(0);
const saving = ref(false);
// modified by jinlong.feng at 2026-10-14 冗余配置名称校验
const formRef = ref(null);
const formRules = {
  name: [regexValidator("safaText", t("rulesName"))],
};
// end
const form = reactive({
  name: "",
  primaryNodeId: "",
  standbyNodeId: "",
  primaryAppIds: [],
  standbyAppIds: [],
  initialActiveNodeId: "",
});
const nodes = computed(() => resourceStore.nodeResourceData || []);
// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
const occupiedNodeIds = computed(() =>
  getOccupiedRedundancyNodeIds(
    redundancyStore.configurations,
    props.editing?.redundancyId || "",
  ),
);
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
const primaryNode = computed(() =>
  nodes.value.find((item) => item.nodeId === form.primaryNodeId),
);
const standbyNode = computed(() =>
  nodes.value.find((item) => item.nodeId === form.standbyNodeId),
);

watch(visible, (open) => {
  if (!open) return;
  step.value = 0;
  Object.assign(
    form,
    props.editing
      ? {
          name: props.editing.name,
          primaryNodeId: props.editing.primaryNodeId,
          standbyNodeId: props.editing.standbyNodeId,
          primaryAppIds: [...(props.editing.primaryAppIds || [])],
          standbyAppIds: [...(props.editing.standbyAppIds || [])],
          initialActiveNodeId: props.editing.initialActiveNodeId,
        }
      : {
          name: "",
          primaryNodeId: "",
          standbyNodeId: "",
          primaryAppIds: [],
          standbyAppIds: [],
          initialActiveNodeId: "",
        },
  );
});

/** 选择或取消一个节点侧 APP。 */
function toggleApp(side, appId) {
  const key = side === "primary" ? "primaryAppIds" : "standbyAppIds";
  form[key] = form[key].includes(appId)
    ? form[key].filter((id) => id !== appId)
    : [...form[key], appId];
}

// modified by jinlong.feng at 2026-10-14 冗余配置名称校验
/** 校验当前步骤并进入下一步。 */
async function next() {
  if (step.value === 0) {
    try {
      await formRef.value.validateField("name");
    } catch {
      return;
    }
  }
  if (
    step.value === 0 &&
    (!form.name.trim() ||
      !form.primaryNodeId ||
      !form.standbyNodeId ||
      form.primaryNodeId === form.standbyNodeId)
  ) {
    showRedundancyMessage("warning", t("redundancy.validation.basic"));
    return;
  }
  // modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
  if (
    step.value === 0 &&
    isRedundancyNameDuplicated(
      redundancyStore.configurations,
      form.name,
      props.editing?.redundancyId || "",
    )
  ) {
    showRedundancyMessage(
      "warning",
      t("redundancy.validation.nameDuplicated", { name: form.name.trim() }),
    );
    return;
  }
  // end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
  if (
    step.value === 1 &&
    (!form.primaryAppIds.length || !form.standbyAppIds.length)
  ) {
    showRedundancyMessage("warning", t("redundancy.validation.apps"));
    return;
  }
  if (step.value < 2) step.value += 1;
}
// end

/** 保存新建或编辑后的冗余配置。 */
async function save() {
  if (!form.initialActiveNodeId)
    return showRedundancyMessage(
      "warning",
      t("redundancy.validation.activeNode"),
    );
  saving.value = true;
  try {
    const payload = { ...form, name: form.name.trim() };
    if (props.editing)
      await redundancyAPI.update(
        props.editing.redundancyId,
        props.editing.revision,
        payload,
      );
    else await redundancyAPI.create(payload);
    showRedundancyMessage("success", t("redundancy.messages.saved"));
    visible.value = false;
    emit("saved");
  } catch {
    /* 请求拦截器已使用冗余模块专属位置展示错误。 */
  } finally {
    saving.value = false;
  }
}
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-dialog
    v-model="visible"
    :title="
      editing
        ? t('redundancy.editConfiguration')
        : t('redundancy.createConfiguration')
    "
    width="min(1080px, calc(100vw - 32px))"
    destroy-on-close
    class="redundancy-dialog"
  >
    <el-steps :active="step" align-center finish-status="success">
      <el-step :title="t('redundancy.steps.basic')" />
      <el-step :title="t('redundancy.steps.apps')" />
      <el-step :title="t('redundancy.steps.confirm')" />
    </el-steps>
    <div class="section-line">
      <b>{{ String(step + 1).padStart(2, "0") }}</b>
    </div>

    <section v-if="step === 0" class="step-content">
      <h3>{{ t("redundancy.configurationName") }}</h3>
      <!-- modified by jinlong.feng at 2026-10-14 冗余配置名称校验 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        class="configuration-name-form"
        @submit.prevent
      >
        <el-form-item prop="name">
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
            :placeholder="t('redundancy.namePlaceholder')"
          />
        </el-form-item>
      </el-form>
      <!-- end -->
      <h3>{{ t("redundancy.nodeConfiguration") }}</h3>
      <div class="node-selectors">
        <article class="node-card node-card--primary">
          <header class="node-card-header">
            <span class="node-role-mark" aria-hidden="true">{{
              t("redundancy.primaryNode").slice(0, 1)
            }}</span>
            <strong>{{ t("redundancy.primaryNode") }}</strong>
            <el-tag
              v-if="primaryNode"
              size="small"
              :type="isNodeOnline(primaryNode) ? 'success' : 'danger'"
              round
            >
              {{ isNodeOnline(primaryNode) ? t("online") : t("offline") }}
            </el-tag>
          </header>
          <el-select
            v-model="form.primaryNodeId"
            class="node-selector"
            :placeholder="t('redundancy.selectPrimary')"
            ><el-option
              v-for="node in nodes"
              :key="node.nodeId"
              :label="`${node.nodeName} ${node.address || node.nodeIp || ''}`"
              :value="node.nodeId"
              :disabled="
                node.nodeId === form.standbyNodeId ||
                occupiedNodeIds.has(node.nodeId)
              "
          /></el-select>
          <dl v-if="primaryNode" class="node-detail-grid">
            <div
              v-for="detail in getNodeConnectionDetails(primaryNode, t)"
              :key="detail.key"
              class="node-detail-item"
            >
              <dt>{{ detail.label }}</dt>
              <dd
                :class="{
                  'is-online': detail.key === 'status' && detail.online,
                  'is-offline': detail.key === 'status' && !detail.online,
                }"
              >
                {{ detail.value }}
              </dd>
            </div>
          </dl>
          <div v-else class="node-detail-empty">
            {{ t("redundancy.selectNodeHint") }}
          </div>
        </article>
        <div class="standby-connector">
          <span class="standby-connector__axis" aria-hidden="true"></span>
          <span class="standby-connector__label">{{
            t("redundancy.coldStandby")
          }}</span>
        </div>
        <article class="node-card node-card--standby">
          <header class="node-card-header">
            <span class="node-role-mark" aria-hidden="true">{{
              t("redundancy.standbyNode").slice(0, 1)
            }}</span>
            <strong>{{ t("redundancy.standbyNode") }}</strong>
            <el-tag
              v-if="standbyNode"
              size="small"
              :type="isNodeOnline(standbyNode) ? 'success' : 'danger'"
              round
            >
              {{ isNodeOnline(standbyNode) ? t("online") : t("offline") }}
            </el-tag>
          </header>
          <el-select
            v-model="form.standbyNodeId"
            class="node-selector"
            :placeholder="t('redundancy.selectStandby')"
            ><el-option
              v-for="node in nodes"
              :key="node.nodeId"
              :label="`${node.nodeName} ${node.address || node.nodeIp || ''}`"
              :value="node.nodeId"
              :disabled="
                node.nodeId === form.primaryNodeId ||
                occupiedNodeIds.has(node.nodeId)
              "
          /></el-select>
          <dl v-if="standbyNode" class="node-detail-grid">
            <div
              v-for="detail in getNodeConnectionDetails(standbyNode, t)"
              :key="detail.key"
              class="node-detail-item"
            >
              <dt>{{ detail.label }}</dt>
              <dd
                :class="{
                  'is-online': detail.key === 'status' && detail.online,
                  'is-offline': detail.key === 'status' && !detail.online,
                }"
              >
                {{ detail.value }}
              </dd>
            </div>
          </dl>
          <div v-else class="node-detail-empty">
            {{ t("redundancy.selectNodeHint") }}
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="step === 1" class="step-content app-step">
      <h3>{{ t("redundancy.appConfiguration") }}</h3>
      <div class="app-tables">
        <article v-for="side in ['primary', 'standby']" :key="side">
          <header>
            <strong>{{
              side === "primary"
                ? t("redundancy.primaryNodeApps")
                : t("redundancy.standbyNodeApps")
            }}</strong
            ><span>{{
              side === "primary" ? primaryNode?.nodeName : standbyNode?.nodeName
            }}</span>
          </header>
          <CustomStyleTable
            :table-data="
              (side === 'primary' ? primaryNode : standbyNode)?.apps || []
            "
            row-key="appId"
            :show-pagination="false"
            max-height="300px"
            :show-highlight="false"
            table-class="redundancy-centered-table"
          >
            <el-table-column width="48"
              ><template #default="{ row }"
                ><el-checkbox
                  :model-value="
                    form[
                      side === 'primary' ? 'primaryAppIds' : 'standbyAppIds'
                    ].includes(row.appId)
                  "
                  @click.stop
                  @change="toggleApp(side, row.appId)" /></template
            ></el-table-column>
            <el-table-column
              prop="appName"
              :label="t('redundancy.appName')"
              min-width="150"
              show-overflow-tooltip
            />
            <!-- modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称 -->
            <el-table-column
              prop="projectType"
              :label="t('projectType')"
              min-width="120"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                {{ getProjectTypeText(row.projectType, t) }}
              </template>
            </el-table-column>
            <!-- end modified by jinlong.feng at 2026-10-09 冗余APP配置显示工程类型名称 -->
            <el-table-column prop="port" :label="t('port')" width="90" />
          </CustomStyleTable>
        </article>
      </div>
    </section>

    <section v-else class="step-content confirm-step">
      <h3>{{ t("redundancy.initialActiveNode") }}</h3>
      <div class="active-options">
        <article
          :class="{ selected: form.initialActiveNodeId === form.primaryNodeId }"
          @click="form.initialActiveNodeId = form.primaryNodeId"
        >
          <el-radio
            v-model="form.initialActiveNodeId"
            :value="form.primaryNodeId"
            >{{ t("redundancy.primaryNode") }}</el-radio
          ><strong>{{ primaryNode?.nodeName }}</strong
          ><span>{{
            t("redundancy.configuredApps", { count: form.primaryAppIds.length })
          }}</span>
        </article>
        <article
          :class="{ selected: form.initialActiveNodeId === form.standbyNodeId }"
          @click="form.initialActiveNodeId = form.standbyNodeId"
        >
          <el-radio
            v-model="form.initialActiveNodeId"
            :value="form.standbyNodeId"
            >{{ t("redundancy.standbyNode") }}</el-radio
          ><strong>{{ standbyNode?.nodeName }}</strong
          ><span>{{
            t("redundancy.configuredApps", { count: form.standbyAppIds.length })
          }}</span>
        </article>
      </div>
      <el-alert
        :title="t('redundancy.initialActiveHint')"
        type="warning"
        show-icon
        :closable="false"
      />
    </section>

    <template #footer
      ><span class="dialog-footer"
        ><span>{{ t("redundancy.stepCounter", { current: step + 1 }) }}</span
        ><span
          ><el-button @click="visible = false">{{ t("cancel") }}</el-button
          ><el-button v-if="step" @click="step--">{{
            t("redundancy.previous")
          }}</el-button
          ><el-button v-if="step < 2" type="primary" @click="next">{{
            t("redundancy.next")
          }}</el-button
          ><el-button v-else type="primary" :loading="saving" @click="save">{{
            t("confirm")
          }}</el-button></span
        ></span
      ></template
    >
  </el-dialog>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.section-line {
  margin: 18px 0 12px;
  border-bottom: 1px solid #e5eaf3;
  text-align: right;
  color: #dce4f5;
  font-size: 28px;
}
.step-content {
  min-height: 420px;
  h3 {
    margin: 18px 0 12px;
    padding-left: 10px;
    border-left: 3px solid #4a78ff;
    font-size: 15px;
    color: #4f5b72;
  }
  > .el-input {
    width: 520px;
  }
}
/* modified by jinlong.feng at 2026-10-14 冗余配置名称校验 */
.configuration-name-form {
  width: 520px;
}
/* end */
.node-selectors {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px minmax(0, 1fr);
  align-items: stretch;
  gap: 10px;
  .node-card {
    min-width: 0;
    padding: 20px 24px 22px;
    border: 1px solid #c9d5ec;
    border-top: 2px solid #315ce8;
    border-radius: 8px;
    background: #fff;
    &--standby {
      border-color: #cbd4e5;
      border-top-color: #7e93bd;
      .node-role-mark {
        background: #7e93bd;
      }
    }
    .node-selector {
      width: 100%;
      margin: 18px 0 16px;
    }
  }
  .node-card-header {
    display: flex;
    align-items: center;
    min-height: 36px;
    gap: 12px;
    color: #242d3d;
    .node-role-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      border-radius: 6px;
      background: #315ce8;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
    }
    > strong {
      font-size: 15px;
      font-weight: 600;
    }
    .el-tag {
      margin-left: auto;
    }
  }
  .node-detail-grid,
  .node-detail-empty {
    min-height: 76px;
    margin: 0;
    border-radius: 4px;
    background: #f5f7fb;
  }
  .node-detail-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 13px 6px;
  }
  .node-detail-item {
    min-width: 0;
    padding: 0 10px;
    text-align: center;
    &:not(:first-child) {
      border-left: 1px solid #dbe2ee;
    }
    dt {
      color: #778197;
      font-size: 13px;
      line-height: 20px;
    }
    dd {
      margin: 5px 0 0;
      overflow: hidden;
      color: #2d3544;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
      &.is-online {
        color: #38a858;
      }
      &.is-offline {
        color: #d84b4b;
      }
    }
  }
  .node-detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    color: #9aa4b5;
    font-size: 13px;
  }
  .standby-connector {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 202px;
    &::before {
      position: absolute;
      right: -10px;
      left: -10px;
      top: 50%;
      border-top: 1px solid #ccd6e8;
      content: "";
    }
    &__axis {
      position: absolute;
      top: 44px;
      bottom: 44px;
      left: 50%;
      border-left: 1px solid #bcc9df;
      &::before,
      &::after {
        position: absolute;
        left: -4px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #bac6da;
        content: "";
      }
      &::before {
        top: 0;
      }
      &::after {
        bottom: 0;
      }
    }
    &__label {
      position: relative;
      z-index: 1;
      min-width: 52px;
      padding: 6px 10px;
      border: 1px solid #8eacff;
      border-radius: 6px;
      background: #fff;
      color: #315ce8;
      text-align: center;
      font-size: 13px;
      white-space: nowrap;
    }
  }
}
.app-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  article {
    min-width: 0;
    border: 1px solid #e1e7f0;
    border-radius: 6px;
    overflow: hidden;
    > header {
      display: flex;
      justify-content: space-between;
      padding: 13px 16px;
      background: #f6f8fc;
    }
  }
  :deep(.table-container) {
    padding: 8px;
    border-radius: 0;
  }
}
.active-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  margin: 34px 0;
  article {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    padding: 24px;
    border: 1px solid #dce3ef;
    border-radius: 8px;
    cursor: pointer;
    span {
      grid-column: 2;
      color: #7b8495;
    }
    &.selected {
      border-color: #315ce8;
      background: #f4f7ff;
      box-shadow: inset 0 3px 0 #315ce8;
    }
  }
}
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
/* end */
</style>
