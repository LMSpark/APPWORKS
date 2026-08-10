/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererCollapse/zero-code
 * 职责：封装 RendererCollapse（r-collapse）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 container/layout-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer collapse 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { RendererCollapseApi } from './types'
import type { ValueRef } from '../../../shared-types.js'
import type { SparkNode } from '@spark-appworks/spark-data'

/** Renderer Collapse Zero Code Options 的调用配置。 */
type RendererCollapseZeroCodeOptions = {
    /** current Value 字段。 */
currentValue: ValueRef<string | number | Array<string | number> | undefined>
    /** commit Collapse Value 回调。 */
commitCollapseValue: (value: string | number | Array<string | number>, options?: { emit?: boolean }) => void
    /** item Configs 字段。 */
itemConfigs: ValueRef<SparkNode[]>
    /** get Item Name 名称。 */
getItemName: (item: SparkNode, index: number) => string | number
    /** on Change 事件回调。 */
onChange: ((value: string | number | Array<string | number>) => void) | undefined}

export function createRendererCollapseZeroCode(options: RendererCollapseZeroCodeOptions) {
  const collapseApi: RendererCollapseApi = {
    getExpandedItems() {
      return options.currentValue.value
    },
    setExpandedItems(value) {
      options.commitCollapseValue(value)
    },
    expandAll() {
      const allNames = options.itemConfigs.value.map((item, index) => options.getItemName(item, index))
      options.commitCollapseValue(allNames)
    },
    collapseAll() {
      options.commitCollapseValue([])
    },
    toggleItem(name) {
      const current = Array.isArray(options.currentValue.value) ? options.currentValue.value : []
      const next = current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
      options.commitCollapseValue(next)
    },
    isItemExpanded(name) {
      const current = options.currentValue.value
      if (Array.isArray(current)) return current.includes(name)
      return current === name
    },
  }

  return {
    collapseApi,
    handleModelUpdate(value: string | number | Array<string | number>) {
      options.commitCollapseValue(value)
    },
    handleChange(value: string | number | Array<string | number>) {
      options.commitCollapseValue(value, { emit: false })
      options.onChange?.(value)
    },
  }
}