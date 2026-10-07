<!--
@module @spark-appworks/spark-component:components/editors/JsonTreeEditor
职责：实现 JsonTreeEditor（未注册组件类型）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 infrastructure/editor 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 json tree editor 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div class="vxe-json-tree-editor" :style="rootStyle">
    <div class="vxe-json-tree-editor__toolbar">
      <div class="vxe-json-tree-editor__toolbar-main">
        <el-input
          :model-value="keywordInput"
          clearable
          :placeholder="filterPlaceholder"
          class="vxe-json-tree-editor__keyword"
          @update:model-value="handleKeywordChange"
        >
          <template #prefix>
            <span class="vxe-json-tree-editor__prefix">筛选</span>
          </template>
        </el-input>
        <el-select
          :model-value="typeFilter"
          size="small"
          style="width: 140px"
          @update:model-value="handleTypeFilterChange"
        >
          <el-option label="全部类型" value="all" />
          <el-option v-for="option in nodeTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-switch
          v-if="schema"
          :model-value="schemaOnly"
          inline-prompt
          active-text="Schema"
          inactive-text="全部"
          @update:model-value="handleSchemaOnlyChange"
        />
      </div>
      <div class="vxe-json-tree-editor__toolbar-actions">
        <el-button size="small" @click="expandAll">展开全部</el-button>
        <el-button size="small" @click="collapseAll">收起全部</el-button>
      </div>
    </div>

    <div v-if="parseError" class="vxe-json-tree-editor__notice vxe-json-tree-editor__notice--warning">
      {{ parseError }}
    </div>

    <div v-else-if="displayRows.length === 0" class="vxe-json-tree-editor__empty">
      当前过滤条件下没有匹配节点
    </div>

    <div v-else class="vxe-json-tree-editor__table-shell">
      <vxe-table
        ref="tableRef"
        border
        show-overflow="title"
        show-header-overflow="title"
        :data="displayRows"
        :height="tableHeight"
        :row-config="rowConfig"
        :column-config="columnConfig"
        :tree-config="treeConfig"
        :virtual-y-config="virtualYConfig"
        @current-row-change="handleCurrentRowChange"
      >
        <!-- 列 1: 节点键名（tree-node） -->
        <vxe-column field="displayKey" title="节点" min-width="240" tree-node>
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__key-cell">
              <el-input
                v-if="row.keyEditable && isEditable && isRowActive(row)"
                :model-value="getKeyInputValue(row)"
                size="small"
                @update:model-value="handleKeyInput(row, $event)"
                @change="handleKeyChange(row, $event)"
              />
              <span v-else class="vxe-json-tree-editor__key-text">{{ row.displayKey }}</span>
              <el-tag v-if="row._schemaRequired" size="small" type="danger" effect="plain">必填</el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 2: 类型 -->
        <vxe-column field="type" title="类型" width="130">
          <template #default="{ row }">
            <el-select
              v-if="row.typeEditable && isEditable && isRowActive(row)"
              :model-value="row.type"
              size="small"
              style="width: 110px"
              @update:model-value="handleTypeChange(row, $event)"
            >
              <el-option v-for="option in editableTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-tag v-else size="small" effect="plain">{{ renderTypeLabel(row.type) }}</el-tag>
          </template>
        </vxe-column>

        <!-- 列 3: 值（按类型自适应编辑控件） -->
        <vxe-column field="valuePreview" title="值" min-width="260">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__value-cell">
              <template v-if="row.type === 'string'">
                <el-select
                  v-if="isEditable && isRowActive(row) && row._schemaEnumValues.length > 0"
                  :model-value="row.stringValue"
                  size="small"
                  filterable
                  allow-create
                  default-first-option
                  clearable
                  @update:model-value="handleStringUpdate(row, $event)"
                >
                  <el-option v-for="option in row._schemaEnumValues" :key="option" :label="row._schemaEnumLabels[option] ?? option" :value="option" />
                </el-select>
                <el-input
                  v-else-if="isRowActive(row)"
                  :model-value="getStringInputValue(row)"
                  size="small"
                  :readonly="!isEditable"
                  @update:model-value="handleStringInput(row, $event)"
                  @change="handleStringChange(row, $event)"
                />
                <span v-else class="vxe-json-tree-editor__value-text">{{ row.stringValue || '(空字符串)' }}</span>
              </template>
              <el-input-number
                v-else-if="row.type === 'number' && isRowActive(row)"
                :model-value="row.numberValue ?? 0"
                size="small"
                controls-position="right"
                :disabled="!isEditable"
                @change="handleNumberChange(row, $event)"
              />
              <el-switch
                v-else-if="row.type === 'boolean' && isRowActive(row)"
                :model-value="row.booleanValue"
                :disabled="!isEditable"
                @update:model-value="handleBooleanChange(row, $event)"
              />
              <el-tag v-else-if="row.type === 'boolean'" size="small" type="info" effect="plain">
                {{ row.booleanValue ? 'true' : 'false' }}
              </el-tag>
              <span v-else-if="row.type === 'number'" class="vxe-json-tree-editor__value-text">{{ row.valuePreview }}</span>
              <el-tag v-else-if="row.type === 'null'" size="small" type="info">null</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">{{ row.valuePreview }}</el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 4: Schema 标题（条件展示） -->
        <vxe-column v-if="schema" field="_schemaTitle" title="Schema" min-width="190">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__schema-cell">
              <span>{{ row._schemaTitle || '-' }}</span>
              <el-tag v-if="row._schemaEnumValues.length > 0" size="small" type="success" effect="plain">
                枚举 {{ row._schemaEnumValues.length }}
              </el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 5: 说明（条件展示） -->
        <vxe-column v-if="schema" field="_schemaDescription" title="说明" min-width="320">
          <template #default="{ row }">
            <span>{{ row._schemaDescription || row.valuePreview }}</span>
          </template>
        </vxe-column>

        <!-- 列 6: 路径 -->
        <vxe-column field="id" title="路径" min-width="220" />

        <!-- 列 7: 操作 -->
        <vxe-column v-if="isEditable" title="操作" width="210">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__action-cell">
              <template v-if="isRowActive(row)">
                <el-button v-if="row.type === 'object' || row.type === 'array'" size="small" link type="primary" @click="handleAddChild(row)">加子项</el-button>
                <el-button v-if="row.depth > 0" size="small" link type="primary" @click="handleAddSibling(row)">加同级</el-button>
                <el-button v-if="row.deletable" size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
              </template>
              <span v-else class="vxe-json-tree-editor__action-hint">选中行后可编辑</span>
            </div>
          </template>
        </vxe-column>
      </vxe-table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description JSON 树形编辑器，基于 VXE-Table 以可折叠/展开的树结构编辑 JSON 数据。
 * @category internal
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { deepClone, isRecord } from '@spark-appworks/spark-utils'
import type { VxeTableInstance, VxeTablePropTypes } from 'vxe-table'
import { useBasicFieldState } from '../fields/data-components/composables/state/useBasicFieldState'
import { coerceStringValue } from '../fields/data-components/composables/value/fieldValueCoercion'
import * as Sjd from '@spark-appworks/spark-json-document'

