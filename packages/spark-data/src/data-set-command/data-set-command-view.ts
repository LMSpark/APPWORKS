/**
 * @module @spark-appworks/spark-data:data-set-command-view
 * 职责：在运行 DataSet 上幂等装配 static/file 命令表、只读 refresh 查询结果与写命令提交。
 * 边界：不含业务 HTTP；调用方在 executeQuery 内执行远端请求并返回本地行。
 */
import {DataViewLocalQuery} from '../query/data-view-local-query'
import type {DataSet} from '../dataset'
import type {DataView} from '../data-view'
import type {DataColumn, DataRow} from '../types'

export type DataSetCommandColumnSpec = Readonly<{name: string; primary?: boolean}>

export type DataSetCommandScopeGuard = () => void

type QueryResult = Awaited<ReturnType<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>>

export type DataSetCommandRowsLoader = (view: DataView) => Promise<readonly DataRow[]>

export type DataSetCommandResourceIdentity = Readonly<{resourceType: 'file'; resourceId: string}>

export type BindReadonlyCommandQueryOptions = Readonly<{
  resource: DataSetCommandResourceIdentity
  guard: DataSetCommandScopeGuard
  loadRows: DataSetCommandRowsLoader
  queryColumns?: (view: DataView) => readonly DataColumn[]
}>

function columnDefs(columns: readonly DataSetCommandColumnSpec[]) {
  return columns.map(column => ({
    name: column.name,
    type: 'string' as const,
    ...(column.primary ? {isPrimaryKey: true} : {}),
  }))
}

/** 幂等创建 static-data 输入表（命令参数行，不参与正式 saveChanges 资源）。 */
export function ensureDataSetStaticInputTable(
  dataSet: DataSet,
  tableName: string,
  columns: readonly DataSetCommandColumnSpec[],
): void {
  if (dataSet.getTable(tableName)) return
  const table = dataSet.addTable(tableName, columnDefs(columns))
  table.resourceType = 'static-data'
}

export type EnsureDataSetFileCommandViewInput = Readonly<{
  dataSet: DataSet
  tableName: string
  resourceId: string
  columns: readonly DataSetCommandColumnSpec[]
}>

/** 幂等创建 file 资源命令结果表并返回 default DataView。 */
export function ensureDataSetFileCommandView(input: EnsureDataSetFileCommandViewInput): DataView {
  if (input.dataSet.getTable(input.tableName)) {
    const existing = input.dataSet.getView(input.tableName, 'default')
    if (!existing) throw new Error(`命令视图缺失: ${input.tableName}`)
    return existing
  }
  const table = input.dataSet.addTable(input.tableName, columnDefs(input.columns))
  table.resourceType = 'file'
  table.resourceId = input.resourceId
  const view = input.dataSet.getView(input.tableName, 'default')
  if (!view) throw new Error(`命令视图缺失: ${input.tableName}`)
  return view
}

/** 将内存行包装为只读查询结果（供命令 DataView.refresh 消费）。 */
export function dataSetCommandQueryResultFromLocalRows(
  view: DataView,
  rows: readonly DataRow[],
  guard: DataSetCommandScopeGuard,
): Promise<QueryResult> {
  guard()
  const fields = new Set(view.columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
  const {rows: outputRows, total, output} = DataViewLocalQuery.select({
    rows: [...rows],
    fields,
    primaryKeys: view.primaryKey ? [view.primaryKey] : [],
    params: {page: 1, allPages: true, treeMode: 'flat'},
  })
  const rowKey = (row: Readonly<DataRow>) => (view.primaryKey ? row[view.primaryKey] : undefined)
  const keys = new Set(outputRows.map(rowKey))
  const allowed = (key: unknown, field: string) => key !== undefined && keys.has(key) && output.has(field)
  return Promise.resolve({
    rows: outputRows,
    total,
    rowKey,
    assertIdentity: () => guard(),
    fieldAccess: (key, field) => ({
      read: allowed(key, field) ? 'visible' : 'invisible',
      write: 'denied',
      component: allowed(key, field) ? 'readonly' : 'hidden',
      required: false,
      writeMode: 'readonly',
    }),
    readFieldAccess: (row, field) => (outputRows.includes(row) && output.has(field) ? 'visible' : 'invisible'),
    addActionState: () => 'hidden',
    editActionState: () => 'hidden',
    deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden',
    viewActionState: (key, available = true) => (keys.has(key) ? (available ? 'enabled' : 'disabled') : 'hidden'),
  })
}

type QueryExecutor = Parameters<DataView['bindQueryExecutor']>[0]
type SaveCommand = Parameters<NonNullable<QueryExecutor['save']>>[0]
type SaveReceipt = Awaited<ReturnType<NonNullable<QueryExecutor['save']>>>[number]

/**
 * 写命令视图：一行新增即一次后端业务命令（如注册服务器），不是模型插表。
 * inputFields — 可录入的命令参数，其余列只读
 * createKey — 新增行的前端主键，命令须携带它以便结果未知时按主键核验
 * submit — 执行命令并返回后端接纳行；明确失败直接抛错
 * isUnconfirmed — 判定抛错属于结果未知（如网络中断、超时）；缺省全部视为明确失败
 * verify — 结果未知后的下一次保存只调用它核验原提交，返回已生效行或 undefined（确认未生效），不重放 submit
 */
export type BindCommandSubmitOptions = Readonly<{
  resource: DataSetCommandResourceIdentity
  guard: DataSetCommandScopeGuard
  inputFields: readonly string[]
  createKey: () => string
  submit: (row: DataRow) => Promise<DataRow>
  verify: (row: DataRow) => Promise<DataRow | undefined>
  isUnconfirmed?: (error: unknown) => boolean
}>

function commandSubmitResult(view: DataView, confirmed: readonly DataRow[], options: BindCommandSubmitOptions): QueryResult {
  const pk = view.primaryKey
  if (!pk) throw new Error(`DATA_SET_COMMAND_KEY: ${view.tableName} 命令视图须声明主键`)
  const rowKey = (row: Readonly<DataRow>) => row[pk]
  const keys = new Set(confirmed.map(rowKey))
  const columns = new Set(view.columns.map(column => column.name))
  return {
    rows: confirmed,
    total: confirmed.length,
    rowKey,
    assertIdentity: () => options.guard(),
    prepareNewRow: data => {
      options.guard()
      const defaults = Object.fromEntries(options.inputFields.filter(field => columns.has(field)).map(field => [field, '']))
      const key = data[pk]
      return {...defaults, ...data, [pk]: typeof key === 'string' && key !== '' ? key : options.createKey()}
    },
    isFieldReadOnly: field => !options.inputFields.includes(field),
    fieldAccess: (key, field) => {
      const visible = keys.has(key) && columns.has(field)
      return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden',
        required: false, writeMode: 'readonly'}
    },
    readFieldAccess: (row, field) => (confirmed.includes(row) && columns.has(field) ? 'visible' : 'invisible'),
    addActionState: (available = true) => (available ? 'enabled' : 'disabled'),
    editActionState: (key, available = true) => (keys.has(key) ? 'hidden' : available ? 'enabled' : 'disabled'),
    deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden',
    viewActionState: (key, available = true) => (keys.has(key) ? (available ? 'enabled' : 'disabled') : 'hidden'),
  }
}

