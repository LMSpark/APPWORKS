<template>
  <section class="data-space-parameters-editor" aria-label="输入参数编辑器">
    <div v-for="(item, index) in modelValue" :key="parameterKey(index)" class="data-space-parameter-editor-row">
      <label>
        名称
        <ElInput :aria-label="`名称 ${index + 1}`" :disabled="disabled || (!hasParameterId(item) && !secureIdAvailable)"
          :model-value="textValue(item, ['Name', 'name'])" @update:model-value="updateText(index, 'Name', $event)" />
      </label>
      <label>
        描述
        <ElInput :aria-label="`描述 ${index + 1}`" :disabled="disabled || (!hasParameterId(item) && !secureIdAvailable)"
          :model-value="textValue(item, ['Description', 'description'])" @update:model-value="updateText(index, 'Description', $event)" />
      </label>
      <div class="data-space-parameter-editor-business">
        <ElCheckbox :aria-label="`业务参数 ${index + 1}`" :disabled="disabled || (!hasParameterId(item) && !secureIdAvailable)"
          :model-value="Boolean(item['IsBusParam'])" @update:model-value="updateBusinessParameter(index, $event)">
          业务参数
        </ElCheckbox>
      </div>
      <ElButton native-type="button" :disabled="disabled" :aria-label="`删除参数 ${index + 1}`" @click="removeParameter(index)">
        删除
      </ElButton>
    </div>
    <p v-if="legacyIdError" role="alert">{{ legacyIdError }}</p>
    <p v-if="editorError" role="alert">{{ editorError }}</p>
    <ElButton native-type="button" :disabled="disabled" @click="addParameter">新增参数</ElButton>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElCheckbox, ElInput } from 'element-plus'
import type { DataSpaceParameterItem, DataSpaceParameterUpdate, DataSpaceParametersEditorProps } from './DataSpaceParametersEditor.props'

const props = defineProps<DataSpaceParametersEditorProps>()
const emit = defineEmits<{ change: [items: DataSpaceParameterItem[]] }>()
const editorError = ref('')
const secureIdAvailable = Boolean(globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function')
const generatedIds = new WeakMap<object, string>()
const parameterIdFields = ['rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id']
const legacyIdError = computed(() => !secureIdAvailable && props.modelValue.some(item => !hasParameterId(item))
  ? '当前环境不能安全生成输入参数 ID，无 ID 参数保持只读' : '')

function existingParameterId(item: DataSpaceParameterItem): string {
  for (const field of parameterIdFields) {
    const value = item[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function hasParameterId(item: DataSpaceParameterItem): boolean {
  return existingParameterId(item) !== ''
}

function stableParameterId(item: DataSpaceParameterItem): string {
  const existing = existingParameterId(item)
  if (existing) return existing
  const remembered = generatedIds.get(item)
  if (remembered) return remembered
  const id = createParameterId()
  generatedIds.set(item, id)
  return id
}

function createParameterId(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('当前环境不能安全生成输入参数 ID')
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function parameterKey(index: number): string {
  return `parameter-${index}`
}

function textValue(item: DataSpaceParameterItem, keys: readonly string[]): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }
  return ''
}

function emitChange(items: DataSpaceParameterItem[]): void {
  editorError.value = ''
  emit('change', items)
}

function updateText(index: number, field: 'Name' | 'Description', value: unknown): void {
  if (typeof value !== 'string') return
  const item = props.modelValue[index]
  if (!item) return
  try {
    emitUpdatedItem({ index, item, field, value })
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '输入参数 ID 生成失败'
  }
}

function updateBusinessParameter(index: number, value: unknown): void {
  if (typeof value !== 'boolean') return
  const item = props.modelValue[index]
  if (!item) return
  try {
    emitUpdatedItem({ index, item, field: 'IsBusParam', value })
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '输入参数 ID 生成失败'
  }
}

function emitUpdatedItem(options: DataSpaceParameterUpdate): void {
  const { index, item, field, value } = options
  const updated = { ...item, [field]: value }
  if (!hasParameterId(item)) {
    updated['rowid'] = stableParameterId(item)
  }
  const next = [...props.modelValue]
  next[index] = updated
  emitChange(next)
}

function removeParameter(index: number): void {
  if (!props.modelValue[index]) return
  emitChange(props.modelValue.filter((_, itemIndex) => itemIndex !== index))
}

function addParameter(): void {
  try {
    const item = { rowid: createParameterId(), Name: '', Description: '', IsBusParam: false }
    emitChange([...props.modelValue, item])
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '输入参数 ID 生成失败'
  }
}
</script>

<style scoped>
.data-space-parameters-editor {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.data-space-parameter-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr) max-content max-content;
  align-items: end;
  gap: 0.75rem;
  margin-block: 0.75rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.data-space-parameter-editor-row > label,
.data-space-parameter-editor-business {
  display: grid;
  min-width: 0;
  gap: 0.35rem;
}

@container (max-width: 42rem) {
  .data-space-parameter-editor-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 24rem) {
  .data-space-parameter-editor-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
