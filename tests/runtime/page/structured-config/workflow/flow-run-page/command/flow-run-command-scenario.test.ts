import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'

describe('formal approval command declaration', () => {
  it('declares a semantic command in the original monitor scenario without a fake model identity', () => {
    const text = readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')
    const config = new ScenarioViewConfig('A5BADCEE11D2438CB9E75C2453A220A6', text)
    const definition = JSON.parse(text).tables.ApprovalCommand
    expect(config.scenarioId).toBe('A5BADCEE11D2438CB9E75C2453A220A6')
    expect(definition).toMatchObject({resourceType: 'command', resourceId: 'workflow:approval'})
    expect(definition.modelBinding).toBeUndefined()
    expect(definition.columns).toContainEqual({name: 'nextNode', type: 'array'})
  })
})
