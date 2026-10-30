import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/catalog/table-view'
import {
  databaseCatalogDbSelectedId,
  databaseCatalogQueryUnregisteredTableNames,
  databaseCatalogTableBeginCreate,
  databaseCatalogTableSaveEdit,
  requireDatabaseCatalogDbViewForTable,
  requireDatabaseCatalogTableView,
} from '@/lowcode/resources/database/catalog/table/view-ops'
import {
  databaseCatalogQueryUnregisteredViewNames,
  databaseCatalogSyncTableMetadata,
} from '@/lowcode/resources/database/catalog/table/sync-view-ops'
import {requireDatabaseTableRegisterView} from '@/lowcode/resources/database/catalog/table/register-view-ops'
import {
  databaseCatalogRegisterTables,
  databaseCatalogRegisterViews,
  databaseCatalogVerifyTableRegistration,
  databaseCatalogVerifyViewRegistration,
  databaseCatalogBeginRegistrationBatch,
  databaseCatalogDiscardPendingRegistration,
} from '@/lowcode/resources/database/catalog/table/register-view-ops'
import {
  databaseCatalogCanDeleteRow,
  databaseCatalogDeleteRow,
} from '@/lowcode/resources/database/catalog/object-view-ops'
import {databaseCatalogCopyTable} from '@/lowcode/resources/database/catalog/table/copy-view-ops'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_VIEW_REGISTER_TABLE,
} from '@/lowcode/resources/database/catalog/table-view'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './table-view.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const sets: DataSet[] = []

beforeEach(() => {
  http = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(http, service)
})

afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.clearAllMocks()})

