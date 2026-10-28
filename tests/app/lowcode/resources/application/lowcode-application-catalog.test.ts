import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceDesignApi, LOWCODE_APPLICATION_CATALOG_FORM_KEY, DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {Request, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {loadLowcodeApplicationCatalog} from '@/lowcode/lowcode-application-catalog'

const priorSession = lowcodeApi.session.get()
const priorApplication = lowcodeApi.application.get()
const fields = ['rowid', 'AppDesc', 'AppName'].map((name, order) => ({
  id: name, modelId: 'APP-MODEL', name, canonicalName: name, type: 'string', description: name,
  primaryKey: name === 'rowid', output: true, computed: false, order, orderType: '', raw: {},
}))
const formalModel = {
  id: 'APP-MODEL', name: 'Base_AppSystemList', metaName: 'Base_AppSystemList', sourceType: '数据库表',
  sourceId: 'DB', sourceName: 'Base_AppSystemList', primaryKey: 'rowid', businessMain: false, fields, raw: {},
} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

type TransportSpy = {mock: {calls: Array<[RequestConfig]>}; mockClear: () => unknown}
let transport: TransportSpy

beforeEach(() => {
  lowcodeApi.application.clear()
  transport = vi.spyOn(Request.prototype as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}, 'executeRequest')
    .mockImplementation(async config => ({
    data: {Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: [{rowid: 'APP-1', AppDesc: 'Alpha', AppName: 'alpha',
      lingma_sys_key: 'ROW-KEY', lingma_sys_params: {r: ['AppDesc', 'AppName', 'IsSys'], e: [], h: [], m: [], d: false}}], Count: 1}, allowAdd: false, lingma_sys_key: 'TABLE-KEY'}},
    status: 200, statusText: 'OK', headers: {},
    }))
})

afterEach(() => {
  vi.restoreAllMocks()
  lowcodeApi.session.clear()
  if (priorSession) lowcodeApi.session.save(priorSession)
  lowcodeApi.application.clear()
  if (priorApplication) lowcodeApi.application.save(priorApplication)
})

describe('authenticated application catalog DataView', () => {
  it('loads the fixed formal space/model and queries through the shared session-only SPARK DataView', async () => {
    lowcodeApi.session.save({accessToken: 'catalog-test-access', refreshToken: 'catalog-test-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1', enterpriseShortName: 'Enterprise', role: null, raw: {}},
      enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise', shortCode: 'ENT', raw: {}},
    })
    lowcodeApi.application.clear()
    const readSpace = vi.spyOn(DataSpaceDesignApi.prototype, 'readSpaceDefinition').mockResolvedValue({
      dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, name: '应用目录',
    })
    const readModel = vi.spyOn(DataSpaceDesignApi.prototype, 'readModel').mockResolvedValue(formalModel)

    const dataSet = await loadLowcodeApplicationCatalog()
    try {
      const view = dataSet.getView('Base_AppSystemList', 'default')
      expect(view).toBeDefined()
      expect(readSpace).toHaveBeenCalledWith(expect.objectContaining({
        designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
      }))
      expect(readModel).toHaveBeenCalledWith(expect.objectContaining({
        designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, metaName: 'Base_AppSystemList',
      }))
      expect(view?.queryConfig).toMatchObject({allPages: true, distinct: true})
      expect(view?.sortExpression).toEqual([{field: 'rowid', direction: 'asc'}])
      const result = await view?.requestRefresh()
      expect(result?.success).toBe(true)
      expect(view?.rows[0]?.['AppDesc']).toBe('Alpha')
      const request = transport.mock.calls.map(call => call[0]).find(config => config.url === '/api/DataOperation/GetData')
      expect(request).toBeDefined()
      expect(request?.headers?.['x-FormKey']).toBe(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
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
      dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, name: '应用目录',
    })
    vi.spyOn(DataSpaceDesignApi.prototype, 'readModel').mockImplementation(async () => {
      lowcodeApi.session.clear()
      return formalModel
    })
    await expect(loadLowcodeApplicationCatalog()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport).not.toHaveBeenCalled()
  })
})
