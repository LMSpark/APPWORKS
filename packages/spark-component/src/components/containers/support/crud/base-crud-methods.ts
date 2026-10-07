/**
 * @module @spark-appworks/spark-component:components/containers/support/crud/base-crud-methods
 * 职责：提供 base crud methods 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * BaseContainerApi 通用实现工厂
 *
 * Form / Detail / List 可直接展开使用；Table 展开后覆盖 setCurrentRow / setCurrentRowById。
 */
import type { DataView, DataRow } from '@spark-appworks/spark-data'
import type { ValueRef } from '../../../shared-types.js'
import type { BaseContainerApi } from './base-container-api.js'
import { createCancelledCrudResult } from '../interactionControl.js'
import type { EventDispatcher } from '../useEventDefaults.js'

export function createBaseCrudMethods(
  resolvedView: ValueRef<DataView | null>,
  dispatch: EventDispatcher,
): BaseContainerApi {
  return {
    getDataSource() {
      return resolvedView.value ?? null
    },
    getCurrentRow() {
      return resolvedView.value?.currentRow ?? null
    },
    async refresh() {
      const view = resolvedView.value
      if (!view) return
      await view.refresh()
    },
    async addRow(row) {
      const view = resolvedView.value
      if (!view) return null
      const { cancel } = await dispatch('add-row', row)
      if (cancel) return createCancelledCrudResult<DataRow>('addRow cancelled by business handler')
      return await view.addRow(row)
    },
    async editRowById(id, patch) {
      const view = resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('edit-row', id, patch)
      if (cancel) return createCancelledCrudResult<DataRow>('editRowById cancelled by business handler')
      return await view.editRowById(id, patch)
    },
    async removeRow(id) {
      const view = resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('remove-row', id)
      if (cancel) return createCancelledCrudResult<boolean>('removeRow cancelled by business handler')
      return await view.removeRow(id)
    },
    appendRow(row) {
      resolvedView.value?.appendRow(row)
    },
    updateRowById(id, patch) {
      return resolvedView.value?.updateRowById(id, patch) ?? false
    },
    deleteRowById(id) {
      return resolvedView.value?.deleteRowById(id) ?? false
    },
    setCurrentRow(row) {
      resolvedView.value?.setCurrentRow(row ?? null)
    },
    setCurrentRowById(id) {
      return resolvedView.value?.setCurrentRowById(id ?? null) ?? false
    },
  }
}
