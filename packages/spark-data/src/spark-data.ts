/**
 * @module @spark-appworks/spark-data:spark-data
 * 职责：提供 spark-data 数据管线中的 spark data 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * SparkData facade API - recommended entry point for consumers.
 */

import { DataSet } from './dataset'
import { TreeManager } from './node-tree/tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { DataSetCrudTool } from './dataset-crud-tool'
import {
  commitDataSetSnapshot,
  createLocalStorageHistoryAdapter,
  formatPageDataSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
} from './dataset-history'
import {
  DataMember,
  buildDataViewKey,
  diagnoseDataViewKey,
  diagnoseDataViewMember,
  getDataViewIdentity,
  isDataViewKey,
  parseDataViewKey,
  resolveDataViewCapabilities,
  resolveDataViewKey,
  resolveDataViewMember,
  resolveDataViewMemberBinding,
} from './core/data-view-key'
import { extractColumnRules, isColumnRequired } from './validation/column-validation'
import type {
  CrudApi,
  DataSetMetadata,
  FlatTreeNode,
  TableMetadata,
  TreeConfig,
  ViewMetadata,
} from './types'

function createDataSet(meta: DataSetMetadata): DataSet {
  return DataSet.fromJson(meta)
}

function fromJson(json: DataSetMetadata | Record<string, unknown> | string): DataSet {
  return DataSet.fromJson(json)
}

function createTreeManager(config: TreeConfig, initialNodes?: FlatTreeNode[]): TreeManager {
  return new TreeManager({
    config: { ...config },
    ...(initialNodes === undefined ? {} : { initialNodes }),
  })
}

function createDataTable(meta: TableMetadata): DataTable {
  return DataTable.fromJson(meta)
}

function createDatabaseCrudApi(tableName: string): CrudApi {
  const encodedTableName = encodeURIComponent(tableName)
  const base = `/data/${encodedTableName}`
  return {
    list: { url: `${base}/query`, method: 'POST' },
    create: { url: `${base}/records`, method: 'POST' },
    retrieve: { url: `${base}/records/get`, method: 'POST' },
    update: { url: `${base}/records/update`, method: 'POST' },
    delete: { url: `${base}/records/delete`, method: 'POST' },
    batch: {
      create: { url: `${base}/records/batch-create`, method: 'POST' },
      update: { url: `${base}/records/batch-update`, method: 'POST' },
      delete: { url: `${base}/records/batch-delete`, method: 'POST' },
    },
    children: { url: `${base}/tree/children`, method: 'POST' },
    path: { url: `${base}/tree/path`, method: 'POST' },
    subtree: { url: `${base}/tree/subtree`, method: 'POST' },
    move: { url: `${base}/tree/move`, method: 'POST' },
    search: { url: `${base}/tree/search`, method: 'POST' },
    nested: { url: `${base}/tree/nested`, method: 'POST' },
    nestedSearch: { url: `${base}/tree/nested/search`, method: 'POST' },
  }
}

function createDataView(tableName: string, meta?: ViewMetadata): DataView {
  const view = new DataView(tableName, meta?.viewId)
  view.applyViewConfig({ ...meta, tableName })
  return view
}

function createDataSetCrudTool(dataSetName: string): DataSetCrudTool {
  return new DataSetCrudTool(dataSetName)
}

export const SparkData = {
  createDataSet,
  fromJson,
  createTreeManager,
  createDataTable,
  createDatabaseCrudApi,
  createDataView,
  createDataSetCrudTool,
  listDataSetSnapshots,
  getDataSetSnapshot,
  commitDataSetSnapshot,
  createLocalStorageHistoryAdapter,
  formatPageDataSnapshot,
  DataMember,
  isDataViewKey,
  parseDataViewKey,
  diagnoseDataViewKey,
  resolveDataViewKey,
  buildDataViewKey,
  resolveDataViewMember,
  diagnoseDataViewMember,
  resolveDataViewMemberBinding,
  getDataViewIdentity,
  resolveDataViewCapabilities,
  extractColumnRules,
  isColumnRequired,
}