type DisplayRow = Sjd.TreeDisplayNode & {
  displayKey: string
    valuePreview: string
    stringValue: string
    numberValue: number | null
    booleanValue: boolean
    _searchText: string
    _schemaTitle: string
    _schemaDescription: string
    _schemaRequired: boolean
    _schemaEnumValues: string[]
    _schemaEnumLabels: Record<string, string>}

function isJsonValue(value: unknown): value is Sjd.JsonValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isJsonDocument(value: unknown): value is Sjd.JsonDocument {
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function isDisplayRow(value: unknown): value is DisplayRow {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && Array.isArray(value['path'])
}

// ── Props ─────────────────────────────────────────────────────

/** JSON 树编辑器属性，描述树数据、Schema 和过滤交互配置。 */
type JsonTreeEditorProps = {
  /** 固定编辑器类型，用于组件注册和配置识别。 */
  type?: 'json-tree-editor'
  /** 字段绑定名，映射到 DataView 行字段 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** JSON 字符串内容 */
  modelValue?: string
  /** 已解析的 JSON 文档对象 */
  documentValue?: Sjd.JsonDocument | null
  /** 编辑器高度 */
  height?: number | string
  /** 是否只读 */
  readOnly?: boolean
  /** JSON Schema 校验规则 */
  schema?: { [key: string]: unknown } | null
  /** 筛选框占位文本 */
  filterPlaceholder?: string
  /** 策略聚合对象（复杂场景一次传入） */
  policy?: Sjd.JsonTreePolicy
  /** 根节点标签 */
  rootLabel?: string
  /** 判断路径是否受保护 */
  isProtected?: (path: Sjd.JsonPath) => boolean
  /** 判断路径是否可编辑键名 */
  canEditKey?: (path: Sjd.JsonPath) => boolean
  /** 判断路径是否可编辑类型 */
  canEditType?: (path: Sjd.JsonPath) => boolean
  /** 推荐子节点键名 */
  suggestChildKey?: (target: Sjd.JsonObject, parentPath: Sjd.JsonPath) => string
  /** 创建数组默认子项 */
  createDefaultArrayItem?: (parentPath: Sjd.JsonPath) => Sjd.JsonValue
  /** 创建对象默认子值 */
  createDefaultObjectValue?: (parentPath: Sjd.JsonPath, key: string) => Sjd.JsonValue}

const props = withDefaults(defineProps<JsonTreeEditorProps>(), {
  value: '',
  documentValue: null,
  height: 420,
  readOnly: false,
  schema: null,
  filterPlaceholder: '筛选路径 / 键名 / 值',
  type: 'json-tree-editor',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:documentValue': [value: Sjd.JsonDocument]
}>()

// ── 字段能力接入 ────────────────────────────────────────────

const { permission, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'json-tree-editor',
  fallbackValue: '',
  coerce: coerceStringValue,
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable: _fieldEditable } = permission

/** 字段模式用权限驱动；独立模式用 !readOnly */
const isEditable = computed(() =>
  props.field ? _fieldEditable.value : !props.readOnly,
)

/**
 * 字段模式下的有效输入值。
 * DATA_ROW[field] 可能是 string（JSON 文本）→ 反序列化；
 * 也可能是 object/array（已解析文档）→ 直接使用。
 */
const effectiveFieldInput = computed<string | Sjd.JsonDocument>(() => {
  if (props.field) {
    const raw: unknown = fieldValue.value
    if (isJsonDocument(raw)) return raw
    return typeof raw === 'string' ? raw : ''
  }
  return props.modelValue ?? ''
})
// ── 合并 policy（平铺 props 优先） ──────────────────────────

const mergedPolicy = computed<Partial<Sjd.JsonTreePolicy>>(() => {
  const base = props.policy ?? {}
  return {
    ...base,
    ...(props.rootLabel !== undefined ? { rootLabel: props.rootLabel } : {}),
    ...(props.isProtected !== undefined ? { isProtected: props.isProtected } : {}),
    ...(props.canEditKey !== undefined ? { canEditKey: props.canEditKey } : {}),
    ...(props.canEditType !== undefined ? { canEditType: props.canEditType } : {}),
    ...(props.suggestChildKey !== undefined ? { suggestChildKey: props.suggestChildKey } : {}),
    ...(props.createDefaultArrayItem !== undefined ? { createDefaultArrayItem: props.createDefaultArrayItem } : {}),
    ...(props.createDefaultObjectValue !== undefined ? { createDefaultObjectValue: props.createDefaultObjectValue } : {}),
  }
})

const tableRef = ref<VxeTableInstance<DisplayRow> | null>(null)
const keywordInput = ref('')
const keyword = ref('')
const typeFilter = ref<'all' | Sjd.JsonNodeType>('all')
const schemaOnly = ref(false)
const keyInputDrafts = ref<Record<string, string>>({})
const stringInputDrafts = ref<Record<string, string>>({})
const parseError = ref<string | null>(null)
const treeModelRef = shallowRef<Sjd.TreeModel>(Sjd.buildTreeModel({}))
const currentRowId = ref(Sjd.rootOf(treeModelRef.value))
let keywordTimer: ReturnType<typeof setTimeout> | undefined
let lastEmittedValue: string | null = null
let tableStateInitialized = false
let lastFilterActiveState = false
let pendingExpandRowId: string | null = null
let pendingRestoreState: { expandPaths: Set<string>; currentPath: string | null } | null = null

// ── 常量 ──────────────────────────────────────────────────────

const nodeTypeOptions = [
  { label: '对象', value: 'object' },
  { label: '数组', value: 'array' },
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '空值', value: 'null' },
] as const

const editableTypeOptions = nodeTypeOptions

// ── VXE 配置 ─────────────────────────────────────────────────

const rowConfig = computed<VxeTablePropTypes.RowConfig>(() => ({
  keyField: 'id',
  useKey: true,
  isCurrent: true,
}))

const columnConfig = computed<VxeTablePropTypes.ColumnConfig>(() => ({
  useKey: true,
  resizable: true,
}))

const treeConfig = computed<VxeTablePropTypes.TreeConfig>(() => ({
  transform: true,
  reserve: true,
  rowField: 'id',
  parentField: 'parentId',
  childrenField: 'children',
  mapChildrenField: '_children',
  showLine: true,
}))

const virtualYConfig = computed<VxeTablePropTypes.VirtualYConfig>(() => ({
  enabled: true,
  gt: 80,
  oSize: 20,
}))

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

const tableHeight = computed(() => '100%')

const hasActiveFilter = computed(() => {
  return schemaOnly.value || typeFilter.value !== 'all' || keyword.value.trim().length > 0
})

// ── 数据管线 ─────────────────────────────────────────────────

const allRows = computed<DisplayRow[]>(() => {
  const rawRows = Sjd.toDisplayRows(treeModelRef.value, mergedPolicy.value)
  const schemaCache = new Map<string, ReturnType<typeof Sjd.resolveSchemaInfoForPath>>()
  const rootLabel = mergedPolicy.value.rootLabel ?? '$'
  const policy = mergedPolicy.value
  return rawRows.map(row => enrichRow(row, { schemaCache, rootLabel, policy }))
})

const filteredRows = computed<DisplayRow[]>(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  const hasKeyword = normalizedKeyword.length > 0
  const hasFilter = schemaOnly.value || typeFilter.value !== 'all' || hasKeyword

  if (!hasFilter) return allRows.value

  return Sjd.filterJsonTreeNodes<DisplayRow>(allRows.value, (row) => {
    if (row.depth > 0 && typeFilter.value !== 'all' && row.type !== typeFilter.value) {
      return false
    }
    if (schemaOnly.value && row._schemaTitle === '' && row._schemaDescription === '') {
      return false
    }
    if (!hasKeyword) return true
    return row._searchText.includes(normalizedKeyword)
  })
})

