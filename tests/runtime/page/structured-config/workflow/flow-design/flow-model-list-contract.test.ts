import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

describe('flow model list page contract', () => {
  it('registers design peer scenario for embedded flow design dialog', () => {
    const source = readFileSync(
      resolve('src/views/features/workflow/flow-model/ui/flow-model-list-page.vue'),
      'utf8',
    )
    expect(source).toContain('peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID]')
    expect(source).toContain('FlowDesignPage')
  })

  it('flow monitor links run detail with wfid and flowid', () => {
    const source = readFileSync(
      resolve('src/views/features/system/flow-monitor/ui/flow-monitor-page.vue'),
      'utf8',
    )
    expect(source).toContain('flow-run-detail-page')
    expect(source).toContain('wfid')
    expect(source).toContain('flowid')
  })
})