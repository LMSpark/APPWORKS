import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  LowcodeDatabaseTableView,
} from '@/platform-adapters/resources/database/catalog/table-view'
import {
  databaseCatalogDesignCanSave,
  databaseCatalogDesignSavePending,
  databaseCatalogFieldSavePending,
  databaseCatalogFieldBeginCreate,
  requireDatabaseCatalogFieldView,
} from '@/platform-adapters/resources/database/catalog/table/field-view-ops'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
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

describe.each([
  {model: DATABASE_CATALOG_TABLE_MODEL, objectId: 'T1', property: 'tbldesc', fieldId: 'F1', fieldViewId: DATABASE_CATALOG_FIELD_TABLE_VIEW},
  {model: DATABASE_CATALOG_VIEW_MODEL, objectId: 'V1', property: 'vewdesc', fieldId: 'F3', fieldViewId: DATABASE_CATALOG_FIELD_VIEW_VIEW},
] as const)('database design save receipts for $model', ({model, objectId, property, fieldId, fieldViewId}) => {
  async function stageDesign() {
    const dataSet = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(dataSet)
    const database = dataSet.getView('_base_dbInfo')!
    database.setSelectedRows([database.rows[0]!])
    const objectView = dataSet.getView(model)!
    await objectView.refresh()
    objectView.setSelectedRows([objectView.rows.find(row => objectView.getPkKey(row) === objectId)!])
    const fieldView = requireDatabaseCatalogFieldView(dataSet, fieldViewId)
    await fieldView.refresh()
    objectView.updateEditingValue(objectId, property, '设计说明')
    fieldView.updateEditingValue(fieldId, 'cnname', '设计字段')
    return {dataSet, objectView, fieldView}
  }
  const writes = () => http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
  const storedHeader = () => http.rows[model]!.find(row => row['rowid'] === objectId)?.[property]
  const storedField = () => http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === fieldId)?.['cnname']

  it.each([false, true])('requires an actual receipt for every staged view (partial=%s)', async partial => {
    const input = await stageDesign()
    const save = input.dataSet.saveChanges.bind(input.dataSet)
    vi.spyOn(input.dataSet, 'saveChanges').mockImplementationOnce(async options => {
      input.objectView.discardPendingChanges([objectId])
      if (!partial) input.fieldView.discardPendingChanges([fieldId])
      return save(options)
    })
    const outcome = await databaseCatalogDesignSavePending(input).catch((cause: unknown) => cause)
    expect(writes()).toHaveLength(partial ? 1 : 0)
    expect(storedHeader()).not.toBe('设计说明')
    if (partial) expect(storedField()).toBe('设计字段')
    else expect(storedField()).not.toBe('设计字段')
    expect(outcome).toMatchObject({
      message: expect.stringContaining(partial ? '部分设计修改已确认' : '本次未提交设计修改'),
    })
  })

  it('keeps a confirmed batch distinct from its directory read failure', async () => {
    const input = await stageDesign()
    const save = input.dataSet.saveChanges.bind(input.dataSet)
    vi.spyOn(input.dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options)
      http.failNextCatalogRead = true
      return result
    })
    const outcome = await databaseCatalogDesignSavePending(input).catch((cause: unknown) => cause)
    expect(writes()).toHaveLength(1)
    expect(storedHeader()).toBe('设计说明')
    expect(storedField()).toBe('设计字段')
    expect(outcome).toMatchObject({message: expect.stringContaining('设计修改已确认，目录回读失败')})
  })

  it('verifies the original multi-view batch and keeps later edits pending', async () => {
    const input = await stageDesign()
    http.copySaveLostAck = true
    await expect(databaseCatalogDesignSavePending(input)).rejects.toThrow()
    expect(writes()).toHaveLength(1)
    expect(storedHeader()).toBe('设计说明')
    expect(storedField()).toBe('设计字段')
    const batchId = input.dataSet.saveJournal.batchId
    expect(batchId).toBeTruthy()
    expect(input.fieldView.hasUnconfirmedSave).toBe(true)
    expect(databaseCatalogDesignCanSave(input.fieldView, input.objectView)).toBe(true)
    input.fieldView.updateEditingValue(fieldId, 'cnname', '后来修改')
    const save = vi.spyOn(input.dataSet, 'saveChanges')
    const outcome = await databaseCatalogDesignSavePending(input).catch((cause: unknown) => cause)
    expect(save).not.toHaveBeenCalled()
    expect(outcome).toBeUndefined()
    expect(input.dataSet.saveJournal.batchId).toBe(batchId)
    expect(input.fieldView.getEditingRow(fieldId)?.['cnname']).toBe('后来修改')
    expect(writes()).toHaveLength(1)
    expect(databaseCatalogDesignCanSave(input.fieldView, input.objectView)).toBe(true)
  })
})