const displayRows = computed(() => filteredRows.value)

// ── 外部同步 ─────────────────────────────────────────────────

watch(() => props.documentValue, (value) => {
  if (value === null) return
  syncDocumentValue(value)
}, { immediate: true })

watch(effectiveFieldInput, (value) => {
  if (props.documentValue !== null) return
  if (typeof value === 'string') {
    if (lastEmittedValue !== null && value === lastEmittedValue) {
      lastEmittedValue = null
      return
    }
    syncDocument(value)
  } else {
    syncDocumentValue(value)
  }
}, { immediate: true })

watch(displayRows, () => {
  syncTableState()
}, { immediate: true })

onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})

// ── 树状态捕获与恢复 ────────────────────────────────────────

function serializePath(path: Sjd.JsonPath): string {
  return path.map(s => typeof s === 'number' ? `[${s}]` : s).join('/')
}

/**
 * 在模型整体重建前捕获展开/选中状态（按路径，不依赖 ID）。
 * syncTableState 会在下一 tick 检测并恢复。
 */
function captureTreeState(): void {
  const table = tableRef.value
  if (!table) return
  const expandedRecords = table.getTreeExpandRecords().filter(isDisplayRow)
  const expandPaths = new Set(expandedRecords.map(r => serializePath(r.path)))
  const currentRow = allRows.value.find(r => r.id === currentRowId.value)
  const currentPath = currentRow ? serializePath(currentRow.path) : null
  pendingRestoreState = { expandPaths, currentPath }
}

