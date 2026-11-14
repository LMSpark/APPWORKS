<!--
@module app:views/features/application/application-manager/ui/application-database-dialog
职责：新增应用时选择默认数据库：按数据库名、服务器、端口、类型、架构、描述筛选的分页列表，行“确定”或选中后底部“确定”。
边界：候选绑定 93DF 场景 _base_dbInfo@picker 正式视图；只把所选行交回调用方，写入由应用记录编排落到原关联视图。
-->
<template>
  <RendererDialog :model-value="true" title="选择数据库" width="min(1200px, 94vw)" :append-to-body="true" @update:model-value="emit('close')">
    <p v-if="message" role="alert">{{ message }}</p>
    <RendererTable :data-view-key="pickerKey" :children="fields" :filter="filter" :actions="actions" :auto-columns="false"
      :highlight-current-row="true" :show-data-view-meta="false" :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
    <template #footer>
      <RendererButton label="取消" @click="emit('close')" />
      <RendererButton label="确定" button-type="primary" @click="confirm" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {DATABASE_RELATIONS_SCENARIO} from '../model/application-manager-model'

const emit = defineEmits<{close: []; choose: [row: Readonly<DataRow>]}>()
const pickerKey = buildDataViewKey('_base_dbInfo', 'picker', DATABASE_RELATIONS_SCENARIO)
const {sparkConsume} = useSparkComponent({type: 'application-database-dialog'})
const message = ref('')
const column = (field: string, label: string, minWidth = 120): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
const fields: SparkNode[] = [column('Name', '数据库名', 180), column('ServerName', '服务器名称', 180), column('Port', '端口', 100),
  column('Type', '类型', 100), column('SchemaName', '架构名称', 120), column('Remark', '描述', 220)]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [['Name', '数据库名'], ['ServerName', '服务器名称'], ['Port', '端口'], ['Type', '类型'], ['SchemaName', '架构名称'], ['Remark', '描述']]
    .map(([field, label]) => ({type: 'r-text', props: {field, label, filterTrim: true}})),
}
const actions: RToolbarProps = {children: [{type: 'r-button', props: {label: '确定', link: true, buttonType: 'primary',
  onClick: (row: DataRow) => emit('choose', row)}}]}
const picker = () => {
  const view = sparkConsume(PAGE_RUNTIME)?.resolveView(pickerKey)
  if (!view) throw new Error('选择数据库缺少正式视图')
  return view
}

function confirm(): void {
  const row = picker().currentRow
  if (!row) { message.value = '请选择数据库'; return }
  emit('choose', row)
}
onMounted(async () => {
  try {
    const view = picker()
    await view.refresh()
    if (view.loadingError) message.value = `获取数据库列表失败：${view.loadingError.message}`
  } catch (cause) { message.value = cause instanceof Error ? cause.message : String(cause) }
})
</script>
