import {describe, expect, it, vi} from 'vitest'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {resolveDatabaseCatalogScenarioId} from '@/lowcode/resources/database/database-catalog-scenario'

const readModelBatch = vi.hoisted(() => vi.fn())
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {dataSpace: {design: {readModelBatch}}},
}))

describe('database-catalog-scenario exact identity', () => {
  it('checks the exact host-bound data-space id and required models once', async () => {
    readModelBatch.mockReset().mockResolvedValue(undefined)
    const result = await resolveDatabaseCatalogScenarioId({
      preferredScenarioId: 'FORM-ROWID',
      metaNames: ['_base_dbInfo', '_Base_TblList', '_Base_ViewList', 'Base_TblField'],
      assertCurrent: () => {},
    })
    expect(result).toBe('FORM-ROWID')
    expect(readModelBatch).toHaveBeenCalledTimes(1)
    expect(readModelBatch).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
      dataSpaceId: 'FORM-ROWID',
      metaNames: ['_base_dbInfo', '_Base_TblList', '_Base_ViewList', 'Base_TblField'],
    }))
  })

  it('fails the exact target when required models are missing without trying candidates', async () => {
    readModelBatch.mockReset().mockRejectedValue(new Error('target models missing'))
    await expect(resolveDatabaseCatalogScenarioId({
      preferredScenarioId: 'FORM-ROWID',
      metaNames: ['_base_dbInfo', '_Base_TblList'],
      assertCurrent: () => {},
    })).rejects.toThrow('target models missing')
    expect(readModelBatch).toHaveBeenCalledTimes(1)
    expect(readModelBatch.mock.calls[0]?.[0]).toMatchObject({dataSpaceId: 'FORM-ROWID'})
  })

  it('rejects a missing host target without querying another data space', async () => {
    readModelBatch.mockReset()
    await expect(resolveDatabaseCatalogScenarioId({
      preferredScenarioId: '  ',
      metaNames: ['Base_serverInfo'],
      assertCurrent: () => {},
    })).rejects.toThrow('页面缺少正式 dataSpaceId')
    expect(readModelBatch).not.toHaveBeenCalled()
  })
})
