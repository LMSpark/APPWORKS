<!--
@module app:views/features/application/application-function-management/ui/blueprint-source-commit-editor
职责：“来源提交协议”子对话框：只读查看已有不可变版本，录入新版本草稿（六个协议模型、来源主键/提交引用字段、提交事实字段）。
边界：已有版本绑定 88A4 Commit_Policy.byBinding / Commit_Field.byPolicy；草稿表单与事实行绑定暂存输入视图；校验、保存与回读由宿主流程状态承担。
AI用途：调整来源提交协议布局时修改本组件，不在此另建查询或保存链。
-->
<template>
  <RendererDialog :model-value="true" title="来源提交协议" width="min(1080px, 94vw)" top="5vh" :append-to-body="true" :close-disabled="busy"
    @update:model-value="closeCommit">
    <DisplayAlert title="配置保存为不可变版本草稿" alert-type="info" :closable="false"
      description="选择当前节点的正式模型并定义提交事实。草稿保存后还需核验物理约束、后端权限与并发行为，才可启用。" />
    <DisplayAlert v-if="commitUnknown" description="上次草稿保存结果未知，只能重试“保存新版本草稿”核验原提交，不会以新身份重新提交。"
      alert-type="warning" :closable="false" />
    <DisplayAlert v-if="commitError" :title="commitError" alert-type="error" :closable="false" />
    <DisplayAlert v-if="commitNotice" :description="commitNotice" alert-type="success" :closable="false" />
    <DisplayAlert v-if="busy && commitDraftId === undefined" description="正在读取正式协议版本…" alert-type="info" :closable="false" />
    <template v-if="commitPolicyViewKey">
      <h3>已有版本</h3>
      <RendererTable :data-view-key="commitPolicyViewKey" :children="[...commitPolicyColumns]" :actions="commitPolicyActions"
        :show-data-view-meta="false" :show-pagination="false" />
    </template>
    <template v-if="selectedPolicyId !== undefined">
      <p>当前查看已有版本的提交事实，已有版本不可覆盖。</p>
      <RendererTable :data-view-key="commitFieldViewKey" :children="[...commitFieldColumns]" :show-data-view-meta="false" :show-pagination="false" />
      <RendererButton label="返回新版本设计" @click="backToDraft" />
    </template>
    <template v-else-if="commitDraftId !== undefined">
      <h3>新版本草稿</h3>
      <FeatureRecordFields :data-view-key="commitDraftViewKey" :record-id="commitDraftId" :specs="commitDraftSpecs" :locked="commitLocked"
        :columns="2" />
      <p>事实类型须与正式回读的值一致，不自动转换。日期可保留为字符串；日期时间须包含 UTC 时区和毫秒。草稿保存不代表实际行值已通过验证。</p>
      <RendererButton label="新增提交事实字段" :disabled="commitLocked" @click="addFact" />
      <RendererTable :data-view-key="commitFactViewKey" :children="[...commitFactColumns]" :actions="commitFactActions"
        :show-data-view-meta="false" :show-pagination="false" />
    </template>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy" @click="closeCommit()" />
      <RendererButton v-if="selectedPolicyId === undefined" label="保存新版本草稿" button-type="primary"
        :disabled="busy || commitDraftId === undefined || commitFactCount === 0" :loading="busy" @click="saveCommitDraft" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererButton, RendererDialog, RendererTable} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import type {useApplicationFunctionDimensionSource} from './use-application-function-dimension-source'

const props = defineProps<{source: ReturnType<typeof useApplicationFunctionDimensionSource>}>()
const {busy, commitError, commitNotice, commitUnknown, commitLocked, selectedPolicyId, commitPolicyViewKey, commitFieldViewKey,
  commitDraftViewKey, commitFactViewKey, commitDraftId, commitFactCount, commitDraftSpecs, commitPolicyColumns, commitFieldColumns,
  commitFactColumns, commitPolicyActions, commitFactActions, backToDraft, addFact, saveCommitDraft, closeCommit} = props.source
</script>
