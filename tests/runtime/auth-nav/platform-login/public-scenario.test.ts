import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {PlatformAuthResource} from '@spark-appworks/spark-lowcode-api'
import {getPublicScenarioResource, resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {loadLowcodePublicScenario} from '@/lowcode/data-space/lowcode-public-scenario'
import {createPlatformAuthBindings} from '@/lowcode/resources/system/platform-auth/runtime-bindings'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

const resource = getPublicScenarioResource('platformLogin')
const text = readFileSync(resource.path, 'utf8')

afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks()})

async function stubHost(content: string) {
  vi.stubEnv('DEV', true)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  const sourceRevision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({resourceId: resource.resourceId,
    scenarioId: resource.scenarioId, text: content, sourceRevision}), {status: 200, headers: {'Content-Type': 'application/json'}}))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('platform login public scenario', () => {
  it('stays out of application and catalog scenario resolution', () => {
    expect(resource.path).toBe('config/pages/platform/login/pagedata.json')
    expect(resolveSystemScenarioResource(resource.scenarioId)).toBeNull()
  })

  it('assembles command and projection views from the repository file without server definitions', async () => {
    const fetchMock = await stubHost(text)
    const readSpace = vi.spyOn(lowcodeApi.dataSpace.design, 'readSpaceDefinition')
    vi.spyOn(lowcodeApi.platform, 'listEnterprises').mockResolvedValue([{id: 'E1', name: '领码科技', shortName: 'lingma', shortCode: 'LM'}])
    const dataSet = await loadLowcodePublicScenario({name: 'platformLogin', scenarioId: resource.scenarioId, assertCurrent: () => undefined})
    try {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(readSpace).not.toHaveBeenCalled()
      expect(Object.keys(dataSet.tables).sort()).toEqual(['EnterpriseCatalog', 'EnterpriseRegistrationRequest', 'LoginRequest', 'UserRegistrationRequest', 'VerificationCodeRequest'])
      const catalog = dataSet.getView('EnterpriseCatalog')!
      await catalog.refresh()
      expect(catalog.rows).toEqual([expect.objectContaining({id: 'E1', shortName: 'lingma'})])
      const login = dataSet.getView('LoginRequest')!
      await login.refresh()
      const row = await login.addRow({enterpriseName: 'lingma', account: 'alice', password: ''})
      await expect(dataSet.saveChanges({views: [{tableName: 'LoginRequest', viewId: 'default', ids: [login.getPkKey(row)!]}]})).rejects.toThrow('DATA_VIEW_SAVE_VALIDATION')
    } finally {dataSet.destroy()}
  })

  it('rejects a mismatched scenario identity before reading the file', async () => {
    const fetchMock = await stubHost(text)
    await expect(loadLowcodePublicScenario({name: 'platformLogin', scenarioId: 'OTHER', assertCurrent: () => undefined})).rejects.toThrow('PUBLIC_SCENARIO_IDENTITY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses model-bound tables in a public scenario', async () => {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || !('tables' in parsed) || typeof parsed.tables !== 'object' || parsed.tables === null) throw Error('bad fixture')
    const tables = {...parsed.tables, Base_User: {modelBinding: {modelId: 'M', modelName: 'Base_User'}, views: {default: {autoLoad: false}}}}
    await stubHost(JSON.stringify({...parsed, tables}))
    await expect(loadLowcodePublicScenario({name: 'platformLogin', scenarioId: resource.scenarioId, assertCurrent: () => undefined})).rejects.toThrow('PUBLIC_SCENARIO_TABLE')
  })

  it('binds only the declared platform auth resources', () => {
    const auth = new PlatformAuthResource({platform: lowcodeApi.platform, assertCurrent: () => undefined})
    const config = new ScenarioViewConfig(resource.scenarioId, text)
    const bindings = createPlatformAuthBindings({config, resource: auth, assertCurrent: () => undefined})
    expect(Object.keys(bindings.commandBindings).sort()).toEqual(['EnterpriseRegistrationRequest', 'LoginRequest', 'UserRegistrationRequest', 'VerificationCodeRequest'])
    expect(Object.keys(bindings.projectionBindings)).toEqual(['EnterpriseCatalog'])
    const altered = new ScenarioViewConfig(resource.scenarioId, text.replace('"platform:login"', '"platform:other"'))
    expect(() => createPlatformAuthBindings({config: altered, resource: auth, assertCurrent: () => undefined})).toThrow('PLATFORM_AUTH_BINDING')
  })
})
