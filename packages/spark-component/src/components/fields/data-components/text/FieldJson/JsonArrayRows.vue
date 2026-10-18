<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonArrayRows
职责：标准JSON字段的对象数组行编辑模式，按字段子组件渲染表头和单元格。
边界：局部DataView承载子字段交互；row确认或inline输入经原字段接纳后写回其编辑域，不保存后端、推导授权或维护模型定义。
AI用途：通过r-json mode=rows使用，不在业务页面复制数组编辑与取消逻辑。
-->
<template>
  <div class="json-array-rows">
    <div class="json-array-toolbar">
      <el-button data-json-add type="primary" :disabled="locked || editing !== null || !canEdit(undefined)" @click="begin(true)">新增</el-button>
      <el-button v-if="!inline" data-json-edit :disabled="locked || selected === null || editing !== null || !canEdit(selected)" @click="begin(false)">编辑</el-button>
      <el-button data-json-delete type="danger" :disabled="locked || selected === null || editing !== null" @click="remove">删除</el-button>
      <el-button v-if="!inline" data-json-save-row type="success" :disabled="locked || editing === null" @click="save">保存</el-button>
      <el-button v-if="!inline" data-json-cancel-row :disabled="editing === null || committing" @click="cancel">取消</el-button>
      <el-button v-if="reorderable" data-json-move-up :disabled="locked || editing !== null || selectedIndex <= 0" @click="move(-1)">上移</el-button>
      <el-button v-if="reorderable" data-json-move-down :disabled="locked || editing !== null || selectedIndex < 0 || selectedIndex >= (view?.rows.length ?? 0) - 1" @click="move(1)">下移</el-button>
      <div v-if="toolbar" class="json-array-extra-actions"><RendererToolbar v-bind="toolbar" /></div>
    </div>
    <p v-if="error" role="alert">{{ error }}；原始JSON保留。</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <el-table v-if="view" :key="generation" :data="view.rows" :height="maxHeight === undefined ? height : undefined" :max-height="maxHeight" border highlight-current-row :row-key="rowKey" empty-text="无记录可显示"
      :current-row-key="selected ?? undefined" @row-click="select">
      <el-table-column v-for="child in fields" :key="String(child.props?.['field'])" :label="String(child.props?.['label'] || child.props?.['field'])"
        :width="dimension(child.props?.['width'])" :min-width="dimension(child.props?.['minWidth']) ?? (child.props?.['width'] === undefined ? 180 : undefined)"
        :align="alignment(child.props?.['valueAlign'])">
        <template #default="{row}">
          <FieldTableCellScope v-if="inline || row[rowKey] === editing || child.type === 'r-checkbox' || child.type === 'r-switch'" :source="view" :row="row">
            <SparkComponentRenderer :config="{...child,props:cellProps(child,row)}" />
          </FieldTableCellScope>
          <span v-else>{{ display(row[alias(String(child.props?.['field']))]) }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, shallowRef, ref, useId, watch} from 'vue'
import {SparkData, getSparkNodeChildren, type DataSet, type DataRow, type SparkNode, type SparkNodeChildren} from '@spark-appworks/spark-data'
import {asJsonValue, isJsonObject, parseJsonDocument} from '@spark-appworks/spark-json-document'
import type {JsonArrayRowAdapter} from './FieldJson.props'
import {SparkComponentRenderer, DATA_SOURCE, useSparkComponent} from '../../../../internal'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
import RendererToolbar from '../../../../containers/layout/action/RendererToolbar/RendererToolbar.vue'
import type {RToolbarProps} from '../../../../containers/layout/action/RendererToolbar/RendererToolbar.types'
import {useEventDefaults} from '../../../../containers/support/useEventDefaults'
import type {CancellableControl} from '../../../../containers/support/interactionControl'

