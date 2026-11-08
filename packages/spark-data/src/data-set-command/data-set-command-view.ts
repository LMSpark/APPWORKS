/**
 * @module @spark-appworks/spark-data:data-set-command-view
 * 职责：在运行 DataSet 上幂等装配 static 输入和显式语义资源视图，统一只读查询与写命令提交。
 * 边界：不含业务 HTTP；调用方在 executeQuery 内执行远端请求并返回本地行。
 */
import {DataViewLocalQuery} from '../query/data-view-local-query'
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataSet} from '../dataset'
import type {DataTable} from '../data-table'
import {DataViewSaveNotAppliedError, type DataView} from '../data-view'
import type {DataColumn, DataRow, QueryParams} from '../types'

/** 创建时保留字段元数据；重复装配核资源、类型、主键及显式必填/枚举声明。 */
export type DataSetCommandColumnSpec = Readonly<Partial<Omit<DataColumn, 'name' | 'isPrimaryKey'>>
  & {name: string; primary?: boolean}>

export type DataSetCommandScopeGuard = () => void

type QueryResult = Awaited<ReturnType<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>>

/** 返回当次输入的完整资源集合；分页和输出由公共查询链执行，不以已加载业务页冒全集。 */
export type DataSetCommandRowsLoader = (view: DataView, params: Readonly<QueryParams>) => Promise<readonly DataRow[]>

/** 真实资源身份；file仅用于文件，服务命令、查询及应用投影声明自身语义类型，不伪造文件或后端模型。 */
export type DataSetCommandResourceIdentity = Readonly<{resourceType: string; resourceId: string}>

export type BindReadonlyCommandQueryOptions = Readonly<{
  /** 显式探测只允许原绑定视图调用，不可作为选项来源或隐式克隆；普通只读资源省略。 */
  derivedQueries?: 'bound-view-only'
  resource: DataSetCommandResourceIdentity
  guard: DataSetCommandScopeGuard
  /** 每次实际查询派发时捕获输入，返回的校验同时守护结果接纳及后续上下文使用；准备/预检不调用它。 */
  captureQueryInputs?: (view: DataView) => DataSetCommandScopeGuard
  loadRows: DataSetCommandRowsLoader
  queryColumns?: (view: DataView) => readonly DataColumn[]
}>

function columnDefs(columns: readonly DataSetCommandColumnSpec[]) {
  return columns.map(({primary, ...column}) => ({
    ...column,
    type: column.type ?? 'string',
    ...(column.enumOptions ? {enumOptions: column.enumOptions.map(option => ({...option}))} : {}),
    isPrimaryKey: primary === true,
  }))
}

function assertCommandColumns(columns: readonly DataSetCommandColumnSpec[]): void {
  if (new Set(columns.map(column => column.name)).size !== columns.length) {
    throw new Error('DATA_SET_COMMAND_COLUMNS_CONFLICT: 命令字段声明重复')
  }
}

function assertCommandTable(
  table: DataTable,
  columns: readonly DataSetCommandColumnSpec[],
  resource: Readonly<{resourceType: string; resourceId?: string}>,
): void {
  const {resourceType, resourceId} = resource
  if (table.modelBinding || table.resourceType !== resourceType || table.resourceId !== resourceId) {
    throw new Error(`DATA_SET_COMMAND_RESOURCE_CONFLICT: ${table.tableName} 已绑定其他语义资源`)
  }
  for (const expected of columns) {
    const matches = table.columns.filter(column => column.name === expected.name)
    const actual = matches[0]
    if (matches.length !== 1 || actual?.type !== (expected.type ?? 'string')
      || (expected.primary === true) !== (actual.isPrimaryKey === true)
      || (expected.required !== undefined && actual.required !== expected.required)
      || (expected.enumOptions !== undefined && (actual.enumOptions?.length !== expected.enumOptions.length
        || expected.enumOptions.some((option, index) => {
          const candidate = actual.enumOptions?.[index]
          return option.value !== candidate?.value || option.label !== candidate.label
        })))) {
      throw new Error(`DATA_SET_COMMAND_COLUMNS_CONFLICT: ${table.tableName}.${expected.name} 字段或主键不匹配`)
    }
  }
  const primaryNames = new Set(columns.filter(column => column.primary === true).map(column => column.name))
  if (table.columns.some(column => column.isPrimaryKey === true && !primaryNames.has(column.name))) {
    throw new Error(`DATA_SET_COMMAND_COLUMNS_CONFLICT: ${table.tableName} 存在其他主键字段`)
  }
}

