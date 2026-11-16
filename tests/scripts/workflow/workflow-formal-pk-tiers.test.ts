import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
// @ts-expect-error -- workflow smoke .mjs helper
import {buildPkRepairChecklist, classifyDesignerOnly, classifyFormalPkDetail, classifyFormalPkRepair, FLOW_WORKBENCH_SCENARIO_ID, FORMAL_PK_TIER, partitionFormalPkRepairs} from '../../../tools/workflow/workflow-formal-pk-tiers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const detailPath = join(root, 'notes', 'evidence', 'workflow-formal-pk-detail-20261116.json')

describe('workflow-formal-pk-tiers', () => {
  const detailDoc = JSON.parse(readFileSync(detailPath, 'utf8')) as {
    models: Array<{modelId: string; modelName: string; scenarioId: string; scenarioKey: string; repairHint: string; modelFieldIsPKey: string[]}>
  }
  const detailByModelId = new Map(detailDoc.models.map(row => [row.modelId, row]))

  it('classifies Tier A when only rowid is marked IsPKey', () => {
    const waiting = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_Waiting')
    expect(waiting).toBeDefined()
    expect(classifyFormalPkDetail(waiting!)).toBe(FORMAL_PK_TIER.A)
  })

  it('classifies Tier B for dual IsPKey', () => {
    const relation = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_RELATIONLINE_STEP')
    expect(relation).toBeDefined()
    expect(classifyFormalPkDetail(relation!)).toBe(FORMAL_PK_TIER.B)
    const form = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_FORM')
    expect(classifyFormalPkDetail(form!)).toBe(FORMAL_PK_TIER.B)
  })

  it('classifies Tier C for non-rowid field pk', () => {
    const user = detailDoc.models.find(row => row.modelName === 'Base_UserInfo')
    expect(classifyFormalPkDetail(user!)).toBe(FORMAL_PK_TIER.C)
    const workform = detailDoc.models.find(row => row.modelName === 'WFM_WORKFORM')
    expect(workform).toBeDefined()
    expect(classifyFormalPkDetail(workform!)).toBe(FORMAL_PK_TIER.C)
  })

  it('designerOnly for workbench UUID model ids', () => {
    const waiting = detailDoc.models.find(row => row.modelName === 'WFOBJ_FLOW_Waiting')!
    expect(waiting.scenarioId).toBe(FLOW_WORKBENCH_SCENARIO_ID)
    expect(classifyDesignerOnly({modelId: waiting.modelId, scenarioId: waiting.scenarioId}, waiting)).toBe(true)
  })

  it('buildPkRepairChecklist attaches actions', () => {
    const repair = detailDoc.models.slice(0, 3).map(row => ({
      modelId: row.modelId,
      modelName: row.modelName,
      scenarioKey: row.scenarioKey,
      scenarioId: row.scenarioId,
    }))
    const checklist = buildPkRepairChecklist(repair, detailByModelId)
    expect(checklist.every((row: {actions: string[]}) => row.actions.length >= 1)).toBe(true)
  })

  it('partitions current gap list consistently with detail evidence', () => {
    const repair = detailDoc.models.map(row => ({
      modelId: row.modelId,
      modelName: row.modelName,
      scenarioKey: row.scenarioKey,
    }))
    const parts = partitionFormalPkRepairs(repair, detailByModelId)
    expect(parts.tierA.length + parts.tierB.length + parts.tierC.length).toBe(repair.length)
    for (const item of [...parts.tierA, ...parts.tierB, ...parts.tierC]) {
      expect(classifyFormalPkRepair(item, detailByModelId)).toBe(item.tier)
    }
  })
})
