import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {getPublicScenarioResource, resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {readRepositoryScenarioText} from '@/platform-adapters/resources/repository/scenarios/resource'
import registeredScenarios from '../../../../config/pages/system-scenarios.json'

const scenarioIds = [
  '8D1AB14DD8277F3E7017CD38F77B09FD',
  '90A82E287930A234FEC3E687C94A93EA',
  '69B79AB779DF4C12A5595DACDF3283F1',
  '7AB874097A1E8711A42FD845939A6E05',
  '8CBB62EBC873A38DB9E6EEF177AFC731',
  '446B5D94A71587E9BD4D325A4DF5F6F8',
  'EC84BD89BDBDF46B1FE5132DD53836E5',
  'A133D679691178F192D7E9DA06829506',
  '868E62F90DB8118C74CDC9F6BCA61157',
]

describe('repository-backed system scenario resources', () => {
  it.each(registeredScenarios.scenarios)('bundles registered $name under its formal scenario identity', async entry => {
    vi.stubEnv('DEV', false)
    const host = vi.fn(() => {throw Error('bundled repository scenarios must not query the development host')})
    vi.stubGlobal('fetch', host)
    const resource = entry.scope === 'public'
      ? getPublicScenarioResource('platformLogin')
      : resolveSystemScenarioResource(entry.scenarioId)
    expect(resource).toMatchObject({name: entry.name, scenarioId: entry.scenarioId, resourceId: entry.resourceId, path: entry.path})
    if (!resource) throw Error(`Missing repository scenario ${entry.name}`)
    const text = await readRepositoryScenarioText(resource, () => undefined)
    const config = new ScenarioViewConfig(entry.scenarioId, text)
    expect(config.scenarioId).toBe(entry.scenarioId)
    expect(host).not.toHaveBeenCalled()
    if (entry.scope === 'public') expect(resolveSystemScenarioResource(entry.scenarioId)).toBeNull()
  })

  it('refuses a registered scenario pointing to a file absent from the build', async () => {
    vi.stubEnv('DEV', false)
    const resource = resolveSystemScenarioResource(scenarioIds[0]!)!
    await expect(readRepositoryScenarioText({...resource, path: 'config/pages/unregistered/pagedata.json'}, () => undefined))
      .rejects.toThrow('REPOSITORY_RESOURCE_FILE_MISSING')
  })

  it.each([
    {label: 'malformed JSON', text: '{', message: /JSON/},
    {label: 'another scenario', text: '{"scenarioId":"OTHER","tables":{}}', message: /不属于当前场景/},
    {label: 'invalid tables', text: '{"scenarioId":"__SCENARIO__","tables":[]}', message: /tables/},
  ])('rejects host text with $label at the scenario config boundary', async ({text, message}) => {
    const scenarioId = scenarioIds[0]!
    const resource = resolveSystemScenarioResource(scenarioId)!
    await stubHostResponses([{resourceId: resource.resourceId, scenarioId, text}])
    const content = await readRepositoryScenarioText(resource, () => undefined)
    expect(() => new ScenarioViewConfig(scenarioId, content)).toThrow(message)
  })

  it.each(scenarioIds)('reads %s through the repository file DataView', async scenarioId => {
    const resource = resolveSystemScenarioResource(scenarioId)
    expect(resource).not.toBeNull()
    const text = readFileSync(resource!.path, 'utf8')
    await stubHostResponses([{resourceId: resource!.resourceId, scenarioId, text}])
    expect(await readRepositoryScenarioText(resource!, () => undefined)).toBe(text)
    expect(new ScenarioViewConfig(scenarioId, text).scenarioId).toBe(scenarioId)
  })

  it('fetches fresh host text for each repository DataView query', async () => {
    const resource = resolveSystemScenarioResource(scenarioIds[0]!)!
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
    expect(resolveSystemScenarioResource(scenarioIds[0]!)).not.toBeNull()
    expect(resolveSystemScenarioResource('UNREGISTERED')).toBeNull()
  })

  it('materializes __SCENARIO__ token for workflow repository pagedata', async () => {
    const scenarioId = '6E462C4A39EE0D96F4D1A28FFE887C89'
    const resource = resolveSystemScenarioResource(scenarioId)
    expect(resource).not.toBeNull()
    const raw = readFileSync(resource!.path, 'utf8')
    expect(raw).toContain('"scenarioId": "__SCENARIO__"')
    await stubHostResponses([{resourceId: resource!.resourceId, scenarioId, text: raw}])
    const text = await readRepositoryScenarioText(resource!, () => undefined)
    expect(JSON.parse(text).scenarioId).toBe(scenarioId)
    expect(new ScenarioViewConfig(scenarioId, text).scenarioId).toBe(scenarioId)
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
