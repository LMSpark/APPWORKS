<!--
@module app:views/app/dev-system/DevDataSetDesigner
职责：提供 DevSystem 的 DevDataSetDesigner 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevDataSetDesigner。
-->
<!--
  DevDataSetDesigner — DataSet 可视化设计器

  功能：
  - 可视化展示表结构和关联关系
  - 可视化编辑数据模型
-->
<template>
  <div class="dataset-designer">
    <!-- 头部操作栏 -->
    <div class="ds-header">
      <div class="ds-header__left">
        <NavIcon name="Coin" :size="18" />
        <span class="ds-title">DataSet 可视化设计器</span>
      </div>
      <div class="ds-header__actions">
        <el-button size="small" @click="refreshFromLiveData(false)" :disabled="!state.activePageId.value">
          <NavIcon name="Refresh" :size="14" /> 刷新当前模型
        </el-button>
      </div>
    </div>

    <!-- 主体双栏 -->
    <div class="ds-body">
      <!-- 左侧：画布区域 -->
      <div class="ds-canvas ds-canvas--full">
        <div class="ds-toolbar">
          <el-button size="small" @click="addTable">
            <NavIcon name="Plus" :size="12" /> 添加表
          </el-button>
          <el-button size="small" @click="addResourceRelation" :disabled="tables.length < 2">
            <NavIcon name="Share" :size="12" /> 添加关联
          </el-button>
          <el-button size="small" @click="autoLayout" :disabled="tables.length === 0">
            <NavIcon name="Rank" :size="12" /> 自动布局
          </el-button>
          <el-button size="small" @click="clearAll" :disabled="tables.length === 0">
            <NavIcon name="Delete" :size="12" /> 清空
          </el-button>
          <div class="ds-toolbar__sep" />
          <el-button size="small" :disabled="!canUndo" @click="undo" title="撤销 (Ctrl+Z)">
            <NavIcon name="RefreshLeft" :size="12" /> 撤销
          </el-button>
          <el-button size="small" :disabled="!canRedo" @click="redo" title="重做 (Ctrl+Y)">
            <NavIcon name="RefreshRight" :size="12" /> 重做
          </el-button>
          <span v-if="tables.length" class="ds-toolbar__info">{{ tables.length }} 个表 · {{ relations.length }} 个关联</span>
        </div>

        <!-- 画布视口 -->
        <div class="ds-viewport">
          <div class="ds-canvas-inner" :style="canvasInnerStyle">
            <!-- SVG 关系连线层 -->
            <svg class="ds-svg-layer" :width="canvasSize.width" :height="canvasSize.height">
              <defs>
                <marker id="ds-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <path d="M 0 0 L 10 4 L 0 8 Z" fill="#a855f7" />
                </marker>
                <marker id="ds-arrow-hover" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <path d="M 0 0 L 10 4 L 0 8 Z" fill="#7c3aed" />
                </marker>
              </defs>
              <g v-for="(line, idx) in relationLines" :key="'rel-' + idx">
                <path
                  :d="line.path"
                  class="ds-rel-line"
                  :class="{ 'ds-rel-line--hover': hoveredRelIdx === idx }"
                  fill="none"
                  stroke="#c4b5fd"
                  stroke-width="2"
                  :marker-end="hoveredRelIdx === idx ? 'url(#ds-arrow-hover)' : 'url(#ds-arrow)'"
                  @mouseenter="hoveredRelIdx = idx"
                  @mouseleave="hoveredRelIdx = -1"
                  style="pointer-events: stroke;"
                />
                <!-- 关系标签（点击编辑，右键删除） -->
                <rect
                  :x="line.midX - line.labelW / 2 - 6"
                  :y="line.midY - 10"
                  :width="line.labelW + 12"
                  height="20"
                  rx="4"
                  :fill="hoveredRelIdx === idx ? '#ede9fe' : '#faf5ff'"
                  :stroke="hoveredRelIdx === idx ? '#c4b5fd' : '#e9d5ff'"
                  stroke-width="1"
                  class="ds-rel-label-bg"
                  @mouseenter="hoveredRelIdx = idx"
                  @mouseleave="hoveredRelIdx = -1"
                  @click.stop="editRelation(idx)"
                  @contextmenu.prevent.stop="removeResourceRelation(idx)"
                  style="cursor: pointer; pointer-events: fill;"
                />
                <text
                  :x="line.midX"
                  :y="line.midY + 4"
                  text-anchor="middle"
                  font-size="10"
                  :fill="hoveredRelIdx === idx ? '#6d28d9' : '#7c3aed'"
                  class="ds-rel-label-text"
                  @click.stop="editRelation(idx)"
                  style="cursor: pointer; pointer-events: fill;"
                >{{ line.label }}</text>
              </g>
            </svg>

            <!-- 关系编辑弹窗 -->
            <div v-if="editingRel !== null" class="ds-rel-editor" :style="relEditorPos">
              <div class="ds-rel-editor__title">
                编辑关联
                <el-button size="small" text type="danger" @click="deleteEditingRelation" title="删除关联">
                  <NavIcon name="Delete" :size="12" />
                </el-button>
                <el-button size="small" text @click="editingRel = null">
                  <NavIcon name="Close" :size="12" />
                </el-button>
              </div>
              <div class="ds-rel-editor__row">
                <label>关联类型</label>
                <el-select v-model="editingRel.draft.relationType" size="small">
                  <el-option label="一对多" value="one-to-many" />
                  <el-option label="一对一" value="one-to-one" />
                  <el-option label="多对多" value="many-to-many" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父表</label>
                <el-select v-model="editingRel.draft.parentTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父字段</label>
                <el-select v-model="editingRel.draft.parentField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.draft.parentTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子表</label>
                <el-select v-model="editingRel.draft.childTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子字段</label>
                <el-select v-model="editingRel.draft.childField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.draft.childTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="ds-rel-editor__actions">
                <el-button size="small" type="primary" @click="applyRelationEdit">确定</el-button>
                <el-button size="small" @click="editingRel = null">取消</el-button>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="tables.length === 0" class="ds-empty">
              <NavIcon name="Coin" :size="48" />
              <p>暂无表结构</p>
              <p class="ds-empty__hint">点击"添加表"或从 pagedata.json 加载数据模型</p>
            </div>

            <!-- 可拖拽表卡片 -->
            <div
              v-for="(table, idx) in tables"
              :key="table.id"
              class="ds-card"
              :class="{ 'ds-card--selected': selectedTableId === table.id, 'ds-card--dragging': isDraggingTable(table.id) }"
              :style="{ left: table.x + 'px', top: table.y + 'px' }"
            >
              <!-- 表头（拖拽手柄） -->
              <div
                class="ds-card__header"
                @mousedown="onCardMouseDown($event, table)"
              >
                <NavIcon name="Grid" :size="14" />
                <input :value="table.tableName" class="ds-card__title" placeholder="表名" @change="handleTableNameInputChange(table, $event)" @mousedown.stop />
                <span class="ds-card__badges">
                  <el-tag size="small" type="info" effect="plain">{{ table.columns.length }} 列</el-tag>
                  <el-tag v-if="(table.views.default.rows?.length ?? 0) > 0" size="small" type="success" effect="plain">{{ table.views.default.rows!.length }} 行</el-tag>
                </span>
                <span class="ds-card__spacer" />
                <el-button size="small" text :type="propsExpandedTables.has(table.id) ? 'primary' : 'default'" @click.stop="toggleProps(table.id)" class="ds-card__btn" title="表属性">
                  <NavIcon name="Setting" :size="12" />
                </el-button>
                <el-button size="small" text :type="expandedTables.has(table.id) ? 'primary' : 'default'" @click.stop="toggleSchema(table.id)" class="ds-card__btn" title="字段编辑">
                  <NavIcon :name="expandedTables.has(table.id) ? 'ArrowUp' : 'ArrowDown'" :size="12" />
                </el-button>
                <el-button size="small" text type="danger" @click.stop="removeTable(idx)" class="ds-card__btn">
                  <NavIcon name="Close" :size="12" />
                </el-button>
              </div>

              <!-- 字段列表（紧凑模式） -->
              <div class="ds-card__columns">
                <div v-for="col in table.columns" :key="col.id" class="ds-card__col">
                  <NavIcon :name="col.isPrimaryKey ? 'Key' : 'Document'" :size="11" />
                  <span class="ds-card__col-name" :class="{ 'ds-card__col-name--pk': col.isPrimaryKey }">{{ col.name }}</span>
                  <span class="ds-card__col-type">{{ col.type }}</span>
                  <span v-if="col.label" class="ds-card__col-label">{{ col.label }}</span>
                </div>
              </div>

              <!-- 表属性编辑 -->
              <div v-if="propsExpandedTables.has(table.id)" class="ds-card__props">
                <div class="ds-prop-row">
                  <label>资源类型</label>
                  <el-select :model-value="table.resourceType" size="small" clearable placeholder="-" @update:modelValue="handleTableSemanticChange(table, { resourceType: $event ?? null })" @mousedown.stop>
                    <el-option label="数据库表" value="database-table" />
                    <el-option label="数据库视图" value="database-view" />
                    <el-option label="第三方 API" value="third-party-api" />
                    <el-option label="静态数据" value="static-data" />
                    <el-option label="字典" value="dictionary" />
                    <el-option label="逻辑视图" value="logical-view" />
                  </el-select>
                </div>
                <div class="ds-prop-row">
                  <label>业务角色</label>
                  <el-select :model-value="table.businessCategory" size="small" clearable placeholder="-" @update:modelValue="handleTableSemanticChange(table, { businessCategory: $event ?? null })" @mousedown.stop>
                    <el-option label="主表" value="master" />
                    <el-option label="从表" value="child" />
                    <el-option label="引用表" value="reference" />
                  </el-select>
                </div>
                <div class="ds-prop-row">
                  <label>资源 ID</label>
                  <input :value="table.resourceId ?? ''" class="ds-prop-row__input" placeholder="外部标识" @change="handleTableResourceIdInputChange(table, $event)" @mousedown.stop />
                </div>
                <div class="ds-prop-row">
                  <label>API</label>
                  <input :value="typeof table.api === 'string' ? table.api : ''" class="ds-prop-row__input" placeholder="如 /api/users 或留空" @change="handleTableApiInputChange(table, $event)" @mousedown.stop />
                </div>
              </div>

              <!-- 可折叠的 schema 编辑 -->
              <div v-if="expandedTables.has(table.id)" class="ds-card__schema">
                <div v-for="(col, cidx) in table.columns" :key="col.id" class="ds-schema-row">
                  <el-checkbox :model-value="col.isPrimaryKey" size="small" title="主键" @update:modelValue="handleColumnFieldChange(table, col, { isPrimaryKey: Boolean($event) })" @mousedown.stop />
                  <input :value="col.name" class="ds-schema-row__field" placeholder="字段名" @change="handleColumnNameInputChange(table, col, $event)" @mousedown.stop />
                  <input :value="col.label ?? ''" class="ds-schema-row__label" placeholder="标签" @change="handleColumnLabelInputChange(table, col, $event)" @mousedown.stop />
                  <el-select :model-value="col.type" size="small" class="ds-schema-row__type" @update:modelValue="handleColumnTypeChange(table, col, $event)" @mousedown.stop>
                    <el-option label="string" value="string" />
                    <el-option label="number" value="number" />
                    <el-option label="boolean" value="boolean" />
                    <el-option label="date" value="date" />
                    <el-option label="datetime" value="datetime" />
                    <el-option label="object" value="object" />
                    <el-option label="array" value="array" />
                  </el-select>
                  <el-button size="small" text type="danger" @click="removeColumn(table, cidx)" class="ds-schema-row__del">
                    <NavIcon name="Minus" :size="10" />
                  </el-button>
                </div>
                <el-button size="small" text class="ds-schema-add" @click="addColumn(table)">
                  <NavIcon name="Plus" :size="10" /> 添加字段
                </el-button>
              </div>

              <!-- 底部信息栏：坐标 & 尺寸 -->
              <div class="ds-card__footer">
                <span class="ds-card__coord" title="画布坐标">
                  <NavIcon name="Aim" :size="10" />
                  {{ Math.round(table.x) }}, {{ Math.round(table.y) }}
                </span>
                <span class="ds-card__size" title="宽 × 高">
                  {{ CARD_W }} × {{ getCardHeight(table) }}
                </span>
                <span class="ds-card__id" :title="'ID: ' + table.id">
                  #{{ table.id.slice(0, 4) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import NavIcon from '@/components/NavIcon.vue'
