/**
 * @module @spark-appworks/spark-component:components/containers/support/crud/base-container-api
 * 职责：提供 base container api 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 容器组件公共 API 基类
 *
 * Table / Form / Detail / List 四大容器共享的 CRUD + 当前行方法签名。
 * Tree 的 CRUD 表面差异较大（appendNode / removeNode 等），不参与该基类。
 */
import type { CrudResult, DataView, DataRow } from '@spark-appworks/spark-data'

/**
 * 数据容器 CRUD API（统一最小公约数）。
 *
 * 该接口用于抽取 Table/Form/Detail/List/Tree 的共有 CRUD 能力。
 */
export type BaseCrudContainerApi = {
  /** 获取容器绑定的 DataView 数据源。 */
  getDataSource(): DataView | null
  /** 新增一行并提交到远端，返回新行或 CRUD 结果。 */
  addRow(row: Partial<DataRow>): Promise<DataRow | CrudResult<DataRow> | null>
  /** 按主键 id 更新行并提交到远端。 */
  editRowById(id: string | number, patch: Partial<DataRow>): Promise<boolean | CrudResult<DataRow>>
  /** 按主键 id 删除行并提交到远端。 */
  removeRow(id: string | number): Promise<boolean | CrudResult<boolean>>
}

/**
 * 表单/表格类容器 API（CRUD + 当前行 + 本地行操作）。
 */
export type BaseContainerApi = BaseCrudContainerApi & {
  /** 获取当前选中/聚焦的行。 */
  getCurrentRow(): DataRow | null
  /** 刷新容器绑定的 DataView 数据。 */
  refresh(): Promise<void>
  /** 在本地 DataView 追加一行（不立即提交远端）。 */
  appendRow(row: DataRow): void
  /** 按主键 id 在本地更新行数据（不立即提交远端）。 */
  updateRowById(id: string | number, patch: Partial<DataRow>): boolean
  /** 按主键 id 在本地删除行（不立即提交远端）。 */
  deleteRowById(id: string | number): boolean
  /** 设置当前选中/聚焦的行。 */
  setCurrentRow(row: DataRow | null): void
  /** 按主键 id 设置当前行，返回是否找到目标行。 */
  setCurrentRowById(id: string | number | null): boolean
}

/**
 * 可见性容器 API（Dialog/Drawer 等）。
 */
export type VisibilityContainerApi = {
  /** 打开容器（显示面板）。 */
  open(): void
  /** 关闭容器（隐藏面板）。 */
  close(): void
  /** 查询容器当前是否可见。 */
  isVisible(): boolean
  /** 切换容器可见状态。 */
  toggle(): void
}
