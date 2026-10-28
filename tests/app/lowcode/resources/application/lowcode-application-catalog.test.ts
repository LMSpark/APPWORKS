import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {DataSet} from '@spark-appworks/spark-data'
import {Request, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {getFormalModelView, loadLowcodeApplicationCatalog} from '@/lowcode/lowcode-application-catalog'

const priorSession = lowcodeApi.session.get()
const priorApplication = lowcodeApi.application.get()
const CATALOG_SCENARIO_ID = '7AB874097A1E8711A42FD845939A6E05'
const fields = ['rowid', 'AppDesc', 'AppName', 'Memo', 'EntId', 'EntShortName', 'IsSys'].map((name, order) => ({
  id: name, modelId: '7AB874097A1E8711A42FD845939A6E05p001', name, canonicalName: name, type: 'string', description: name,
  primaryKey: name === 'rowid', output: true, computed: false, order, orderType: '', raw: {},
}))
const formalModel = {
  id: '7AB874097A1E8711A42FD845939A6E05p001', name: 'Base_AppSystemList', metaName: 'Base_AppSystemList', sourceType: '数据库表',
  sourceId: 'DB', sourceName: 'Base_AppSystemList', primaryKey: 'rowid', businessMain: false, fields, raw: {},
} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

type TransportSpy = {mock: {calls: Array<[RequestConfig]>}; mockClear: () => unknown}
type QueryWire = Readonly<{
  Table?: readonly Readonly<{Fields?: readonly Readonly<{Name?: string}>[]; Filter?: unknown}>[]
  PageParam?: Readonly<{index?: number; size?: number}>
}>
let transport: TransportSpy
let queryRows: Array<Record<string, unknown>>
let hiddenFields: string[]
let maskedFields: string[]
let requiredFields: string[]
let queryFailure: Error | undefined
let onQueryRequest: (() => void) | undefined
let queryCountOverride: number | undefined
let queryCountSequence: readonly number[] | undefined
let omitQueryCount = false
let queryRequestOrdinal: number

function saveNavigationRootSession(): void {
  lowcodeApi.session.save({accessToken: 'root-test-access', refreshToken: 'root-test-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
    enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
  })
}

function makeNavigationModel(names: readonly string[] = ['rowid', 'SysId', 'prowid']) {
  const rootFields = names.map((name, order) => ({id: name, modelId: '7AB874097A1E8711A42FD845939A6E05p000', name,
    canonicalName: name, type: 'string', description: name, primaryKey: name === 'rowid', output: true,
    computed: false, order, orderType: '', raw: {}}))
  return {id: '7AB874097A1E8711A42FD845939A6E05p000', name: 'Base_NavigationInfo', metaName: 'Base_NavigationInfo',
    sourceType: '数据库表', sourceId: 'DB', sourceName: 'Base_NavigationInfo', primaryKey: 'rowid',
    businessMain: true, fields: rootFields, raw: {}} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
}

function mockNavigationMetadata(
  model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>> = makeNavigationModel(),
  spaceId = CATALOG_SCENARIO_ID,
): void {
  vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({dataSpaceId: spaceId, name: '功能管理'})
  vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([model])
  vi.spyOn(DataSpaceDesignApi.prototype, 'readRelations').mockResolvedValue([])
}

function formalQueryRequests(): Array<{config: RequestConfig; body: QueryWire}> {
  return transport.mock.calls.flatMap(([config]) => config.url === '/api/DataOperation/GetData'
    ? [{config, body: config.data as QueryWire}] : [])
}

async function requireNavigationRootReader(): Promise<(systemId: string, assertCurrent: () => void) => Promise<string>> {
  const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
    readLowcodeNavigationRootId?: (systemId: string, assertCurrent: () => void) => Promise<string>
  }
  expect(typeof catalog.readLowcodeNavigationRootId).toBe('function')
  if (!catalog.readLowcodeNavigationRootId) throw new Error('readLowcodeNavigationRootId export missing')
  return catalog.readLowcodeNavigationRootId
}

