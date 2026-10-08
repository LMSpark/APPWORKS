<!--
@module @spark-appworks/spark-component:components/fields/non-data-components/FieldContextRenderer
职责：实现 FieldContextRenderer（r-context-renderer）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/field-support 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field context renderer 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <!-- table 模式：el-table-column -->
  <template v-if="resolvedContext === 'table'">
    <!-- 分组列（多行表头） -->
    <el-table-column
      v-if="resolvedChildren.length > 0"
      :label="resolvedDisplayLabel"
      :width="width"
      :min-width="minWidth"
      :resizable="resolvedResizable"
      :fixed="fixed"
      :align="resolvedValueAlign"
      :header-align="resolvedHeaderAlign"
      :label-class-name="tableHeaderClassName"
      :class-name="tableCellClassName"
    >
      <SparkComponentRenderer
        v-for="(child, i) in resolvedChildren"
        :key="nodeId(child) ?? `fcr-child-${i}`"
        :config="child"
      />
    </el-table-column>
    <!-- 数据列 -->
    <el-table-column
      v-else
      :label="resolvedDisplayLabel"
      :prop="resolvedFieldName"
      :sortable="resolvedSortable"
      :width="width"
      :min-width="minWidth"
      :resizable="resolvedResizable"
      :fixed="fixed"
      :header-align="resolvedHeaderAlign"
      :align="resolvedValueAlign"
      :label-class-name="tableHeaderClassName"
      :class-name="tableCellClassName"
    >
      <template #default="{ row }">
        <template v-if="!resolveTableCellHidden(row)">
          <slot name="table-cell" :row="row" :value="resolveTableCellDisplayValue(row)">
            <span :class="['field-table-value', tableValueClassName]">{{ resolveTableCellDisplayValue(row) }}</span>
          </slot>
        </template>
      </template>
    </el-table-column>
  </template>

  <!-- form 模式：el-form-item（携带列级验证规则） -->
  <el-form-item
    v-else-if="resolvedContext === 'form' && resolvedShouldRenderCurrentField"
    :label="resolvedDisplayLabel"
    :prop="resolvedFieldName"
    :rules="resolvedValidationRules"
  >
    <slot name="form" />
  </el-form-item>

  <!-- tree 模式：树节点文本 -->
  <template v-else-if="resolvedContext === 'tree'">
    <template v-if="resolvedShouldRenderCurrentField">
      <slot name="tree">
        <span class="tree-node-text">{{ resolvedCurrentDisplayValue }}</span>
      </slot>
    </template>
  </template>

  <!-- detail 模式（含 list 等只读宿主）：只读展示 -->
  <template v-else>
    <template v-if="resolvedShouldRenderCurrentField">
      <slot name="detail">
        <div class="field-display">
          <span :class="['field-label', detailTitleClassName]">{{ resolvedDisplayLabel }}：</span>
          <span :class="['field-value', detailValueClassName]">{{ resolvedCurrentDisplayValue }}</span>
        </div>
      </slot>
    </template>
  </template>
</template>

<script setup lang="ts">
/**
 * @description 语境感知字段渲染代理，根据父容器类型（table/form/detail/tree）自动切换渲染模板，统一处理权限控制和校验规则。
 * @notes displayLabel - 分组标题（用于多级表头）
 * @notes children - 子字段组件数组（SparkNode[]）
 */
// FieldContextRenderer 渲染为 fragment（多分支 <template>），无法自动透传 attrs。
// 声明 inheritAttrs: false 以避免 Vue 的 "Extraneous non-props attributes" 告警。
defineOptions({ inheritAttrs: false })
import { computed, inject } from 'vue'
import { SparkComponentRenderer } from '../../internal'