/** 幂等创建 static-data 输入表（命令参数行，不参与正式 saveChanges 资源）。 */
export function ensureDataSetStaticInputTable(
  dataSet: DataSet,
  tableName: string,
  columns: readonly DataSetCommandColumnSpec[],
): void {
  if (dataSet.destroyed) throw new Error('DATA_SET_RESOURCE_DESTROYED: 不能向已释放的数据空间注册资源')
  assertCommandColumns(columns)
  const existing = dataSet.getTable(tableName)
  if (existing) {
    assertCommandTable(existing, columns, {resourceType: 'static-data'})
    return
  }
  const table = dataSet.addTable(tableName, columnDefs(columns))
  table.resourceType = 'static-data'
}

export type EnsureDataSetResourceViewInput = Readonly<{
  dataSet: DataSet
  tableName: string
  /** 运行时扩展类型不自动获得正式场景配置或后端协议支持。 */
  resource: DataSetCommandResourceIdentity
  columns: readonly DataSetCommandColumnSpec[]
}>

/** 按显式语义资源身份幂等创建结果表并返回 default DataView；不推断 file 或后端模型。 */
export function ensureDataSetResourceView(input: EnsureDataSetResourceViewInput): DataView {
  if (input.dataSet.destroyed) throw new Error('DATA_SET_RESOURCE_DESTROYED: 不能向已释放的数据空间注册资源')
  const identity: unknown = input.resource
  if (!isRecord(identity) || typeof identity['resourceType'] !== 'string' || typeof identity['resourceId'] !== 'string'
    || !identity['resourceType'].trim() || identity['resourceType'] !== identity['resourceType'].trim()
    || !identity['resourceId'].trim() || identity['resourceId'] !== identity['resourceId'].trim()) {
    throw new Error('DATA_SET_RESOURCE_IDENTITY: 资源类型与身份必须为非空、无首尾空白的字符串')
  }
  const resource = {resourceType: identity['resourceType'], resourceId: identity['resourceId']}
  assertCommandColumns(input.columns)
  const table = input.dataSet.getTable(input.tableName)
  if (table) {
    assertCommandTable(table, input.columns, resource)
    const existing = input.dataSet.getView(input.tableName, 'default')
    if (!existing) throw new Error(`资源视图缺失: ${input.tableName}`)
    if (existing.destroyed) throw new Error('DATA_SET_RESOURCE_VIEW_STALE: 原资源视图已释放')
    return existing
  }
  const created = input.dataSet.addTable(input.tableName, columnDefs(input.columns))
  created.resourceType = resource.resourceType
  created.resourceId = resource.resourceId
  const view = input.dataSet.getView(input.tableName, 'default')
  if (!view) throw new Error(`资源视图缺失: ${input.tableName}`)
  if (view.destroyed) throw new Error('DATA_SET_RESOURCE_VIEW_STALE: 原资源视图已释放')
  return view
}

/** 将已确定的完整本地快照包装为只读结果；实际参数化查询由只读绑定消费请求，不在此入口推断视图参数。 */
export function dataSetCommandQueryResultFromLocalRows(
  view: DataView,
  rows: readonly DataRow[],
  guard: DataSetCommandScopeGuard,
): Promise<QueryResult> {
  return readonlyRowsQueryResult({view, rows, guard, fields: readonlyQueryFields(view.columns), primaryKey: view.primaryKey, params: {page: 1, allPages: true, treeMode: 'flat'}})
}