// ── 文档同步 ─────────────────────────────────────────────────

function syncDocument(rawText: string): void {
  clearInputDrafts()
  if (rawText.trim() === '') {
    captureTreeState()
    treeModelRef.value = Sjd.buildTreeModel({}, mergedPolicy.value)
    parseError.value = null
    return
  }
  try {
    captureTreeState()
    const doc = Sjd.parseJsonDocument(rawText)
    treeModelRef.value = Sjd.buildTreeModel(doc, mergedPolicy.value)
    parseError.value = null
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
  }
}

function syncDocumentValue(value: Sjd.JsonDocument): void {
  clearInputDrafts()
  const nextDocument = deepClone(value)
  const nextText = Sjd.serializeJsonDocument(nextDocument)
  if (lastEmittedValue !== null && nextText === lastEmittedValue) {
    lastEmittedValue = null
    return
  }
  captureTreeState()
  treeModelRef.value = Sjd.buildTreeModel(nextDocument, mergedPolicy.value)
  parseError.value = null
}

// ── 行增强（schema + 搜索文本）──────────────────────────────

type EnrichRowContext = Readonly<{
  schemaCache: Map<string, ReturnType<typeof Sjd.resolveSchemaInfoForPath>>,
  rootLabel: string,
  policy: Partial<Sjd.JsonTreePolicy>
}>

