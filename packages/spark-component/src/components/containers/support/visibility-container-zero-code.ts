/**
 * @module @spark-appworks/spark-component:components/containers/support/visibility-container-zero-code
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/visibility-container-zero-code 的模块能力，围绕 VisibilityContainerZeroCodeOptions 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/visibility-container-zero-code 的声明、导出和使用边界时，从本模块开始。
 */
import type { ValueRef } from '../../shared-types.js'
import type { VisibilityContainerApi } from './crud/base-container-api.js'

/** Visibility Container Zero Code Options 的调用配置。 */
export type VisibilityContainerZeroCodeOptions = {
    /** visible Value 字段。 */
visibleValue: ValueRef<boolean>
    /** commit Visible Value 回调。 */
commitVisibleValue: (value: boolean) => void
    /** on Open 事件回调。 */
onOpen: (() => void) | undefined
    /** on Close 事件回调。 */
onClose: (() => void) | undefined
    /** on Opened 事件回调。 */
onOpened: (() => void) | undefined
    /** on Closed 事件回调。 */
onClosed: (() => void) | undefined
}

export function createVisibilityContainerZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const api: VisibilityContainerApi = {
    open() {
      options.commitVisibleValue(true)
    },
    close() {
      options.commitVisibleValue(false)
    },
    isVisible() {
      return options.visibleValue.value
    },
    toggle() {
      options.commitVisibleValue(!options.visibleValue.value)
    },
  }

  return {
    api,
    handleModelUpdate(value: boolean) {
      options.commitVisibleValue(value)
    },
    handleOpen() {
      options.onOpen?.()
    },
    handleClose() {
      options.onClose?.()
    },
    handleOpened() {
      options.onOpened?.()
    },
    handleClosed() {
      options.onClosed?.()
    },
  }
}
