import {afterEach, describe, expect, it} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {DataSet} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {hasDimensionLedgerRecords} from '@/lowcode/resources/structured-config/dimension-source/ledger-guard'
import pagedata from '../../../../config/pages/structured-config/dimension-ledger/pagedata.json?raw'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

const LEDGER_SCENARIO = '07D264520034366B1DA25CEE5358E502'
const dataSets: DataSet[] = []
afterEach(() => dataSets.splice(0).forEach(dataSet => dataSet.destroy()))

function ledgerWith(rows: Array<Record<string, unknown>>, hidden: string[] = []) {
  const http = new ApiBackend()
  http.records['Bil_Dimension_Set'] = rows
  http.hiddenFields['Bil_Dimension_Set'] = hidden
  const [model] = buildFormalModels({Bil_Dimension_Set: ['rowid', 'source_binding_id', 'lingma_sys_is_delete']})
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(LEDGER_SCENARIO, pagedata),
    space: {dataSpaceId: LEDGER_SCENARIO, name: '租户维度结果'}, models: [{...model!, id: `${LEDGER_SCENARIO}p000`}], relations: []}).dataSet
  dataSets.push(dataSet)
  return {dataSet, http}
}

describe('维度来源台账引用守卫', () => {
  it('queries the ledger scenario view by binding and reports active records of the binding only', async () => {
    const {dataSet, http} = ledgerWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 0},
      {rowid: 'S2', source_binding_id: 'B2', lingma_sys_is_delete: 0}])
    await expect(hasDimensionLedgerRecords(dataSet, 'B1', () => undefined)).resolves.toBe(true)
    expect(http.reads.map(read => read.table)).toEqual(['Bil_Dimension_Set'])
    await expect(hasDimensionLedgerRecords(dataSet, 'B3', () => undefined)).resolves.toBe(false)
  })

  it('ignores soft-deleted ledger records', async () => {
    const {dataSet} = ledgerWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 1}])
    await expect(hasDimensionLedgerRecords(dataSet, 'B1', () => undefined)).resolves.toBe(false)
  })

  it('fails closed when the ledger fields are not readable', async () => {
    const {dataSet} = ledgerWith([{rowid: 'S1', source_binding_id: 'B1', lingma_sys_is_delete: 0}], ['lingma_sys_is_delete'])
    await expect(hasDimensionLedgerRecords(dataSet, 'B1', () => undefined)).rejects.toThrow('字段 lingma_sys_is_delete 无法读取')
  })

  it('fails closed when the target becomes stale', async () => {
    const {dataSet} = ledgerWith([])
    await expect(hasDimensionLedgerRecords(dataSet, 'B1', () => { throw new Error('目标已失效') })).rejects.toThrow('目标已失效')
  })
})
