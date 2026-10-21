import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  DATABASE_CATALOG_RESOLVE_HINT,
  formatDatabaseCatalogResolveFailure,
  metaNamesFingerprint,
  resolveDatabaseCatalogScenarioId,
} from '@/lowcode/resources/database/database-catalog-scenario'

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

describe('database-catalog resolve cache', () => {
  beforeEach(() => {
    mocks.readModelBatch.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('includes identity hint in resolve failure', () => {
    const err = formatDatabaseCatalogResolveFailure(new Error('正式模型集合不完整'))
    expect(err.message).toContain(DATABASE_CATALOG_RESOLVE_HINT)
    expect(err.message).toContain('正式模型集合不完整')
  })

  it('reuses sessionStorage after first successful resolve', async () => {
    mocks.readModelBatch.mockResolvedValue(undefined)
    const meta = ['Base_serverInfo']
    const fp = metaNamesFingerprint(meta)
    const first = await resolveDatabaseCatalogScenarioId({
      preferredScenarioId: 'PREFERRED',
      metaNames: meta,
      assertCurrent: () => {},
    })
    expect(first).toBe('PREFERRED')
    expect(mocks.readModelBatch).toHaveBeenCalledTimes(1)

    mocks.readModelBatch.mockClear()
    const second = await resolveDatabaseCatalogScenarioId({
      preferredScenarioId: 'PREFERRED',
      metaNames: meta,
      assertCurrent: () => {},
    })
    expect(second).toBe('PREFERRED')
    expect(mocks.readModelBatch).toHaveBeenCalledTimes(1)
    const stored = sessionStorage.getItem('spark:dbCatalogFormKey:APP-1:PREFERRED')
    expect(stored).toContain(fp)
  })
})
