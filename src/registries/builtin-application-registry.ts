import appworks from '../../config/applications/appworks.json'

export type BuiltinScenarioName = 'dataSpaceDesign' | 'dataSpaceCatalog' | 'dataDictionary' | 'projectBlueprint'
export type BuiltinScenarioResource = Readonly<{name: BuiltinScenarioName; scenarioId: string; resourceId: string; path: string}>
export type BuiltinNavigationResource = Readonly<{resourceId: string; path: string}>
export type BuiltinApplicationDescriptor = Readonly<{id: string; name: string; navigation: BuiltinNavigationResource}>

const applicationId = appworks.applicationId
const applicationDescriptor: BuiltinApplicationDescriptor = Object.freeze({id: appworks.applicationId,
  name: appworks.applicationName, navigation: Object.freeze({...appworks.navigationResource})})
const scenarios = new Map<string, BuiltinScenarioResource>()
const scenariosByName = new Map<BuiltinScenarioName, BuiltinScenarioResource>()
const paths = new Set<string>()
const requiredScenarioNames = new Set<BuiltinScenarioName>(['dataSpaceDesign', 'dataSpaceCatalog', 'dataDictionary', 'projectBlueprint'])
for (const resource of appworks.scenarioResources) {
  if (!isBuiltinScenarioName(resource.name)
    || !resource.scenarioId.trim() || resource.resourceId !== `repository:scenario-view:${resource.scenarioId}`
    || !resource.path.startsWith('config/pages/') || resource.path.includes('..') || paths.has(resource.path)
    || scenarios.has(resource.scenarioId) || scenariosByName.has(resource.name)) {
    throw new Error('BUILTIN_APPLICATION_CONFIG_INVALID: 场景资源身份或路径重复/无效')
  }
  const registered: BuiltinScenarioResource = {...resource, name: resource.name}
  paths.add(resource.path)
  scenarios.set(resource.scenarioId, Object.freeze(registered))
  scenariosByName.set(resource.name, Object.freeze(registered))
}
if (scenariosByName.size !== requiredScenarioNames.size
  || [...requiredScenarioNames].some(name => !scenariosByName.has(name))) {
  throw new Error('BUILTIN_APPLICATION_CONFIG_INVALID: AppWorks 四个系统场景必须全部登记')
}

function isBuiltinScenarioName(value: string): value is BuiltinScenarioName {
  return value === 'dataSpaceDesign' || value === 'dataSpaceCatalog' || value === 'dataDictionary' || value === 'projectBlueprint'
}

/** AppWorks system program configuration has one explicit repository source; dynamic applications remain remote. */
export function isBuiltinApplication(applicationIdInput: string): boolean {
  return applicationIdInput === applicationId
}

/** Resolve only the app identity and navigation resource declared by the repository manifest. */
export function getBuiltinApplicationDescriptor(): BuiltinApplicationDescriptor {
  return applicationDescriptor
}

/** Resolve a system program scenario by stable resource identity, without importing its content. */
export function getBuiltinScenarioResource(name: BuiltinScenarioName): BuiltinScenarioResource {
  const resource = scenariosByName.get(name)
  if (!resource) throw new Error(`BUILTIN_SCENARIO_SOURCE_MISSING: ${name} 未登记仓内场景资源`)
  return resource
}

/** Resolve only the four registered system program scenes; other IDs remain explicit business targets. */
export function resolveBuiltinScenarioResource(scenarioId: string): BuiltinScenarioResource | null {
  return scenarios.get(scenarioId.trim()) ?? null
}
