/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/types
 * 职责：集中定义 RendererForm（r-form）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer form 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { BaseContainerApi } from '../../support/crud/base-container-api.js'

/** Renderer Form Api 的语义模型。 */
export type RendererFormApi = BaseContainerApi & {
  /** 获取表单可编辑数据模型（与 el-form :model 绑定的 shallowReactive 对象，同一引用）。 */
  getFormData(): Record<string, unknown>
  /** 获取底层 Element Plus el-form 组件实例；未挂载时返回 null。 */
  getNativeForm(): unknown
  /** 触发表单校验；委托 el-form.validate，校验通过返回 true，失败或表单不可用返回 false（不抛异常）。 */
  validate(): Promise<boolean>
  /** 重置所有字段到初始值并清除校验状态；委托 el-form.resetFields。 */
  resetFields(): void
  /** 清除所有字段的校验提示，不重置值；委托 el-form.clearValidate。 */
  clearValidate(): void
  /** 读取表单模型中指定字段的当前值。 */
  getFieldValue(field: string): unknown
  /** 设置表单模型中指定字段的值；立即触发 Vue 响应式更新。 */
  setFieldValue(field: string, value: unknown): void}