beforeEach(() => {
  vi.spyOn(DataSpaceDesignApi.prototype, 'readRelations').mockResolvedValue([])
  lowcodeApi.application.clear()
  queryRows = [{rowid: 'APP-1', AppDesc: 'Alpha', AppName: 'alpha'}]
  hiddenFields = []
  maskedFields = []
  requiredFields = []
  queryFailure = undefined
  onQueryRequest = undefined
  queryCountOverride = undefined
  queryCountSequence = undefined
  omitQueryCount = false
  queryRequestOrdinal = 0
  transport = vi.spyOn(Request.prototype as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}, 'executeRequest')
    .mockImplementation(async config => {
    if (config.url === '/api/DataOperation/GetData') {
      onQueryRequest?.()
      if (queryFailure !== undefined) throw queryFailure
      const ordinal = queryRequestOrdinal++
      const body = config.data as {PageParam?: {index?: number; size?: number}} | undefined
      const pageIndex = Number(body?.PageParam?.index ?? 1)
      const pageSize = Number(body?.PageParam?.size ?? Math.max(queryRows.length, 1))
      const pageRows = queryRows.slice((pageIndex - 1) * pageSize, pageIndex * pageSize)
      const count = queryCountSequence?.[ordinal] ?? queryCountOverride ?? queryRows.length
      const resultData = {Items: pageRows.map(row => ({...row,
        lingma_sys_key: 'ROW-KEY', lingma_sys_params: {r: requiredFields, e: requiredFields, h: hiddenFields, m: maskedFields, d: false}})),
        ...(omitQueryCount ? {} : {Count: count})}
      return {
        data: {Code: 200, Result: {primaryKeyField: 'rowid', data: resultData, allowAdd: false, lingma_sys_key: 'TABLE-KEY'}},
        status: 200, statusText: 'OK', headers: {},
      }
    }
    return {
      data: {Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: queryRows, Count: queryRows.length}, allowAdd: false, lingma_sys_key: 'TABLE-KEY'}},
    status: 200, statusText: 'OK', headers: {},
    }
    })
})

afterEach(() => {
  vi.restoreAllMocks()
  lowcodeApi.session.clear()
  if (priorSession) lowcodeApi.session.save(priorSession)
  lowcodeApi.application.clear()
  if (priorApplication) lowcodeApi.application.save(priorApplication)
})

