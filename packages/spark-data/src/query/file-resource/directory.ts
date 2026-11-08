/**
 * @module @spark-appworks/spark-data:file-resource-directory
 * 职责：核定目录目标、来源字段及完整basename集合，由公共只读查询工厂处理查询与权限。
 * 边界：固定目录上下文不可通过查询参数改写；每次请求保留自己的来源与scope，不提供保存入口。
 * AI用途：目录和派生/选项视图沿同一DataView读取，失败不以过滤后的空集合冒完整目录。
 */
import type {DataView} from '../../data-view'
import type {DataColumn, DataViewFieldProjection, QueryParams} from '../../types'
import {prepareDataSetReadonlyCommandQuery} from '../../data-set-command/data-set-command-view'
import type {BindFileDirectoryQueryAdapterOptions, FileResourceTarget} from '../file-resource-adapter'

const bindings = new WeakMap<DataView, (options: BindFileDirectoryQueryAdapterOptions) => void>()

function targetIdentity(target: FileResourceTarget): string {return JSON.stringify([target.key, target.fields])}

function directoryNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('FILE_DIRECTORY_NAMES: 目录结果不是完整名称数组')
  const names: string[] = [], seen = new Set<string>()
  for (const name of value) {
    if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || /[\\/\u0000]/.test(name) || seen.has(name)) {
      throw new Error('FILE_DIRECTORY_NAMES: 目录名称非法或重复')
    }
    seen.add(name); names.push(name)
  }
  return names
}

/** Binds a complete directory snapshot through the common readonly query owner; fixed queryContext keys identify this directory. */
export function bindFileDirectoryQueryAdapter(view: DataView, options: BindFileDirectoryQueryAdapterOptions): void {
  const existing = bindings.get(view)
  if (existing) {existing(options); return}
  const table = view.dataTable, dataSet = table?.dataSet
  let currentOptions = options
  const resourceId = options.resourceId
  const guard = () => {
    if (!table || !dataSet || dataSet.destroyed || dataSet.getTable(table.tableName) !== table) {
      throw new Error('FILE_DIRECTORY_VIEW_STALE: 原目录DataTable已释放或解绑')
    }
    if (!resourceId.trim() || table.modelBinding !== undefined || table.resourceType !== 'file' || table.resourceId !== resourceId) {
      throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录资源身份不匹配')
    }
  }
  const assertProjection = (current: DataView, projection: readonly DataViewFieldProjection[]) => {
    const required = new Set([current.primaryKey, 'fileName'])
    if (projection.some(field => required.has(field.viewField) && (field.source !== 'resource' || field.resourceField !== field.viewField || field.type !== 'string'))) {
      throw new Error('FILE_DIRECTORY_COLUMNS: 目录投影字段必须来自同名原始字符串字段')
    }
  }
  const columns = (current: DataView): readonly DataColumn[] => {
    guard()
    if (current.destroyed || current.dataTable !== table || table?.getView(current.viewId) !== current) {
      throw new Error('FILE_DIRECTORY_VIEW_STALE: 实际目录DataView已释放或解绑')
    }
    const primary = table.columns.filter(column => column.isPrimaryKey === true)
    const required = new Set([current.primaryKey, 'fileName'])
    if (primary.length !== 1 || primary[0]?.name !== current.primaryKey || current.primaryKey === '_pk') {
      throw new Error('FILE_DIRECTORY_COLUMNS: 目录必须声明唯一原始字符串主键')
    }
    const result: DataColumn[] = []
    for (const name of required) {
      const source = table.columns.filter(column => column.name === name)
      if (source.length !== 1 || source.some(column => column.type !== 'string' || column.isComputed === true || column.computeExpression !== undefined)) {
        throw new Error('FILE_DIRECTORY_COLUMNS: 主键和fileName必须是正式原始字符串字段')
      }
      const column = source[0]
      if (column) result.push(column)
    }
    assertProjection(current, current.fieldProjection)
    return result
  }
  columns(view)
  const fixedContext = structuredClone(view.queryContext)
  const assertContext = (context: Readonly<Record<string, unknown>>, complete = false) => {
    for (const [key, value] of Object.entries(fixedContext)) {
      if (complete && !Object.hasOwn(context, key) || Object.hasOwn(context, key) && JSON.stringify(context[key]) !== JSON.stringify(value)) {
        throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 本次目录固定上下文不可改写')
      }
    }
  }
  const boundTarget = targetIdentity(structuredClone(options.target(view)))
  const captureTarget = (source: BindFileDirectoryQueryAdapterOptions, current: DataView): FileResourceTarget => {
    columns(current); assertContext(current.queryContext, true)
    const target = structuredClone(source.target(current))
    columns(current); assertContext(current.queryContext, true)
    if (targetIdentity(target) !== boundTarget) throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图目标不可改绑')
    return target
  }
  type Capture = Readonly<{source: BindFileDirectoryQueryAdapterOptions; target: FileResourceTarget}>
  const captures = new WeakMap<Readonly<QueryParams>, Capture>()
  const prepared = prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'file', resourceId}, guard,
    queryColumns: columns,
    captureQueryInputs: (current, params) => {
      const source = currentOptions
      assertProjection(current, params.projection ?? [])
      const target = captureTarget(source, current)
      assertContext(params.context ?? {})
      captures.set(params, {source, target})
      return () => {
        source.assertCurrent?.()
        captureTarget(source, current)
      }
    },
    loadRows: async (current, params) => {
      const captured = captures.get(params)
      if (!captured) throw new Error('FILE_DIRECTORY_QUERY_CAPTURE: 缺少本次目录输入')
      const primaryKey = current.primaryKey
      const names = directoryNames(await captured.source.list(captured.target))
      return names.map(fileName => ({[primaryKey]: fileName, fileName}))
    },
  })
  prepared.assertCanBind(); options.assertCurrent?.(); captureTarget(options, view)
  prepared.bind()
  view.queryConfig = {...view.queryConfig, pagination: view.queryConfig.pagination ?? 'none'}
  bindings.set(view, next => {
    prepared.assertCanBind(); columns(view)
    if (next.resourceId !== resourceId) throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图已绑定另一资源')
    const source = next
    captureTarget(source, view); source.assertCurrent?.(); captureTarget(source, view)
    currentOptions = source
  })
}