import {
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerRelationProjection,
  type DesignerTableProjection,
  type DesignerTableUiState,
} from '@/services/project-model-artifacts'
import type { DevState } from './useDevState'
import type {
  CrudApi,
  DataColumn,
  DataSetCrudTool,
  DataResourceRelation,
  DataSetMetadata,
  TableBusinessCategory,
  TableResourceType,
} from '@spark-appworks/spark-data'

/**
 * 设计器列 — DataColumn + 画布唯一标识
 */
type DesignerColumn = DesignerTableProjection['columns'][number]

/** 为新表分配布局位置的回调。 */
type LayoutForNewTable = (tableName: string, newIndex: number) => { x: number; y: number }

type RelationDraftState = {
  sourceIndex: number
  sourceSelector: ReturnType<typeof buildRelationSelector>
  draft: DesignerRelationProjection}

const props = defineProps<{
  state: DevState
}>()

const tableUiState = ref<Record<string, DesignerTableUiState>>({})
const selectedTableId = ref<string | null>(null)
const expandedTables = ref<Set<string>>(new Set())
const propsExpandedTables = ref<Set<string>>(new Set())
const hoveredRelIdx = ref(-1)

// ═══ 关系编辑状态 ═══
const editingRel = ref<RelationDraftState | null>(null)
const relEditorPos = computed(() => {
  if (editingRel.value === null) return {}
  const idx = editingRel.value.sourceIndex
  const lines = relationLines.value
  if (idx < 0 || idx >= lines.length) return {}
  const line = lines[idx]!
  return {
    left: (line.midX + 10) + 'px',
    top: (line.midY - 20) + 'px',
  }
})

