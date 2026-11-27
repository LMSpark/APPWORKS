<template>
  <p v-if="loading" role="status">正在读取申请详情…</p>
  <p v-if="error || proofError" role="alert">{{ error || proofError }}</p>
  <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
  <RendererForm v-if="ready && !proofError" :data-view-key="viewKey" :children="fields" :auto-columns="false"
    :show-data-view-meta="false" />
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {DataViewFilter, type DataView} from '@spark-appworks/spark-data'
import {RendererButton, RendererForm} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {applicationPageScope, detailFields, textFields} from './application-fields'

const props = defineProps<{applicationKey: number}>()
const fields = textFields(detailFields)
const proofError = ref('')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  ...applicationPageScope,
  componentType: 'mp-template-application-detail',
  title: '申请详情',
  prepareView(view: DataView) {
    view.queryConfig = {fields: Object.keys(detailFields), pagination: 'paged', allPages: false, autoQuery: false}
    view.page = 1
    view.pageSize = 2
    view.filterExpression = DataViewFilter.condition({field: 'id', operator: 'eq', value: props.applicationKey}).toJSON()
  },
})
watch(ready, value => {
  proofError.value = ''
  if (!value) return
  const source = session.runtime?.resolveView(viewKey.value)
  const row = source?.rows[0]
  try {
    if (!source || !row || source.primaryKey !== 'id' || source.countReported !== true ||
      source.total !== 1 || source.rows.length !== 1 || row['id'] !== props.applicationKey) {
      throw new Error('无法按原申请键确认唯一详情')
    }
    source.captureReadRow(row, ['id'])()
    source.setCurrentRow(row)
  } catch (cause) {
    proofError.value = cause instanceof Error ? cause.message : '无法读取当前申请详情'
  }
}, {flush: 'sync'})
</script>
