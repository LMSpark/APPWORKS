/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererSection/zero-code
 * 职责：封装 RendererSection（r-section）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 container/layout-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer section 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { RendererSectionApi } from './types'
import type { ValueRef } from '../../../../shared-types.js'

/** Renderer Section Zero Code Options 的调用配置。 */
type RendererSectionZeroCodeOptions = {
    /** collapsed 字段。 */
collapsed: ValueRef<boolean>
    /** collapsible 字段。 */
collapsible: ValueRef<boolean>}

export function createRendererSectionZeroCode(options: RendererSectionZeroCodeOptions) {
  function toggleCollapsed(): void {
    if (!options.collapsible.value) return
    options.collapsed.value = !options.collapsed.value
  }

  const sectionApi: RendererSectionApi = {
    isCollapsed() {
      return options.collapsed.value
    },
    setCollapsed(value) {
      options.collapsed.value = value
    },
    toggle() {
      options.collapsed.value = !options.collapsed.value
    },
  }

  return {
    sectionApi,
    handleHeaderClick: toggleCollapsed,
    toggleCollapsed,
  }
}