// ═══ Undo / Redo（DataSetCrudTool 历史栈）═══
const pendingProjectionLayout = shallowRef<LayoutForNewTable | null>(null)

function getPageDataTool(): DataSetCrudTool | null {
  void props.state.projectRevision.value
  return props.state.project.getDataSetTool()
}

function buildColumnIdMap(table: DesignerTableProjection): Record<string, string> {
  return Object.fromEntries(table.columns.map((column) => [column.name, column.id]))
}

const projectedMetadata = computed<DataSetMetadata | null>(() => {
  void props.state.projectRevision.value
  // 以 DataSetCrudTool 为唯一数据源；pagedata 文档变更由 ProjectModel revision 接入 Vue 响应式。
  return getPageDataTool()?.toJson() ?? null
})

const tables = computed<DesignerTableProjection[]>(() => {
  const metadata = projectedMetadata.value
  if (!metadata) return []

  return projectDesignerTables(metadata, tableUiState.value, generateId)
})

const relations = computed<DesignerRelationProjection[]>(() => (
  projectedMetadata.value ? projectDesignerRelations(projectedMetadata.value) : []
))

/** 将设计器当前 tableUiState 的 x/y 位置直接写入 tool.dataSet.layout，保持位置与模型同步。 */
function syncLayoutToTool(tool: DataSetCrudTool): void {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const [tableName, uiState] of Object.entries(tableUiState.value)) {
    positions[tableName] = { x: uiState.x, y: uiState.y }
  }
  tool.dataSet.layout = { ...(tool.dataSet.layout ?? {}), tablePositions: positions }
}

