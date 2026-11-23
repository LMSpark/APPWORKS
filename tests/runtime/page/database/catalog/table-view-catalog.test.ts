import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import { DataSpaceModelNotFoundError } from '@/platform-adapters/api'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  LowcodeDatabaseTableView,
} from '@/platform-adapters/resources/database/catalog/table-view'
import {DATABASE_SERVER_MODEL} from '@/platform-adapters/resources/database/server/resource'
import {
  databaseCatalogHasDesensitizationRules,
  databaseCatalogHasEncryptionDictionary,
  databaseCatalogHasFieldTypeDictionary,
} from '@/platform-adapters/resources/database/catalog/table/field-metadata'
import {
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
} from '@/platform-adapters/resources/database/catalog/table-view'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  databaseTableViewModels,
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

describe('LowcodeDatabaseTableView', () => {
  it('loads the field type dictionary as a readonly resource when no scene model exists', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      if ([DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL, DATABASE_CATALOG_ENCRYPTION_DICT_MODEL].includes(metaName)) throw new DataSpaceModelNotFoundError(DATABASE_TABLE_VIEW_SCENARIO_ID, metaName)
      return Promise.resolve(databaseTableViewModels[metaName as keyof typeof databaseTableViewModels])
    })
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = ds.getView(DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL)!
    expect(view).toBeTruthy()
    expect(view.rows.map(row => row['txt'])).toEqual(['字符串', '整型'])
    expect(view.dataTable?.modelBinding).toBeUndefined()
    expect(view.addActionState()).not.toBe('enabled')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('"Type":"字典"'))).toBe(true)
  })

  it.each(['network failure', 'masked model', 'duplicate model'])('does not switch field type sources after %s', async reason => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      if (metaName === DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL) throw Error(reason)
      return Promise.resolve(databaseTableViewModels[metaName as keyof typeof databaseTableViewModels])
    })
    await expect(LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)).rejects.toThrow(reason)
    expect(http.requests.some(request => JSON.stringify(request.data).includes('"Type":"字典"'))).toBe(false)
  })

  it('projects the JSON dictionary alias to the service field type without changing its label or source', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      if (metaName === DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL) throw new DataSpaceModelNotFoundError(DATABASE_TABLE_VIEW_SCENARIO_ID, metaName)
      return Promise.resolve(databaseTableViewModels[metaName as keyof typeof databaseTableViewModels])
    })
    http.rows[DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL] = [{rowid: 'JSON-TYPE', txt: 'JSON类型', val: 'JSON类型', ordIdx: 1}]
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(ds.getView(DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL)?.rows[0]).toMatchObject({rowid: 'JSON-TYPE', txt: 'JSON类型', val: 'json类型'})
    expect(http.rows[DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL]![0]?.['val']).toBe('JSON类型')
  })

  it('rejects dictionary aliases that collide after field type projection', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      if (metaName === DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL) throw new DataSpaceModelNotFoundError(DATABASE_TABLE_VIEW_SCENARIO_ID, metaName)
      return Promise.resolve(databaseTableViewModels[metaName as keyof typeof databaseTableViewModels])
    })
    http.rows[DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL] = [
      {rowid: 'JSON-OLD', txt: 'JSON类型', val: 'JSON类型', ordIdx: 1},
      {rowid: 'JSON-NEW', txt: 'json类型', val: 'json类型', ordIdx: 2},
    ]
    await expect(LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)).rejects.toThrow('映射后代码重复')
  })
  it('assembles and loads the four catalog models when the target has no server directory', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      if (metaName === DATABASE_SERVER_MODEL) throw new Error('当前目录空间没有 Base_serverInfo')
      const model = Object.entries(databaseTableViewModels).find(([name]) => name === metaName)?.[1]
      if (!model) throw new Error(`unexpected model ${metaName}`)
      return Promise.resolve(model)
    })

    let dataSet: DataSet | undefined
    let loadError: unknown
    try {
      dataSet = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID, {
        resolvedDataSpaceId: DATABASE_TABLE_VIEW_SCENARIO_ID,
      })
    } catch (error) {
      loadError = error
    }
    expect(loadError).toBeUndefined()
    if (!dataSet) return
    sets.push(dataSet)
    const dbView = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    expect(dbView?.rows.map(row => row['rowid'])).toEqual(['DB1'])
    expect(dataSet.getView(DATABASE_SERVER_MODEL, 'default')).toBeUndefined()
  })

  it('does not narrow the catalog to the first server when databases belong to different servers', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({
      rowid: 'DB2', serverId: 'S2', Name: '分析库', ServerName: '分析服务器', SchemaName: 'dbo', Remark: '',
    })
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    expect(dbView.rows.map(row => row['rowid']).sort()).toEqual(['DB1', 'DB2'])
  })

  it('uses a formal primary-key filter for a requested database instead of scanning the first page', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({
      rowid: 'DB2', serverId: 'S2', Name: '分析库', ServerName: '分析服务器', SchemaName: 'dbo', Remark: '',
    })
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB2'})
    sets.push(ds)
    const dbView = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    expect(dbView.rows.map(row => dbView.getPkKey(row))).toEqual(['DB2'])
    expect(dbView.queryConfig.allPages).toBe(false)
    const request = http.requests.find(item => item.url === '/api/DataOperation/GetData'
      && JSON.stringify(item.data).includes(DATABASE_CATALOG_DB_MODEL))
    expect(request?.data).toMatchObject({PageParam: {index: 1, size: 20}})
    const wire = JSON.stringify(request?.data)
    expect(wire).toContain('DB2')
  })

  it('rejects a same-token application change before accepting an old catalog result', async () => {
    service.readModel.mockImplementation(async ({metaName}: {metaName: string}) => {
      service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'OTHER-APP'}})
      const model = Object.entries(databaseTableViewModels).find(([name]) => name === metaName)?.[1]
      if (!model) throw new Error(`unexpected model ${metaName}`)
      return model
    })
    await expect(LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID))
      .rejects.toThrow('所属应用或登录身份已变化')
    expect(http.requests.filter(request => request.url === '/api/DataOperation/GetData')).toHaveLength(0)
  })

  it('does not query tables, views, or fields until their parent is selected', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const queriedNames = http.requests
      .filter(request => request.url === '/api/DataOperation/GetData')
      .map(request => JSON.stringify(request.data))
    expect(queriedNames.some(body => body.includes(`\"Name\":\"${DATABASE_CATALOG_TABLE_MODEL}\"`))).toBe(false)
    expect(queriedNames.some(body => body.includes(`\"Name\":\"${DATABASE_CATALOG_VIEW_MODEL}\"`))).toBe(false)
    expect(queriedNames.some(body => body.includes(`\"Name\":\"${DATABASE_CATALOG_FIELD_MODEL}\"`))).toBe(false)
  })

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

  it('withdraws previous tables and views when switching databases before the next query', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '分析库', SchemaName: 'dbo'})
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const databases = ds.getView(DATABASE_CATALOG_DB_MODEL)!
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL)!
    const views = ds.getView(DATABASE_CATALOG_VIEW_MODEL)!
    databases.setSelectedRows([databases.rows.find(row => row['rowid'] === 'DB1')!])
    await Promise.all([tables.refresh(), views.refresh()])
    expect(tables.rows).toHaveLength(2)
    expect(views.rows).toHaveLength(1)
    databases.setSelectedRows([databases.rows.find(row => row['rowid'] === 'DB2')!])
    expect(tables.rows).toEqual([])
    expect(views.rows).toEqual([])
    await Promise.all([tables.refresh(), views.refresh()])
    expect(tables.rows.map(row => row['rowid'])).toEqual(['T2'])
    expect(views.rows).toEqual([])
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
