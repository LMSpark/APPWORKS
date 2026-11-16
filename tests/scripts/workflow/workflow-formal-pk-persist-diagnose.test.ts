import {describe, expect, it} from 'vitest'
// @ts-expect-error -- workflow smoke .mjs helper
import {buildPersistDiagnoseReport, findDuplicateModelNames, summarizeModelRow} from '../../../tools/workflow/workflow-formal-pk-persist-diagnose.mjs'

describe('workflow-formal-pk-persist-diagnose', () => {
  it('summarizes model row without leaking full lingma_sys_key', () => {
    const row = {
      rowid: 'abc',
      Name: 'WFOBJ_FLOW',
      dataSetId: 'A5BAD',
      PrimaryKeyFields: '',
      lingma_sys_key: 'ABCDEF0123456789SECRET',
      updateuser: 'admin',
    }
    const summary = summarizeModelRow(row)
    expect(summary.lingma_sys_key_prefix).toBe('ABCDEF0123456789')
    expect(summary.primaryKeyFields).toBe('')
  })

  it('detects duplicate Name in same dataSetId', () => {
    const rows = [
      {rowid: '1', Name: 'WFOBJ_FLOW', dataSetId: 'A5BAD'},
      {rowid: '2', Name: 'WFOBJ_FLOW', dataSetId: 'A5BAD'},
    ]
    const dup = findDuplicateModelNames(rows)
    expect(dup).toHaveLength(1)
    expect(dup[0]?.rowCount).toBe(2)
  })

  it('buildPersistDiagnoseReport flags repair targets', () => {
    const repair = [{modelId: 'mid-1', modelName: 'Base_UserInfo', scenarioKey: 'flowModelList'}]
    const rows = [{rowid: 'mid-1', Name: 'Base_UserInfo', dataSetId: '87F0', PrimaryKeyFields: 'rowid'}]
    const report = buildPersistDiagnoseReport(repair, rows, {baseUrl: 'http://x', appId: 'D99', tenantId: 'NewApp', tokenPresent: true, tokenLength: 10})
    expect(report.gapCount).toBe(1)
    expect(report.targets[0]?.found).toBe(true)
    expect(report.targets[0]?.snapshot?.primaryKeyFields).toBe('rowid')
  })
})
