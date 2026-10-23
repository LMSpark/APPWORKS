import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogHasDesensitizationRules,
  databaseCatalogHasEncryptionDictionary,
  databaseCatalogHasFieldTypeDictionary,
} from '@/lowcode/resources/database/database-catalog-field-metadata'
import {
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './database-table-view.fixture'

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

describe('LowcodeDatabaseTableView', () => {
  it('loads databases and scopes tables by selected database through query cascade', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tableView = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    expect(dbView?.rows).toHaveLength(1)
    expect(dbView?.columns.map(column => column.name)).toContain('Name')
    expect(tableView?.rows).toHaveLength(0)
    const dbRow = dbView!.rows[0]!
    dbView!.setSelectedRows([dbRow])
    await tableView!.refresh()
    expect(tableView!.rows.map(row => row['tblname']).sort()).toEqual(['LineItems', 'Orders'])
    expect(http.requests.some(request => JSON.stringify(request.data).includes(DATABASE_CATALOG_TABLE_MODEL))).toBe(true)
  })

  it('scopes views when parent database is selected', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    const viewView = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')!
    dbView.setSelectedRows([dbView.rows[0]!])
    await viewView.refresh()
    expect(viewView.rows.map(row => row['vewname'])).toEqual(['OrderView'])
  })

  it('loads field catalog for the selected table', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    const tableView = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    tableView.setSelectedRows([tableView.rows[0]!])
    await fieldView.refresh()
    expect(fieldView.rows.map(row => row['enname'])).toEqual(['Id', 'Name'])
    expect(fieldView.columns.map(column => column.name)).toContain('enname')
    expect(fieldView.columns.map(column => column.name)).toContain('DataTypeName')
    expect(fieldView.columns.map(column => column.name)).toContain('DesenID')
  })

  it('assembles Base_Desensitization_Rule on the same catalog DataSet', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasDesensitizationRules(ds)).toBe(true)
    const rulesView = ds.getView(DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL, 'default')!
    expect(rulesView.rows.map(row => row['name'])).toEqual(['手机号脱敏', '身份证脱敏'])
    expect(rulesView.labelField).toBe('name')
    expect(rulesView.valueField).toBe('rowid')
  })

  it('assembles dictionary option models on the same catalog DataSet', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasEncryptionDictionary(ds)).toBe(true)
    expect(databaseCatalogHasFieldTypeDictionary(ds)).toBe(true)
    const encryptionView = ds.getView(DATABASE_CATALOG_ENCRYPTION_DICT_MODEL, 'default')!
    expect(encryptionView.rows.map(row => row['txt'])).toEqual(['AES'])
    expect(encryptionView.labelField).toBe('txt')
    expect(encryptionView.valueField).toBe('val')
    const typeView = ds.getView(DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL, 'default')!
    expect(typeView.rows.length).toBe(2)
  })
})
