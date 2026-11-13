/**
 * @module app:lowcode/resources/system/enterprise-registration/runtime-bindings
 * 职责：为入驻管理正式场景的首次装配绑定企业初始化命令，列表与回读视图取自同一DataSet。
 * 边界：只核本次配置与正式模型身份，不创建表、查询、草稿或页面owner。
 */
import {EnterpriseInitializationResource} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'

const scenarioId='5914FF981A7DF228ED88BBDB71353470',commandTable='EnterpriseInitializationRequest'
const enterprise={modelId:'fd8f5854-4169-4597-9d8e-80f3bbe54e73',modelName:'Base_Enterprise_Info'} as const
type Input=Readonly<{config:ScenarioViewConfig;http:HttpClientBase
 readScope:ConstructorParameters<typeof EnterpriseInitializationResource>[0]['readScope'];assertCurrent:()=>void}>
/** 非入驻场景返回空绑定；命令factory执行时才从原DataSet解析列表与回读视图。 */
export function createEnterpriseRegistrationBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'commandBindings'>{
 if(input.config.scenarioId!==scenarioId)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables']
 const table=isRecord(tables)?tables[enterprise.modelName]:undefined,binding=isRecord(table)?table['modelBinding']:undefined
 if(!isRecord(binding)||binding['modelId']!==enterprise.modelId||binding['modelName']!==enterprise.modelName)throw Error('ENTERPRISE_REGISTRATION_BINDING: 企业模型正式身份不符')
 const command=isRecord(tables)?tables[commandTable]:undefined
 if(!isRecord(command)||command['resourceType']!=='command'||command['resourceId']!==EnterpriseInitializationResource.resourceId)throw Error('ENTERPRISE_REGISTRATION_BINDING: 初始化命令资源身份不符')
 return{commandBindings:{[commandTable]:view=>{
  input.assertCurrent()
  const ds=view.dataSet,list=ds?.getView(enterprise.modelName,'default'),readback=ds?.getView(enterprise.modelName,'initializationReadback')
  if(ds?.scenarioId!==scenarioId||view.viewId!=='default'||view.dataTable?.tableName!==commandTable||!list||!readback
   ||list.dataTable?.modelBinding?.modelId!==enterprise.modelId||list.dataTable.modelBinding.modelName!==enterprise.modelName)throw Error('ENTERPRISE_REGISTRATION_BINDING: 初始化命令缺少同实例企业视图')
  return new EnterpriseInitializationResource({list,readback,http:input.http,readScope:input.readScope,assertCurrent:input.assertCurrent}).binding(view)
 }}}
}
