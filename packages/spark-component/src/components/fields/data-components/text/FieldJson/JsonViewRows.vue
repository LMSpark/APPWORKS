<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonViewRows
职责：按完整绑定只读呈现DataView结果JSON。
边界：可读投影归DataView；不保存、不查询、不复制结果为业务状态。
AI用途：r-json dataMember=rows的内部呈现，沿统一绑定处理视图切换与释放。
-->
<template>
  <p v-if="content.error" role="status">{{ content.error }}</p>
  <JsonTreeEditor v-else-if="mode === 'tree'" :model-value="content.json" read-only :height="height" />
  <SparkJsonEditor v-else :model-value="content.json" read-only :mode="mode" :height="height" />
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {useActiveFieldRow} from '../../../context/useActiveFieldRow'
import SparkJsonEditor from '../../../../editors/SparkJsonEditor.vue'
import JsonTreeEditor from '../../../../editors/JsonTreeEditor.vue'
import type {RJsonProps} from './FieldJson.props'
const props = withDefaults(defineProps<Pick<RJsonProps, 'dataViewKey' | 'dataMember' | 'includeQueryInfo' | 'height'> & {mode?: 'text' | 'tree' | 'table'}>(), {mode: 'tree', height: 320})
const binding = useActiveFieldRow(props)
const content = computed(() => {
  // 原绑定订阅的结果/配置事件使快照失效；绝不直接将未经权限投影的memberValue输出。
  binding.revision.value
  try {
    const view = binding.dataSource.value
    if (!view || view.destroyed) return {json: '', error: '尚未取得有效查询结果'}
    const snapshot = view.readSnapshot()
    return {json: JSON.stringify(props.includeQueryInfo ? snapshot : snapshot.rows, null, 2), error: ''}
  } catch (cause) {return {json: '', error: cause instanceof Error ? cause.message.replace(/^DATA_VIEW_READ_RESULT: /, '') : String(cause)}}
})
</script>