/**
 * 绑定写命令：refresh 得到空结果后 addRow 录入参数，DataSet.saveChanges 一次提交一行并接纳回执。
 * 已接纳行只读；修改或删除已接纳行不是本命令语义，直接拒绝。
 */
export function bindDataSetCommandSubmit(view: DataView, options: BindCommandSubmitOptions): void {
  let confirmed: DataRow[] = []
  const pending = new WeakMap<object, DataRow>()
  const save = async (command: SaveCommand): Promise<SaveReceipt[]> => {
    options.guard()
    return Promise.all(command.changes.map(async change => {
      const {added = [], changed = [], deleted = []} = change.changes
      if (changed.length > 0 || deleted.length > 0) throw new Error(`DATA_SET_COMMAND_ADD_ONLY: ${view.tableName} 命令只接受新增提交`)
      const submitted = added[0]
      if (added.length !== 1 || submitted === undefined) throw new Error(`DATA_SET_COMMAND_SINGLE_ROW: ${view.tableName} 每次提交一行命令`)
      const key = submitted[view.primaryKey]
      let accepted: DataRow | undefined
      if (pending.has(change.context)) {
        accepted = await options.verify(pending.get(change.context) ?? submitted)
        pending.delete(change.context)
        if (accepted === undefined) throw new Error(`DATA_SET_COMMAND_NOT_APPLIED: ${view.tableName} 核验确认命令未生效，可修改后重新提交`)
      } else {
        try {
          accepted = await options.submit(submitted)
        } catch (error) {
          if (options.isUnconfirmed?.(error) === true) pending.set(change.context, submitted)
          throw error
        }
      }
      const row: DataRow = {...accepted, [view.primaryKey]: accepted[view.primaryKey] ?? key}
      confirmed = [...confirmed, row]
      return {metaName: change.identity.metaName, added: [row], changed: [], deleted: [], changedFields: [],
        context: commandSubmitResult(view, confirmed, options)}
    }))
  }
  view.bindQueryExecutor({
    localAggregates: false,
    executeQuery: target => {
      options.guard()
      confirmed = []
      return Promise.resolve(commandSubmitResult(target, confirmed, options))
    },
    save,
    hasUnconfirmedSave: context => pending.has(context),
    abandonUnconfirmedSave: context => { pending.delete(context) },
  }, {resource: options.resource})
}

/** 绑定只读命令查询：页面通过 DataView.refresh() 触发 loadRows。 */
export function bindDataSetReadonlyCommandQuery(view: DataView, options: BindReadonlyCommandQueryOptions): void {
  const queryColumns = options.queryColumns ?? (target => target.dataTable?.columns ?? [])
  view.bindQueryExecutor({
    localAggregates: false,
    queryColumns,
    executeQuery: async (target, _params) => {
      options.guard()
      const rows = await options.loadRows(target)
      return dataSetCommandQueryResultFromLocalRows(target, rows, options.guard)
    },
  }, {resource: options.resource})
}