function enrichRow(
  row: Sjd.TreeDisplayNode,
  context: EnrichRowContext,
): DisplayRow {
  const { schemaCache, rootLabel, policy } = context
  const isContainer = row.type === 'object' || row.type === 'array'
  const displayKey = row.depth === 0 ? rootLabel
    : (typeof row.segment === 'number' ? `[${row.segment}]` : row.segment)
  const valuePreview = Sjd.formatValuePreview(row.type, isContainer ? null : row.value, row.childCount)
  const stringValue = typeof row.value === 'string' ? row.value : ''
  const numberValue = typeof row.value === 'number' ? row.value : null
  const booleanValue = row.value === true

  const cacheKey = row.id
  const schemaInfo = schemaCache.get(cacheKey) ?? Sjd.resolveSchemaInfoForPath(props.schema, row.path)
  schemaCache.set(cacheKey, schemaInfo)

  // Policy 提供的值选项（仅当 Schema 无 enum 时使用）
  const policyOptions = schemaInfo.enumValues.length === 0
    ? policy.getValueOptions?.(row.path)
    : undefined

  const searchText = [
    displayKey,
    row.id,
    valuePreview,
    stringValue,
    schemaInfo.title,
    schemaInfo.description,
    schemaInfo.enumValues.join(' '),
  ].join(' ').toLowerCase()

  let schemaEnumValues: string[]
  let schemaEnumLabels: Record<string, string>
  // 优先级：getValueLabels > Schema enum > getValueOptions
  const labeledOptions = policy.getValueLabels?.(row.path)
  if (labeledOptions !== undefined && labeledOptions.length > 0) {
    const labels: Record<string, string> = {}
    for (const o of labeledOptions) labels[o.value] = o.label
    schemaEnumValues = labeledOptions.map(o => o.value)
    schemaEnumLabels = labels
  } else {
    schemaEnumValues = schemaInfo.enumValues.length > 0
      ? schemaInfo.enumValues
      : (policyOptions ?? [])
    schemaEnumLabels = {}
  }
  // 确保当前值始终在选项中（处理目录外的自定义类型如 div、el-card）
  if (row.type === 'string' && schemaEnumValues.length > 0 && typeof row.value === 'string') {
    if (row.value.length > 0 && !schemaEnumValues.includes(row.value)) {
      schemaEnumValues = [row.value, ...schemaEnumValues]
    }
  }
  return {
    ...row,
    displayKey,
    valuePreview,
    stringValue,
    numberValue,
    booleanValue,
    _searchText: searchText,
    _schemaTitle: schemaInfo.title,
    _schemaDescription: schemaInfo.description,
    _schemaRequired: schemaInfo.required,
    _schemaEnumValues: schemaEnumValues,
    _schemaEnumLabels: schemaEnumLabels,
  }
}

// ── 工具栏交互 ──────────────────────────────────────────────

function handleKeywordChange(value: string | undefined): void {
  keywordInput.value = value ?? ''
  if (keywordTimer) clearTimeout(keywordTimer)
  if (keywordInput.value.trim().length === 0) {
    keyword.value = ''
    return
  }
  keywordTimer = setTimeout(() => {
    keyword.value = keywordInput.value
  }, 120)
}

function handleTypeFilterChange(value: 'all' | Sjd.JsonNodeType): void {
  typeFilter.value = value
}

function handleSchemaOnlyChange(value: boolean): void {
  schemaOnly.value = value
}

// ── 表格行交互 ──────────────────────────────────────────────

function handleCurrentRowChange(params: { newValue?: DisplayRow | null }): void {
  if (params.newValue) {
    currentRowId.value = params.newValue.id
  }
}

