/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/types
 * 职责：集中定义 RendererTree（r-tree）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer tree 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseCrudContainerApi } from '../../support/crud/base-container-api.js'

/** Renderer Tree Api 的语义模型。 */
export type RendererTreeApi = BaseCrudContainerApi & {
  /** 获取当前树组件绑定的全部节点数据。 */
  getTreeData(): DataRow[]
  /** 获取底层 Element Plus 树组件实例。 */
  getNativeTree(): unknown
  /** 获取当前高亮/选中的树节点。 */
  getCurrentNode(): DataRow | null
  /** 按节点 key 设置当前高亮节点。 */
  setCurrentKey(key: string | number): void
  /** 展开树到指定节点。 */
  expandToNode(key: string | number): Promise<void>
  /** 按关键字过滤树节点显示。 */
  filter(keyword: string): void
  /** 获取勾选节点列表，可选仅叶子节点或包含半选节点。 */
  getCheckedNodes(leafOnly?: boolean, includeHalfChecked?: boolean): DataRow[]
  /** 获取当前勾选节点的 key 列表。 */
  getCheckedKeys(): Array<string | number>
  /** 按 key 列表设置勾选状态。 */
  setCheckedKeys(keys: Array<string | number>): void
  /** 移动节点到新的父节点下，可选指定插入位置。 */
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null>
  /** 在指定父节点下追加子节点。 */
  appendNode(parentKey: string | number | null, nodeData: DataRow): void
  /** 在参考节点之前插入同级节点。 */
  insertBefore(refKey: string | number, nodeData: DataRow): void
  /** 在参考节点之后插入同级节点。 */
  insertAfter(refKey: string | number, nodeData: DataRow): void
  /** 按 key 局部更新节点数据，返回是否找到目标节点。 */
  updateNode(key: string | number, patch: Partial<DataRow>): boolean
  /** 按 key 删除节点，返回是否成功移除。 */
  removeNode(key: string | number): boolean
}
