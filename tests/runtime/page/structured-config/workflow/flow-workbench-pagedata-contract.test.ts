import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {flowWorkbenchTabBinding} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'
// @ts-expect-error -- R16 manual contract helper
import {checkWorkbenchFourTabsContract} from '../../../../../tools/workflow/workflow-manual-contract.mjs'

const FLOW_WORKBENCH_SCENARIO = 'A5BADCEE11D2438CB9E75C2453A220A6'

describe('flow-workbench pagedata contract', () => {
  const doc = JSON.parse(
    readFileSync(join(process.cwd(), 'config/pages/workflow/flow-workbench/pagedata.json'), 'utf8'),
  ) as {
    scenarioId: string
    tables?: Record<string, {views?: Record<string, unknown>}>
  }

  it('matches workflow-manual-contract workbench probe', () => {
    const result = checkWorkbenchFourTabsContract()
    expect(result.ok, result.reason).toBe(true)
  })

  it('registers four workbench named views', () => {
    expect(doc.scenarioId).toBe(FLOW_WORKBENCH_SCENARIO)
    for (const tab of ['pending', 'processed', 'shared', 'started'] as const) {
      const binding = flowWorkbenchTabBinding(tab)
      expect(doc.tables?.[binding.modelName]?.views?.[binding.viewId], binding.viewId).toBeDefined()
    }
  })
})