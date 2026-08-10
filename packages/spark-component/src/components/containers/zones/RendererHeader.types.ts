/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererHeader.types
 * 职责：集中定义 RendererHeader（r-header）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/zone-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer header 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { SparkNodeProps } from '../../shared-types'
import type { SparkNode } from '@spark-appworks/spark-data'

/**
 * `RendererHeader` 运行时公开属性。
 */
export type RHeaderProps = SparkNodeProps & {
  /** 组件类型固定为 `r-header`。 */
    type?: 'r-header'
    /** 节点标识。 */
    id?: string
    /** 头部内容节点列表。 */
    children?: SparkNode[]
    /** 头部区域附加 class */
    class?: string
    /** 头部区域宽度 */
    width?: string | number}
