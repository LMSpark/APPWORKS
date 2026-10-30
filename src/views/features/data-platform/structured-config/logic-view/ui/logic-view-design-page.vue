<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-design-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>逻辑视图设计</h1><p v-if="viewId">视图 ID：{{ viewId }}</p></header>
    <p v-if="loading" role="status">正在读取设计…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <JsonTreeEditor v-model="designTree" :height="360" />
      <RendererButton label="保存设计" button-type="primary" :disabled="busy" @click="save" />
      <RendererButton label="放弃修改并重读" :disabled="busy" @click="reload" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {JsonTreeEditor, RendererButton} from '@spark-appworks/spark-component'
import {LOGIC_VIEW_DESIGN_INPUT, LOGIC_VIEW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/logic-view/design-ops'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const viewId = computed(() => typeof route.query['viewId'] === 'string' ? route.query['viewId'] : '')
const {designView, loading, ready, busy, error, saveChanges, refreshDesign, updateDesignField} = useStagedDesignPage({
  pageId: 'logic-view-design-page',
  scenarioId,
  scopeId: viewId,
  scopeInputTable: LOGIC_VIEW_DESIGN_INPUT,
  scopeField: 'viewId',
  designViewTable: LOGIC_VIEW_DESIGN_VIEW,
  loadDataSet: id => LowcodeLogicView.loadEditor(id),
  missingScopeMessage: '缺少 viewId 参数',
})
const designTree = computed({
  get: () => String(designView.value?.rows[0]?.['designJson'] ?? ''),
  set: value => updateDesignField(designView.value, 'designJson', value),
})
async function save(): Promise<void> {await saveChanges()}
async function reload(): Promise<void> {await refreshDesign()}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