function isRowActive(row: Pick<DisplayRow, 'id'>): boolean {
  return row.id === currentRowId.value
}

// ── 编辑操作 ──────────────────────────────────────────────────

function hasInputDraft(drafts: Record<string, string>, rowId: string): boolean {
  return Object.prototype.hasOwnProperty.call(drafts, rowId)
}

function clearInputDrafts(): void {
  keyInputDrafts.value = {}
  stringInputDrafts.value = {}
}

function getKeyInputValue(row: DisplayRow): string {
  const draft = keyInputDrafts.value[row.id]
  return hasInputDraft(keyInputDrafts.value, row.id)
    ? draft ?? ''
    : row.displayKey
}

function getStringInputValue(row: DisplayRow): string {
  const draft = stringInputDrafts.value[row.id]
  return hasInputDraft(stringInputDrafts.value, row.id)
    ? draft ?? ''
    : row.stringValue
}

function handleKeyInput(row: DisplayRow, value: string | number): void {
  if (typeof value !== 'string') return
  keyInputDrafts.value[row.id] = value
}

function handleKeyChange(row: DisplayRow, value: string | number): void {
  const nextValue = typeof value === 'string' ? value : getKeyInputValue(row)
  delete keyInputDrafts.value[row.id]
  if (nextValue === row.displayKey || nextValue.trim().length === 0) return
  mutateModel((current) => Sjd.renameNodeKey({
    model: current,
    uid: row.id,
    nextKeyInput: nextValue,
    policy: mergedPolicy.value,
  }))
}

function handleTypeChange(row: DisplayRow, value: Sjd.JsonNodeType): void {
  if (value === undefined || value === null) return
  mutateModel((current) => Sjd.updateNodeType({
    model: current,
    uid: row.id,
    nextType: value,
    policy: mergedPolicy.value,
  }))
}

function handleStringUpdate(row: DisplayRow, value: string | undefined): void {
  const v = value ?? ''
  delete stringInputDrafts.value[row.id]
  mutateModel(
    (current) => Sjd.updateNodeValue(current, row.id, v),
    row.path,
    v,
  )
}

function handleStringInput(row: DisplayRow, value: string | number): void {
  if (typeof value !== 'string') return
  stringInputDrafts.value[row.id] = value
}

function handleStringChange(row: DisplayRow, value: string | number): void {
  const nextValue = typeof value === 'string' ? value : getStringInputValue(row)
  delete stringInputDrafts.value[row.id]
  if (nextValue === row.stringValue) return
  mutateModel((current) => Sjd.updateNodeValue(current, row.id, nextValue))
}

function handleNumberChange(row: DisplayRow, value: string | number | null | undefined): void {
  const nextValue = typeof value === 'number' ? value : Number(value)
  mutateModel((current) => Sjd.updateNodeValue(current, row.id, Number.isFinite(nextValue) ? nextValue : 0))
}

function handleBooleanChange(row: DisplayRow, value: boolean): void {
  mutateModel((current) => Sjd.updateNodeValue(current, row.id, value))
}

function handleAddChild(row: DisplayRow): void {
  mutateModel((current) => Sjd.addChildNode(current, row.id, mergedPolicy.value))
}

function handleAddSibling(row: DisplayRow): void {
  mutateModel((current) => Sjd.addSiblingNode(current, row.id, mergedPolicy.value))
}

function handleDelete(row: DisplayRow): void {
  mutateModel((current) => Sjd.deleteNode(current, row.id, mergedPolicy.value))
}

function mutateModel(
  mutator: (current: Sjd.TreeModel) => Sjd.MutationResult,
  changedPath?: Sjd.JsonPath,
  changedValue?: Sjd.JsonValue,
): void {
  if (!isEditable.value) return
  const result = mutator(treeModelRef.value)
  // uid 稳定标识，直接用作焦点/展开行，无数组索引偏移问题
  currentRowId.value = result.focusId
  pendingExpandRowId = result.expandId

  let model = result.model

  // ── 自动填充副作用 ──────────────────────────────────
  if (changedPath !== undefined && changedValue !== undefined) {
    const patches = mergedPolicy.value.getAutoPopulate?.(changedPath, changedValue)
    if (patches !== undefined && patches.length > 0) {
      const doc = Sjd.exportJsonDocument(model)
      if (Sjd.applyAutoPopulatePatches(doc, patches)) {
        captureTreeState()
        model = Sjd.buildTreeModel(doc, mergedPolicy.value)
      }
    }
  }

  treeModelRef.value = model
  const nextDocument = Sjd.exportJsonDocument(model)
  const nextText = Sjd.serializeJsonDocument(nextDocument)
  parseError.value = null
  lastEmittedValue = nextText
  emit('update:documentValue', deepClone(nextDocument))
  emit('update:modelValue', nextText)
  // 字段模式：通过能力链回写 DATA_ROW[field]
  void handleControlledChange(nextText)
}

