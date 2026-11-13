/**
 * @module app:registries/system-scenario-registry
 * 职责：登记 AppWorks 系统页使用的仓内场景资源（pagedata），供任一应用及目录作用域按场景身份解析；另登记登录前公开场景。
 * 边界：只登记资源身份与路径，不携带应用身份、不复制场景正文；场景正文经 SPARK data 仓内文件 DataView 读取。
 * 公开场景（scope: public）不参与应用/目录作用域解析，只经公开装配入口取用。
 */
import systemScenarios from '../../config/pages/system-scenarios.json'

const systemScenarioNames = ['dataSpaceDesign', 'dataSpaceCatalog', 'dataDictionary', 'projectBlueprint', 'cacheManagement',
  'logicViewCatalog', 'apiProvider', 'apiConfig', 'apiInterface', 'dataCodeCatalog', 'dataCodeEditor', 'workflowCatalog', 'excelImportCatalog', 'pdfInspectCatalog',
  'excelImportEditor', 'workflowEditor', 'jsonDataCatalog', 'businessTableSelector', 'agentWorkflowFiles', 'organizationStructure', 'jobManagement', 'applicationManager', 'enterpriseRegistration',
  'bugManage', 'dataRecovery', 'flowMonitor', 'databaseRelations', 'dataMenu', 'dimensionDesign', 'dimensionLedger', 'fileManager', 'reportManagement'] as const
const publicScenarioNames = ['platformLogin'] as const
export type SystemScenarioName = typeof systemScenarioNames[number]
export type PublicScenarioName = typeof publicScenarioNames[number]
export type SystemScenarioResource = Readonly<{name: SystemScenarioName | PublicScenarioName; scenarioId: string; resourceId: string; path: string}>

const scenarios = new Map<string, SystemScenarioResource>()
const scenariosByName = new Map<string, SystemScenarioResource>()
const publicScenarioIds = new Set<string>()
const paths = new Set<string>()
const requiredSystemNames = new Set<string>(systemScenarioNames)
const requiredPublicNames = new Set<string>(publicScenarioNames)
for (const resource of systemScenarios.scenarios) {
  const isPublic = resource.scope === 'public'
  const name = scenarioName(resource.name, isPublic)
  if (!name || !resource.scenarioId.trim() || resource.resourceId !== `repository:scenario-view:${resource.scenarioId}`
    || !resource.path.startsWith('config/pages/') || resource.path.includes('..') || paths.has(resource.path)
    || scenarios.has(resource.scenarioId) || scenariosByName.has(name)) {
    throw new Error('SYSTEM_SCENARIO_CONFIG_INVALID: 场景资源身份或路径重复/无效')
  }
  const registered: SystemScenarioResource = Object.freeze({name, scenarioId: resource.scenarioId, resourceId: resource.resourceId, path: resource.path})
  paths.add(resource.path)
  scenarios.set(resource.scenarioId, registered)
  scenariosByName.set(name, registered)
  if (isPublic) publicScenarioIds.add(resource.scenarioId)
}
if (scenariosByName.size !== requiredSystemNames.size + requiredPublicNames.size
  || [...systemScenarioNames, ...publicScenarioNames].some(name => !scenariosByName.has(name))) {
  throw new Error('SYSTEM_SCENARIO_CONFIG_INVALID: 系统场景必须全部登记')
}

function isSystemScenarioName(value: string): value is SystemScenarioName {
  return requiredSystemNames.has(value)
}

function isPublicScenarioName(value: string): value is PublicScenarioName {
  return requiredPublicNames.has(value)
}

function scenarioName(value: string, isPublic: boolean): SystemScenarioResource['name'] | undefined {
  if (isPublic) return isPublicScenarioName(value) ? value : undefined
  return isSystemScenarioName(value) ? value : undefined
}

function registeredByName(name: string): SystemScenarioResource {
  const resource = scenariosByName.get(name)
  if (!resource) throw new Error(`SYSTEM_SCENARIO_SOURCE_MISSING: ${name} 未登记仓内场景资源`)
  return resource
}

/** 按稳定名称取系统场景资源，不读取正文。 */
export function getSystemScenarioResource(name: SystemScenarioName): SystemScenarioResource {
  return registeredByName(name)
}

/** 按稳定名称取登录前公开场景资源；只供公开装配入口使用。 */
export function getPublicScenarioResource(name: PublicScenarioName): SystemScenarioResource {
  return registeredByName(name)
}

/** 按场景身份解析已登记的系统场景；公开场景与其它 ID 都返回 null（后者属于应用自己的场景）。 */
export function resolveSystemScenarioResource(scenarioId: string): SystemScenarioResource | null {
  const id = scenarioId.trim()
  return publicScenarioIds.has(id) ? null : scenarios.get(id) ?? null
}
