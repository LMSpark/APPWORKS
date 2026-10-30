<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>PDF 规则设计</h1><p v-if="ruleId">规则 ID：{{ ruleId }}</p></header>
    <p v-if="loading" role="status">正在读取…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <PdfInspectRuleForm v-model="ruleDoc" />
      <RendererButton label="保存规则" button-type="primary" :disabled="busy" @click="save" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {RendererButton} from '@spark-appworks/spark-component'
import {PDF_INSPECT_DESIGN_INPUT, PDF_INSPECT_DESIGN_VIEW} from '@/lowcode/resources/semi-structured/pdf-inspect/design-ops'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'
import PdfInspectRuleForm from './pdf-inspect-rule-form.vue'
import {parseDesignJsonText} from '../../../shared/model/design-json-ui'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const ruleId = computed(() => typeof route.query['ruleId'] === 'string' ? route.query['ruleId'] : '')
const {designView, loading, ready, busy, error, saveChanges, updateDesignField} = useStagedDesignPage({
  pageId: 'pdf-inspect-editor-page',
  scenarioId,
  scopeId: ruleId,
  scopeInputTable: PDF_INSPECT_DESIGN_INPUT,
  scopeField: 'ruleId',
  designViewTable: PDF_INSPECT_DESIGN_VIEW,
  loadDataSet: id => LowcodePdfInspect.loadEditor(id),
  missingScopeMessage: '缺少 ruleId 参数',
})
const ruleDoc = computed({
  get: () => {
    try {return parseDesignJsonText(String(designView.value?.rows[0]?.['designJson'] ?? '{}'))}
    catch {return {}}
  },
  set: value => updateDesignField(designView.value, 'designJson', JSON.stringify(value ?? {}, null, 2)),
})
async function save(): Promise<void> {await saveChanges()}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
