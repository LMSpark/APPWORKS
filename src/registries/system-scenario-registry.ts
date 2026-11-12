/**
 * @module app:registries/system-scenario-registry
 * 职责：登记 AppWorks 系统页使用的仓内场景资源（pagedata），供任一应用及目录作用域按场景身份解析。
 * 边界：只登记资源身份与路径，不携带应用身份、不复制场景正文；场景正文经 SPARK data 仓内文件 DataView 读取。
 */
import systemScenarios from '../../config/pages/system-scenarios.json'

const systemScenarioNames = ['dataSpaceDesign', 'dataSpaceCatalog', 'dataDictionary', 'projectBlueprint', 'cacheManagement',
  'logicViewCatalog', 'apiProvider', 'apiConfig', 'apiInterface', 'dataCodeCatalog', 'dataCodeEditor', 'workflowCatalog', 'excelImportCatalog', 'pdfInspectCatalog',
  'excelImportEditor', 'workflowEditor', 'jsonDataCatalog', 'businessTableSelector', 'agentWorkflowFiles', 'organizationStructure', 'jobManagement', 'applicationManager',
  'bugManage', 'dataRecovery', 'flowMonitor', 'databaseRelations', 'dataMenu', 'dimensionDesign', 'dimensionLedger', 'fileManager', 'reportManagement'] as const
export type SystemScenarioName = typeof systemScenarioNames[number]
export type SystemScenarioResource = Readonly<{name: SystemScenarioName; scenarioId: string; resourceId: string; path: string}>

const scenarios = new Map<string, SystemScenarioResource>()
const scenariosByName = new Map<SystemScenarioName, SystemScenarioResource>()
const paths = new Set<string>()
const requiredScenarioNames = new Set<string>(systemScenarioNames)
for (const resource of systemScenarios.scenarios) {
  if (!isSystemScenarioName(resource.name)
    || !resource.scenarioId.trim() || resource.resourceId !== `repository:scenario-view:${resource.scenarioId}`
    || !resource.path.startsWith('config/pages/') || resource.path.includes('..') || paths.has(resource.path)
    || scenarios.has(resource.scenarioId) || scenariosByName.has(resource.name)) {
    throw new Error('SYSTEM_SCENARIO_CONFIG_INVALID: 场景资源身份或路径重复/无效')
  }
  const registered: SystemScenarioResource = Object.freeze({...resource, name: resource.name})
  paths.add(resource.path)
  scenarios.set(resource.scenarioId, registered)
  scenariosByName.set(resource.name, registered)
}
if (scenariosByName.size !== requiredScenarioNames.size || systemScenarioNames.some(name => !scenariosByName.has(name))) {
  throw new Error('SYSTEM_SCENARIO_CONFIG_INVALID: 系统场景必须全部登记')
}

function isSystemScenarioName(value: string): value is SystemScenarioName {
  return requiredScenarioNames.has(value)
}

/** 按稳定名称取系统场景资源，不读取正文。 */
export function getSystemScenarioResource(name: SystemScenarioName): SystemScenarioResource {
  const resource = scenariosByName.get(name)
  if (!resource) throw new Error(`SYSTEM_SCENARIO_SOURCE_MISSING: ${name} 未登记仓内场景资源`)
  return resource
}

/** 按场景身份解析已登记的系统场景；其它 ID 属于应用自己的场景。 */
export function resolveSystemScenarioResource(scenarioId: string): SystemScenarioResource | null {
  return scenarios.get(scenarioId.trim()) ?? null
}