describe('authenticated application catalog DataView', () => {
  it('resolves formal model names through a unique internal table alias', () => {
    const dataSet = DataSet.fromJson({scenarioId: CATALOG_SCENARIO_ID, tables: {
      appDirectoryAlias: {modelBinding: {modelId: formalModel.id, modelName: 'Base_AppSystemList'},
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}, catalogApps: {}}},
    }})
    try {
      expect(getFormalModelView(dataSet, 'Base_AppSystemList', 'catalogApps').tableName).toBe('appDirectoryAlias')
    } finally {dataSet.destroy()}
  })

  it('rejects duplicate formal model-name bindings instead of choosing a table key', () => {
    const dataSet = DataSet.fromJson({scenarioId: CATALOG_SCENARIO_ID, tables: {
      firstAlias: {modelBinding: {modelId: formalModel.id, modelName: 'Base_AppSystemList'},
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}, catalogApps: {}}},
      secondAlias: {modelBinding: {modelId: formalModel.id, modelName: 'Base_AppSystemList'},
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}, catalogApps: {}}},
    }})
    try {
      expect(() => getFormalModelView(dataSet, 'Base_AppSystemList', 'catalogApps')).toThrow('正式模型名称绑定不唯一')
    } finally {dataSet.destroy()}
  })

  it('projects every visible application through one formal DataView and releases the owner', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [
      {rowid: 'APP-1', AppDesc: '财务管理', AppName: 'finance', Memo: '财务模块'},
      {rowid: 'APP-2', AppDesc: '采购管理', AppName: 'procurement', Memo: ''},
    ]
    const readerModel = formalModel
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([readerModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    const applications = await catalog.readLowcodeApplications(() => undefined)

    expect(applications).toEqual([
      {id: 'APP-1', name: '财务管理', code: 'finance', description: '财务模块'},
      {id: 'APP-2', name: '采购管理', code: 'procurement', description: ''},
    ])
    expect(formalQueryRequests()).toHaveLength(1)
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('projects readable enterprise metadata and explicit system defaults from the canonical columns', async () => {
    saveNavigationRootSession()
    queryRows = [{rowid: 'APP-1', AppDesc: '财务管理', AppName: 'finance', Memo: '财务系统说明',
      EntId: 'ENT-1', EntShortName: 'enterprise-one', IsSys: 1}]
    const readerModel = formalModel
    mockNavigationMetadata(readerModel)
    const catalog = await import('@/lowcode/lowcode-application-catalog')

    await expect(catalog.readLowcodeApplications(() => undefined)).resolves.toEqual([{
      id: 'APP-1', name: '财务管理', code: 'finance', description: '财务系统说明',
      enterpriseId: 'ENT-1', enterpriseShortName: 'enterprise-one', isDefault: true,
    }])
  })

  it('omits application description when Memo is unavailable or unreadable', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [{rowid: 'APP-1', AppDesc: '财务管理', AppName: 'finance'}]
    hiddenFields = ['Memo']
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    await expect(catalog.readLowcodeApplications(() => undefined)).resolves.toEqual([
      {id: 'APP-1', name: '财务管理', code: 'finance'},
    ])
  })

  it.each(['hidden', 'masked'] as const)('omits Memo when its DataView field is %s', async (permissionState) => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [{rowid: 'APP-1', AppDesc: '财务管理', AppName: 'finance', Memo: '不可见描述'}]
    if (permissionState === 'hidden') hiddenFields = ['Memo']
    else maskedFields = ['Memo']
    const readerModel = formalModel
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([readerModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    await expect(catalog.readLowcodeApplications(() => undefined)).resolves.toEqual([
      {id: 'APP-1', name: '财务管理', code: 'finance'},
    ])
  })

  it('uses formal AppDesc, then AppName, then rowid for the application name without inferring metadata', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [
      {rowid: 'APP-1', AppDesc: '', AppName: 'finance'},
      {rowid: 'APP-2'},
    ]
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    await expect(catalog.readLowcodeApplications(() => undefined)).resolves.toEqual([
      {id: 'APP-1', name: 'finance', code: 'finance'},
      {id: 'APP-2', name: 'APP-2'},
    ])
  })

  it('releases the formal DataView owner when full application catalog query fails', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryFailure = new Error('catalog query failed')
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    await expect(catalog.readLowcodeApplications(() => undefined)).rejects.toThrow('catalog query failed')

    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it.each(['query-success', 'query-failure'] as const)(
    'releases the list reader DataSet when the authenticated session changes during %s', async (queryOutcome) => {
      lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
        accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
        identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
        enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
      })
      if (queryOutcome === 'query-failure') queryFailure = new Error('late query failure')
      onQueryRequest = () => {
        const session = lowcodeApi.session.get()
        if (session) lowcodeApi.session.save({...session, identity: {...session.identity}})
      }
      vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
        dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
      })
      vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
      const destroy = vi.spyOn(DataSet.prototype, 'destroy')
      const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
        readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
      }
      expect(typeof catalog.readLowcodeApplications).toBe('function')
      if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

      await expect(catalog.readLowcodeApplications(() => undefined)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')

      expect(destroy).toHaveBeenCalledTimes(2)
    },
  )

  it('reads an exact application id through the shared formal DataView and destroys its DataSet', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    const readSpace = vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    const readModel = vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    const application = await catalog.readLowcodeApplicationById('APP-1', () => undefined)

    expect(application).toEqual({id: 'APP-1', name: 'Alpha', code: 'alpha'})
    expect(application).not.toHaveProperty('isDefault')
    expect(readSpace).toHaveBeenCalledOnce()
    expect(readModel).toHaveBeenCalledOnce()
    expect(transport.mock.calls.some(([config]) => config.url === '/api/DataOperation/GetData')).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects duplicate identities from the formal query response and destroys its DataSet', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [
      {rowid: 'APP-1', AppDesc: 'Alpha', AppName: 'alpha'},
      {rowid: 'APP-1', AppDesc: 'Duplicate', AppName: 'duplicate'},
    ]
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', () => undefined)).rejects.toThrow(/identity|身份|duplicate|重复|主键|权限|无权|inaccessible|不存在/i)

    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects an application whose id is not readable in the DataView result', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    hiddenFields = ['rowid']
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', () => undefined)).rejects.toThrow(/identity|身份|inaccessible|not exist|不存在|无权/i)
  })

  it('omits unreadable application name metadata and falls back to the readable rowid', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    hiddenFields = ['AppName', 'AppDesc']
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string; code?: string; description?: string}>
    }

    const application = await catalog.readLowcodeApplicationById('APP-1', () => undefined)

    expect(application).toEqual({id: 'APP-1', name: 'APP-1'})
    expect(application).not.toHaveProperty('code')
    expect(application).not.toHaveProperty('description')
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects an id that is absent from the DataView result', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [{rowid: 'APP-2', AppDesc: 'Beta', AppName: 'beta'}]
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', () => undefined)).rejects.toThrow(/inaccessible|not exist|不存在|无权/i)
  })

  it('stops after metadata becomes stale before the DataView query', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    let current = true
    const assertCurrent = (): void => {if (!current) throw new Error('LOWCODE_APPLICATION_SELECTION_STALE')}
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockImplementation(async () => {
      current = false
      return [formalModel]
    })
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', assertCurrent)).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    expect(transport.mock.calls.some(([config]) => config.url === '/api/DataOperation/GetData')).toBe(false)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('rejects a result that became stale during the DataView query and releases its DataSet', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    let current = true
    const assertCurrent = (): void => {if (!current) throw new Error('LOWCODE_APPLICATION_SELECTION_STALE')}
    onQueryRequest = () => {current = false}
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', assertCurrent)).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('releases the DataSet and preserves query failure from the DataView reader', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryFailure = new Error('catalog query failed')
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplicationById: (id: string, assertCurrent: () => void) => Promise<{id: string; name: string}>
    }
    expect(typeof catalog.readLowcodeApplicationById).toBe('function')

    await expect(catalog.readLowcodeApplicationById('APP-1', () => undefined)).rejects.toThrow('catalog query failed')

    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing rowid', [{AppDesc: 'Alpha', AppName: 'alpha'}], []],
    ['non-string rowid', [{rowid: 17, AppDesc: 'Alpha', AppName: 'alpha'}], []],
    ['empty rowid', [{rowid: '   ', AppDesc: 'Alpha', AppName: 'alpha'}], []],
    ['unreadable rowid', [{rowid: 'APP-1', AppDesc: 'Alpha', AppName: 'alpha'}], ['rowid']],
    ['duplicate rowid', [
      {rowid: 'APP-1', AppDesc: 'Alpha', AppName: 'alpha'},
      {rowid: 'APP-1', AppDesc: 'Duplicate', AppName: 'duplicate'},
    ], []],
  ] as const)('rejects the complete catalog when it contains an invalid identity: %s', async (_caseName, rows, hidden) => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    queryRows = [...rows] as Array<Record<string, unknown>>
    hiddenFields = [...hidden]
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeApplications?: (assertCurrent: () => void) => Promise<Array<Record<string, unknown>>>
    }
    expect(typeof catalog.readLowcodeApplications).toBe('function')
    if (!catalog.readLowcodeApplications) throw new Error('readLowcodeApplications export missing')

    await expect(catalog.readLowcodeApplications(() => undefined)).rejects.toThrow(/identity|身份|主键|应用/)

    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('loads the fixed formal space/model and queries through the shared session-only SPARK DataView', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    lowcodeApi.application.clear()
    const readSpace = vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    const readModel = vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([formalModel])

    const dataSet = await loadLowcodeApplicationCatalog()
    try {
      const view = dataSet.getView('Base_AppSystemList', 'catalogApps')
      expect(view).toBeDefined()
      expect(readSpace).toHaveBeenCalledWith(expect.objectContaining({
        designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: CATALOG_SCENARIO_ID,
      }))
      expect(readModel).toHaveBeenCalledWith(expect.objectContaining({
        designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: CATALOG_SCENARIO_ID, metaNames: ['Base_AppSystemList'],
      }))
      expect(view?.queryConfig).toMatchObject({allPages: true, distinct: true})
      expect(view?.sortExpression).toEqual([{field: 'rowid', direction: 'asc'}])
      const result = await view?.requestRefresh()
      expect(result?.success).toBe(true)
      expect(view?.rows[0]?.['AppDesc']).toBe('Alpha')
      const request = transport.mock.calls.map(call => call[0]).find(config => config.url === '/api/DataOperation/GetData')
      expect(request).toBeDefined()
      expect(request?.headers?.['x-FormKey']).toBe(CATALOG_SCENARIO_ID)
      expect(request?.headers?.['X-AppId']).toBeUndefined()
      expect(request?.headers?.['tenant-id']).toBeUndefined()
      expect(request?.headers?.['Authorization']).toBe('Bearer catalog-test-access')
      expect(JSON.stringify(request?.data)).toContain('"DISTINCT":true')
      const requestScope = lowcodeApi.readAuthenticatedRequestScope()
      expect(requestScope.headers).toEqual({})
      expect(requestScope.token).not.toContain('catalog-test-access')
    } finally {dataSet.destroy()}
  })

  it('rejects stale metadata completion before creating or querying a DataSet', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockImplementation(async () => {
      lowcodeApi.session.clear()
      return [formalModel]
    })
    await expect(loadLowcodeApplicationCatalog()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport).not.toHaveBeenCalled()
  })

  it('reads the unique navigation root through the formal three-field DataView with backend permissions', async () => {
    lowcodeApi.session.save({accessToken: 'root-test-access', refreshToken: 'root-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    lowcodeApi.application.clear()
    const rootFields = ['rowid', 'SysId', 'prowid', 'FunName', 'NavigationUrl'].map((name, order) => ({
      id: name, modelId: '7AB874097A1E8711A42FD845939A6E05p000', name, canonicalName: name, type: 'string', description: name,
      primaryKey: name === 'rowid', output: true, computed: false, order, orderType: '', raw: {},
    }))
    const rootModel = {
      id: '7AB874097A1E8711A42FD845939A6E05p000', name: 'Base_NavigationInfo', metaName: 'Base_NavigationInfo', sourceType: '数据库表',
      sourceId: 'DB', sourceName: 'Base_NavigationInfo', primaryKey: 'rowid', businessMain: true, fields: rootFields, raw: {},
    } satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
    queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
    requiredFields = ['rowid']
    hiddenFields = ['FunName']
    maskedFields = ['NavigationUrl']
    const readSpace = vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '功能管理',
    })
    const readModel = vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([rootModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeNavigationRootId?: (systemId: string, assertCurrent: () => void) => Promise<string>
    }
    expect(typeof catalog.readLowcodeNavigationRootId).toBe('function')
    if (!catalog.readLowcodeNavigationRootId) return

    await expect(catalog.readLowcodeNavigationRootId('APP-1', () => undefined)).resolves.toBe('ROOT-APP-1')

    expect(readSpace).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: CATALOG_SCENARIO_ID,
    }))
    expect(readModel).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: CATALOG_SCENARIO_ID, metaNames: ['Base_NavigationInfo'],
    }))
    const requests = formalQueryRequests()
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(request?.config.headers?.['x-FormKey']).toBe(CATALOG_SCENARIO_ID)
    expect(request?.config.headers?.['X-AppId']).toBeUndefined()
    expect(request?.config.headers?.['tenant-id']).toBeUndefined()
    expect(request?.body.Table?.[0]?.Fields?.map(field => field.Name).sort()).toEqual(['SysId', 'prowid', 'rowid'])
    expect(request?.body.Table?.[0]?.Filter).toMatchObject({Type: 'and', Filters: [
      expect.objectContaining({Field: 'SysId', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'APP-1'}}),
      expect.objectContaining({Field: 'prowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: '000000'}}),
    ]})
    expect(request?.body.PageParam).toEqual({index: 1, size: 1})
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['zero roots', []],
    ['two roots', [
      {rowid: 'ROOT-1', SysId: 'APP-1', prowid: '000000'},
      {rowid: 'ROOT-2', SysId: 'APP-1', prowid: '000000'},
    ]],
    ['three roots above the DataView cap', [
      {rowid: 'ROOT-1', SysId: 'APP-1', prowid: '000000'},
      {rowid: 'ROOT-2', SysId: 'APP-1', prowid: '000000'},
      {rowid: 'ROOT-3', SysId: 'APP-1', prowid: '000000'},
    ]],
  ])('rejects %s rather than choosing the first navigation root', async (_label, rows) => {
    lowcodeApi.session.save({accessToken: 'root-test-access', refreshToken: 'root-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    lowcodeApi.application.clear()
    queryRows = rows
    const rootFields = ['rowid', 'SysId', 'prowid'].map((name, order) => ({
      id: name, modelId: '7AB874097A1E8711A42FD845939A6E05p000', name, canonicalName: name, type: 'string', description: name,
      primaryKey: name === 'rowid', output: true, computed: false, order, orderType: '', raw: {},
    }))
    const rootModel = {id: '7AB874097A1E8711A42FD845939A6E05p000', name: 'Base_NavigationInfo', metaName: 'Base_NavigationInfo',
      sourceType: '数据库表', sourceId: 'DB', sourceName: 'Base_NavigationInfo', primaryKey: 'rowid',
      businessMain: true, fields: rootFields, raw: {}} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '功能管理',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([rootModel])
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeNavigationRootId?: (systemId: string, assertCurrent: () => void) => Promise<string>
    }
    expect(typeof catalog.readLowcodeNavigationRootId).toBe('function')
    if (!catalog.readLowcodeNavigationRootId) return

    await expect(catalog.readLowcodeNavigationRootId('APP-1', () => undefined)).rejects.toThrow()
    if (_label === 'two roots') {
      expect(formalQueryRequests().map(item => item.body.PageParam)).toEqual([
        {index: 1, size: 1}, {index: 2, size: 1},
      ])
    }
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['rowid', 'hidden'], ['rowid', 'masked'], ['SysId', 'hidden'], ['SysId', 'masked'],
    ['prowid', 'hidden'], ['prowid', 'masked'],
  ] as const)('rejects a root whose %s permission is %s in the real query response', async (field, permission) => {
    lowcodeApi.session.save({accessToken: 'root-test-access', refreshToken: 'root-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    lowcodeApi.application.clear()
    queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
    if (permission === 'hidden') hiddenFields = [field]
    else maskedFields = [field]
    const rootFields = ['rowid', 'SysId', 'prowid'].map((name, order) => ({
      id: name, modelId: '7AB874097A1E8711A42FD845939A6E05p000', name, canonicalName: name, type: 'string', description: name,
      primaryKey: name === 'rowid', output: true, computed: false, order, orderType: '', raw: {},
    }))
    const rootModel = {id: '7AB874097A1E8711A42FD845939A6E05p000', name: 'Base_NavigationInfo', metaName: 'Base_NavigationInfo',
      sourceType: '数据库表', sourceId: 'DB', sourceName: 'Base_NavigationInfo', primaryKey: 'rowid',
      businessMain: true, fields: rootFields, raw: {}} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '功能管理',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockResolvedValue([rootModel])
    const catalog = await import('@/lowcode/lowcode-application-catalog') as unknown as {
      readLowcodeNavigationRootId?: (systemId: string, assertCurrent: () => void) => Promise<string>
    }
    expect(typeof catalog.readLowcodeNavigationRootId).toBe('function')
    if (!catalog.readLowcodeNavigationRootId) return

    await expect(catalog.readLowcodeNavigationRootId('APP-1', () => undefined)).rejects.toThrow()
  })

  it.each([
    ['wrong system identity', {rowid: 'ROOT-APP-2', SysId: 'APP-2', prowid: '000000'}],
    ['non-root parent identity', {rowid: 'CHILD-1', SysId: 'APP-1', prowid: 'PARENT-1'}],
  ])('rejects a returned row with %s', async (_label, row) => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryRows = [row]
    mockNavigationMetadata()
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow()
  })

  it.each([
    ['wrong model name', makeNavigationModel(), CATALOG_SCENARIO_ID],
    ['missing formal parent field', makeNavigationModel(['rowid', 'SysId']), CATALOG_SCENARIO_ID],
    ['wrong formal data space', makeNavigationModel(), 'OTHER-SPACE'],
  ])('rejects %s before returning a root identity', async (_label, model, spaceId) => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
    const selectedModel = _label === 'wrong model name'
      ? {...model, name: 'Different_Model', metaName: 'Different_Model'}
      : model
    mockNavigationMetadata(selectedModel, spaceId)
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow()
    expect(transport.mock.calls.some(([config]) => config.url === '/api/DataOperation/GetData')).toBe(false)
  })

  it('rejects a failed root query and releases the assembled DataSet', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryFailure = new Error('navigation root query failed')
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow('navigation root query failed')
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it.each(['query-success', 'query-failure'] as const)(
    'rejects a root result from a changed session and releases the DataSet during %s', async (queryOutcome) => {
      saveNavigationRootSession()
      lowcodeApi.application.clear()
      queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
      if (queryOutcome === 'query-failure') queryFailure = new Error('late root query failure')
      onQueryRequest = () => {
        const session = lowcodeApi.session.get()
        if (session) lowcodeApi.session.save({...session, identity: {...session.identity}})
      }
      mockNavigationMetadata()
      const destroy = vi.spyOn(DataSet.prototype, 'destroy')
      const reader = await requireNavigationRootReader()

      await expect(reader('APP-1', () => undefined)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')

      expect(destroy).toHaveBeenCalledTimes(2)
    })

  it('rejects an all-pages query without a backend Count instead of deriving completeness from loaded rows', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
    omitQueryCount = true
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow(/total|总数/i)
    expect(formalQueryRequests()).toHaveLength(1)
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects a backend Count of two when only one matching row is returned across all pages', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryRows = [{rowid: 'ROOT-APP-1', SysId: 'APP-1', prowid: '000000'}]
    queryCountOverride = 2
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow(/page|分页|records|记录/i)
    expect(formalQueryRequests().map(item => item.body.PageParam)).toEqual([
      {index: 1, size: 1}, {index: 2, size: 1},
    ])
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects a backend Count that changes between all-pages reads', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryRows = [
      {rowid: 'ROOT-1', SysId: 'APP-1', prowid: '000000'},
      {rowid: 'ROOT-2', SysId: 'APP-1', prowid: '000000'},
    ]
    queryCountSequence = [2, 1]
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow(/total|总数/i)
    expect(formalQueryRequests().map(item => item.body.PageParam)).toEqual([
      {index: 1, size: 1}, {index: 2, size: 1},
    ])
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('stops on a stale metadata result before the root query', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    let current = true
    const assertCurrent = (): void => {if (!current) throw new Error('ROOT_READER_STALE')}
    vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: CATALOG_SCENARIO_ID, name: '功能管理',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModelBatch').mockImplementation(async () => {
      current = false
      return [makeNavigationModel()]
    })
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', assertCurrent)).rejects.toThrow('ROOT_READER_STALE')
    expect(transport.mock.calls.some(([config]) => config.url === '/api/DataOperation/GetData')).toBe(false)
  })

  it('releases the DataSet when the root query completes after its caller guard becomes stale', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    let current = true
    const assertCurrent = (): void => {if (!current) throw new Error('ROOT_READER_STALE')}
    onQueryRequest = () => {current = false}
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', assertCurrent)).rejects.toThrow('ROOT_READER_STALE')
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects a root query when the authenticated session changes during a successful DataView response', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    onQueryRequest = () => {lowcodeApi.session.clear()}
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('prefers stale authentication scope over a root DataView query error', async () => {
    saveNavigationRootSession()
    lowcodeApi.application.clear()
    queryFailure = new Error('late navigation root query failure')
    onQueryRequest = () => {lowcodeApi.session.clear()}
    mockNavigationMetadata()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    const reader = await requireNavigationRootReader()

    await expect(reader('APP-1', () => undefined)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