// ── 类型标签 ──────────────────────────────────────────────────

function renderTypeLabel(type: Sjd.JsonNodeType): string {
  switch (type) {
    case 'object': return '对象'
    case 'array': return '数组'
    case 'number': return '数字'
    case 'boolean': return '布尔'
    case 'null': return '空值'
    default: return '字符串'
  }
}

// ── 表格状态同步 ──────────────────────────────────────────────

function syncTableState(): void {
  void nextTick(() => {
    const table = tableRef.value
    const firstRow = displayRows.value[0]
    if (!table || !firstRow) return

    // ── 恢复外部同步（undo/redo）前的展开 + 选中状态 ──
    if (pendingRestoreState) {
      const { expandPaths, currentPath } = pendingRestoreState
      pendingRestoreState = null
      tableStateInitialized = true

      const rowsToExpand = displayRows.value.filter(r => expandPaths.has(serializePath(r.path)))
      const activeRow = currentPath
        ? displayRows.value.find(r => serializePath(r.path) === currentPath) ?? firstRow
        : firstRow
      currentRowId.value = activeRow.id

      if (rowsToExpand.length > 0) {
        void table.clearTreeExpand().then(() => {
          return table.setTreeExpand(rowsToExpand, true)
        }).then(() => {
          table.setCurrentRow(activeRow)
        })
      } else {
        table.setCurrentRow(activeRow)
      }
      return
    }

    const activeRow = displayRows.value.find((row) => row.id === currentRowId.value) ?? firstRow
    currentRowId.value = activeRow.id

    const filterActive = hasActiveFilter.value
    const shouldExpandAllForFilter = filterActive && (!tableStateInitialized || !lastFilterActiveState)
    const shouldInitRoot = !tableStateInitialized && !filterActive
    const pendingExpandRow = pendingExpandRowId
      ? displayRows.value.find((row) => row.id === pendingExpandRowId) ?? null
      : null

    tableStateInitialized = true
    lastFilterActiveState = filterActive

    if (shouldExpandAllForFilter) {
      pendingExpandRowId = null
      void table.setAllTreeExpand(true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    if (pendingExpandRow) {
      pendingExpandRowId = null
      void table.setTreeExpand(pendingExpandRow, true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    if (shouldInitRoot) {
      void table.setTreeExpand(firstRow, true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    table.setCurrentRow(activeRow)
  })
}

function expandAll(): void {
  if (displayRows.value.length === 0) return
  void nextTick(() => {
    tableRef.value?.setAllTreeExpand(true)
  })
}

function collapseAll(): void {
  if (displayRows.value.length === 0) return
  void nextTick(() => {
    tableRef.value?.clearTreeExpand()
  })
}
</script>

<style scoped>
.vxe-json-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.vxe-json-tree-editor__table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.vxe-json-tree-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.vxe-json-tree-editor__toolbar-main,
.vxe-json-tree-editor__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vxe-json-tree-editor__keyword {
  width: 360px;
}

.vxe-json-tree-editor__prefix {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.vxe-json-tree-editor__notice,
.vxe-json-tree-editor__empty {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
}

.vxe-json-tree-editor__notice {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.vxe-json-tree-editor__notice--warning {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.vxe-json-tree-editor__empty {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.vxe-json-tree-editor__key-cell,
.vxe-json-tree-editor__schema-cell,
.vxe-json-tree-editor__action-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vxe-json-tree-editor__key-cell,
.vxe-json-tree-editor__value-cell {
  min-height: 28px;
}

.vxe-json-tree-editor__key-text,
.vxe-json-tree-editor__value-text,
.vxe-json-tree-editor__action-hint {
  color: var(--el-text-color-secondary);
}
</style>
