import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/server/resource'
import {
  DATABASE_SERVER_SCENARIO_ID,
  type DatabaseServerDesignMocks,
  DatabaseServerHttp,
  bootstrapDatabaseServerRuntime,
} from './resource.fixture'

const service = vi.hoisted(() => ({
  readSpaceDefinition: vi.fn(),
  readModel: vi.fn(),
  readRequestScope: vi.fn(),
})) as DatabaseServerDesignMocks
let http: DatabaseServerHttp
let runtime: DataSpaceRuntimeApi

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {
    return http
  },
  lowcodeApi: {
    readRequestScope: service.readRequestScope,
    application: {get: () => null},
    blueprint: {readRecords: async () => []},
    catalog: {getDatabaseCatalog: async () => ({sourceDataSpaces: {}})},
    dataSpace: {
      design: service,
      get runtime() {
        return runtime
      },
    },
  },
}))

const sets: DataSet[] = []

beforeEach(() => {
  http = new DatabaseServerHttp()
  runtime = bootstrapDatabaseServerRuntime(http, service)
})

afterEach(() => {
  sets.splice(0).forEach(ds => ds.destroy())
  vi.clearAllMocks()
})

describe('DatabaseCatalogLoadOptions.resolvedDataSpaceId', () => {
  it('rechecks the exact host-bound FormKey even when the same resolved id is supplied', async () => {
    const resolved = DATABASE_SERVER_SCENARIO_ID
    service.readSpaceDefinition.mockImplementation(async (input: {dataSpaceId: string}) =>
      ({dataSpaceId: input.dataSpaceId, name: '数据库', raw: {}}))
    service.readRequestScope.mockReturnValue({
      token: 'scope',
      headers: {'X-AppId': 'APP', 'x-FormKey': resolved},
    })
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID, {resolvedDataSpaceId: resolved})
    sets.push(ds)
    expect(ds.scenarioId).toBe(resolved)
    expect(service.readModelBatch).toHaveBeenCalledTimes(1)
    expect(service.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: resolved}))
  })

  it('runs readModelBatch when resolved id is absent', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
    sets.push(ds)
    expect(service.readModelBatch).toHaveBeenCalled()
  })
})
