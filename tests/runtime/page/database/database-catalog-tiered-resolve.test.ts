import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  DATABASE_CATALOG_SERVER_ONLY_NOTICE,
  resolveDatabaseCatalogScenarioTiered,
} from '@/lowcode/resources/database/database-catalog-scenario'
import {DATABASE_SERVER_MODEL} from '@/lowcode/resources/database/lowcode-database-server'
import {DATABASE_CATALOG_SCENARIO_META_NAMES} from '@/lowcode/resources/database/lowcode-database-table-view'

const mocks = vi.hoisted(() => ({
  readModelBatch: vi.fn(),
  readRecords: vi.fn(async () => [] as never[]),
  getDatabaseCatalog: vi.fn(async () => ({sourceDataSpaces: {}})),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    readRequestScope: () => ({token: 'scope-a', headers: {'X-AppId': 'APP-1'}}),
    application: {get: () => ({application: {id: 'APP-1'}})},
    blueprint: {readRecords: mocks.readRecords},
    catalog: {getDatabaseCatalog: mocks.getDatabaseCatalog},
    dataSpace: {design: {readModelBatch: mocks.readModelBatch}},
  },
}))

vi.mock('@spark-appworks/spark-app', () => ({getNavTree: () => ({items: []})}))

describe('resolveDatabaseCatalogScenarioTiered', () => {
  beforeEach(() => {
    mocks.readModelBatch.mockReset()
  })

  it('returns full tier when five-model batch succeeds', async () => {
    mocks.readModelBatch.mockResolvedValue(undefined)
    const result = await resolveDatabaseCatalogScenarioTiered({
      preferredScenarioId: 'FORM-KEY',
      fullMetaNames: DATABASE_CATALOG_SCENARIO_META_NAMES,
      serverMetaNames: [DATABASE_SERVER_MODEL],
      assertCurrent: () => {},
    })
    expect(result).toEqual({dataSpaceId: 'FORM-KEY', tier: 'full'})
  })

  it('falls back to serverOnly on same rowid when five-model batch fails', async () => {
    mocks.readModelBatch.mockImplementation(async (input: {metaNames: readonly string[]}) => {
      if (input.metaNames.length > 1) throw new Error('正式模型集合不完整')
    })
    const result = await resolveDatabaseCatalogScenarioTiered({
      preferredScenarioId: 'FORM-KEY',
      fullMetaNames: DATABASE_CATALOG_SCENARIO_META_NAMES,
      serverMetaNames: [DATABASE_SERVER_MODEL],
      assertCurrent: () => {},
    })
    expect(result).toEqual({dataSpaceId: 'FORM-KEY', tier: 'serverOnly'})
  })
})

describe('DATABASE_CATALOG_SERVER_ONLY_NOTICE', () => {
  it('references formal model gap evidence', () => {
    expect(DATABASE_CATALOG_SERVER_ONLY_NOTICE).toContain('live-pilot-formal-model-gap.json')
  })
})
