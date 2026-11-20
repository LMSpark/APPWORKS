/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererEditor.types
 * 职责：集中定义 RendererEditor（r-editor）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/zone-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer editor 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { SparkNodeProps } from '../../shared-types'
import type { ToolbarPosition } from '../runtime/container-ui'
import type { SparkNode } from '@spark-appworks/spark-data'

/**
 * `RendererEditor` 运行时公开属性。
 */
export type REditorProps = SparkNodeProps & {
  /** 组件类型固定为 `r-editor`。 */
    type?: 'r-editor'
    /** 节点标识。 */
    id?: string
    /** 编辑区内容节点列表。 */
    children?: SparkNode[]
    /** 编辑区停靠位置 */
    position?: ToolbarPosition
    /** 编辑区宽度 */
    width?: string | number
    /** 编辑区附加 class */
    class?: string}
