<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonObjectForm
职责：按Schema将JSON对象成员呈现为表单，嵌套修改合并回原字段。
边界：仅呈现固定成员；下拉候选浮层按需挂载，已选标题读取同一Schema；不应用默认值、不执行业务校验或保存，不创建第二份DataView。
AI用途：通过r-json form模式编辑配置，复用外层字段权限、草稿和过期事件守卫。
-->
<template>
  <div class="json-object-form">
    <p v-if="content.error" role="alert">{{ content.error }}</p>
    <template v-if="content.value">
      <div v-for="member in members" :key="member.name" :data-json-member="member.name"
        class="json-member" :class="{'json-member--object': member.schema.type === 'object'}">
        <div class="json-member-heading">
          <span>{{ member.schema.title || member.name }}</span>
          <el-button v-if="drafts.has(member.name)" link size="small" data-json-cancel-input
            :aria-label="`取消输入 ${member.schema.title || member.name}`" :disabled="locked"
            @click="cancelInput(member.name)">取消输入</el-button>
          <el-button v-if="!schema?.required?.includes(member.name)" link size="small" data-json-remove
            :aria-label="`移除 ${member.schema.title || member.name}`" :disabled="locked || !has(member.name)"
            @click="write(member.name, undefined)">移除配置</el-button>
        </div>
        <p v-if="errors.has(member.name)" role="alert">{{ errors.get(member.name) }}</p>
        <JsonObjectForm v-if="member.schema.type === 'object'" :model-value="JSON.stringify(value(member.name) === undefined ? {} : value(member.name))"
          :schema="member.schema" :read-only="readOnly" :busy="busy || committing" :commit="text => write(member.name, parseJsonDocument(text))"
          @editing-change="value => childEditing.set(member.name, value)" />
        <el-select v-else-if="arrayChoices(member.schema).length && scalarArray(member.name)" multiple
          :model-value="value(member.name)" :disabled="locked" :aria-label="member.schema.title || member.name" :persistent="false"
          placeholder="未配置" @update:model-value="write(member.name, $event)">
          <template #label="selected">{{ choiceLabel(arrayChoices(member.schema), selected.value, selected.label) }}</template>
          <el-option v-for="(choice, index) in arrayChoices(member.schema)" :key="index" :value="choice.value" :label="choice.label" />
        </el-select>
        <el-radio-group v-else-if="member.schema['x-control'] === 'radio' && choices(member.schema).length"
          :model-value="value(member.name)" :disabled="locked" :aria-label="member.schema.title || member.name"
          @update:model-value="write(member.name, $event)">
          <el-radio v-for="(choice, index) in choices(member.schema)" :key="index" :value="choice.value">{{ choice.label }}</el-radio>
        </el-radio-group>
        <el-select v-else-if="choices(member.schema).length" :model-value="value(member.name)" :disabled="locked"
          :aria-label="member.schema.title || member.name" :persistent="false" placeholder="未配置" @update:model-value="write(member.name, $event)">
          <template #label="selected">{{ choiceLabel(choices(member.schema), selected.value, selected.label) }}</template>
          <el-option v-for="(choice, index) in choices(member.schema)" :key="index" :value="choice.value" :label="choice.label" />
        </el-select>
        <el-input-number v-else-if="member.schema.type === 'number' || member.schema.type === 'integer'"
          :model-value="numberValue(member.name)" :disabled="locked" :aria-label="member.schema.title || member.name"
          :min="member.schema.minimum" :max="member.schema.maximum" :precision="member.schema.type === 'integer' ? 0 : undefined"
          @update:model-value="write(member.name, $event)" />
        <el-input v-else-if="member.schema.type === 'string'" :model-value="drafts.get(member.name) ?? textValue(member.name)" :disabled="locked"
          :aria-label="member.schema.title || member.name" placeholder="未配置"
          @update:model-value="input(member.name, $event)" @change="write(member.name, $event)" />
        <el-input v-else :model-value="drafts.get(member.name) ?? JSON.stringify(value(member.name))" type="textarea" :disabled="locked"
          :aria-label="member.schema.title || member.name" placeholder="JSON值；未配置"
          @update:model-value="input(member.name, $event)" @change="writeJson(member.name, $event)" />
        <small v-if="member.schema.description">{{ member.schema.description }}</small>
        <small v-if="has(member.name)">当前值：{{ JSON.stringify(value(member.name)) }}</small>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {asJsonValue, isJsonObject, parseJsonDocument, type JsonSchemaObject, type JsonValue} from '@spark-appworks/spark-json-document'

const props = defineProps<{
  /** 原字段或所属对象的JSON文本。 */
  modelValue: string
  /** 原字段权限与提交锁。 */
  readOnly: boolean
  /** 上层成员写回期间暂时锁定输入，不使当前编辑上下文失效。 */
  busy?: boolean
  /** 仅展示properties，保留未声明成员；不填充default。 */
  schema: JsonSchemaObject | undefined
  /** 写回原字段；false表示被原绑定或权限守卫拒绝。 */
  commit: (value: string) => Promise<boolean>
}>()
const emit = defineEmits<{'editing-change': [value: boolean]}>()
const drafts = ref(new Map<string, string>()), errors = ref(new Map<string, string>()), committing = ref(false)
const childEditing = ref(new Map<string, boolean>())
let active = true
const locked = computed(() => props.readOnly || props.busy || committing.value)
watch(() => committing.value || drafts.value.size > 0 || [...childEditing.value.values()].some(Boolean),
  value => emit('editing-change', value), {immediate: true, flush: 'sync'})