import { type DataRow, getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'
import type { SparkNodeProps } from '../../shared-types.js'
import type { FormItemRule } from '../columnFormRules'
import { useResolvedFieldContext } from '../context/useResolvedFieldContext'
import { TABLE_COLUMN_RESIZABLE_KEY } from '../context/tableColumnContext'
import type { SparkNode } from '@spark-appworks/spark-data'

/** 字段上下文渲染器属性，统一描述字段在表格、表单、详情中的展示状态。 */
type Props = SparkNodeProps & {
  /** 显示标签 */
  displayLabel?: string | undefined
  /** 字段绑定名 */
  fieldName?: string | undefined
  /** 列宽 */
  width?: string | number | undefined
  /** 表格列是否允许拖动列宽 */
  resizable?: boolean | undefined
  /** 表格列排序能力 */
  sortable?: boolean | 'custom' | undefined
  /** 表格字段是否可参与过滤区生成；由上层容器消费，此处仅声明避免 fallthrough warning */
  filterable?: boolean | undefined
  /** 最小列宽 */
  minWidth?: string | number | undefined
  /** 固定列方向 */
  fixed?: boolean | 'left' | 'right' | undefined
  /** 列对齐 */
  align?: 'left' | 'center' | 'right' | undefined
  /** 表头对齐 */
  headerAlign?: 'left' | 'center' | 'right' | undefined
  /** 子组件配置 */
  mergedChildren?: SparkNode[] | undefined
  /** 当前字段是否隐藏 */
  isCurrentFieldHidden?: boolean | undefined
  /** 当前宿主下字段是否应渲染 */
  shouldRenderCurrentField?: boolean | undefined
  /** 当前显示值 */
  currentDisplayValue?: string | undefined
  /** 表格行级隐藏判断 */
  isTableCellHidden?: ((row: DataRow) => boolean) | undefined
  /** 表格行级显示值获取 */
  getTableCellDisplayValue?: ((row: DataRow) => string) | undefined
  /** 表单验证规则 */
  validationRules?: FormItemRule[] | undefined
  /** 标题对齐（table/detail） */
  titleAlign?: 'left' | 'center' | 'right' | undefined
  /** 值对齐（table/detail） */
  valueAlign?: 'left' | 'center' | 'right' | undefined
  /** 表头 class（table） */
  headerCellClassName?: string | undefined
  /** 单元格 class（table） */
  cellClassName?: string | undefined
  /** 标题 class（detail） */
  titleClassName?: string | undefined
  /** 值 class（detail/table value） */
  valueClassName?: string | undefined}

const props = defineProps<Props>()

const resolvedContext = useResolvedFieldContext()
const tableColumnResizable = inject(TABLE_COLUMN_RESIZABLE_KEY, undefined)

// 1. 解析字段基础语义：不同宿主最终都依赖同一组 label/field/children 快照。
const resolvedDisplayLabel = computed(() => props.displayLabel ?? '')
const resolvedFieldName = computed(() => props.fieldName ?? '')
const resolvedChildren = computed<SparkNode[]>(() => {
  return getSparkNodeChildren(props.mergedChildren ?? props.children)
})
const resolvedCurrentFieldHidden = computed(() => props.isCurrentFieldHidden ?? false)
const resolvedShouldRenderCurrentField = computed(() => props.shouldRenderCurrentField ?? !resolvedCurrentFieldHidden.value)
const resolvedCurrentDisplayValue = computed(() => props.currentDisplayValue ?? '')
const resolvedValidationRules = computed<FormItemRule[]>(() => props.validationRules ?? [])

// 2. 表格宿主专用投影：排序、列宽、表头/单元格对齐和 class 在这里集中决定。
const resolvedHeaderAlign = computed(() => props.headerAlign ?? 'center')
const resolvedValueAlign = computed(() => props.valueAlign ?? 'left')
const resolvedSortable = computed<boolean | 'custom'>(() => props.sortable ?? true)
const resolvedResizable = computed(() => props.resizable ?? tableColumnResizable?.value ?? true)

const tableHeaderClassName = computed(() => props.headerCellClassName ?? `spark-col-header--${resolvedHeaderAlign.value}`)

const tableCellClassName = computed(() => props.cellClassName ?? `spark-col-cell--${resolvedValueAlign.value}`)

const tableValueClassName = computed(() => (
  props.valueClassName ?? `field-table-value--${resolvedValueAlign.value}`
))

// 3. 详情/只读宿主专用投影：优先使用显式 class，否则按对齐配置生成稳定 class。
const detailTitleClassName = computed(() => (
  props.titleClassName
    ? props.titleClassName
    : props.titleAlign
      ? `field-align--${props.titleAlign}`
      : 'field-align--var-title'
))

const detailValueClassName = computed(() => (
  props.valueClassName
    ? props.valueClassName
    : props.valueAlign
      ? `field-align--${props.valueAlign}`
      : 'field-align--var-value'
))

function resolveTableCellHidden(row: DataRow): boolean {
  return props.isTableCellHidden?.(row) ?? false
}

function resolveTableCellDisplayValue(row: DataRow): string {
  if (props.getTableCellDisplayValue) return props.getTableCellDisplayValue(row)
  const fieldName = resolvedFieldName.value
  if (!fieldName) return ''
  const value = row[fieldName]
  return value == null ? '' : String(value)
}

defineSlots<{
  'table-cell'(props: { row: DataRow; value: string }): unknown
  'form'(): unknown
  'tree'(): unknown
  'detail'(): unknown
}>()
</script>

<style scoped>
.field-display {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  display: inline-block;
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  display: inline-block;
  color: #303133;
}

.field-align--left {
  text-align: left;
}

.field-align--center {
  text-align: center;
}

.field-align--right {
  text-align: right;
}

.field-align--var-title {
  text-align: var(--spark-detail-title-align, left);
}

.field-align--var-value {
  text-align: var(--spark-detail-value-align, left);
}

.field-table-value {
  display: inline;
}

.field-table-value--left {
  text-align: left;
}

.field-table-value--center {
  text-align: center;
}

.field-table-value--right {
  text-align: right;
}

:deep(.spark-col-header--left .cell) {
  text-align: left;
}

:deep(.spark-col-header--center .cell) {
  text-align: center;
}

:deep(.spark-col-header--right .cell) {
  text-align: right;
}

:deep(.spark-col-cell--left .cell) {
  text-align: left;
}

:deep(.spark-col-cell--center .cell) {
  text-align: center;
}

:deep(.spark-col-cell--right .cell) {
  text-align: right;
}
</style>