function applyMutationWithHistory(
  mutator: (tool: DataSetCrudTool) => void,
  layoutForNewTable?: LayoutForNewTable,
): void {
  const tool = getPageDataTool()
  if (!tool) return
  try {
    pendingProjectionLayout.value = layoutForNewTable ?? null
    void props.state.project.editDataSet((t) => {
      syncLayoutToTool(t)
      mutator(t)
    }).catch((error: unknown) => {
      pendingProjectionLayout.value = null
      throw error
    })
  } catch (error) {
    pendingProjectionLayout.value = null
    throw error
  }
}

function applyHistoryMutation(
  mutator: (tool: DataSetCrudTool) => void,
  layoutForNewTable?: LayoutForNewTable,
): void {
  applyMutationWithHistory(mutator, layoutForNewTable)
}

function undo() {
  const ok = props.state.project.undoPageFile('pagedata.json')
  if (!ok) return
  resetSelectionState()
}

function redo() {
  const ok = props.state.project.redoPageFile('pagedata.json')
  if (!ok) return
  resetSelectionState()
}

function resetSelectionState(): void {
  editingRel.value = null
  selectedTableId.value = null
}

function commitLayoutCheckpoint(): void {
  const tool = getPageDataTool()
  if (!tool) return
  const anchor = tables.value[0]
  if (!anchor) return
  // 通过 no-op 结构提交推进 DataSetCrudTool 历史游标，把当前 UI 布局绑定到同一撤销链。
  void props.state.project.editDataSet((t) => {
    syncLayoutToTool(t)
    t.updateTable({ tableName: anchor.tableName })
  })
}

const canUndo = computed(() => {
  void props.state.projectRevision.value
  return props.state.project.canUndoPageFile('pagedata.json')
})
const canRedo = computed(() => {
  void props.state.projectRevision.value
  return props.state.project.canRedoPageFile('pagedata.json')
})

watch(
  projectedMetadata,
  (metadata) => {
    if (!metadata) {
      tableUiState.value = {}
      pendingProjectionLayout.value = null
      return
    }

    projectDesignerFromMetadata(metadata, pendingProjectionLayout.value ?? undefined)
    pendingProjectionLayout.value = null
  },
  { flush: 'sync' },
)

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  }
}

// ═══ 拖拽状态 ═══
const dragState = ref<{
  tableId: string
  startX: number
  startY: number
  origX: number
  origY: number
} | null>(null)

const CARD_W = 260
const CARD_HEADER_H = 42
const COL_ROW_H = 24

function getCardHeight(table: DesignerTableProjection): number {
  let base = CARD_HEADER_H + table.columns.length * COL_ROW_H + 10 + 22 // 22 = footer
  if (propsExpandedTables.value.has(table.id)) {
    base += 4 * 32 + 12 // 4 prop rows
  }
  if (expandedTables.value.has(table.id)) {
    base += table.columns.length * 32 + 36
  }
  return base
}

const canvasSize = computed(() => {
  let maxW = 800
  let maxH = 600
  for (const t of tables.value) {
    maxW = Math.max(maxW, t.x + CARD_W + 60)
    maxH = Math.max(maxH, t.y + getCardHeight(t) + 60)
  }
  return { width: maxW, height: maxH }
})

const canvasInnerStyle = computed(() => ({
  width: canvasSize.value.width + 'px',
  height: canvasSize.value.height + 'px',
}))

