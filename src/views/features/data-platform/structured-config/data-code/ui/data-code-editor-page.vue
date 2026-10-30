<!--
@module app:views/features/data-platform/structured-config/data-code/ui/data-code-editor-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>编码方案设计</h1><p v-if="codeDesignId">方案 ID：{{ codeDesignId }}</p></header>
    <p v-if="loading" role="status">正在读取编码设计…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready && codeDesignId">
      <label class="structured-editor-page__field">方案名称<input v-model="codeName" :disabled="busy"></label>
      <RendererButton label="保存设计" button-type="primary" :disabled="busy" @click="save" />
      <RendererButton label="编码类选择…" :disabled="busy" @click="openDialog = 'classSelector'" />
      <RendererButton label="父码规则…" :disabled="busy" @click="openDialog = 'parentCode'" />
      <RendererButton label="序列规则…" :disabled="busy" @click="openDialog = 'sequence'" />
      <RendererButton label="时间片…" :disabled="busy" @click="openDialog = 'timeString'" />
      <RendererButton label="初始化数据…" :disabled="busy" @click="openDialog = 'codeInit'" />
      <RendererButton label="编码类编辑…" :disabled="busy" @click="openDialog = 'classEdit'" />
    </template>
    <CodeClassSelectorDialog v-if="openDialog === 'classSelector'" @close="openDialog = ''" />
    <ParentCodeDialog v-if="openDialog === 'parentCode'" @close="openDialog = ''" />
    <SequenceSelectorDialog v-if="openDialog === 'sequence'" @close="openDialog = ''" />
    <TimeStringDialog v-if="openDialog === 'timeString'" @close="openDialog = ''" />
    <CodeInitDialog v-if="openDialog === 'codeInit'" @close="openDialog = ''" />
    <CodeClassEditDialog v-if="openDialog === 'classEdit'" @close="openDialog = ''" />
  </section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRoute} from 'vue-router'
import {RendererButton} from '@spark-appworks/spark-component'
import {DATA_CODE_DESIGN_INPUT, DATA_CODE_DESIGN_VIEW} from '@/lowcode/resources/structured-config/data-code/design-ops'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'
import CodeClassSelectorDialog from './dialogs/code-class-selector-dialog.vue'
import CodeClassEditDialog from './dialogs/code-class-edit-dialog.vue'
import CodeInitDialog from './dialogs/code-init-dialog.vue'
import ParentCodeDialog from './dialogs/parent-code-dialog.vue'
import SequenceSelectorDialog from './dialogs/sequence-selector-dialog.vue'
import TimeStringDialog from './dialogs/time-string-dialog.vue'

const route = useRoute()
const openDialog = ref('')
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const codeDesignId = computed(() => typeof route.query['codeDesignId'] === 'string' ? route.query['codeDesignId'] : '')
const {designView, loading, ready, busy, error, saveChanges, updateDesignField} = useStagedDesignPage({
  pageId: 'data-code-editor-page',
  scenarioId,
  scopeId: codeDesignId,
  scopeInputTable: DATA_CODE_DESIGN_INPUT,
  scopeField: 'codeDesignId',
  designViewTable: DATA_CODE_DESIGN_VIEW,
  loadDataSet: id => LowcodeDataCode.loadEditor(id),
  missingScopeMessage: '缺少 codeDesignId 参数',
})
const codeName = computed({
  get: () => String(designView.value?.rows[0]?.['CodeName'] ?? ''),
  set: value => updateDesignField(designView.value, 'CodeName', value),
})
async function save(): Promise<void> {await saveChanges()}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
.structured-editor-page h1 { margin: 0; font-size: 1.25rem; }
.structured-editor-page__field { display: grid; gap: 6px; max-width: 420px; }
</style>