describe('database/catalog/table/view-ops', () => {
  it('registers a table row through saveChanges on _Base_TblList', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    expect(dbView.rows.length).toBeGreaterThan(0)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const edit = await databaseCatalogTableBeginCreate(tableView, dbView)
    tableView.updateEditingValue(edit.id, 'tblname', 'Invoices')
    await databaseCatalogTableSaveEdit(ds, tableView, edit)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('loads unregistered view names through command DataView', async () => {
    http.unregisteredViewsByDb = {DB1: ['RawView']}
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    const names = await databaseCatalogQueryUnregisteredViewNames(ds, dbId)
    expect(names).toEqual(['RawView'])
    expect(http.requests.some(request => request.url === `/api/View/getUnregisteredView/${dbId}`)).toBe(true)
  })

  it('registers physical tables through registerTable write command', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    await databaseCatalogRegisterTables(ds, dbId, [{
      tableName: 'StagingOrders',
      tableComment: 'staging',
      addDefaultFields: false,
    }])
    expect(http.requests.some(request => request.url === `/api/Table/registerTable/${dbId}`)).toBe(true)
    const tableView = requireDatabaseCatalogTableView(ds)
    expect(tableView.rows.some(row => row['tblname'] === 'StagingOrders')).toBe(true)
  })

  it('completes true default-field registration only after the exact per-item receipt and readback', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    await expect(databaseCatalogRegisterTables(ds, 'DB1', [{tableName: 'DefaultFieldsConfirmed', tableComment: '', addDefaultFields: true}])).resolves.toBeUndefined()
    const request = http.requests.find(item => item.url === '/api/Table/registerTable/DB1')
    expect((request?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields).toBe(1)
    expect(requireDatabaseTableRegisterView(ds).hasUnconfirmedSave).toBe(false)
    expect(http.rows[DATABASE_CATALOG_TABLE_MODEL]!.filter(row => row['dbid'] === 'DB1' && row['tblname'] === 'DefaultFieldsConfirmed')).toHaveLength(1)
  })

  it('settles the original command-input option after success without leaving the host dirty', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const input = ds.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')!
    const inputRow = input.rows[0]!
    const inputId = input.getPkKey(inputRow)
    if (typeof inputId !== 'string') throw new Error('命令输入行身份无效')
    input.updateEditingValue(inputId, 'addDefaultFields', '0')
    expect(input.hasEditingChanges()).toBe(true)

    await databaseCatalogRegisterTables(ds, 'DB1', [{tableName: 'OptionSettled', tableComment: '', addDefaultFields: false}])

    expect(input.rows[0]?.['addDefaultFields']).toBe('0')
    expect(input.hasEditingChanges()).toBe(false)
    expect(input.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('does not clear unknown when the registered object is outside the current directory page', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    for (let index = 0; index < 20; index += 1) {
      http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({rowid: `T-PAGE-${index}`, dbid: dbId, tblname: `Page${String(index).padStart(2, '0')}`, schemaName: 'dbo'})
    }
    http.applyThenFailRegisterTableNames.add('LateRegistered')
    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'LateRegistered', tableComment: '', addDefaultFields: false}])).rejects.toThrow()

    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(true)
    const postCount = http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`).length
    const verified = await ds.saveChanges({views: [{tableName: commandView.tableName, viewId: commandView.viewId}]})
    expect(verified.success).toBe(true)
    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`).length).toBe(postCount)
  })

  it('can retry a failed verification on the original command capture without posting again', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.applyThenFailRegisterTableNames.add('VerifyRetry')
    http.failCatalogReadAfterRegisterNames.add('VerifyRetry')
    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'VerifyRetry', tableComment: '', addDefaultFields: false}])).rejects.toThrow()

    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(true)
    const postCount = http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`).length
    await expect(ds.saveChanges({views: [{tableName: commandView.tableName, viewId: commandView.viewId}]})).rejects.toThrow()
    const result = await ds.saveChanges({views: [{tableName: commandView.tableName, viewId: commandView.viewId}]})
    expect(result.success).toBe(true)
    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`).length).toBe(postCount)
  })

  it('keeps an unknown capture when exact directory readback is ambiguous', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({rowid: 'T-AMBIGUOUS', dbid: dbId, tblname: 'AmbiguousName', schemaName: 'dbo'})
    http.applyThenFailRegisterTableNames.add('AmbiguousName')

    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'AmbiguousName', tableComment: '', addDefaultFields: false}])).rejects.toThrow()
    expect(requireDatabaseTableRegisterView(ds).hasUnconfirmedSave).toBe(true)
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`)).toHaveLength(1)
  })

  it('does not call default-field registration complete from directory readback alone', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.applyThenFailRegisterTableNames.add('DefaultFieldsUnknown')
    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'DefaultFieldsUnknown', tableComment: '', addDefaultFields: true}])).rejects.toThrow()

    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(true)
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`)).toHaveLength(1)
    expect(http.rows[DATABASE_CATALOG_TABLE_MODEL]!.some(row => row['dbid'] === dbId && row['tblname'] === 'DefaultFieldsUnknown')).toBe(true)
    expect(http.rows[DATABASE_CATALOG_FIELD_MODEL]!.some(row => row['tblname'] === 'DefaultFieldsUnknown')).toBe(false)
    await expect(databaseCatalogVerifyTableRegistration(ds)).rejects.toThrow('默认字段补齐尚无正式完成回执')
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`)).toHaveLength(1)
  })

  it('keeps an unknown registration captured for DB A when the default catalog selection changes to DB B', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbIdA = databaseCatalogDbSelectedId(dbView)
    http.rows['_base_dbInfo']!.push({rowid: 'DB2', Id: 'DB2', serverId: 'S1', Name: '另一库', ServerName: '主库', SchemaName: 'dbo'})
    http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({rowid: 'T-B2', dbid: 'DB2', tblname: 'BOnly', schemaName: 'dbo'})
    http.applyThenFailRegisterTableNames.add('CapturedInA')
    await expect(databaseCatalogRegisterTables(ds, dbIdA, [{tableName: 'CapturedInA', tableComment: '', addDefaultFields: false}])).rejects.toThrow()
    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(true)
    await dbView.refresh()
    dbView.setSelectedRows([dbView.rows.find(row => row['Id'] === 'DB2')!])

    const readsBeforeVerification = http.requests.length
    const verified = await ds.saveChanges({views: [{tableName: commandView.tableName, viewId: commandView.viewId}]})
    expect(verified.success).toBe(true)
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbIdA}`).length).toBe(1)
    expect(commandView.hasUnconfirmedSave).toBe(false)
    const verifyRead = http.requests.slice(readsBeforeVerification).filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)).at(-1)
    const verifyFilter = JSON.stringify((verifyRead?.data as {Table: Array<{Filter?: unknown}>}).Table[0]?.Filter)
    expect(verifyFilter).toContain('DB1')
    expect(verifyFilter).not.toContain('DB2')
  })

  it('treats already-registered true as a definite default-field rejection even when exact readback fails', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({rowid: 'T-ALREADY-DEFAULT', dbid: 'DB1', tblname: 'AlreadyDefaultFields', schemaName: 'dbo'})
    http.registerTableResult = {AlreadyDefaultFields: '表已注册'}
    http.failNextVerifyRead = true
    const batch = [{tableName: 'AlreadyDefaultFields', tableComment: '', addDefaultFields: true}]

    await expect(databaseCatalogRegisterTables(ds, 'DB1', batch)).rejects.toThrow('服务明确返回表已注册，本次默认字段补齐未执行')

    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)

    const pending = commandView.rows.find(row => row['tableName'] === 'AlreadyDefaultFields')!
    const pendingId = commandView.getPkKey(pending)
    if (typeof pendingId !== 'string') throw new Error('未完成命令身份无效')
    expect(commandView.getEditingRow(pendingId)?.['registrationDisposition']).toBe('cancel-required')
    await expect(databaseCatalogRegisterTables(ds, 'DB1', batch)).rejects.toThrow('已明确未执行')
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)

    await databaseCatalogDiscardPendingRegistration(ds, 'table')
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(commandView.rows.some(row => row['tableName'] === 'AlreadyDefaultFields')).toBe(false)
    await databaseCatalogBeginRegistrationBatch(ds)
    const input = ds.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')
    if (!input || !input.rows[0]) throw new Error('命令输入视图缺失')
    const inputId = input.getPkKey(input.rows[0])
    if (typeof inputId !== 'string') throw new Error('命令输入行身份无效')
    input.updateEditingValue(inputId, 'addDefaultFields', '0')
    await expect(databaseCatalogRegisterTables(ds, 'DB1', [{...batch[0]!, addDefaultFields: false}])).resolves.toBeUndefined()
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(2)
    expect((http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')[1]?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields).toBe(0)
  })

  it('does not complete a registration when Code 200 contains an item failure', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.registerTableResult = {success: false, message: '该项未登记'}

    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'BusinessFailure', tableComment: '', addDefaultFields: false}])).rejects.toThrow()
    expect(ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!.rows.some(row => row['tblname'] === 'BusinessFailure')).toBe(false)
  })

  it('keeps a Code 500 write outcome unknown and never blind-reposts it', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.failRegisterTableNames.add('Code500Unknown')
    const batch = [{tableName: 'Code500Unknown', tableComment: '', addDefaultFields: false}]
    await expect(databaseCatalogRegisterTables(ds, 'DB1', batch)).rejects.toThrow('注册项被拒绝')
    expect(requireDatabaseTableRegisterView(ds).hasUnconfirmedSave).toBe(true)
    await expect(databaseCatalogRegisterTables(ds, 'DB1', batch)).rejects.toThrow('先核验')
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)
  })

  it('recovers an acknowledged default-field registration after its exact readback failed', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.failNextVerifyRead = true
    const batch = [{tableName: 'DefaultFieldsAcked', tableComment: '', addDefaultFields: true}]
    await expect(databaseCatalogRegisterTables(ds, 'DB1', batch)).rejects.toThrow()
    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(true)
    const posts = http.requests.filter(request => request.url === '/api/Table/registerTable/DB1').length

    await databaseCatalogVerifyTableRegistration(ds)

    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(posts)
  })

  it('does not accept a precise row when its server count is omitted or identity fields are unreadable', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.applyThenFailRegisterTableNames.add('NoCountReadback')
    http.omitCountByModel.add(DATABASE_CATALOG_TABLE_MODEL)
    await expect(databaseCatalogRegisterTables(ds, 'DB1', [{tableName: 'NoCountReadback', tableComment: '', addDefaultFields: false}])).rejects.toThrow()
    expect(requireDatabaseTableRegisterView(ds).hasUnconfirmedSave).toBe(true)
    await expect(databaseCatalogVerifyTableRegistration(ds)).rejects.toThrow('后端总数')
    http.omitCountByModel.delete(DATABASE_CATALOG_TABLE_MODEL)

    const ds2 = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds2)
    http.hiddenFieldsByModel[DATABASE_CATALOG_TABLE_MODEL] = ['dbid']
    http.applyThenFailRegisterTableNames.add('UnreadableIdentity')
    await expect(databaseCatalogRegisterTables(ds2, 'DB1', [{tableName: 'UnreadableIdentity', tableComment: '', addDefaultFields: false}])).rejects.toThrow()
    expect(requireDatabaseTableRegisterView(ds2).hasUnconfirmedSave).toBe(true)
    await expect(databaseCatalogVerifyTableRegistration(ds2)).rejects.toThrow()
  })

  it('does not POST an already completed prefix again after a later batch item fails', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.definitelyRejectRegisterTableNames.add('RejectedLater')
    const batch = [
      {tableName: 'CompletedFirst', tableComment: '', addDefaultFields: false},
      {tableName: 'RejectedLater', tableComment: '', addDefaultFields: false},
    ] as const

    await expect(databaseCatalogRegisterTables(ds, dbId, batch)).rejects.toThrow()
    await expect(databaseCatalogRegisterTables(ds, dbId, batch)).rejects.toThrow()
    http.definitelyRejectRegisterTableNames.delete('RejectedLater')
    http.registerTableResult = undefined
    await expect(databaseCatalogRegisterTables(ds, dbId, batch)).resolves.toBeUndefined()
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}` && (request.data as Array<{table_name: string}>)[0]?.table_name === 'CompletedFirst')).toHaveLength(1)
    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(commandView.rows.filter(row => row['tableName'] === 'CompletedFirst')).toHaveLength(1)
    expect(commandView.rows.filter(row => row['tableName'] === 'RejectedLater')).toHaveLength(1)

    http.registerTableResult = {CompletedFirst: '表已注册'}
    await expect(databaseCatalogRegisterTables(ds, dbId, [{tableName: 'CompletedFirst', tableComment: '', addDefaultFields: false}])).resolves.toBeUndefined()
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}` && (request.data as Array<{table_name: string}>)[0]?.table_name === 'CompletedFirst')).toHaveLength(2)
  })

  it('rejects a changed selection while a definite-failure batch remains pending', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.registerTableResult = {PendingSignature: '表不存在'}
    const original = [{tableName: 'PendingSignature', tableComment: '', addDefaultFields: false}]
    await expect(databaseCatalogRegisterTables(ds, 'DB1', original)).rejects.toThrow('表不存在')
    const commandView = requireDatabaseTableRegisterView(ds)
    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(true)

    await expect(databaseCatalogRegisterTables(ds, 'DB1', [
      {tableName: 'AnotherSelection', tableComment: '', addDefaultFields: false},
    ])).rejects.toThrow('已有未完成注册批次')
    await expect(databaseCatalogRegisterTables(ds, 'DB1', [
      {tableName: 'PendingSignature', tableComment: '', addDefaultFields: true},
    ])).rejects.toThrow('已有未完成注册批次')
    expect(commandView.rows).toHaveLength(1)
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)
  })

  it('does not repost an acknowledged item when the final directory refresh fails', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    http.failNextDirectoryRead = true
    const batch = [{tableName: 'RefreshFailureAfterSuccess', tableComment: '', addDefaultFields: false}]

    await expect(databaseCatalogRegisterTables(ds, dbId, batch)).rejects.toThrow()
    await expect(databaseCatalogRegisterTables(ds, dbId, batch)).resolves.toBeUndefined()
    expect(http.requests.filter(request => request.url === `/api/Table/registerTable/${dbId}`)).toHaveLength(1)
  })

  it('registers physical views through registerView write command', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    await databaseCatalogRegisterViews(ds, dbId, [{viewName: 'SalesView', viewComment: ''}])
    expect(http.requests.some(request => request.url === `/api/View/registerView/${dbId}`)).toBe(true)
    const viewCatalog = ds.getView('_Base_ViewList', 'default')!
    expect(viewCatalog.rows.some(row => row['vewname'] === 'SalesView')).toBe(true)
  })

  it('keeps explicit view rejection retryable through the original command row', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.registerViewResult = {RetryableView: '视图不存在'}
    const batch = [{viewName: 'RetryableView', viewComment: ''}]

    await expect(databaseCatalogRegisterViews(ds, 'DB1', batch)).rejects.toThrow('视图不存在')
    const commandView = ds.getView(DATABASE_VIEW_REGISTER_TABLE, 'default')!
    const pending = commandView.rows.find(row => row['viewName'] === 'RetryableView')!
    const pendingId = commandView.getPkKey(pending)
    if (typeof pendingId !== 'string') throw new Error('未完成命令身份无效')
    expect(commandView.getEditingRow(pendingId)?.['registrationDisposition']).toBe('retryable')
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(true)

    http.registerViewResult = undefined
    await expect(databaseCatalogRegisterViews(ds, 'DB1', batch)).resolves.toBeUndefined()
    expect(http.requests.filter(request => request.url === '/api/View/registerView/DB1')).toHaveLength(2)
    expect(commandView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(commandView.rows.filter(row => row['viewName'] === 'RetryableView')).toHaveLength(1)
  })

  it('explicitly verifies an unknown view on its exact named view without reposting', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    http.applyThenFailRegisterViewNames.add('UnknownView')
    const dbId = 'DB1'
    await expect(databaseCatalogRegisterViews(ds, dbId, [{viewName: 'UnknownView', viewComment: ''}])).rejects.toThrow()
    const commandView = ds.getView(DATABASE_VIEW_REGISTER_TABLE, 'default')!
    expect(commandView.hasUnconfirmedSave).toBe(true)
    const posts = http.requests.filter(request => request.url === `/api/View/registerView/${dbId}`).length

    await databaseCatalogVerifyViewRegistration(ds)

    expect(commandView.hasUnconfirmedSave).toBe(false)
    expect(http.requests.filter(request => request.url === `/api/View/registerView/${dbId}`)).toHaveLength(posts)
    const verifyRequest = http.requests.filter(request => request.url === '/api/DataOperation/GetData')
      .find(request => (request.data as {Table?: Array<{Name?: string; Filter?: unknown}>}).Table?.some(table => table.Name === DATABASE_CATALOG_VIEW_MODEL
        && JSON.stringify(table.Filter).includes('UnknownView')))
    expect(verifyRequest).toBeTruthy()
    const defaultView = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')!
    expect(defaultView.filterExpression).toBeUndefined()
  })

  it('syncs table metadata through write command and refreshes fields', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    tableView.setSelectedRows([tableView.rows[0]!])
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    await fieldView.refresh()
    if (fieldView.loadingError) throw fieldView.loadingError
    const dbId = databaseCatalogDbSelectedId(dbView)
    const tableId = tableView.getSelectedValues()[0] as string
    await databaseCatalogSyncTableMetadata({dataSet: ds, dbId, tableId, fieldView})
    expect(http.requests.some(request => request.url === `/api/Table/SyncMetaData/${dbId}/${tableId}`)).toBe(true)
    expect(fieldView.rows.some(row => row['enname'] === 'SyncedCol')).toBe(true)
  })

  it('copies a table with fields through one saveChanges', async () => {
    http.allowAddByModel.add(DATABASE_CATALOG_FIELD_MODEL)
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const source = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(source).toBeTruthy()
    const sourceId = tableView.getPkKey(source!) as string
    const dbId = databaseCatalogDbSelectedId(dbView)
    const newId = await databaseCatalogCopyTable(ds, {
      sourceTableId: sourceId,
      dbId,
      newTableName: 'OrdersCopy',
      newTableDesc: '复制订单',
    })
    expect(newId.length).toBeGreaterThan(0)
    const created = tableView.rows.find(row => tableView.getPkKey(row) === newId)
    expect(created).toBeTruthy()
    tableView.setSelectedRows([created!])
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    await fieldView.refresh()
    if (fieldView.loadingError) throw fieldView.loadingError
    expect(fieldView.rows.filter(row => row['tblid'] === newId).length).toBeGreaterThan(0)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('refuses a copy before staging the table when the formal field DataView denies new rows', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const source = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(source).toBeTruthy()
    const sourceId = tableView.getPkKey(source!) as string
    const dbId = databaseCatalogDbSelectedId(dbView)
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!

    await expect(databaseCatalogCopyTable(ds, {
      sourceTableId: sourceId, dbId, newTableName: 'DeniedCopy', newTableDesc: '权限拒绝',
    })).rejects.toThrow('当前正式查询不允许新增字段 tblid')

    expect([...tableView.dirtyTracking.pendingCreateIds]).toEqual([])
    expect([...fieldView.dirtyTracking.pendingCreateIds]).toEqual([])
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('deletes a table row through saveChanges on _Base_TblList', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const target = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(target).toBeTruthy()
    const id = tableView.getPkKey(target!)
    expect(typeof id).toBe('string')
    expect(databaseCatalogCanDeleteRow(tableView, id as string)).toBe(true)
    await databaseCatalogDeleteRow(ds, tableView, id as string)
    expect(tableView.rows.some(row => row['tblname'] === 'Orders')).toBe(false)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('loads unregistered table names through command DataView', async () => {
    http.unregisteredByDb = {DB1: ['RawA', 'RawB']}
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    const names = await databaseCatalogQueryUnregisteredTableNames(ds, dbId)
    expect(names).toEqual(['RawA', 'RawB'])
    expect(http.requests.some(request => request.url === `/api/Db/getUnregisteredTable/${dbId}`)).toBe(true)
  })

  it('preserves the service diagnostic from HTTP 200 Code 500 while loading unregistered tables', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    http.unregisteredTableBody = {Code: 500, Message: "Unknown database 'sync_test'", Result: null}
    const dbId = databaseCatalogDbSelectedId(dbView)

    await expect(databaseCatalogQueryUnregisteredTableNames(ds, dbId)).rejects.toThrow("Unknown database 'sync_test'")
  })
})
