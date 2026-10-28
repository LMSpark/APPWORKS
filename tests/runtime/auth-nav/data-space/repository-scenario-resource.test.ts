import {describe, expect, it} from 'vitest'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {readRepositoryScenarioText} from '@/lowcode/resources/shared/repository-scenario-resource'

const applicationId = 'D99A1DCE9894698799101EFD70F8FC76'
const scenarioIds = [
  '8D1AB14DD8277F3E7017CD38F77B09FD',
  '90A82E287930A234FEC3E687C94A93EA',
  '69B79AB779DF4C12A5595DACDF3283F1',
  '7AB874097A1E8711A42FD845939A6E05',
]

describe('repository-backed system scenario resources', () => {
  it.each(scenarioIds)('reads %s through the repository file DataView', async scenarioId => {
    const resource = resolveBuiltinScenarioResource(scenarioId)
    expect(resource).not.toBeNull()
    const text = await readRepositoryScenarioText(resource!, () => undefined)
    expect(new ScenarioViewConfig(scenarioId, text).scenarioId).toBe(scenarioId)
  })

  it('keeps dynamic and formal target spaces separate from declared program scenarios', () => {
    expect(resolveBuiltinScenarioResource(scenarioIds[0]!)).not.toBeNull()
    expect(resolveBuiltinScenarioResource('UNREGISTERED')).toBeNull()
  })
})
