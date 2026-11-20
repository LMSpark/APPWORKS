/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererList/zero-code
 * 职责：封装 RendererList（r-list）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer list 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import { isDataRow, type DataView, type DataRow } from '@spark-appworks/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer List Zero Code Options 的调用配置。 */
type RendererListZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** 行数据集合。 */
rows: ValueRef<readonly DataRow[]>}

export function createRendererListZeroCode(options: RendererListZeroCodeOptions) {
  const { props, resolvedView, rows } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'item-click': {
        systemDefault: (row: unknown) => {
          if (isDataRow(row)) {
            resolvedView.value?.setCurrentRow(row)
          }
        },
      },
    },
  })

  const listApi: RendererListApi = {
    ...baseMethods,
    getRows() {
      return [...rows.value]
    },
    getItemCount() {
      return rows.value.length
    },
  }

  return {
    dispatch,
    listApi,
  }
}