// ═══ 关系连线计算 ═══
const relationLines = computed(() => {
  return relations.value.map((rel) => {
    const from = tables.value.find((t) => t.tableName === rel.parentTable)
    const to = tables.value.find((t) => t.tableName === rel.childTable)
    if (!from || !to) return null

    const fromH = getCardHeight(from)
    const toH = getCardHeight(to)
    const fromCx = from.x + CARD_W / 2
    const toCx = to.x + CARD_W / 2

    let x1: number, y1: number, x2: number, y2: number

    if (fromCx <= toCx) {
      x1 = from.x + CARD_W
      y1 = from.y + fromH / 2
      x2 = to.x
      y2 = to.y + toH / 2
    } else {
      x1 = from.x
      y1 = from.y + fromH / 2
      x2 = to.x + CARD_W
      y2 = to.y + toH / 2
    }

    const dx = Math.abs(x2 - x1)
    const tension = Math.max(dx * 0.4, 50)
    const cp1x = x1 + (x1 <= x2 ? tension : -tension)
    const cp2x = x2 + (x1 <= x2 ? -tension : tension)
    const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`

    const label = `${rel.parentField ?? ''} → ${rel.childField ?? ''}`
    const labelW = label.length * 6.5 + 4
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2

    return { path, label, labelW, midX, midY }
  }).filter((v): v is NonNullable<typeof v> => v !== null)
})

function resetDesignerRuntimeState(): void {
  tableUiState.value = {}
  selectedTableId.value = null
  expandedTables.value = new Set()
  propsExpandedTables.value = new Set()
  editingRel.value = null
  hoveredRelIdx.value = -1
  pendingProjectionLayout.value = null
}

// ═══ 直接对接 DataSetCrudTool 页面节点子模型 ═══

function refreshFromLiveData(silent = false): void {
  const tool = getPageDataTool()
  if (!tool) {
    if (!silent) {
      ElMessage.warning('当前页面尚未初始化 DataSet 模型')
    }
    return
  }

  resetSelectionState()
}

onMounted(() => {
  refreshFromLiveData(true)
  document.addEventListener('keydown', onKeydown)
})

watch(
  () => props.state.activePageId.value,
  (nextPageId, previousPageId) => {
    if (nextPageId === previousPageId) return
    resetDesignerRuntimeState()
    refreshFromLiveData(true)
  },
)

function normalizeRelation(rel: DesignerRelationProjection): DataResourceRelation {
  return {
    parentTable: rel.parentTable,
    childTable: rel.childTable,
    ...(rel.parentField !== undefined ? { parentField: rel.parentField } : {}),
    ...(rel.childField !== undefined ? { childField: rel.childField } : {}),
    ...(rel.relationName !== undefined ? { relationName: rel.relationName } : {}),
    ...(rel.condition !== undefined ? { condition: rel.condition } : {}),
    ...(rel.cascadeUpdate !== undefined ? { cascadeUpdate: rel.cascadeUpdate } : {}),
    ...(rel.cascadeDelete !== undefined ? { cascadeDelete: rel.cascadeDelete } : {}),
  }
}

function buildRelationSelector(rel: {
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
}): {
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
} {
  return {
    parentTable: rel.parentTable,
    childTable: rel.childTable,
    ...(rel.parentField ? { parentField: rel.parentField } : {}),
    ...(rel.childField ? { childField: rel.childField } : {}),
  }
}

function deleteTableWithRelationFallback(
  tool: DataSetCrudTool,
  tableName: string,
  currentRelations: DesignerRelationProjection[],
): void {
  try {
    tool.deleteTable(tableName)
  } catch {
    // 兜底：若依赖导致 deleteTable 失败，先清理关联再删。
    for (const rel of currentRelations) {
      if (rel.parentTable === tableName || rel.childTable === tableName) {
        tool.deleteResourceRelation(buildRelationSelector(rel))
      }
    }
    tool.deleteTable(tableName)
  }
}

function projectDesignerFromMetadata(
  metadata: DataSetMetadata,
  layoutForNewTable?: LayoutForNewTable,
): void {
  tableUiState.value = reconcileDesignerTableUiState({
    metadata,
    currentTables: tables.value,
    createId: generateId,
    layoutForNewTable,
  })
}

function snapshotRelations(): DesignerRelationProjection[] {
  return [...relations.value]
}

// ═══ 表操作 ═══

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function addTable() {
  const tableCount = tables.value.length
  const tableName = `table_${tableCount + 1}`
  applyHistoryMutation((tool) => {
    tool.createTable({
      tableName,
      columns: [{ name: 'id', label: 'ID', type: 'number', isPrimaryKey: true }],
      views: { default: { rows: [] } },
    })
  }, (_name: string, i: number) => ({
    x: 50 + ((tableCount + i) % 3) * 220,
    y: 50 + Math.floor((tableCount + i) / 3) * 200,
  }))
}

async function removeTable(idx: number) {
  const table = tables.value[idx]
  if (!table) return
  if (!await confirmDangerAction(`确定删除表「${table.tableName}」及其关联关系？`, '删除表', '删除')) return
  const tableId = table.id
  const name = table.tableName
  const relationSnapshot = snapshotRelations()
  applyHistoryMutation((tool) => {
    deleteTableWithRelationFallback(tool, name, relationSnapshot)
  })
  if (selectedTableId.value === tableId) {
    resetSelectionState()
  }
}

function addColumn(table: DesignerTableProjection) {
  applyHistoryMutation((tool) => {
    tool.createColumn({
      tableName: table.tableName,
      column: {
        name: `field_${table.columns.length}`,
        label: '',
        type: 'string',
        isPrimaryKey: false,
      },
    })
  })
}

function readInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function applyMutationWithFeedback(action: () => void, failureTitle: string): void {
  try {
    action()
  } catch (error) {
    ElMessage.error(`${failureTitle}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function confirmDangerAction(message: string, title: string, confirmButtonText: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText,
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

function applyHistoryMutationWithFeedback(
  mutator: (tool: DataSetCrudTool) => void,
  failureTitle: string,
  layoutForNewTable?: LayoutForNewTable,
): void {
  applyMutationWithFeedback(() => {
    applyHistoryMutation(mutator, layoutForNewTable)
  }, failureTitle)
}

type TableUpdatePayload = {
  resourceType?: TableResourceType | null
  businessCategory?: TableBusinessCategory | null
  resourceId?: string | null
  api?: CrudApi | string | boolean}

function updateTableWithFeedback(
  table: DesignerTableProjection,
  updates: TableUpdatePayload,
  failureTitle: string,
): void {
  applyHistoryMutationWithFeedback((tool) => {
    const params: { tableName: string } & TableUpdatePayload = { tableName: table.tableName }
    if (updates.resourceType !== undefined) params.resourceType = updates.resourceType
    if (updates.businessCategory !== undefined) params.businessCategory = updates.businessCategory
    if (updates.resourceId !== undefined) params.resourceId = updates.resourceId
    if (updates.api !== undefined) params.api = updates.api
    tool.updateTable(params)
  }, failureTitle)
}

type ColumnUpdateFeedbackInput = Readonly<{
  table: DesignerTableProjection
  columnName: string
  updates: Partial<DataColumn>
  failureTitle: string
}>

function updateColumnWithFeedback(input: ColumnUpdateFeedbackInput): void {
  const { table, columnName, updates, failureTitle } = input
  applyHistoryMutationWithFeedback((tool) => {
    tool.updateColumn({ tableName: table.tableName, columnName, updates })
  }, failureTitle)
}

type ColumnRenameFeedbackInput = Readonly<{
  table: DesignerTableProjection
  columnName: string
  newColumnName: string
  failureTitle: string
}>

function renameColumnWithFeedback(input: ColumnRenameFeedbackInput): void {
  const { table, columnName, newColumnName, failureTitle } = input
  applyHistoryMutationWithFeedback((tool) => {
    tool.renameColumn({ tableName: table.tableName, columnName, newColumnName })
  }, failureTitle)
}

function deleteColumnWithFeedback(
  table: DesignerTableProjection,
  columnName: string,
  failureTitle: string,
): void {
  applyHistoryMutationWithFeedback((tool) => {
    tool.deleteColumn({ tableName: table.tableName, columnName })
  }, failureTitle)
}

function handleTableNameInputChange(table: DesignerTableProjection, event: Event): void {
  const nextName = readInputValue(event).trim()
  if (!nextName || nextName === table.tableName) return
  applyHistoryMutationWithFeedback((tool) => {
    tool.renameTable({ tableName: table.tableName, newTableName: nextName })
  }, '表名更新失败')
}

function handleTableSemanticChange(
  table: DesignerTableProjection,
  updates: TableUpdatePayload,
): void {
  updateTableWithFeedback(table, updates, '表属性更新失败')
}

function handleTableResourceIdInputChange(table: DesignerTableProjection, event: Event): void {
  const value = readInputValue(event).trim()
  updateTableWithFeedback(table, { resourceId: value || null }, '资源 ID 更新失败')
}

function handleTableApiInputChange(table: DesignerTableProjection, event: Event): void {
  const value = readInputValue(event).trim()
  updateTableWithFeedback(table, { api: value || false }, 'API 更新失败')
}

function handleColumnFieldChange(table: DesignerTableProjection, column: DesignerColumn, updates: Partial<DataColumn>): void {
  updateColumnWithFeedback({ table, columnName: column.name, updates, failureTitle: '字段更新失败' })
}

function handleColumnNameInputChange(table: DesignerTableProjection, column: DesignerColumn, event: Event): void {
  const nextName = readInputValue(event).trim()
  if (!nextName || nextName === column.name) return
  renameColumnWithFeedback({
    table,
    columnName: column.name,
    newColumnName: nextName,
    failureTitle: '字段名更新失败',
  })
}

function handleColumnLabelInputChange(table: DesignerTableProjection, column: DesignerColumn, event: Event): void {
  const nextLabel = readInputValue(event)
  if (nextLabel === (column.label ?? '')) return
  handleColumnFieldChange(table, column, { label: nextLabel })
}

function handleColumnTypeChange(table: DesignerTableProjection, column: DesignerColumn, nextType: unknown): void {
  if (typeof nextType !== 'string' || nextType === column.type) return
  handleColumnFieldChange(table, column, { type: nextType })
}

function removeColumn(table: DesignerTableProjection, idx: number) {
  const column = table.columns[idx]
  if (!column) return
  deleteColumnWithFeedback(table, column.name, '字段删除失败')
}

// ═══ 关联操作 ═══

async function addResourceRelation() {
  if (tables.value.length < 2) {
    ElMessage.warning('至少需要两个表才能创建关联')
    return
  }
  const parentTable = tables.value[0]!.tableName
  const childTable = tables.value[1]!.tableName
  applyHistoryMutation((tool) => {
    tool.createResourceRelation({
      parentTable,
      childTable,
      parentField: 'id',
      childField: `${parentTable}Id`,
    })
  })
  const newIdx = relations.value.length - 1
  // 打开编辑弹窗
  editRelation(newIdx)
}

function getTableByName(name: string | undefined): DesignerTableProjection | undefined {
  return tables.value.find((t) => t.tableName === name)
}

function getTableById(id: string): DesignerTableProjection | undefined {
  return tables.value.find((t) => t.id === id)
}

function upsertTableUiPosition(table: DesignerTableProjection, x: number, y: number): void {
  tableUiState.value = {
    ...tableUiState.value,
    [table.tableName]: {
      id: table.id,
      columnIds: tableUiState.value[table.tableName]?.columnIds ?? buildColumnIdMap(table),
      x,
      y,
    },
  }
}

function deleteResourceRelationBySelector(selector: ReturnType<typeof buildRelationSelector>): void {
  applyHistoryMutation((tool) => {
    tool.deleteResourceRelation(selector)
  })
}

function removeResourceRelation(idx: number) {
  const rel = relations.value[idx]
  if (!rel) return
  deleteResourceRelationBySelector(buildRelationSelector(rel))
  if (editingRel.value?.sourceIndex === idx) editingRel.value = null
}

function editRelation(idx: number) {
  const rel = relations.value[idx]
  if (!rel) return
  editingRel.value = {
    sourceIndex: idx,
    sourceSelector: buildRelationSelector(rel),
    draft: { ...rel },
  }
}

function applyRelationEdit() {
  if (!editingRel.value) return
  const { sourceSelector, draft } = editingRel.value
  applyHistoryMutation((tool) => {
    tool.updateResourceRelation({
      selector: sourceSelector,
      updates: normalizeRelation(draft),
    })
  })
  editingRel.value = null
}

async function deleteEditingRelation() {
  if (!editingRel.value) return
  if (!await confirmDangerAction('确定删除该关联关系？', '删除关联', '删除')) return
  const idx = editingRel.value.sourceIndex
  const rel = relations.value[idx]
  editingRel.value = null
  if (!rel) return
  deleteResourceRelationBySelector(buildRelationSelector(rel))
}

function toggleSchema(tableId: string) {
  expandedTables.value = toggleSetItem(expandedTables.value, tableId)
}

function toggleProps(tableId: string) {
  propsExpandedTables.value = toggleSetItem(propsExpandedTables.value, tableId)
}

function toggleSetItem(source: Set<string>, item: string): Set<string> {
  const next = new Set(source)
  if (next.has(item)) {
    next.delete(item)
  } else {
    next.add(item)
  }
  return next
}

async function clearAll() {
  if (!await confirmDangerAction(
    `确定清空所有 ${tables.value.length} 个表和 ${relations.value.length} 个关联？此操作可通过 Ctrl+Z 撤销。`,
    '清空画布',
    '清空',
  )) return
  const relationSnapshot = snapshotRelations()
  applyHistoryMutation((tool) => {
    for (const name of tables.value.map(table => table.tableName)) {
      deleteTableWithRelationFallback(tool, name, relationSnapshot)
    }
  })
  resetSelectionState()
}

function autoLayout() {
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(tables.value.length))))
  const nextUiState: Record<string, DesignerTableUiState> = { ...tableUiState.value }
  tables.value.forEach((table, i) => {
    nextUiState[table.tableName] = {
      id: nextUiState[table.tableName]?.id ?? table.id,
      columnIds: nextUiState[table.tableName]?.columnIds ?? buildColumnIdMap(table),
      x: 40 + (i % cols) * 320,
      y: 40 + Math.floor(i / cols) * 280,
    }
  })
  tableUiState.value = nextUiState
  commitLayoutCheckpoint()
}

// ═══ 拖拽交互 ═══

function onCardMouseDown(e: MouseEvent, table: DesignerTableProjection) {
  if (!(e.target instanceof HTMLElement)) return
  const target = e.target
  if (target.closest('input, .el-select, .el-button, .el-tag')) return

  dragState.value = {
    tableId: table.id,
    startX: e.clientX,
    startY: e.clientY,
    origX: table.x,
    origY: table.y,
  }
  selectedTableId.value = table.id
  attachDragListeners()
  e.preventDefault()
}

function isDraggingTable(tableId: string): boolean {
  const drag = dragState.value
  return drag !== null && drag.tableId === tableId
}

function attachDragListeners(): void {
  document.addEventListener('mousemove', onDocMouseMove)
  document.addEventListener('mouseup', onDocMouseUp)
}

function detachDragListeners(): void {
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
}

function onDocMouseMove(e: MouseEvent) {
  const drag = dragState.value
  if (!drag) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  const table = getTableById(drag.tableId)
  if (table) {
    upsertTableUiPosition(table, Math.max(0, drag.origX + dx), Math.max(0, drag.origY + dy))
  }
}

function onDocMouseUp() {
  const drag = dragState.value
  if (drag) {
    const table = getTableById(drag.tableId)
    if (table && (table.x !== drag.origX || table.y !== drag.origY)) {
      commitLayoutCheckpoint()
    }
  }
  dragState.value = null
  detachDragListeners()
}

onUnmounted(() => {
  detachDragListeners()
  document.removeEventListener('keydown', onKeydown)
})

</script>

<style scoped>
.dataset-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f8fafc;
  overflow: hidden;
}

.ds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ede9fe 0%, #e0f2fe 100%);
  border-bottom: 1px solid #d4d4d8;
}

