/**
 * @module @spark-appworks/spark-data:core/utils
 * 职责：提供 spark-data 数据管线中的 utils 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * spark-data 内部工具函数
 */

import type { DataRow, CrudApi } from '../types'

/** DataViewKey 分隔符，名称中禁止包含 */
const SEPARATOR = '@'

/**
 * 校验名称中不含 DataViewKey 分隔符 '@'
 * @throws 如果名称含 '@'
 * @internal
 */
export function assertNoSeparator(value: string, label: string): void {
  if (value.includes(SEPARATOR)) {
    throw new Error(`${label} 不允许包含 '${SEPARATOR}' 分隔符: "${value}"`)
  }
}

/**
 * PascalCase / camelCase → kebab-case（tableName → API 路径约定）
 * @internal
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * tableName → 约定 API 基础路径（`/api/${kebab-case}`）
 * @internal
 */
function toApiBasePath(tableName: string): string {
  return `/api/${toKebabCase(tableName)}`
}

/**
 * 从基础路径展开为完整的 CrudApi 对象（CRUD + Tree 端点）。
 *
 * 生成的端点布局（以 `/api/users` 为例）：
 * ```
 * CRUD:
 *   list       GET    /api/users
 *   create     POST   /api/users
 *   retrieve   GET    /api/users/{id}
 *   update     PUT    /api/users/{id}
 *   delete     DELETE /api/users/{id}
 * Tree:
 *   node       GET    /api/users/tree/node
 *   children   GET    /api/users/tree/children
 *   path       GET    /api/users/tree/path
 *   subtree    GET    /api/users/tree/subtree
 *   search     GET    /api/users/tree/search
 *   nested     GET    /api/users/tree/nested
 *   nestedSearch GET  /api/users/tree/nested/search
 * ```
 *
 * @param base  RESTful 基础路径，如 `"/api/users"`
 * @returns 完整的 CrudApi 对象
 * @internal
 */
function expandApiShorthand(base: string): CrudApi {
  const tree = `${base}/tree`
  return {
    // CRUD
    list:     { url: base, method: 'GET' },
    create:   { url: base, method: 'POST' },
    retrieve: { url: `${base}/{id}`, method: 'GET' },
    update:   { url: `${base}/{id}`, method: 'PUT' },
    delete:   { url: `${base}/{id}`, method: 'DELETE' },
    // Tree
    node:         { url: `${tree}/node`, method: 'GET' },
    children:     { url: `${tree}/children`, method: 'GET' },
    path:         { url: `${tree}/path`, method: 'GET' },
    subtree:      { url: `${tree}/subtree`, method: 'GET' },
    search:       { url: `${tree}/search`, method: 'GET' },
    nested:       { url: `${tree}/nested`, method: 'GET' },
    nestedSearch: { url: `${tree}/nested/search`, method: 'GET' },
  }
}

/**
 * 解析 api 配置字段为 CrudApi 对象。
 *
 * 支持三种形式：
 * - **CrudApi 对象** → 原样返回
 * - **字符串** `"/api/users"` → {@link expandApiShorthand} 展开
 * - **`true`** → 从 tableName 按约定生成路径后展开
 *
 * @param api  配置中的 api 字段值
 * @param tableName  表名（仅 `api: true` 时使用）
 * @returns CrudApi 对象，或 undefined（api 为 falsy 时）
 * @internal
 */
export function resolveApi(
  api: CrudApi | string | boolean | undefined,
  tableName: string,
): CrudApi | undefined {
  if (api === undefined || api === false || api === '') return undefined
  if (typeof api === 'object') return api
  return expandApiShorthand(typeof api === 'string' ? api : toApiBasePath(tableName))
}

/**
 * 通过主键或引用比较判断两行是否相同
 * 
 * @param row1 第一行数据
 * @param row2 第二行数据
 * @param idField 主键字段名
 * @returns 是否相同
 */
export function isSameRow(
  row1: DataRow | null, 
  row2: DataRow | null, 
  idField: string
): boolean {
  if (row1 === row2) return true
  if (!row1 || !row2) return false
  
  if (idField in row1 && idField in row2) {
    return row1[idField] === row2[idField]
  }
  return false
}

/**
 * 构建行主键集合（O(n)）
 *
 * @param rows 数据行数组
 * @param getPk 获取主键值的函数
 * @returns 主键值集合
 */
export function buildPkSet(
  rows: DataRow[],
  getPk: (row: DataRow) => string | number | undefined,
): Set<string | number> {
  const set = new Set<string | number>()
  for (const r of rows) {
    const pk = getPk(r)
    if (pk !== undefined) set.add(pk)
  }
  return set
}

/**
 * 从选中状态中移除不在 validPkSet 中的项（纯状态操作，不发射事件）
 *
 * 供 LocalMutationDelegate（静默清理）和 SelectionDelegate（清理+发事件）共用。
 *
 * @returns 哪些状态被清理了
 */
export function pruneInvalidSelections(
  state: { _currentRowId: string | number | null; _selectedRowIds: Array<string | number> },
  validPkSet: ReadonlySet<string | number>,
): { currentRowPruned: boolean; selectedRowsPruned: boolean } {
  let currentRowPruned = false
  let selectedRowsPruned = false

  if (state._currentRowId !== null && !validPkSet.has(state._currentRowId)) {
    state._currentRowId = null
    currentRowPruned = true
  }

  if (state._selectedRowIds.length > 0) {
    const validIds = state._selectedRowIds.filter(id => validPkSet.has(id))
    if (validIds.length !== state._selectedRowIds.length) {
      state._selectedRowIds = validIds
      selectedRowsPruned = true
    }
  }

  return { currentRowPruned, selectedRowsPruned }
}

