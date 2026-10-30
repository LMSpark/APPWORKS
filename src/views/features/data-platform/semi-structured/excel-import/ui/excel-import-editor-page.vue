<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>Excel 导入设计</h1><p v-if="importConfigId">方案 ID：{{ importConfigId }}</p></header>
    <p v-if="loading" role="status">正在读取设计…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <ExcelImportSheetLayoutPane v-model="layout" />
      <ExcelImportTransformRulesPane v-model="rules" @open-lookup="openLookup = true" @open-rule="openRule = true" />
      <RendererButton label="保存设计" button-type="primary" :disabled="busy" @click="save" />
    </template>
    <ExcelImportSheetLayoutLookupDialog v-if="openLookup" @close="openLookup = false" />
    <ExcelImportTransformRuleDialog v-if="openRule" @close="openRule = false" />
  </section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRoute} from 'vue-router'
import {RendererButton} from '@spark-appworks/spark-component'
import {EXCEL_IMPORT_DESIGN_INPUT, EXCEL_IMPORT_DESIGN_VIEW} from '@/lowcode/resources/semi-structured/excel-import/design-ops'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'
import ExcelImportSheetLayoutPane from './excel-import-sheet-layout-pane.vue'
import ExcelImportTransformRulesPane from './excel-import-transform-rules-pane.vue'
import ExcelImportSheetLayoutLookupDialog from './dialogs/excel-import-sheet-layout-lookup-dialog.vue'
import ExcelImportTransformRuleDialog from './dialogs/excel-import-transform-rule-dialog.vue'
import {parseDesignJsonText} from '../../../shared/model/design-json-ui'
import {readJsonArray} from '@/lowcode/resources/repository/staged-design-file-view'

const route = useRoute()
const openLookup = ref(false), openRule = ref(false)
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const importConfigId = computed(() => typeof route.query['importConfigId'] === 'string' ? route.query['importConfigId'] : '')
const {designView, loading, ready, busy, error, saveChanges, updateDesignField} = useStagedDesignPage({
  pageId: 'excel-import-editor-page',
  scenarioId,
  scopeId: importConfigId,
  scopeInputTable: EXCEL_IMPORT_DESIGN_INPUT,
  scopeField: 'importConfigId',
  designViewTable: EXCEL_IMPORT_DESIGN_VIEW,
  loadDataSet: id => LowcodeExcelImport.loadEditor(id),
  missingScopeMessage: '缺少 importConfigId 参数',
})
const designDoc = computed(() => {
  try {
    const parsed = parseDesignJsonText(String(designView.value?.rows[0]?.['designJson'] ?? '{}'))
    return {layout: readJsonArray(parsed, 'layout'), rules: readJsonArray(parsed, 'rules')}
  } catch {return {layout: [], rules: []}}
})
function writeDoc(layout: unknown, rules: unknown): void {
  updateDesignField(designView.value, 'designJson', JSON.stringify({layout, rules}, null, 2))
}
const layout = computed({
  get: () => designDoc.value.layout ?? [],
  set: value => writeDoc(value, rules.value),
})
const rules = computed({
  get: () => designDoc.value.rules ?? [],
  set: value => writeDoc(layout.value, value),
})
async function save(): Promise<void> {await saveChanges()}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