.ds-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ds-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.ds-header__actions {
  display: flex;
  gap: 8px;
}

.ds-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ═══ 画布 ═══ */

.ds-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  min-width: 0;
}

.ds-canvas--full {
  border-right: none;
}

.ds-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.ds-toolbar__info {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
}

.ds-toolbar__sep {
  width: 1px;
  height: 20px;
  background: #e2e8f0;
  margin: 0 4px;
}

/* 画布视口 */
.ds-viewport {
  flex: 1;
  overflow: auto;
  position: relative;
}

.ds-canvas-inner {
  position: relative;
  min-width: 100%;
  min-height: 100%;
  background-image:
    radial-gradient(circle, #d4d4d8 1px, transparent 1px);
  background-size: 20px 20px;
}

/* SVG 连线层 */
.ds-svg-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.ds-rel-line {
  transition: stroke 0.15s, stroke-width 0.15s;
  pointer-events: stroke !important;
  stroke-linecap: round;
}

.ds-rel-line--hover {
  stroke: #7c3aed !important;
  stroke-width: 3 !important;
}

.ds-rel-label-bg {
  pointer-events: fill !important;
  cursor: pointer;
  transition: fill 0.15s, stroke 0.15s;
}

.ds-rel-label-text {
  pointer-events: fill !important;
  cursor: pointer;
  font-family: system-ui, sans-serif;
}

/* ═══ 关系编辑弹窗 ═══ */
.ds-rel-editor {
  position: absolute;
  z-index: 20;
  width: 240px;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
  padding: 10px 12px;
}

.ds-rel-editor__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}