describe('database/catalog/table/field-view-ops', () => {
  it('prepares a field under the selected formal table and cancels without a write', async () => {
    http.allowAddByModel.add(DATABASE_CATALOG_FIELD_MODEL)
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const db = ds.getView('_base_dbInfo')!, tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL)!
    await db.refresh(); db.setSelectedRows([db.rows[0]!]); await tables.refresh()
    const table = tables.rows.find(row => row['tblname'] === 'Orders')!
    tables.setSelectedRows([table])
    const fields = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await fields.refresh()
    const writes = http.requests.filter(request => request.url.includes('BatchTableOperate')).length
    await databaseCatalogFieldBeginCreate({fields, tables})
    const created = fields.currentRow!
    expect(created['tblid']).toBe(tables.getPkKey(table))
    const id = fields.getPkKey(created)!
    expect(fields.dirtyTracking.hasPendingChanges(id)).toBe(true)
    fields.discardPendingChanges([id])
    expect(http.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(writes)
  })

  it('rejects field creation without a selected table', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    await expect(databaseCatalogFieldBeginCreate({fields: requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW),
      tables: ds.getView(DATABASE_CATALOG_TABLE_MODEL)!})).rejects.toThrow('尚未就绪')
  })

  it('requires a fresh field query after switching to another table', async () => {
    http.allowAddByModel.add(DATABASE_CATALOG_FIELD_MODEL)
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const db = ds.getView('_base_dbInfo')!, tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL)!
    const fields = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await db.refresh(); db.setSelectedRows([db.rows[0]!]); await tables.refresh()
    tables.setSelectedRows([tables.rows.find(row => row['tblname'] === 'Orders')!]); await fields.refresh()
    tables.setSelectedRows([tables.rows.find(row => row['tblname'] === 'LineItems')!])
    await expect(databaseCatalogFieldBeginCreate({fields, tables})).rejects.toThrow()
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    await fields.refresh()
    await databaseCatalogFieldBeginCreate({fields, tables})
    expect(fields.currentRow?.['tblid']).toBe('T3')
    expect(http.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  })

  it('commits staged field edits through saveChanges on Base_TblField', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const tableView = ds.getView('_Base_TblList', 'default')!
    await dbView.refresh()
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    const tableRow = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(tableRow).toBeTruthy()
    tableView.setSelectedRows([tableRow!])
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Id')
    expect(fieldRow).toBeTruthy()
    const id = fieldView.getPkKey(fieldRow!)
    expect(id).toBeDefined()
    fieldView.updateEditingValue(id!, 'cnname', '订单编号')
    await databaseCatalogFieldSavePending(ds, fieldView)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F1')
    expect(stored?.['cnname']).toBe('订单编号')
  })

  it('commits staged view output field edits on Base_TblField@viewFields', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const viewView = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')!
    dbView.setSelectedRows([dbView.rows[0]!])
    await viewView.refresh()
    const viewRow = viewView.rows.find(row => row['vewname'] === 'OrderView')!
    viewView.setSelectedRows([viewRow])
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Total')!
    const id = fieldView.getPkKey(fieldRow!)!
    fieldView.updateEditingValue(id, 'cnname', '合计列')
    await databaseCatalogFieldSavePending(ds, fieldView)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F3')
    expect(stored?.['cnname']).toBe('合计列')
  })

  it('commits table header and field edits in one saveChanges', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const tableView = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    const tableRow = tableView.rows.find(row => row['tblname'] === 'Orders')!
    tableView.setSelectedRows([tableRow])
    const tableId = tableView.getPkKey(tableRow)
    tableView.updateEditingValue(tableId!, 'tbldesc', '订单表')
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Name')!
    fieldView.updateEditingValue(fieldView.getPkKey(fieldRow)!, 'cnname', '名称列')
    await databaseCatalogDesignSavePending({dataSet: ds, fieldView, objectView: tableView})
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const storedTable = http.rows[DATABASE_CATALOG_TABLE_MODEL]!.find(row => row['rowid'] === 'T1')
    expect(storedTable?.['tbldesc']).toBe('订单表')
  })
})
