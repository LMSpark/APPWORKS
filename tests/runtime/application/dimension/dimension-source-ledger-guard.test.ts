import {describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {DimensionSourceLedgerGuard} from '@/lowcode/resources/structured-config/dimension-source/ledger-guard'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

const LEDGER_SCENARIO = '07D264520034366B1DA25CEE5358E502'

function guardWith(rows: Array<Record<string, unknown>>, hidden: string[] = []) {
  const http = new ApiBackend()
  http.records['Bil_Dimension_Set'] = rows
  http.hiddenFields['Bil_Dimension_Set'] = hidden
  const [model] = buildFormalModels({Bil_Dimension_Set: ['rowid', 'source_binding_id', 'lingma_sys_is_delete']})
  const readModel = vi.fn<DataSpaceDesignApi['readModel']>(async () => ({...model!, id: `${LEDGER_SCENARIO}p000`}))
  const readSpaceDefinition = vi.fn<DataSpaceDesignApi['readSpaceDefinition']>(async () => ({dataSpaceId: LEDGER_SCENARIO, name: '租户维度结果'}))
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const guard = new DimensionSourceLedgerGuard({readModel, readSpaceDefinition}, new LowcodeDataSpaceAssembler(api, http))
  return {guard, http, readModel}
}

describe('维度来源台账引用守卫', () => {
  it('resolves the 07D2 formal model at runtime and reports active ledger records of the binding only', async () => {
    const {guard, http, readModel} = guardWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 0},
      {rowid: 'S2', source_binding_id: 'B2', lingma_sys_is_delete: 0}])
    await expect(guard.hasRecords('B1', () => undefined)).resolves.toBe(true)
    expect(readModel).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: LEDGER_SCENARIO, metaName: 'Bil_Dimension_Set'}))
    expect(http.reads.map(read => read.table)).toEqual(['Bil_Dimension_Set'])
    await expect(guard.hasRecords('B3', () => undefined)).resolves.toBe(false)
  })

  it('ignores soft-deleted ledger records', async () => {
    const {guard} = guardWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 1}])
    await expect(guard.hasRecords('B1', () => undefined)).resolves.toBe(false)
  })

  it('fails closed when the ledger fields are not readable', async () => {
    const {guard} = guardWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 0}], ['lingma_sys_is_delete'])
    await expect(guard.hasRecords('B1', () => undefined)).rejects.toThrow('字段 lingma_sys_is_delete 无法读取')
  })

  it('fails closed when the target becomes stale', async () => {
    const {guard} = guardWith([])
    await expect(guard.hasRecords('B1', () => { throw new Error('目标已失效') })).rejects.toThrow('目标已失效')
  })
})
