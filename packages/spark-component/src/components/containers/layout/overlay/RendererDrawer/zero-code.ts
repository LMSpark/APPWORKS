/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDrawer/zero-code
 * 职责：封装 RendererDrawer（r-drawer）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 container/layout-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer drawer 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import {
  createVisibilityContainerZeroCode,
  type VisibilityContainerZeroCodeOptions,
} from '../../../support/visibility-container-zero-code.js'

export function createRendererDrawerZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const { api: drawerApi, ...handlers } = createVisibilityContainerZeroCode(options)
  return {
    drawerApi,
    ...handlers,
  }
}
