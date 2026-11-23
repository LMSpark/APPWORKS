import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, RequestState} from '@spark-appworks/spark-data'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {LowcodeDatabaseDirectory} from '@/platform-adapters/resources/database/directory'
import {DATABASE_CATALOG_DB_MODEL} from '@/platform-adapters/resources/database/catalog/table-view'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbCancelEdit,
  databaseCatalogQueryUnregisteredDbNames,
  databaseCatalogDbSaveEdit,
  databaseCatalogServerSelectedId,
  requireDatabaseCatalogDbView,
  requireDatabaseCatalogServerView,
} from '@/platform-adapters/resources/database/catalog/db-view-ops'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
  databaseTableViewModels,
} from './table-view.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/platform-adapters/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => ({application: {id: 'APP'}})}, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const sets: DataSet[] = []

beforeEach(() => {
  http = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(http, service)
})

afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.clearAllMocks()})

describe('database/catalog/db-view-ops', () => {
  it('edits only the selected existing database row through its original DataView/DataSet', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const beginEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbBeginEdit
    expect(beginEdit, '现有 _base_dbInfo 行应有 DataView 编辑入口').toBeTypeOf('function')

    const row = dbView.rows[0]!
    dbView.setSelectedRows([row])
    const id = dbView.getPkKey(row)!
    const original = {Name: row['Name'], SchemaName: row['SchemaName'], Remark: row['Remark']}
    const edit = beginEdit!(dbView, row)
    expect(edit).toMatchObject({id, mode: 'edit', row})
    expect(dbView.fieldAccess(row, 'Name').write).toBe('allowed')
    expect(dbView.fieldAccess(row, 'SchemaName').write).toBe('allowed')
    expect(dbView.fieldAccess(row, 'Remark').write).toBe('allowed')

    dbView.updateEditingValue(id, 'Name', '业务库-更新')
    dbView.updateEditingValue(id, 'SchemaName', 'app')
    dbView.updateEditingValue(id, 'Remark', '目录说明')
    await (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbSaveEdit(ds, dbView, edit)

    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{TableName?: string; CrudModel?: {Changed?: Record<string, unknown>[]; Added?: unknown[]; Deleted?: unknown[]}}>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({TableName: DATABASE_CATALOG_DB_MODEL})
    expect(payload[0]?.CrudModel?.Changed).toEqual([expect.objectContaining({
      rowid: id, Name: '业务库-更新', SchemaName: 'app', Remark: '目录说明',
    })])
    expect(payload[0]?.CrudModel?.Added ?? []).toHaveLength(0)
    expect(payload[0]?.CrudModel?.Deleted ?? []).toHaveLength(0)
    expect(original).toEqual({Name: '业务库', SchemaName: 'dbo', Remark: ''})
  })

  it('deletes exactly the requested primary key through the scoped DataView save and verifies it is absent', async () => {
    http.allowDeleteByModel.add(DATABASE_CATALOG_DB_MODEL)
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseCatalogDbView(ds)
    const remove = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbDelete
    expect(remove, '现有 _base_dbInfo 行应有经 DataView 的单行删除入口').toBeTypeOf('function')
    const target = view.rows[0]!
    const id = view.getPkKey(target)!
    const save = vi.spyOn(ds, 'saveChanges')

    await remove!(ds, view, id)

    expect(save).toHaveBeenCalledWith({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{TableName?: string; CrudModel?: {Deleted?: Record<string, unknown>[]}}>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({TableName: DATABASE_CATALOG_DB_MODEL,
      CrudModel: {Deleted: [expect.objectContaining({rowid: id})]}})
    expect(payload[0]?.CrudModel?.Deleted).toHaveLength(1)
    expect(view.rows.some(row => view.getPkKey(row) === id)).toBe(false)
    expect(http.requests.filter(item => item.url === '/api/DataOperation/GetData'
      && JSON.stringify(item.data).includes(DATABASE_CATALOG_DB_MODEL)).length).toBeGreaterThan(1)
  })

  it('rechecks delete permission and target identity and never submits when either is invalid', async () => {
    http.allowDeleteByModel.add(DATABASE_CATALOG_DB_MODEL)
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseCatalogDbView(ds)
    const remove = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbDelete
    expect(remove, '删除入口必须在提交前核对权限和身份').toBeTypeOf('function')
    const row = view.rows[0]!
    const id = view.getPkKey(row)!
    vi.spyOn(view, 'deleteActionState').mockReturnValue('disabled')
    await expect(remove!(ds, view, id)).rejects.toThrow()
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)

    vi.restoreAllMocks()
    const staleId = view.getPkKey(row)!
    view.rows.splice(view.rows.indexOf(row), 1)
    await expect(remove!(ds, view, staleId)).rejects.toThrow()
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('preserves the staged deletion when the save result is unknown and does not retry', async () => {
    http.allowDeleteByModel.add(DATABASE_CATALOG_DB_MODEL)
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseCatalogDbView(ds)
    const remove = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbDelete!
    const id = view.getPkKey(view.rows[0]!)!
    let unconfirmed = false
    let saves = 0
    vi.spyOn(ds, 'saveChanges').mockImplementation(async () => {
      saves++
      if (saves === 1) {
        unconfirmed = true
        Object.defineProperty(view, 'hasUnconfirmedSave', {configurable: true, get: () => unconfirmed})
        throw new Error('transport disconnected')
      }
      unconfirmed = false
      http.rows[DATABASE_CATALOG_DB_MODEL] = http.rows[DATABASE_CATALOG_DB_MODEL]!.filter(row => row['rowid'] !== id)
      view.discardPendingChanges([id])
      return {success: true} as never
    })

    await expect(remove(ds, view, id)).rejects.toThrow(/尚未确认/)
    expect(view.dirtyTracking.pendingDeleteIds.has(id)).toBe(true)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    await remove(ds, view, id)
    expect(saves).toBe(2)
    expect(view.dirtyTracking.pendingDeleteIds.has(id)).toBe(false)
    expect(view.rows.some(row => view.getPkKey(row) === id)).toBe(false)
  })

  it('rejects existing-row edit without an allowed field and when the target/query identity expires, without submitting', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const beginEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbBeginEdit
    expect(beginEdit, '现有 _base_dbInfo 行应有权限和身份守卫的编辑入口').toBeTypeOf('function')

    const row = dbView.rows[0]!
    dbView.setSelectedRows([row])
    const edit = beginEdit!(dbView, row)
    dbView.updateEditingValue(edit.id, 'Name', '不得部分提交')
    dbView.updateEditingValue(edit.id, 'Remark', '越权修改')
    vi.spyOn(dbView, 'fieldAccess').mockImplementation((target, field) => target === row && field === 'Remark'
      ? {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
      : {read: 'visible', write: 'allowed', component: 'editable', required: false, writeMode: 'editable'})
    await expect((await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbSaveEdit(ds, dbView, edit))
      .rejects.toThrow()
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)

    vi.restoreAllMocks()
    const cancelEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbCancelEdit
    cancelEdit(dbView, edit)
    const refreshedRow = dbView.rows.find(item => dbView.getPkKey(item) === edit.id)!
    dbView.setSelectedRows([refreshedRow])
    const stale = beginEdit!(dbView, refreshedRow)
    dbView.rows.splice(dbView.rows.indexOf(refreshedRow), 1)
    await expect((await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbSaveEdit(ds, dbView, stale))
      .rejects.toThrow()
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('allows Name-only edits when SchemaName is denied and submits only the permitted change', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const beginEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbBeginEdit!
    const row = dbView.rows[0]!
    dbView.setSelectedRows([row])
    const edit = beginEdit(dbView, row)
    vi.spyOn(dbView, 'fieldAccess').mockImplementation((_target, field) => field === 'SchemaName'
      ? {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
      : {read: 'visible', write: 'allowed', component: 'editable', required: false, writeMode: 'editable'})
    dbView.updateEditingValue(edit.id, 'Name', '仅改名称')

    await databaseCatalogDbSaveEdit(ds, dbView, edit)

    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{CrudModel?: {Changed?: Record<string, unknown>[]}}>
    expect(payload).toHaveLength(1)
    expect(payload[0]?.CrudModel?.Changed).toEqual([expect.objectContaining({rowid: edit.id, Name: '仅改名称'})])
    expect(payload[0]?.CrudModel?.Changed?.[0]).not.toHaveProperty('SchemaName')
  })

  it('cancels an existing-row edit back to its original values without submitting', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const beginEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbBeginEdit
    expect(beginEdit, '现有 _base_dbInfo 行应支持 DataView 编辑态取消').toBeTypeOf('function')
    const row = dbView.rows[0]!
    dbView.setSelectedRows([row])
    const id = dbView.getPkKey(row)!
    const before = {Name: row['Name'], SchemaName: row['SchemaName'], Remark: row['Remark']}
    const edit = beginEdit!(dbView, row)
    dbView.updateEditingValue(id, 'Name', '取消后不得保留')
    dbView.updateEditingValue(id, 'Remark', '取消说明')
    const cancelEdit = (await import('@/platform-adapters/resources/database/catalog/db-view-ops')).databaseCatalogDbCancelEdit
    expect(cancelEdit(dbView, edit)).toBeUndefined()
    expect(row).toMatchObject(before)
    expect(dbView.hasEditingChanges(id)).toBe(false)
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('requires explicit server selection and saves one database row through its DataView/DataSet', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    expect(serverView.rows.length).toBeGreaterThan(0)
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    const server = serverView.rows[0]!
    serverView.setSelectedRows([server])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'spark_crm')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(http.requests.some(request => request.url === '/api/DataOperation/GetData'
      && JSON.stringify(request.data).includes('ServerName'))).toBe(true)
  })

  it('cancels only the newly added DataView row without submitting it', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    expect(dbView.rows).toContain(edit.row)
    expect(databaseCatalogDbCancelEdit(dbView, edit)).toBeUndefined()
    expect(dbView.rows).not.toContain(edit.row)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('queries unregistered database names through the directory DataSet command view', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const serverId = databaseCatalogServerSelectedId(serverView)
    http.unregisteredByServer[serverId] = ['Staging', 'Archive']
    const names = await databaseCatalogQueryUnregisteredDbNames(ds, serverId, {
      commandInput: 'DatabaseDirectoryCommandInput',
      unregisteredDbNames: 'DatabaseDirectoryUnregisteredDatabaseNames',
    })
    expect(names).toEqual(['Staging', 'Archive'])
    expect(http.requests.some(request => request.url === `/api/Db/getUnregisteredDb/${serverId}`)).toBe(true)
    expect(ds.getTable('DatabaseDirectoryUnregisteredTableNames')).toBeUndefined()
    expect(ds.getTable('DatabaseDirectoryUnregisteredViewNames')).toBeUndefined()
  })

  it('accepts the standard AjaxResult envelope for unregistered database names', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const serverId = databaseCatalogServerSelectedId(serverView)
    http.unregisteredDbBody = {Code: 200, Type: 'success', Message: 'success', Result: ['Staging', 'Archive']}

    const names = await databaseCatalogQueryUnregisteredDbNames(ds, serverId, {
      commandInput: 'DatabaseDirectoryCommandInput',
      unregisteredDbNames: 'DatabaseDirectoryUnregisteredDatabaseNames',
    })

    expect(names).toEqual(['Staging', 'Archive'])
  })

  it('does not invent a database type when the selected server has no readable type', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const server = serverView.rows[0]!
    server['Type'] = ''
    serverView.setSelectedRows([server])
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it.each([
    ['request failed', (view: ReturnType<typeof requireDatabaseCatalogServerView>) => {
      view.requestState = RequestState.Failed
      view.loadingError = new Error('server query failed')
    }],
    ['server name is unreadable', (view: ReturnType<typeof requireDatabaseCatalogServerView>) => {
      vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => field === 'ServerName'
        ? {read: 'masked', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
        : {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'})
    }],
  ])('refuses server context when %s', async (_label, invalidate) => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    invalidate(serverView)
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects a create when the formal query marks Name as a computed read-only field', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
      if (!found) throw new Error(`unexpected model ${metaName}`)
      return Promise.resolve(metaName === DATABASE_CATALOG_DB_MODEL
        ? {...found, fields: found.fields.map(field => field.name === 'Name' ? {...field, computed: true} : field)}
        : found)
    })
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    expect(dbView.addActionState()).toBe('enabled')
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('DATA_VIEW_NEW_ROW_FIELD_DENIED: 当前正式查询不允许新增字段 Name')
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(dbView.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('creates through the formal projected fields when State is owned by the server and not output', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
      if (!found) throw new Error(`unexpected model ${metaName}`)
      return Promise.resolve(metaName === DATABASE_CATALOG_DB_MODEL
        ? {...found, fields: found.fields.map(field => field.name === 'State' ? {...field, output: false} : field)}
        : found)
    })
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'spark_bid')
    dbView.updateEditingValue(edit.id, 'SchemaName', 'spark_bid')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)
    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{CrudModel: {Added: Array<Record<string, unknown>>}}>
    expect(payload[0]?.CrudModel.Added[0]).toMatchObject({Name: 'spark_bid', SchemaName: 'spark_bid', serverId: 'S1'})
    expect(payload[0]?.CrudModel.Added[0]).not.toHaveProperty('State')
    expect(dbView.rows.find(row => row['Name'] === 'spark_bid')?.['SchemaName']).toBe('spark_bid')
  })

  it('blocks cancel and create after an unknown save, then verifies only the original DataView target', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'unknown-save')
    Object.defineProperty(dbView, 'hasUnconfirmedSave', {configurable: true, get: () => true})
    const saveChanges = vi.spyOn(ds, 'saveChanges').mockResolvedValue({success: true} as never)
    vi.spyOn(dbView, 'refresh').mockResolvedValue(undefined)

    expect(() => databaseCatalogDbCancelEdit(dbView, edit)).toThrow('请先核验未确认的保存结果')
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)

    expect(saveChanges).toHaveBeenCalledOnce()
    expect(saveChanges).toHaveBeenCalledWith({views: [{tableName: dbView.tableName, viewId: dbView.viewId, ids: [edit.id]}]})
  })

  it.each([{primaryKey: 'rowid', failRead: false}, {primaryKey: 'Id', failRead: false}, {primaryKey: 'Id', failRead: true}])(
    'reads back the server-assigned database identity without repeating a successful save ($primaryKey, read failure=$failRead)', async ({primaryKey, failRead}) => {
    http.databasePrimaryKey = primaryKey
    http.databaseCreatedId = 'DB-SERVER-ID'
    for (const row of http.rows[DATABASE_CATALOG_DB_MODEL] ?? []) row[primaryKey] = row['rowid']
    const readModel = service.readModel.getMockImplementation()!
    service.readModel.mockImplementation(async (input: {metaName: string}) => {
      const model = await readModel(input)
      return input.metaName === DATABASE_CATALOG_DB_MODEL
        ? {...model, primaryKey, fields: model.fields.map((field: {name: string}) => ({...field, primaryKey: field.name === primaryKey}))}
        : model
    })
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const view = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(view, serverView)
    view.updateEditingValue(edit.id, 'Name', 'spark_bid')
    const save = vi.spyOn(ds, 'saveChanges')
    if (failRead) {
      vi.spyOn(view, 'refresh').mockRejectedValueOnce(new Error('readback disconnected'))
      await expect(databaseCatalogDbSaveEdit(ds, view, edit)).rejects.toThrow('readback disconnected')
    }
    await expect(databaseCatalogDbSaveEdit(ds, view, edit)).resolves.toBeUndefined()
    expect(view.rows.find(row => view.getPkKey(row) === 'DB-SERVER-ID')?.['Name']).toBe('spark_bid')
    expect(save).toHaveBeenCalledOnce()
    expect(http.requests.filter(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect((await save.mock.results[0]?.value)?.data?.viewResults[0]?.createdIdentities)
      .toEqual([{submittedId: edit.id, savedId: 'DB-SERVER-ID'}])
  })

  it.each([false, true])('never repeats a create after losing its receipt (server replaced identity=%s)', async reassigned => {
    if (reassigned) http.databaseCreatedId = 'DB-SERVER-ID'
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const servers = requireDatabaseCatalogServerView(ds), view = requireDatabaseCatalogDbView(ds)
    servers.setSelectedRows([servers.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(view, servers)
    view.updateEditingValue(edit.id, 'Name', 'lost-receipt')
    let dropReceipt = true
    const remove = http.interceptors.response.use({onResponse: response => {
      if (dropReceipt && http.requests.at(-1)?.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        dropReceipt = false
        throw Object.assign(new Error('save response lost after persistence'), {name: 'RequestError', status: 503})
      }
      return response
    }})
    try {
      await expect(databaseCatalogDbSaveEdit(ds, view, edit)).rejects.toThrow()
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(http.rows[DATABASE_CATALOG_DB_MODEL]?.filter(row => row['Name'] === 'lost-receipt')).toHaveLength(1)
      if (reassigned) {
        for (let attempt = 0; attempt < 2; attempt++) {
          await expect(databaseCatalogDbSaveEdit(ds, view, edit)).rejects.toThrow('SPARK_SAVE_UNVERIFIABLE')
          expect(view.hasUnconfirmedSave).toBe(true)
          expect(() => databaseCatalogDbCancelEdit(view, edit)).toThrow('请先核验')
        }
        expect(edit.savedId).toBeUndefined()
      } else {
        await expect(databaseCatalogDbSaveEdit(ds, view, edit)).resolves.toBeUndefined()
        expect(view.hasUnconfirmedSave).toBe(false)
        expect(edit.savedId).toBe(edit.id)
      }
      expect(http.requests.filter(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    } finally {remove()}
  })

  it('reads the confirmed new identity beyond the current list page through a named query without changing the list', async () => {
    http.databaseCreatedId = 'DB-LAST'
    const template = http.rows[DATABASE_CATALOG_DB_MODEL]![0]!
    http.rows[DATABASE_CATALOG_DB_MODEL] = Array.from({length: 25}, (_, i) => ({...template, rowid: `DB-${i}`}))
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const servers = requireDatabaseCatalogServerView(ds), view = requireDatabaseCatalogDbView(ds)
    servers.setSelectedRows([servers.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(view, servers)
    view.updateEditingValue(edit.id, 'Name', 'spark_bid')
    await databaseCatalogDbSaveEdit(ds, view, edit)
    expect(view.rows).toHaveLength(20)
    expect(view.rows.some(row => view.getPkKey(row) === 'DB-LAST')).toBe(false)
    expect(http.rows[DATABASE_CATALOG_DB_MODEL]?.find(row => row['rowid'] === 'DB-LAST')?.['Name']).toBe('spark_bid')
    expect(http.requests.some(item => item.url === '/api/DataOperation/GetData' && JSON.stringify(item.data).includes('DB-LAST'))).toBe(true)
    expect(Object.keys(view.dataTable!.views).filter(id => id.startsWith('databaseSaveReadback_'))).toEqual([])
    expect(http.requests.filter(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it('does not accept a same-name row as the saved identity and only rereads after confirmation', async () => {
    http.databaseCreatedId = 'DB-SERVER-ID'
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const servers = requireDatabaseCatalogServerView(ds), view = requireDatabaseCatalogDbView(ds)
    servers.setSelectedRows([servers.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(view, servers)
    view.updateEditingValue(edit.id, 'Name', 'spark_bid')
    const refresh = view.refresh.bind(view)
    vi.spyOn(view, 'refresh').mockImplementation(async () => {
      http.rows[DATABASE_CATALOG_DB_MODEL] = http.rows[DATABASE_CATALOG_DB_MODEL]!.map(row =>
        row['rowid'] === 'DB-SERVER-ID' ? {...row, rowid: 'OTHER-ID'} : row)
      await refresh()
    })
    await expect(databaseCatalogDbSaveEdit(ds, view, edit)).rejects.toThrow('重新读取目录未见该记录（DB-SERVER-ID）')
    await expect(databaseCatalogDbSaveEdit(ds, view, edit)).rejects.toThrow('重新读取目录未见该记录（DB-SERVER-ID）')
    expect(http.requests.filter(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })
})
