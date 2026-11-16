import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
// @ts-expect-error -- workflow smoke .mjs helper
import {buildFieldChangedRow, buildModelChangedRow} from '../../../tools/workflow/workflow-formal-pk-batch.mjs'
// @ts-expect-error -- workflow smoke .mjs helper
import {buildPkRepairChecklist, classifyDesignerOnly, FORMAL_PK_TIER, partitionFormalPkRepairs} from '../../../tools/workflow/workflow-formal-pk-tiers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const detailPath = join(root, 'notes', 'evidence', 'workflow-formal-pk-detail-20261116.json')

describe('workflow-formal-pk-tier-b payloads', () => {
  const detailDoc = JSON.parse(readFileSync(detailPath, 'utf8')) as {
    models: Array<{
      modelId: string
      modelName: string
      scenarioId: string
      scenarioKey: string
      modelFieldIsPKey: string[]
      repairHint: string
    }>
  }
  const detailByModelId = new Map(detailDoc.models.map(row => [row.modelId, row]))

  it('marks A5BAD UUID models as designerOnly', () => {
    const waiting = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_Waiting')
    expect(waiting).toBeDefined()
    expect(classifyDesignerOnly({modelId: waiting!.modelId, scenarioId: waiting!.scenarioId}, waiting)).toBe(true)
    const node = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW' && row.scenarioKey === 'flowWorkbench')
    expect(node).toBeDefined()
    expect(classifyDesignerOnly({modelId: node!.modelId, scenarioId: node!.scenarioId}, node)).toBe(true)
  })

  it('builds field patch rows for Tier B extras', () => {
    const form = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_FORM')!
    const fieldRow = {
      rowid: 'FIELD-1',
      Name: 'WFOBJID',
      dataModelId: form.modelId,
      type: 'dataModel',
      IsPKey: 1,
      lingma_sys_key: 'KEY',
    }
    const changed = buildFieldChangedRow(fieldRow, {IsPKey: 0})
    expect(changed.IsPKey).toBe(0)
    expect(changed.lingma_sys_key).toBe('KEY')
    const modelRow = {
      rowid: form.modelId,
      Name: form.modelName,
      MetaName: form.modelName,
      dataSetId: form.scenarioId,
      Type: '数据库表',
      DbId: 'DB',
      PrimaryKeyFields: '',
    }
    const modelPatch = buildModelChangedRow(modelRow, 'rowid')
    expect(modelPatch.PrimaryKeyFields).toBe('rowid')
  })

  it('checklist includes Tier B steps for dual IsPKey models', () => {
    const repair = detailDoc.models.map(row => ({
      modelId: row.modelId,
      modelName: row.modelName,
      scenarioKey: row.scenarioKey,
      scenarioId: row.scenarioId,
    }))
    const {tierB} = partitionFormalPkRepairs(repair, detailByModelId)
    const checklist = buildPkRepairChecklist(repair.filter(r => tierB.some((b: {modelId: string}) => b.modelId === r.modelId)), detailByModelId)
    const form = checklist.find((row: {modelName: string}) => row.modelName === 'WFOBJ_FLOW_FORM')
    expect(form?.tier).toBe(FORMAL_PK_TIER.B)
    expect(form?.designerOnly).toBe(true)
    expect(form?.actions.some((action: string) => action.includes('WFOBJID'))).toBe(true)
  })
})