const content = computed(() => {
  try {
    const value = parseJsonDocument(props.modelValue)
    if (!isJsonObject(value)) throw new Error('JSON必须是对象；原值保留，请用JSON编辑修正')
    return {value, error: ''}
  } catch (cause) {return {value: undefined, error: String(cause instanceof Error ? cause.message : cause)}}
})
const members = computed(() => Object.entries(props.schema?.properties ?? {}).map(([name, definition]): {name: string; schema: JsonSchemaObject} => ({name,
  schema: typeof definition === 'object' ? definition : {},
})))
function has(name: string): boolean {return !!content.value.value && Object.hasOwn(content.value.value, name)}
function value(name: string): JsonValue | undefined {return has(name) ? content.value.value?.[name] : undefined}
function numberValue(name: string): number | undefined {const raw = value(name); return typeof raw === 'number' ? raw : undefined}
function textValue(name: string): string {const raw = value(name); return typeof raw === 'string' ? raw : ''}
function input(name: string, text: string): void {
  if (!active || locked.value) return
  const schema = members.value.find(member => member.name === name)?.schema
  const original = schema?.type === 'string' ? textValue(name) : JSON.stringify(value(name)) ?? ''
  if (text === original) cancelInput(name)
  else drafts.value.set(name, text)
}
function cancelInput(name: string): void {
  if (!active || locked.value) return
  drafts.value.delete(name); errors.value.delete(name)
}
function scalarArray(name: string): boolean {
  const raw = value(name)
  return raw === undefined || Array.isArray(raw) && raw.every(item => ['string', 'number', 'boolean'].includes(typeof item))
}
function arrayChoices(schema: JsonSchemaObject): {label: string; value: string | number | boolean}[] {
  return schema.type === 'array' && typeof schema.items === 'object' ? choices(schema.items) : []
}
function choices(schema: JsonSchemaObject): {label: string; value: string | number | boolean}[] {
  if (schema.type === 'boolean') return [{label: '是', value: true}, {label: '否', value: false}]
  const literals = schema.oneOf ?? schema.enum?.map((value): JsonSchemaObject => ({const: value})) ?? []
  return literals.flatMap(item => {
    if (typeof item !== 'object' || !Object.hasOwn(item, 'const')) return []
    const value = item.const
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [{label: item.title ?? String(value), value}] : []
  })
}
// 选项浮层按需挂载，已选标题直接读取同一Schema，不能依赖尚未创建的el-option缓存。
function choiceLabel(options: ReturnType<typeof choices>, value: unknown, fallback: unknown): unknown {
  return options.find(option => option.value === value)?.label ?? fallback
}
async function writeJson(name: string, text: string): Promise<void> {
  try {await write(name, JSON.parse(text))}
  catch (cause) {if (active) errors.value.set(name, cause instanceof Error ? cause.message : String(cause))}
}
async function write(name: string, nextValue: unknown): Promise<boolean> {
  if (!active || locked.value || !content.value.value || !members.value.some(member => member.name === name)) return false
  committing.value = true; errors.value.delete(name)
  try {
    const next = {...content.value.value}
    if (nextValue === undefined) {
      if (props.schema?.required?.includes(name)) return false
      delete next[name]
    } else {
      const normalized = asJsonValue(nextValue)
      if (normalized === null && nextValue !== null) throw new Error('输入超出有效JSON值范围')
      Object.defineProperty(next, name, {value: normalized, enumerable: true, writable: true, configurable: true})
    }
    const text = JSON.stringify(next)
    if (text === JSON.stringify(content.value.value)) {drafts.value.delete(name); return true}
    const accepted = await props.commit(text)
    if (active && accepted) drafts.value.delete(name)
    if (active && !accepted) errors.value.set(name, '原字段未接受修改；请检查数据权限和绑定。')
    return accepted
  } catch (cause) {if (active) errors.value.set(name, cause instanceof Error ? cause.message : String(cause)); return false}
  finally {if (active) committing.value = false}
}
// 接纳兄弟成员不清除其他未确认输入；目标成员改变时仍以原字段为准。
watch(() => content.value.value, (next, previous) => {
  for (const name of drafts.value.keys()) {
    if (JSON.stringify(next?.[name]) !== JSON.stringify(previous?.[name])) {
      drafts.value.delete(name); errors.value.delete(name)
    }
  }
}, {flush: 'sync'})
watch([() => JSON.stringify(props.schema), () => props.readOnly], () => {
  drafts.value = new Map(); errors.value = new Map(); childEditing.value = new Map()
}, {flush: 'sync'})
onBeforeUnmount(() => {active = false; emit('editing-change', false)})
</script>
<style scoped>
.json-object-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 16px 24px; width: 100%; }
.json-member { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.json-member--object { grid-column: 1 / -1; border: 1px solid var(--el-border-color-lighter); padding: 12px; border-radius: 6px; }
.json-member-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.json-member small { color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.json-member :deep(.el-input-number) { width: 100%; }
</style>
