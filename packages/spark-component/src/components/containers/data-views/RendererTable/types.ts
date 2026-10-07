/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/types
 * 职责：集中定义 RendererTable（r-table）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer table 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { CrudResult, DataRow, NestedTreeNode, NestedTreeSearchResult, SortDirection } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/crud/base-container-api.js'

/** Element Plus el-table 排序回调 order；投影为 spark-data SortDirection，勿与 wire OrderType 混用。 */
export type ElementPlusTableSortOrder = 'ascending' | 'descending'

export function toSortDirection(order: ElementPlusTableSortOrder): SortDirection {
  return order === 'ascending' ? 'asc' : 'desc'
}

/** Renderer Tree Path 的语义模型。 */
export type RendererTreePath = {
    /** path Ids 字段。 */
pathIds: Array<string | number>
    /** path Nodes 字段。 */
pathNodes?: DataRow[]}

/** Renderer Table Api 的语义模型。 */
export type RendererTableApi = BaseContainerApi & {
  /** 获取当前表格绑定的全部行数据。 */
  getRows(): DataRow[]
  /** 获取当前多选选中的行集合。 */
  getSelectedRows(): DataRow[]
  /** 重新加载表格数据（触发 DataView 刷新）。 */
  query(): Promise<void>
  /** 加载嵌套树形数据的根层或指定根节点子树。 */
  loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]> | null>
  /** 懒加载指定父节点的直接子节点。 */
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<DataRow[]>
  /** 加载从根到指定节点的完整路径。 */
  loadTreePath(id: string | number): Promise<RendererTreePath | null>
  /** 展开树到指定节点并设为当前行。 */
  expandToNode(key: string | number): Promise<void>
  /** 移动树节点到新的父节点下，可选指定插入位置。 */
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null>
  /** 在嵌套树中按关键字搜索节点。 */
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]>
  /** 设置多选选中行（写入 DataView selection）。 */
  setSelectedRows(rows: DataRow[]): void
  /** 按主键 id 列表设置多选选中行，返回成功匹配数量。 */
  setSelectedRowsById(ids: Array<string | number>): number
  /** 清空 DataView 层的多选状态。 */
  clearSelectedRows(): void
  /** 清空 Element Plus 表格 UI 层的多选高亮。 */
  clearUiSelection(): void
  /** 切换指定行在 UI 层的选中状态。 */
  toggleUiRowSelection(row: DataRow, selected?: boolean): void
  /** 重新计算表格列宽与布局。 */
  doLayout(): void
  /** 获取底层 Element Plus 表格组件实例。 */
  getNativeTable(): unknown
}
