import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {readRepositoryScenarioText} from '@/lowcode/resources/repository/scenarios/resource'

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
    const text = readFileSync(resource!.path, 'utf8')
    await stubHostResponses([{resourceId: resource!.resourceId, scenarioId, text}])
    expect(await readRepositoryScenarioText(resource!, () => undefined)).toBe(text)
    expect(new ScenarioViewConfig(scenarioId, text).scenarioId).toBe(scenarioId)
  })

  it('fetches fresh host text for each repository DataView query', async () => {
    const resource = resolveBuiltinScenarioResource(scenarioIds[0]!)!
    const first = `{"scenarioId":"${resource.scenarioId}","revision":"one"}`
    const second = `{"scenarioId":"${resource.scenarioId}","revision":"two"}`
    const fetchMock = await stubHostResponses([
      {resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: first},
      {resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: second},
    ])

    expect(await readRepositoryScenarioText(resource, () => undefined)).toBe(first)
    expect(await readRepositoryScenarioText(resource, () => undefined)).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`,
      `/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`,
    ])
  })

  it('keeps dynamic and formal target spaces separate from declared program scenarios', () => {
    expect(resolveBuiltinScenarioResource(scenarioIds[0]!)).not.toBeNull()
    expect(resolveBuiltinScenarioResource('UNREGISTERED')).toBeNull()
  })
})

afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals()})

async function stubHostResponses(items: readonly Readonly<{resourceId: string; scenarioId: string; text: string}>[]) {
  vi.stubEnv('DEV', true)
  const responses = await Promise.all(items.map(async item => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.text))
    const sourceRevision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
    return new Response(JSON.stringify({...item, sourceRevision}), {status: 200, headers: {'Content-Type': 'application/json'}})
  }))
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
    const response = responses.shift()
    if (!response) throw new Error('unexpected repository host request')
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
