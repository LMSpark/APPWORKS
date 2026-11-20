<!--
@module app:views/features/application/application-function-management/ui/blueprint-dimension-source
职责：蓝图节点“维度来源设计”对话框：选择节点数据空间模型或平台注册事件，编辑来源绑定、正式来源集合与字段维度映射，
  并从已保存绑定进入“数据模型事件”“来源提交协议”维护。
边界：绑定、映射与集合绑定 88A4 维度设计空间的 DataView，模型与字段候选绑定同一 PageRuntime 中 7AB 的候选视图，
  平台合同绑定选项目录视图；当前子集合在详情表单编辑，子外键与子主键按场景字段级联取候选。装载、校验、保存与回读由宿主传入的流程状态承担。
AI用途：调整维度来源设计布局时修改本组件，不在此另建查询或保存链。
-->
<template>
  <RendererDialog :model-value="true" title="维度来源设计" width="min(1120px, 94vw)" top="5vh" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <DisplayAlert v-if="dialogError" title="维度来源读取或保存失败" :description="dialogError" alert-type="error" :show-icon="true" :closable="false" />
    <DisplayAlert v-if="dialogNotice" :description="dialogNotice" alert-type="success" :closable="false" />
    <DisplayAlert v-if="unknown" description="上次保存结果未知，只能重试“保存来源绑定”核验原提交或关闭后重新核对，不能继续编辑。"
      alert-type="warning" :closable="false" />
    <DisplayAlert v-if="loading" description="正在读取正式来源合同与蓝图绑定…" alert-type="info" :closable="false" />
    <template v-else>
      <div class="dimension-source__header">
        <strong>来源类型</strong>
        <RendererButton label="节点数据空间模型" :button-type="candidateKind === 'data-model' ? 'primary' : 'default'"
          :disabled="locked || modelCount === 0" @click="chooseCandidateKind('data-model')" />
        <RendererButton label="平台注册事件" :button-type="candidateKind === 'platform-event' ? 'primary' : 'default'"
          :disabled="locked" @click="chooseCandidateKind('platform-event')" />
      </div>
      <RendererTable v-if="candidateKind === 'data-model' && modelViewKey" :data-view-key="modelViewKey" :children="[...modelColumns]"
        :actions="modelActions" :show-data-view-meta="false" :show-pagination="false" />
      <RendererTable v-if="candidateKind === 'platform-event' && contractViewKey" :data-view-key="contractViewKey"
        :children="[...contractColumns]" :actions="contractActions" :show-data-view-meta="false" :show-pagination="false" />
      <DisplayAlert v-if="sourceLabel" :description="`当前来源：${sourceLabel}`" alert-type="info" :closable="false" />
      <template v-if="bindingId !== undefined">
        <h3>来源绑定</h3>
        <FeatureRecordFields :data-view-key="bindingViewKey" :record-id="bindingId" :specs="bindingSpecs" :locked="locked" :columns="2" />

        <template v-if="sourceKind === 'data-model'">
          <div class="dimension-source__header">
            <div>
              <strong>正式来源集合</strong>
              <p>集合关系只从当前节点数据空间正式模型选择；父主键和子主键按正式模型身份回读。</p>
            </div>
            <RendererButton label="新增子集合" button-type="primary" :plain="true" :disabled="locked" @click="addCollection" />
          </div>
          <RendererTable :data-view-key="collectionViewKey" :children="[...collectionColumns]" :actions="collectionActions"
            :show-data-view-meta="false" :show-pagination="false" />
          <FeatureRecordFields v-if="collectionId !== undefined" :key="String(collectionId)" :data-view-key="collectionViewKey"
            :record-id="collectionId" :specs="collectionSpecs" :locked="locked" :columns="2" />

          <div class="dimension-source__header">
            <div>
              <strong>数据模型事件</strong>
              <p v-if="eventEntryReason">{{ eventEntryReason }}</p>
            </div>
            <RendererButton label="维护数据模型事件" :disabled="locked || !!eventEntryReason" @click="openEventEditor" />
          </div>
        </template>

        <div class="dimension-source__header">
          <strong>字段到维度映射</strong>
          <RendererButton label="新增映射" button-type="primary" :plain="true" :disabled="locked" @click="addMapping" />
        </div>
        <div class="dimension-source__header">
          <p v-if="commitEntryReason">{{ commitEntryReason }}</p>
          <RendererButton label="维护来源提交协议" :disabled="locked || !!commitEntryReason" @click="openCommitEditor" />
        </div>
        <DisplayAlert v-if="sourceKind === 'platform-event' && platformNonDimensionFields.length" title="平台事件字段已按语义分流"
          :description="`此处只映射维度字段；${platformNonDimensionFields.join('、')} 等标识、属性、关系和时间字段仍由正式合同及领域投影消费，不会伪装成维度。`"
          alert-type="info" :show-icon="true" :closable="false" />
        <RendererTable :data-view-key="mappingViewKey" :children="[...mappingColumns]" :actions="mappingActions"
          :show-data-view-meta="false" :show-pagination="false" />
      </template>
    </template>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy" @click="close()" />
      <RendererButton label="保存来源绑定" button-type="primary" :disabled="loading || busy || subOpen || bindingId === undefined"
        :loading="busy" @click="save" />
    </template>
  </RendererDialog>
  <BlueprintDimensionEventEditor v-if="eventOpen" :source="source" />
  <BlueprintSourceCommitEditor v-if="commitOpen" :source="source" />
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {DisplayAlert, RendererButton, RendererDialog, RendererTable} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import BlueprintDimensionEventEditor from './blueprint-dimension-event-editor.vue'
import BlueprintSourceCommitEditor from './blueprint-source-commit-editor.vue'
import type {useApplicationFunctionDimensionSource} from './use-application-function-dimension-source'

const props = defineProps<{source: ReturnType<typeof useApplicationFunctionDimensionSource>}>()
const source = props.source
const {loading, busy, dialogError, dialogNotice, unknown, locked, candidateKind, modelCount, sourceKind, sourceLabel,
  platformNonDimensionFields, modelViewKey, contractViewKey, bindingViewKey, mappingViewKey, collectionViewKey, collectionId, bindingId,
  bindingSpecs, mappingColumns, collectionColumns, collectionSpecs, modelColumns, contractColumns, modelActions, contractActions, mappingActions,
  collectionActions, eventEntryReason, commitEntryReason, eventOpen, commitOpen, chooseCandidateKind, addMapping, addCollection,
  openEventEditor, openCommitEditor, save, close} = source
const subOpen = computed(() => eventOpen.value || commitOpen.value)
</script>

<style scoped>
.dimension-source__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 8px;
}

.dimension-source__header p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
}
</style>
