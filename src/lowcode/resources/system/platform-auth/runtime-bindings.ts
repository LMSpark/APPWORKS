/**
 * @module app:lowcode/resources/system/platform-auth/runtime-bindings
 * 职责：为登录公开场景绑定企业目录投影与登录、注册、注册租户、发送验证码命令。
 * 边界：只核本次配置的表键与资源身份，执行全部交给 PlatformAuthResource；不创建表、草稿或页面 owner。
 */
import {PlatformAuthResource} from '@spark-appworks/spark-lowcode-api'
import type {DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'

type Input = Readonly<{config: ScenarioViewConfig; resource: PlatformAuthResource; assertCurrent: () => void}>
type CommandKey = 'login' | 'userRegistration' | 'enterpriseRegistration' | 'verificationCode'

const catalogTable = 'EnterpriseCatalog'
const commandTables: Readonly<Record<string, CommandKey>> = Object.freeze({
  LoginRequest: 'login',
  UserRegistrationRequest: 'userRegistration',
  EnterpriseRegistrationRequest: 'enterpriseRegistration',
  VerificationCodeRequest: 'verificationCode',
})

/** 配置须恰好声明上述五张表且资源身份一致；工厂执行时再核视图仍属本次场景实例。 */
export function createPlatformAuthBindings(input: Input): Required<Pick<LowcodeDataSpaceAssemblerInput, 'commandBindings' | 'projectionBindings'>> {
  const {config, resource, assertCurrent} = input
  const tables = config.toJSON()['tables']
  const declared = isRecord(tables) ? tables : {}
  const expected = [catalogTable, ...Object.keys(commandTables)]
  const sameTables = Object.keys(declared).length === expected.length && expected.every(name => Object.hasOwn(declared, name))
  const identity = (name: string, resourceType: string, resourceId: string): boolean => {
    const table = declared[name]
    return isRecord(table) && table['resourceType'] === resourceType && table['resourceId'] === resourceId && table['modelBinding'] === undefined
  }
  if (!sameTables || !identity(catalogTable, 'logical-view', PlatformAuthResource.resources.enterpriseCatalog)
    || Object.entries(commandTables).some(([name, key]) => !identity(name, 'command', PlatformAuthResource.resources[key]))) {
    throw new Error('PLATFORM_AUTH_BINDING: 登录场景的表或资源身份不符')
  }
  const own = (view: DataView, tableName: string): DataView => {
    assertCurrent()
    if (view.dataSet?.scenarioId !== config.scenarioId || view.viewId !== 'default' || view.dataTable?.tableName !== tableName) {
      throw new Error(`PLATFORM_AUTH_BINDING: ${tableName} 视图不属于本次登录场景`)
    }
    return view
  }
  return {
    projectionBindings: {[catalogTable]: view => resource.enterpriseCatalog(own(view, catalogTable))},
    commandBindings: Object.fromEntries(Object.entries(commandTables).map(([name, key]) => [name, (view: DataView) => resource[key](own(view, name))])),
  }
}
