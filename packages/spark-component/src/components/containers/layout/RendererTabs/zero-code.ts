/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTabs/zero-code
 * 职责：封装 RendererTabs（r-tabs）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 container/layout-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer tabs 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { RendererTabsApi } from './types'
import type { ValueRef } from '../../../shared-types.js'
import type { SparkNode } from '@spark-appworks/spark-data'

/** Tabs Emit 的语义模型。 */
type TabsEmit = {
  (event: 'update:modelValue', value: string | number): void}

/** Renderer Tabs Zero Code Options 的调用配置。 */
type RendererTabsZeroCodeOptions = {
    /** emit 字段。 */
emit: TabsEmit
    /** current Active Name 名称。 */
currentActiveName: ValueRef<string | number | undefined>
    /** pane Configs 字段。 */
paneConfigs: ValueRef<SparkNode[]>
    /** get Pane Name 名称。 */
getPaneName: (pane: SparkNode, index: number) => string | number
    /** on Tab Change 事件回调。 */
onTabChange: ((name: string | number) => void) | undefined}

export function createRendererTabsZeroCode(options: RendererTabsZeroCodeOptions) {
  const tabsApi: RendererTabsApi = {
    getActiveTab() {
      return options.currentActiveName.value
    },
    setActiveTab(name) {
      options.currentActiveName.value = name
      options.emit('update:modelValue', name)
    },
    getPaneNames() {
      return options.paneConfigs.value.map((pane, index) => options.getPaneName(pane, index))
    },
    getPaneCount() {
      return options.paneConfigs.value.length
    },
  }

  return {
    tabsApi,
    handleModelUpdate(value: string | number) {
      options.currentActiveName.value = value
      options.emit('update:modelValue', value)
    },
    handleTabChange(value: string | number) {
      options.currentActiveName.value = value
      options.onTabChange?.(value)
    },
  }
}