function readonlyQueryFields(columns: readonly DataColumn[]): ReadonlySet<string> {
  return new Set(columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
}

function readonlyRowsQueryResult(input: Readonly<{view: DataView; rows: readonly DataRow[]; guard: DataSetCommandScopeGuard; fields: ReadonlySet<string>; primaryKey: string; params: QueryParams}>): Promise<QueryResult> {
  const {view, rows, guard, fields, primaryKey, params} = input
  const assertCurrent = () => {
    guard()
    if (view.primaryKey !== primaryKey) throw new Error('DATA_SET_READONLY_QUERY_IDENTITY: 本次查询主键已变化')
  }
  assertCurrent()
  if (primaryKey && !fields.has(primaryKey)) throw new Error('DATA_SET_READONLY_QUERY_FIELDS: 主键不在本次来源字段范围')
  const {rows: outputRows, total, output} = DataViewLocalQuery.select({
    rows: [...rows],
    fields,
    primaryKeys: primaryKey ? [primaryKey] : [],
    params,
  })
  const rowKey = (row: Readonly<DataRow>) => {assertCurrent(); return primaryKey ? row[primaryKey] : undefined}
  const keys = new Set(outputRows.map(rowKey))
  const allowed = (key: unknown, field: string) => key !== undefined && keys.has(key) && output.has(field)
  return Promise.resolve({
    rows: outputRows,
    total,
    rowKey,
    assertIdentity: assertCurrent,
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
  resource: DataSetCommandResourceIdentity & Readonly<{resourceType: 'command'}>
  guard: DataSetCommandScopeGuard
  inputFields: readonly string[]
  createKey: () => string
  /** 生成本地命令键后、接纳行前同步校验/捕获独立只读参数快照；不得异步或返回替代行。异常不接纳命令行。 */
  onPrepareInput?: (row: Readonly<DataRow>) => void
  submit: (row: DataRow) => Promise<DataRow>
  verify: (row: DataRow) => Promise<DataRow | undefined>
  isUnconfirmed?: (error: unknown) => boolean
  /** false时不提供放弃未知捕获的能力；没有按请求核验合同的命令须保留原捕获，不能通过放弃再重发。 */
  allowAbandonUnconfirmed?: boolean
  /** true时refresh继续呈现本实例已确认的只读回执，不再次派发或查询后端。用于分配结果尚待其他资源写回的命令；省略时refresh清空回执。实例释放后不提供持久核验，空视图不代表命令未执行。 */
  retainConfirmedOnRefresh?: boolean
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
      const row={...defaults, ...data, [pk]: typeof key === 'string' && key !== '' ? key : options.createKey()}
      if(options.onPrepareInput){
        const prepare:(input:Readonly<DataRow>)=>unknown=options.onPrepareInput
        const outcome=prepare(Object.freeze(structuredClone(row)))
        if(outcome!==undefined){void Promise.resolve(outcome).catch(()=>undefined);throw new Error('DATA_SET_COMMAND_PREPARE_SYNC: 准备回调须同步完成且不能返回替代行')}
        options.guard()
      }
      return row
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

function assertCommandResource(resource: DataSetCommandResourceIdentity): void {
  if (resource.resourceType !== 'command') throw new Error('DATA_SET_COMMAND_RESOURCE_TYPE: 写命令须显式声明 command 资源')
}

/**
 * 绑定写命令：首次refresh初始化本地结果后addRow录入参数，DataSet.saveChanges一次提交一行并接纳回执。
 * 后续refresh按retainConfirmedOnRefresh保留或清空本实例已确认回执，不派发命令。
 * 已接纳行只读；修改或删除已接纳行不是本命令语义，直接拒绝。
 * 只允许原绑定实例，不支持隐式命名查询或选项读取；正式声明的独立视图须分别绑定。
 * @returns 重复装配时校验本视图仍绑定原查询/保存责任方的同步函数；不刷新、不提交、不替换状态。
 */
export function bindDataSetCommandSubmit(view: DataView, options: BindCommandSubmitOptions): () => void {
  assertCommandResource(options.resource)
  let confirmed: DataRow[] = []
  const pending = new WeakMap<object, DataRow>()
  const received = new WeakMap<object, DataRow>()
  const save = async (command: SaveCommand): Promise<SaveReceipt[]> => {
    options.guard()
    return Promise.all(command.changes.map(async change => {
      const {added = [], changed = [], deleted = []} = change.changes
      if (changed.length > 0 || deleted.length > 0) throw new Error(`DATA_SET_COMMAND_ADD_ONLY: ${view.tableName} 命令只接受新增提交`)
      const submitted = added[0]
      if (added.length !== 1 || submitted === undefined) throw new Error(`DATA_SET_COMMAND_SINGLE_ROW: ${view.tableName} 每次提交一行命令`)
      const original = pending.get(change.context) ?? structuredClone(submitted)
      const key = original[view.primaryKey]
      let accepted: DataRow | undefined
      if (received.has(change.context)) {
        accepted = received.get(change.context)
      } else if (pending.has(change.context)) {
        accepted = await options.verify(structuredClone(original))
        options.guard()
        if (accepted === undefined) {
          pending.delete(change.context)
          throw new DataViewSaveNotAppliedError([change], `DATA_SET_COMMAND_NOT_APPLIED: ${view.tableName} 核验确认命令未生效，可修改后重新提交`)
        }
      } else {
        try {
          accepted = await options.submit(structuredClone(original))
        } catch (error) {
          if (options.isUnconfirmed?.(error) === true) pending.set(change.context, original)
          throw error
        }
      }
      let row: DataRow
      try {
        options.guard()
        const snapshot: unknown = structuredClone(accepted)
        if (!isRecord(snapshot) || !Object.hasOwn(snapshot, view.primaryKey) || snapshot[view.primaryKey] !== key) {
          throw new Error(`DATA_SET_COMMAND_RECEIPT_IDENTITY: ${view.tableName} 回执缺少原命令键或身份不一致`)
        }
        row = snapshot
      } catch (error) {
        pending.set(change.context, original)
        throw error
      }
      pending.set(change.context, original)
      received.set(change.context, row)
      return {metaName: change.identity.metaName, added: [row], changed: [], deleted: [], changedFields: [],
        context: commandSubmitResult(view, [...confirmed, row], options)}
    }))
  }
  const executor: QueryExecutor = {
    derivedQueries: 'bound-view-only',
    localAggregates: false,
    saveIndependently: true,
    executeQuery: target => {
      if (target !== view) throw new Error('DATA_SET_COMMAND_VIEW_IDENTITY: 命令只属于原绑定视图')
      options.guard()
      if(options.retainConfirmedOnRefresh!==true)confirmed = []
      return Promise.resolve(commandSubmitResult(target, confirmed, options))
    },
    save,
    hasUnconfirmedSave: context => pending.has(context),
    acknowledgeSave: context => {
      const row = received.get(context)
      if (row) confirmed = [...confirmed, row]
      received.delete(context)
      pending.delete(context)
      return undefined
    },
    ...(options.allowAbandonUnconfirmed === false ? {} : {abandonUnconfirmedSave: (context: object) => {
      if (!received.has(context)) pending.delete(context)
    }}),
  }
  const resource = {...options.resource}
  const assertBinding = () => view.bindQueryExecutor(executor, {resource})
  assertBinding()
  return assertBinding
}

/** 同一查询责任方的纯预检与正式绑定能力，不公开 executor 或保存入口。 */
export type DataSetReadonlyCommandBinding = Readonly<{
  /** 不查询、不接纳结果、不绑定；检查当前可绑定性。 */
  assertCanBind: () => void
  /** 使用同一 executor 正式绑定，并重新执行当前校验。 */
  bind: () => void
}>

/** 为实际多视图装配准备同一只读查询责任方；调用本函数不查询、不绑定。 */
export function prepareDataSetReadonlyCommandQuery(view: DataView, options: BindReadonlyCommandQueryOptions): DataSetReadonlyCommandBinding {
  const queryColumns = options.queryColumns ?? (target => target.dataTable?.columns ?? [])
  const executor: QueryExecutor = {
    ...(options.derivedQueries ? {derivedQueries: options.derivedQueries} : {}),
    localAggregates: false,
    queryColumns,
    executeQuery: async (target, params) => {
      options.guard()
      const fields = readonlyQueryFields(queryColumns(target)), primaryKey = target.primaryKey
      if (primaryKey && !fields.has(primaryKey)) throw new Error('DATA_SET_READONLY_QUERY_FIELDS: 主键不在本次来源字段范围')
      const captured = DataViewLocalQuery.captureParams({fields, primaryKeys: primaryKey ? [primaryKey] : [], params})
      const assertInputs = options.captureQueryInputs?.(target)
      const assertCurrent = () => {
        options.guard(); assertInputs?.()
        if (target.primaryKey !== primaryKey) throw new Error('DATA_SET_READONLY_QUERY_IDENTITY: 本次查询主键已变化')
      }
      assertCurrent()
      const rows = await options.loadRows(target, captured)
      return readonlyRowsQueryResult({view: target, rows, guard: assertCurrent, fields, primaryKey, params: captured})
    },
  }
  const resource = {...options.resource}
  return {
    assertCanBind: () => view.assertCanBindQueryExecutor(executor, {resource}),
    bind: () => view.bindQueryExecutor(executor, {resource}),
  }
}

/** 绑定只读命令查询：页面通过 DataView.refresh() 触发 loadRows。 */
export function bindDataSetReadonlyCommandQuery(view: DataView, options: BindReadonlyCommandQueryOptions): void {
  prepareDataSetReadonlyCommandQuery(view, options).bind()
}