const props = defineProps<{
  /** 原字段JSON文本；无效文本不转换为空数组。 */
  modelValue: string
  /** 原字段权限及业务限制，局部视图不能扩大许可。 */
  readOnly: boolean
  /** 数组字段按标准子组件描述；未声明的属性保留。 */
  children?: SparkNodeChildren | undefined
  /** 表格高度。 */
  height?: number | string
  /** 限制最大高度，内容较少时收缩。 */
  maxHeight?: number | string | undefined
  /** 默认row；inline逐项写回原字段，按顺序处理异步输入。 */
  rowEditMode?: 'row' | 'inline' | undefined
  /** 追加动作复用标准工具栏；未显式绑定时继承当前数组行上下文。 */
  toolbar?: RToolbarProps | undefined
  /** 可选数组顺序编辑；只改原字段数组次序，不添加业务属性。 */
  reorderable?: boolean | undefined
  /** 领域投影与当前行确认转换；原数组及其它行保留。 */
  rowAdapter?: JsonArrayRowAdapter | undefined
  /** 原字段受控写入；确认完成前保持行编辑保护，拒绝或失败时保留草稿。 */
  commit: (value: string) => Promise<boolean>
}>()
const emit = defineEmits<{'editing-change': [editing: boolean]}>()
const dataSet = shallowRef<DataSet>(), selected = ref<string | null>(null), editing = ref<string | null>(null), error = ref('')
const committing = ref(false), message = ref('')
const inline = computed(() => props.rowEditMode === 'inline'), queued = ref(0)
let queue = Promise.resolve(), echo: string | undefined
const {sparkProvide} = useSparkComponent({type:'r-json-rows-editor'})
const generation = ref(0)
const rowKey = `_json_row_${useId()}`
const fields = computed(() => getSparkNodeChildren(props.children).filter(node => typeof node.props?.['field'] === 'string'))
let names: string[] = []
function alias(name: string): string {return `field_${names.indexOf(name)}`}
const view = computed(() => dataSet.value?.getView('Rows'))
const selectedIndex = computed(() => view.value?.rows.findIndex(row => row[rowKey] === selected.value) ?? -1)
const locked = computed(() => props.readOnly || committing.value || queued.value > 0 || !!error.value || !fields.value.length)
let added = false, active = true
let sequence = 0
const originals = new Map<string, DataRow>()
function dimension(value: unknown): number | undefined {return typeof value === 'number' ? value : undefined}
function alignment(value: unknown): 'left' | 'center' | 'right' | undefined {return value === 'left' || value === 'center' || value === 'right' ? value : undefined}
function cellProps(child: SparkNode, row: DataRow): Record<string, unknown> {
  const id = String(row[rowKey]), field = String(child.props?.['field']), bound = view.value, own = generation.value
  const readonly = (!inline.value && row[rowKey] !== editing.value) || child.props?.['readonly'] === true || props.readOnly || committing.value || !canEdit(added && row[rowKey] === editing.value ? undefined : id)
  const result = {...child.props, field:alias(field), readonly}
  if (!inline.value) return result
  const valid = () => active && bound === view.value && own === generation.value && !props.readOnly && !committing.value && canEdit(id) && child.props?.['readonly'] !== true
  return {...result, onChange: (value: unknown, previous: unknown, control: CancellableControl): Promise<void> => {
    queued.value++
    const task = queue.then(async () => {
      let accepted = false
      try {
        if (!valid()) {control.cancel = true;return}
        const {dispatch} = useEventDefaults<{change:[unknown,unknown]}>({change:{systemDefault:async () => {
          if (!valid()) return
          const original = originals.get(id)
          if (!original || !bound) return
          const projected = props.rowAdapter ? object(props.rowAdapter.read(object(original))) : object(original)
          if (JSON.stringify(value) === JSON.stringify(projected[field])) {accepted = true;return}
          projected[field] = value
          const updated = props.rowAdapter ? object(props.rowAdapter.write(projected,object(original))) : object(projected)
          const next = JSON.stringify(bound.rows.map(item => String(item[rowKey]) === id ? updated : originals.get(String(item[rowKey]))))
          echo = next
          if (await props.commit(next) && valid() && props.modelValue === next) {
            originals.set(id,updated); accepted = true; message.value = ''
          }
        }}}, {onChange:child.props?.['onChange']})
        const outcome = await dispatch('change',value,previous)
        control.cancel = outcome.cancel || !accepted
        if (!outcome.cancel && !accepted && valid()) message.value = '原字段未接受本次修改；可重新输入。'
      } catch (cause) {control.cancel = true;if(valid())message.value = cause instanceof Error ? cause.message : String(cause)}
      finally {echo = undefined;queued.value--}
    })
    queue = task
    return task
  }}
}
function object(value: unknown): DataRow {
  const json = asJsonValue(value)
  if (!isJsonObject(json) || Array.isArray(json)) throw new Error('JSON行适配必须返回有效对象')
  return json
}
function canEdit(id: string | null | undefined): boolean {
  if (id === null) return false
  try {return props.rowAdapter?.canEdit?.(id === undefined ? undefined : object(originals.get(id))) ?? true}
  catch {return false}
}
function reset(): void {
  editing.value = null; selected.value = null; added = false; error.value = ''
  dataSet.value?.destroy(); dataSet.value = undefined
  originals.clear()
  try {
    const parsed = props.modelValue.trim() ? parseJsonDocument(props.modelValue) : []
    if (!Array.isArray(parsed) || parsed.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) throw new Error('JSON必须是对象数组')
    const rows = (parsed as DataRow[]).map((row, index) => {
      originals.set(String(index), row)
      return props.rowAdapter ? object(props.rowAdapter.read(object(row))) : row
    })
    if (rows.some(row => Object.hasOwn(row, rowKey))) throw new Error('JSON内部行标识冲突')
    names = [...new Set([...rows.flatMap(row => Object.keys(row)), ...fields.value.map(node => String(node.props?.['field']))])]
    if (fields.value.some(node => node.props?.['dataViewKey'] !== undefined || node.props?.['dataField'] !== undefined || node.props?.['dataMember'] !== undefined)) throw new Error('JSON子字段只绑定数组成员field')
    dataSet.value = SparkData.fromJson({dataSetName:'JsonFieldRows',tables:{Rows:{resourceType:'static-data',
      columns:[{name:rowKey,type:'string',isPrimaryKey:true}, ...names.map(name => ({name:alias(name),type:'object'}))],
      views:{default:{commitMode:'staged',rows:rows.map((row,index) => ({...Object.fromEntries(Object.entries(row).map(([name,value]) => [alias(name),value])),[rowKey]:String(index)}))}},
    }}})
    sparkProvide(DATA_SOURCE, dataSet.value.getView('Rows')!); generation.value++
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function select(row: DataRow): void {if (editing.value === null) selected.value = String(row[rowKey])}
function begin(create: boolean): void {
  if (locked.value || editing.value !== null || !view.value || !canEdit(create ? undefined : selected.value)) return
  if (inline.value && create) {
    try {
      const initial = props.rowAdapter ? object(props.rowAdapter.read({})) : {}
      const row = props.rowAdapter ? object(props.rowAdapter.write(initial,undefined)) : initial
      void publish(JSON.stringify([...view.value.rows.map(item => originals.get(String(item[rowKey]))),row]),selectedIndex.value < 0 ? undefined : selectedIndex.value)
    } catch (cause) {message.value = cause instanceof Error ? cause.message : String(cause)}
    return
  }
  if (create) {
    const id = `new-${++sequence}`
    try {
      const initial = props.rowAdapter ? object(props.rowAdapter.read({})) : {}
      view.value.replaceRows([...view.value.rows, {...Object.fromEntries(names.filter(name => Object.hasOwn(initial,name)).map(name => [alias(name),initial[name]])),[rowKey]: id}]); selected.value = id; added = true
    } catch (cause) {message.value = cause instanceof Error ? cause.message : String(cause);return}
  }
  if (selected.value !== null) {editing.value = selected.value; view.value.setCurrentRowById(selected.value)}
}
function serialize(rows: DataRow[]): string {
  return JSON.stringify(rows.map(row => {
    const original = originals.get(String(row[rowKey]))
    if ((props.rowAdapter || inline.value) && row[rowKey] !== editing.value && original) return original
    const value = Object.fromEntries(names.filter(name => Object.hasOwn(row,alias(name))).map(name => [name,row[alias(name)]]))
    return props.rowAdapter ? object(props.rowAdapter.write(value,original ? object(original) : undefined)) : value
  }))
}
async function publish(next: string, selectIndex?: number): Promise<void> {
  const previousView = view.value
  committing.value = true; message.value = ''
  try {
    const accepted = await props.commit(next)
    if (!active) return
    if (accepted) {
      // 原字段回传已通过watch接纳新视图时，不再销毁其选择和组件状态。
      if (view.value === previousView) reset()
      const moved = selectIndex === undefined ? undefined : view.value?.rows[selectIndex]
      if (moved) selected.value = String(moved[rowKey])
    }
    else message.value = '原字段未接受本次修改；可继续编辑或取消。'
  } catch (cause) {if (active) message.value = cause instanceof Error ? cause.message : String(cause)}
  finally {committing.value = false}
}
async function save(): Promise<void> {
  const current = view.value, id = editing.value
  if (locked.value || !current || id === null) return
  if (!canEdit(added ? undefined : id)) return
  if (!added && !current.hasEditingChanges(id)) {cancel();return}
  try {
    const next = serialize(current.rows.map(row => row[rowKey] === id ? current.getEditingRow(id) ?? row : row))
    await publish(next)
  } catch (cause) {message.value = cause instanceof Error ? cause.message : String(cause)}
}
async function remove(): Promise<void> {
  if (locked.value || editing.value !== null || selected.value === null || !view.value) return
  await publish(serialize(view.value.rows.filter(row => row[rowKey] !== selected.value)))
}
async function move(offset: -1 | 1): Promise<void> {
  const current = view.value, from = selectedIndex.value, to = from + offset
  if (!props.reorderable || locked.value || editing.value !== null || !current || from < 0 || to < 0 || to >= current.rows.length) return
  const rows = [...current.rows]
  const moved = rows.splice(from, 1)[0]!
  rows.splice(to, 0, moved)
  await publish(serialize(rows), to)
}
function cancel(): void {
  if (committing.value) return
  if (editing.value !== null) view.value?.discardEditingRows([editing.value])
  if (added && view.value) view.value.replaceRows(view.value.rows.filter(row => row[rowKey] !== editing.value))
  editing.value = null; added = false; message.value = ''
}
function display(value: unknown): string {return value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)}
watch(() => props.modelValue, value => {if (!inline.value || echo === undefined || value !== echo) reset()}, {immediate:true,flush:'sync'})
watch(() => JSON.stringify(fields.value), reset, {flush:'sync'})
watch(() => props.readOnly, value => {if(value) cancel()}, {flush:'sync'})
watch(() => editing.value !== null || committing.value || queued.value > 0, value => {if(active)emit('editing-change',value)}, {flush:'sync'})
onBeforeUnmount(() => {active=false;if(editing.value !== null || committing.value || queued.value > 0) emit('editing-change',false);dataSet.value?.destroy()})
</script>
<style scoped>
.json-array-rows{width:100%;min-width:0}
.json-array-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.json-array-extra-actions{min-width:0;max-width:100%}
.json-array-toolbar :deep(.el-button + .el-button){margin-left:0}
</style>



