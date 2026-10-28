import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, DataViewLocalQuery, RequestState} from '@spark-appworks/spark-data'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {readRepositoryScenarioText} from '@/lowcode/resources/shared/repository-scenario-resource'

const scenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const resource = resolveBuiltinScenarioResource(scenarioId)!
const created: DataSet[] = []

afterEach(() => {for (const dataSet of created.splice(0)) if (!dataSet.destroyed) dataSet.destroy()})

describe('repository scenario initial DataView read contract', () => {
  it('creates and starts the file DataView before the resource executor loads the registered file', async () => {
    const fromJson = DataSet.fromJson.bind(DataSet)
    vi.spyOn(DataSet, 'fromJson').mockImplementation((...args) => {
      const dataSet = fromJson(...args)
      created.push(dataSet)
      return dataSet
    })
    const select = DataViewLocalQuery.select.bind(DataViewLocalQuery)
    vi.spyOn(DataViewLocalQuery, 'select').mockImplementation(input => {
      const dataSet = created.find(item => item.scenarioId === scenarioId)
      const view = dataSet?.getView('RepositoryScenario', 'default')
      expect(view?.dataTable?.resourceType).toBe('file')
      expect(view?.dataTable?.resourceId).toBe(resource.resourceId)
      expect(view?.requestState).toBe(RequestState.Loading)
      return select(input)
    })
    const text = await readRepositoryScenarioText(resource, () => {})
    expect(text).toContain(`"scenarioId": "${scenarioId}"`)
  })
})
