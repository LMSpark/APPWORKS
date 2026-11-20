/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/zero-code
 * 职责：封装 RendererDetail（r-detail）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer detail 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer Detail Zero Code Options 的调用配置。 */
type RendererDetailZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** detail Data 字段。 */
detailData: Record<string, unknown>
    /** 诊断日志接口。 */
logger: LoggerApi}

export function createRendererDetailZeroCode(options: RendererDetailZeroCodeOptions) {
  const { props, resolvedView, detailData } = options

  const { baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
  })

  const detailApi: RendererDetailApi = {
    ...baseMethods,
    getDetailData() {
      return detailData
    },
    getFieldValue(field) {
      return detailData[field]
    },
  }

  return {
    detailApi,
  }
}