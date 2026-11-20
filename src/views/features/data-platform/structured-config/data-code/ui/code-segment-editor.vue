<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-segment-editor
职责：以标准表格/字段维护原编码分段，确认删除后仅暂存，规则选择交回宿主。
边界：所有字段与选择绑定原DataView；不保存、不持草稿，不替代父记录新增守卫。
AI用途：编码编辑器内的窄分段区域，传入完整节点绑定及宿主交互锁。
-->
<template>
  <section>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton :data-view-key="dataViewKey" label="新增分段" perm-action="create" :disabled="locked" @click="add" />
    <RendererButton :data-view-key="dataViewKey" label="删除分段" :disabled="!canRemove" @click="beginRemove" />
    <RendererTable :data-view-key="dataViewKey" :children="fields" :actions="actions" :show-data-view-meta="false" />
    <RendererDialog v-if="removing" :model-value="true" :data-view-key="dataViewKey" title="删除分段确认" :width="420" :append-to-body="true"
      :close-disabled="acting" @update:model-value="removing = undefined">
      <p>确定删除所选分段？</p>
      <template #footer>
        <RendererButton label="取消删除分段" :disabled="acting" @click="removing = undefined" />
        <RendererButton label="确定删除分段" :disabled="acting" @click="remove(removing)" />
      </template>
    </RendererDialog>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue'
import {buildDataViewKey, parseDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {isFixedCodeNode} from '@/lowcode/resources/structured-config/data-code/design-ops'
import {addCodeSegment, changeCodeSegmentType, removeCodeSegments} from '@/lowcode/resources/structured-config/data-code/segment-ops'
const props = defineProps<{dataViewKey: string; interactionLocked: boolean}>()
const emit = defineEmits<{select: [row: DataRow]}>()
const {sparkConsume} = useSparkComponent({type: 'code-segment-editor'}), runtime = sparkConsume(PAGE_RUNTIME)
const acting = ref(false), error = ref(''), revision = ref(0), removing = shallowRef<Array<string | number>>()
let unsubscribe: (() => void) | undefined
const busy = computed(() => acting.value || removing.value !== undefined)
defineExpose({busy})
const locked = computed(() => props.interactionLocked || busy.value)
const view = computed(() => {revision.value; return runtime?.resolveView(props.dataViewKey)})
function dataSet() {
  const parsed = parseDataViewKey(props.dataViewKey), nodes = view.value
  if (!parsed?.scope || parsed.tableName !== 'Base_CodeNodeDesign' || !nodes?.dataSet
    || nodes.dataSet.scenarioId !== parsed.scope || nodes.viewId !== 'default') throw new Error('分段缺少原始完整视图绑定')
  return nodes.dataSet
}
const selectedIds = computed(() => {revision.value; const ids = view.value?.getSelectedValues() ?? []
  return ids.some(id => typeof id === 'boolean') ? [] : ids.filter((id): id is string | number => typeof id !== 'boolean')
})
const canRemove = computed(() => {revision.value; const nodes = view.value
  return !locked.value && !!nodes && selectedIds.value.length > 0 && selectedIds.value.every(id => {
    const row = nodes.rows.find(item => nodes.getPkKey(item) === id)
    return !!row && (nodes.dirtyTracking.pendingCreateIds.has(id) || nodes.deleteActionState(row) === 'enabled')
  })
})
const fields = computed<SparkNode[]>(() => [
  {type: 'r-number', props: {field: 'NodeNo', label: '段号', width: 110, precision: 0, showCellControl: true, cellReadonly: () => locked.value}},
  {type: 'r-select', props: {field: 'NodeType', label: '类型', width: 180, showCellControl: true,
    optionDataViewKey: buildDataViewKey('Dict_CodeNodeType', 'default', dataSet().scenarioId!),
    cellReadonly: (row: Readonly<DataRow>) => locked.value || !view.value?.currentRow || view.value.getPkKey(view.value.currentRow) !== view.value.getPkKey(row), onChange: changeType}},
  {type: 'r-text', props: {field: 'ParameterName', label: '参数名称', showCellControl: true,
    cellReadonly: (row: Readonly<DataRow>) => {const id = view.value?.getPkKey(row); return locked.value || !isFixedCodeNode(dataSet(), id === undefined ? row : view.value?.getEditingRow(id) ?? row)}}},
])
const actions = computed(() => ({children: [{type: 'r-button', props: {label: '选择', disabled: locked.value, onClick: (row: DataRow) => emit('select', row)}}]}))
function changeType(next: unknown, previous: unknown, control: unknown): void {
  if (control === null || typeof control !== 'object' || !('cancel' in control)) throw new Error('分段类型缺少标准变更控制器')
  control.cancel = true
  try {
    if (locked.value) throw new Error('分段当前不可编辑')
    const row = view.value?.currentRow, id = row ? view.value?.getPkKey(row) : undefined
    if (id === undefined) throw new Error('请选择当前分段')
    changeCodeSegmentType(dataSet(), {id, previous}, next); error.value = ''
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function add(): Promise<void> {
  if (locked.value) return
  acting.value = true; error.value = ''
  try {await addCodeSegment(dataSet())}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {acting.value = false; revision.value++}
}
function beginRemove(): void {
  if (!canRemove.value) return
  const ids = [...selectedIds.value]
  if (ids.every(id => view.value?.dirtyTracking.pendingCreateIds.has(id))) {void remove(ids); return}
  removing.value = ids
}
async function remove(ids: readonly (string | number)[]): Promise<void> {
  if (acting.value || props.interactionLocked) return
  acting.value = true; error.value = ''
  try {await removeCodeSegments(dataSet(), ids)}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {removing.value = undefined; acting.value = false; revision.value++}
}
onMounted(() => {const changed = () => revision.value++; unsubscribe = dataSet().onAnyViewChange({rowsChanged: changed, editingChanged: changed,
  selectedRowsChanged: changed, currentRowChanged: changed, requestStateChanged: changed, mutatingChanged: changed})})
onBeforeUnmount(() => unsubscribe?.())
</script>