.ds-rel-editor__title .el-button {
  margin-left: auto;
}

.ds-rel-editor__title .el-button + .el-button {
  margin-left: 0;
}

.ds-rel-editor__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ds-rel-editor__row label {
  width: 48px;
  font-size: 11px;
  color: #64748b;
  flex-shrink: 0;
}

.ds-rel-editor__row .el-select {
  flex: 1;
}

.ds-rel-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

/* ═══ 可拖拽表卡片 ═══ */

.ds-card {
  position: absolute;
  width: 260px;
  background: #fff;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  z-index: 2;
  transition: box-shadow 0.15s, border-color 0.15s;
  user-select: none;
}

.ds-card:hover {
  border-color: #a5b4fc;
}

.ds-card--selected {
  border-color: #7c3aed;
  box-shadow: 0 4px 16px rgb(124 58 237 / 20%);
}

.ds-card--dragging {
  opacity: 0.9;
  box-shadow: 0 8px 24px rgb(0 0 0 / 15%);
  z-index: 10;
  cursor: grabbing;
}

.ds-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%);
  border-bottom: 1px solid #e2e8f0;
  border-radius: 6px 6px 0 0;
  cursor: grab;
  overflow: hidden;
}

.ds-card--dragging .ds-card__header {
  cursor: grabbing;
}

