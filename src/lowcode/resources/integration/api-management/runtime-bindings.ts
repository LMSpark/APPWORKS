/**
 * @module app:lowcode/resources/integration/api-management/runtime-bindings
 * 职责：为接口配置正式场景的首次装配绑定“调用已登记接口”命令，接口与输入参数视图取自同一DataSet。
 * 边界：只核本次配置与正式模型身份，不创建表、查询、草稿或页面owner。
 */
import {RegisteredInterfaceCallResource} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'

const scenarioId='EC84BD89BDBDF46B1FE5132DD53836E5',commandTable='InterfaceCallRequest'
const models={interfaces:{modelId:`${scenarioId}p001`,modelName:'Base_DataServiceInterface'},parameters:{modelId:`${scenarioId}p006`,modelName:'_Base_ParamList'}} as const
type Input=Readonly<{config:ScenarioViewConfig;http:HttpClientBase
 readScope:ConstructorParameters<typeof RegisteredInterfaceCallResource>[0]['readScope'];assertCurrent:()=>void}>
/** 非接口配置场景返回空绑定；命令factory执行时才从原DataSet解析接口与输入参数视图。 */
export function createApiInterfaceBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'commandBindings'>{
 if(input.config.scenarioId!==scenarioId)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables']
 for(const model of Object.values(models)){
  const table=isRecord(tables)?tables[model.modelName]:undefined,binding=isRecord(table)?table['modelBinding']:undefined
  if(!isRecord(binding)||binding['modelId']!==model.modelId||binding['modelName']!==model.modelName)throw Error(`API_INTERFACE_BINDING: ${model.modelName}正式身份不符`)
 }
 const command=isRecord(tables)?tables[commandTable]:undefined
 if(!isRecord(command)||command['resourceType']!=='command'||command['resourceId']!==RegisteredInterfaceCallResource.resourceId)throw Error('API_INTERFACE_BINDING: 接口调用命令资源身份不符')
 return{commandBindings:{[commandTable]:view=>{
  input.assertCurrent()
  const ds=view.dataSet,interfaces=ds?.getView(models.interfaces.modelName,'default'),parameters=ds?.getView(models.parameters.modelName,'default')
  if(ds?.scenarioId!==scenarioId||view.viewId!=='default'||view.dataTable?.tableName!==commandTable||!interfaces||!parameters
   ||interfaces.dataTable?.modelBinding?.modelId!==models.interfaces.modelId||parameters.dataTable?.modelBinding?.modelId!==models.parameters.modelId)throw Error('API_INTERFACE_BINDING: 接口调用命令缺少同实例接口视图')
  return new RegisteredInterfaceCallResource({interfaces,parameters,http:input.http,readScope:input.readScope,assertCurrent:input.assertCurrent}).binding(view)
 }}}
}
