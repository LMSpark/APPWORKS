/**
 * @module app:lowcode/data-space/lowcode-public-scenario
 * 职责：登录前公开场景的装配入口：经仓内文件 DataView 读取已登记的公开 pagedata，以同一装配器装配独立 DataSet。
 * 边界：只接受命令表与无模型只读投影表，不读取服务端空间、模型或关系，也不进入应用/目录作用域；页面释放后 assertCurrent 阻止迟到写回。
 */
import {PlatformAuthResource} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {getPublicScenarioResource, type PublicScenarioName} from '@/registries/system-scenario-registry'
import {lowcodeApi, lowcodeCatalogDataSpace, lowcodeHttp} from '../lowcode-runtime'
import {readRepositoryScenarioText} from '../resources/repository/scenarios/resource'
import {createPlatformAuthBindings} from '../resources/system/platform-auth/runtime-bindings'
import {LowcodeDataSpaceAssembler} from './lowcode-data-space-assembler'

/** name 定位公开场景登记；scenarioId 是 PageRuntime 本次请求的场景身份，二者须一致。 */
type LoadPublicScenarioInput = Readonly<{name: PublicScenarioName; scenarioId: string; assertCurrent: () => void}>

const publicBindings = {
  platformLogin: (config: ScenarioViewConfig, assertCurrent: () => void) => createPlatformAuthBindings({config, assertCurrent,
    resource: new PlatformAuthResource({platform: lowcodeApi.platform, assertCurrent})}),
} as const

export async function loadLowcodePublicScenario(input: LoadPublicScenarioInput): Promise<DataSet> {
  const {name, scenarioId, assertCurrent} = input
  const resource = getPublicScenarioResource(name)
  if (resource.scenarioId !== scenarioId) throw new Error(`PUBLIC_SCENARIO_IDENTITY: ${scenarioId} 不是公开场景 ${name}`)
  assertCurrent()
  const text = await readRepositoryScenarioText(resource, assertCurrent)
  assertCurrent()
  const config = new ScenarioViewConfig(scenarioId, text)
  const tables = config.toJSON()['tables']
  if (!isRecord(tables)) throw new Error('PUBLIC_SCENARIO_TABLES: 公开场景缺少 tables')
  for (const [tableName, table] of Object.entries(tables)) {
    const allowed = isRecord(table) && table['modelBinding'] === undefined
      && (table['resourceType'] === 'command' || table['resourceType'] === 'logical-view')
    if (!allowed) throw new Error(`PUBLIC_SCENARIO_TABLE: ${tableName} 公开场景只能声明命令或无模型只读投影`)
  }
  const bindings = publicBindings[name](config, assertCurrent)
  const result = new LowcodeDataSpaceAssembler(lowcodeCatalogDataSpace.runtime, lowcodeHttp)
    .assemble({config, space: {dataSpaceId: scenarioId, name: resource.name}, models: [], relations: [], ...bindings})
  if (result.diagnostics.length > 0) {
    result.dataSet.destroy()
    throw new Error(`PUBLIC_SCENARIO_INCOMPLETE: ${result.diagnostics.join('；')}`)
  }
  return result.dataSet
}
