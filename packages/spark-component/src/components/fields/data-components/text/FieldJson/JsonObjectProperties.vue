<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonObjectProperties
职责：JSON对象的固定成员表编辑，复用JSON专题解析并写回原标准字段。
边界：仅保留未提交输入文本；不查询、保存后端或创建第二份DataView数据。
AI用途：由r-json properties模式按Schema呈现参数对象，字段绑定与权限归外层标准字段。
-->
<template>
  <div class="json-object-properties">
    <p v-if="content.error" role="alert">{{ content.error }}</p>
    <el-table v-if="!content.error" :data="members" :max-height="height" border empty-text="无记录可显示">
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column prop="description" label="描述" min-width="180" />
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column :label="valueLabel ?? '值'" min-width="240">
        <template #default="{row}">
          <el-input :data-json-property="row.name" :model-value="drafts.get(row.name) ?? display(memberValue(row.name))"
            :disabled="readOnly || committing" :aria-label="`${row.name} ${valueLabel ?? '值'}`"
            @update:model-value="input(row.name, $event)" @change="write(row.name, $event)" />
          <el-button v-if="drafts.has(row.name)" link size="small" :data-json-cancel-property="row.name"
            :aria-label="`取消输入 ${row.name}`" :disabled="readOnly || committing" @click="cancelInput(row.name)">取消输入</el-button>
          <p v-if="errors.has(row.name)" role="alert">{{ errors.get(row.name) }}</p>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {asJsonValue, isJsonObject, parseJsonDocument, type JsonObject, type JsonSchemaObject, type JsonValue} from '@spark-appworks/spark-json-document'

const props = defineProps<{
  /** 原字段JSON文本；无效对象不被空值覆盖。 */
  modelValue: string
  /** 原字段权限及宿主限制。 */
  readOnly: boolean
  /** 只呈现已声明的顶层成员；未声明数据原样保留。 */
  schema: JsonSchemaObject | undefined
  /** 值标题。 */
  valueLabel: string | undefined
  /** 表格最大高度。 */
  height: number | string
  /** 原字段受保护写入；拒绝时保留输入并提示。 */
  commit: (value: string) => Promise<boolean>
}>()
const emit = defineEmits<{'editing-change': [value: boolean]}>()
const drafts = ref(new Map<string,string>()), errors = ref(new Map<string,string>()), committing = ref(false)
let active = true
watch(() => committing.value || drafts.value.size > 0,
  value => emit('editing-change', value), {immediate: true, flush: 'sync'})
const content = computed(() => {
  try {
    const value = parseJsonDocument(props.modelValue)
    if (!isJsonObject(value)) throw new Error('JSON必须是对象')
    return {value, error:''}
  } catch(cause) {return {value:undefined, error:cause instanceof Error ? cause.message : String(cause)}}
})
const members = computed(() => Object.entries(props.schema?.properties ?? {}).map(([name, schema]) => ({name,
  description:typeof schema === 'object' ? schema.description ?? '' : '',
  type:typeof schema === 'object' ? typeof schema['x-typeLabel'] === 'string' ? schema['x-typeLabel']
    : Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type ?? '' : '',
})))
function parse(text: string): JsonValue {
  const value = text.trim()
  if (!value) return ''
  let parsed: unknown
  try {parsed = JSON.parse(value)} catch {return value}
  const normalized = asJsonValue(parsed)
  if (normalized === null && parsed !== null) throw new Error('输入超出有效JSON值范围')
  return normalized
}
function memberValue(name: string): JsonValue | undefined {
  const object = content.value.value
  return object && Object.hasOwn(object, name) ? object[name] : undefined
}
function display(value: JsonValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') return JSON.stringify(value)
  try {return parse(value) === value ? value : JSON.stringify(value)} catch {return JSON.stringify(value)}
}
async function write(name: string, text: string): Promise<void> {
  if (!active || props.readOnly || committing.value || !content.value.value || !members.value.some(member => member.name === name)) return
  committing.value = true; errors.value.delete(name)
  try {
    const next: JsonObject = {...content.value.value, [name]:parse(text)}
    const serialized = JSON.stringify(next)
    if (serialized === JSON.stringify(content.value.value)) {drafts.value.delete(name); return}
    const accepted = await props.commit(serialized)
    if (active && accepted) drafts.value.delete(name)
    if (active && !accepted) errors.value.set(name, '原字段未接受修改；请检查数据权限和绑定。')
  } catch(cause) {if(active) errors.value.set(name, cause instanceof Error ? cause.message : String(cause))}
  finally {if(active) committing.value=false}
}
function input(name: string, text: string): void {
  if (!active || props.readOnly || committing.value) return
  if (text === display(memberValue(name))) cancelInput(name)
  else drafts.value.set(name, text)
}
function cancelInput(name: string): void {
  if (!active || props.readOnly || committing.value) return
  drafts.value.delete(name); errors.value.delete(name)
}
// 接纳兄弟成员不清除其他未确认输入；目标成员改变时仍以原字段为准。
watch(() => content.value.value, (next, previous) => {
  for (const name of drafts.value.keys()) {
    if (JSON.stringify(next?.[name]) !== JSON.stringify(previous?.[name])) {
      drafts.value.delete(name); errors.value.delete(name)
    }
  }
}, {flush: 'sync'})
// 配置刷新可重建等价Schema；仅实际定义变化才丢弃未确认输入，也跟踪嵌套定义的原位修改。
watch([()=>JSON.stringify(props.schema), ()=>props.readOnly],()=>{drafts.value=new Map();errors.value=new Map()}, {flush:'sync'})
onBeforeUnmount(()=>{active=false;emit('editing-change',false)})
</script>
<style scoped>
.json-object-properties { width:100%; min-width:0; }
</style>