.ds-card__title {
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  outline: none;
  min-width: 50px;
  max-width: 80px;
  cursor: text;
}

.ds-card__badges {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.ds-card__spacer {
  flex: 1;
  min-width: 0;
}

.ds-card__btn {
  padding: 2px !important;
  width: 22px !important;
  height: 22px !important;
  flex-shrink: 0;
}

/* 紧凑字段列表 */
.ds-card__columns {
  padding: 4px 0;
}

.ds-card__col {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  font-size: 12px;
  color: #475569;
}

.ds-card__col-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-card__col-name--pk {
  font-weight: 600;
  color: #7c3aed;
}

.ds-card__col-type {
  font-size: 10px;
  color: #94a3b8;
  padding: 1px 4px;
  background: #f1f5f9;
  border-radius: 3px;
  flex-shrink: 0;
}

.ds-card__col-label {
  font-size: 10px;
  color: #a1a1aa;
  flex-shrink: 0;
}

/* 表属性编辑区 */
.ds-card__props {
  padding: 6px 10px;
  background: #eff6ff;
  border-top: 1px solid #dbeafe;
}

.ds-prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.ds-prop-row label {
  width: 56px;
  font-size: 10px;
  color: #64748b;
  flex-shrink: 0;
}

.ds-prop-row .el-select {
  flex: 1;
  --el-select-input-font-size: 11px;
}

.ds-prop-row__input {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  color: #334155;
  outline: none;
  padding: 2px 6px;
  border-radius: 3px;
}

.ds-prop-row__input:hover,
.ds-prop-row__input:focus {
  border-color: #93c5fd;
  background: #f0f9ff;
}

/* Schema 编辑区（折叠） */
.ds-card__schema {
  padding: 6px 10px;
  background: #fafafa;
  border-top: 1px solid #f1f5f9;
}

.ds-schema-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  border-bottom: 1px dashed #f1f5f9;
}

.ds-schema-row:last-of-type {
  border-bottom: none;
}

.ds-schema-row .el-checkbox {
  --el-checkbox-input-width: 14px;
  --el-checkbox-input-height: 14px;
  margin-right: 0;
}

.ds-schema-row__field {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  color: #334155;
  outline: none;
  padding: 2px 4px;
  border-radius: 3px;
}

.ds-schema-row__field:hover,
.ds-schema-row__field:focus {
  border-color: #c4b5fd;
  background: #faf5ff;
}

.ds-schema-row__label {
  width: 50px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 10px;
  color: #94a3b8;
  outline: none;
  text-align: right;
  padding: 2px 4px;
  border-radius: 3px;
}

.ds-schema-row__label:hover,
.ds-schema-row__label:focus {
  border-color: #c4b5fd;
  background: #faf5ff;
}

.ds-schema-row__type {
  width: 78px;
  --el-select-input-font-size: 10px;
}

.ds-schema-row__del {
  padding: 2px !important;
  width: 18px !important;
  height: 18px !important;
  flex-shrink: 0;
}

.ds-schema-add {
  width: 100%;
  margin-top: 4px;
  font-size: 10px;
}

/* 卡片底部信息栏 */
.ds-card__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  border-radius: 0 0 6px 6px;
  font-size: 9px;
  color: #94a3b8;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.ds-card__coord {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ds-card__size {
  opacity: 0.7;
}

.ds-card__id {
  margin-left: auto;
  opacity: 0.5;
}

/* 空状态 */
.ds-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #94a3b8;
  z-index: 0;
}

.ds-empty p {
  margin: 8px 0 0;
}

.ds-empty__hint {
  font-size: 12px;
  color: #cbd5e1;
}

</style>
