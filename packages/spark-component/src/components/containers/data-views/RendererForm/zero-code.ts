/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/zero-code
 * 职责：封装 RendererForm（r-form）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer form 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import {
  createContainerCrudContext,
  getNativeRefValue,
} from '../zero-code-shared.js'
import type { RendererFormApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type NativeFormLike = {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void}

function isNativeFormLike(value: unknown): value is NativeFormLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('validate' in value) || typeof value.validate === 'function')
    && (!('resetFields' in value) || typeof value.resetFields === 'function')
    && (!('clearValidate' in value) || typeof value.clearValidate === 'function')
}

/** Renderer Form Zero Code Options 的调用配置。 */
type RendererFormZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** form Model 字段。 */
formModel: Record<string, unknown>
    /** native Form Ref 字段。 */
nativeFormRef: ValueRef<unknown>
    /** 诊断日志接口。 */
logger: LoggerApi}

export function createRendererFormZeroCode(options: RendererFormZeroCodeOptions) {
  const { props, resolvedView, formModel, nativeFormRef } = options

  const { baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
  })

  const formApi: RendererFormApi = {
    ...baseMethods,
    getFormData() {
      return formModel
    },
    getNativeForm() {
      return getNativeRefValue(nativeFormRef, isNativeFormLike)
    },
    async validate() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
      if (!form || typeof form.validate !== 'function') return true
      try {
        return await form.validate()
      } catch {
        return false
      }
    },
    resetFields() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
      if (!form || typeof form.resetFields !== 'function') return
      form.resetFields()
    },
    clearValidate() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
      if (!form || typeof form.clearValidate !== 'function') return
      form.clearValidate()
    },
    getFieldValue(field) {
      return formModel[field]
    },
    setFieldValue(field, value) {
      formModel[field] = value
    },
  }

  return {
    formApi,
  }
}
