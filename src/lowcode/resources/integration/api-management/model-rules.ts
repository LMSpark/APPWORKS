/**
 * @module app:lowcode/resources/integration/api-management/model-rules
 * 职责：在正式场景装配时注册API输出与公共参数领域约束，所有命名视图和保存入口共用。
 * 边界：不保存、不持有草稿、不装配第二数据空间；跨空间引用只沿原PageRuntime按需加载。
 */
import type {DataSet,DataRow,DataTableQueryReferenceChange,DataTableQuerySaveReferences,DataTableQuerySaveRuleGroup} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {apiAnd,apiEqual,apiDefinitionTable,readApiDefinitionRows} from './queries'
const API='EC84BD89BDBDF46B1FE5132DD53836E5',CONFIG='446B5D94A71587E9BD4D325A4DF5F6F8',METADATA='8D1AB14DD8277F3E7017CD38F77B09FD'
const OUTPUT='Base_TblField',PUBLIC='Base_Interface_PublicParam',INTERFACE='Base_DataServiceInterface'
const outputFields=['tblid','enname','DataType','IsPKey'],parameterFields=['providerId','paramName','interfaceId','outputfield','interfaceName','accessPath']
/** 本次装配的宿主访问；省略宿主不能跳过需要跨空间证明的约束。 */
export type ApiModelRuleHost=Readonly<{
 /** 返回本次固定的原PageRuntime；注册时不读取，破坏性校验按需取其8D空间。 */
 getPage?:()=>PageRuntime|undefined
 /** 原装配捕获的执行范围守卫；每次引用读取前后核验。 */
 assertCurrent?:()=>void
}>
function text(value:unknown,name:string):string{
 if(typeof value==='string'&&value.length>0&&value===value.trim())return value
 throw Error(`API_DEFINITION_VALUE: ${name}必须是无首尾空白的非空文本`)
}
function scope(dataSet:DataSet,host:ApiModelRuleHost){
 const view=(name:string)=>apiDefinitionTable(dataSet,name)?.getView('default')
 const original=view(PUBLIC),interfaces=view(INTERFACE),output=view(OUTPUT)
 const identity=()=>JSON.stringify([original?.queryContext,interfaces?.queryContext,...[PUBLIC,INTERFACE,OUTPUT].map(name=>apiDefinitionTable(dataSet,name)?.modelBinding)])
 const signature=identity()
 const check=()=>{host.assertCurrent?.();if(dataSet.destroyed||view(PUBLIC)!==original||view(INTERFACE)!==interfaces||view(OUTPUT)!==output||identity()!==signature)throw Error('API_REFERENCE_STALE: 原接口定义范围已变化')}
 check();return check
}
function provider(dataSet:DataSet):string{return text(apiDefinitionTable(dataSet,PUBLIC)?.getView('default')?.queryContext['providerId']??apiDefinitionTable(dataSet,INTERFACE)?.getView('default')?.queryContext['providerId'],'providerId')}
function applyChanges(before:DataRow[],changes:readonly DataTableQueryReferenceChange[],fields:readonly string[]):DataRow[]{
 const after=[...before]
 for(const change of changes){
  const matches=before.filter(row=>change.matchesKey(row['rowid'])),row=matches[0]
  if(change.kind==='create'){
   if(matches.length)throw Error('API_REFERENCE_IDENTITY: 新增身份已存在')
   after.push({...change.values})
  }else{
   if(matches.length!==1||!row||!change.originalValues||fields.some(field=>row[field]!==change.originalValues?.[field]))throw Error('API_REFERENCE_BASELINE: 正式原值已变化，请重新读取')
   const index=after.indexOf(row)
   if(change.kind==='delete')after.splice(index,1)
   else after[index]={...row,...change.values}
  }
 }
 return after
}
async function readEndpointDefinition(input:Readonly<{dataSet:DataSet;id:string;providerId:string;check():void}>){
 const {dataSet,id,providerId,check}=input
 const rows=await readApiDefinitionRows({dataSet,modelName:INTERFACE,fields:['rowid','ProviderID','Name','LinkUrl'],filter:apiAnd(apiEqual('rowid',id),apiEqual('ProviderID',providerId)),check}),row=rows[0]
 if(rows.length!==1||row?.['rowid'] !== id||row['ProviderID']!==providerId)throw Error('API_REFERENCE_INTERFACE: 所属接口不存在或不属于当前服务')
 return row
}
function outputReferences(dataSet:DataSet,host:ApiModelRuleHost):DataTableQuerySaveReferences{
 return{fields:outputFields,triggerFields:outputFields,validate:async({changes})=>{
  const check=scope(dataSet,host),providerId=provider(dataSet),destructive=changes.some(change=>change.kind!=='create')
  const page=destructive?host.getPage?.():undefined
  const scenarioId=text(dataSet.scenarioId,'scenarioId')
  if(destructive&&(page?.getDataSet(scenarioId) !== dataSet))throw Error('API_OUTPUT_HOST_REQUIRED: 破坏性修改须由原页面核验跨空间消费者')
  const guard=()=>{check();if(destructive&&(host.getPage?.()!==page||page?.getDataSet(scenarioId)!==dataSet))throw Error('API_REFERENCE_STALE: 原接口页面已变化')}
  const groups=new Map<string,DataTableQueryReferenceChange[]>()
  for(const change of changes){const id=text(change.values['tblid'],'tblid');if(change.originalValues&&change.originalValues['tblid']!==id)throw Error('API_OUTPUT_OWNER: 输出不能移动到其它接口');const group=groups.get(id)??[];group.push(change);groups.set(id,group)}
  for(const [id,group]of groups){
   const iface=await readEndpointDefinition({dataSet,id,providerId,check:guard})
   const before=await readApiDefinitionRows({dataSet,modelName:OUTPUT,fields:['rowid',...outputFields],filter:apiEqual('tblid',id),check:guard})
   if(before.some(row=>row['tblid']!==id))throw Error('API_OUTPUT_OWNER: 输出查询超出所属接口')
   const after=applyChanges(before,group,outputFields),names=new Set<string>()
   for(const row of after){const name=text(row['enname'],'enname').toLowerCase();if(names.has(name))throw Error('API_OUTPUT_DUPLICATE: 输出名称不区分大小写重复');names.add(name)}
   if(group.some(change=>change.kind!=='create')){
    const affected=group.filter(change=>change.kind!=='create').map(change=>text(change.originalValues?.['enname'],'原输出名'))
    const refs=await readApiDefinitionRows({dataSet,modelName:PUBLIC,fields:['rowid','providerId','interfaceId','outputfield'],filter:apiAnd(apiEqual('providerId',providerId),apiEqual('interfaceId',id)),check:guard})
    if(refs.some(row=>row['providerId']!==providerId||row['interfaceId']!==id))throw Error('API_REFERENCE_SCOPE: 公共参数查询超出当前接口')
    if(refs.some(row=>affected.includes(String(row['outputfield']))))throw Error('API_OUTPUT_REFERENCED: 输出仍被正式公共参数引用')
    if(!page)throw Error('API_OUTPUT_HOST_REQUIRED: 缺少原页面宿主')
    const metadata=await page.ensureScenarioLoaded(METADATA);guard()
    const metadataGuard=()=>{guard();if(page.getDataSet(METADATA)!==metadata||metadata.destroyed)throw Error('API_REFERENCE_STALE: 原元数据空间已变化')}
    const models=await readApiDefinitionRows({dataSet:metadata,modelName:'Base_DataModel',fields:['rowid','Type','DbId','MetaName'],filter:apiAnd(apiEqual('Type','接口'),apiEqual('DbId',providerId),apiEqual('MetaName',text(iface['Name'],'接口名称'))),check:metadataGuard})
    if(models.length)throw Error('API_OUTPUT_REFERENCED: 接口已有正式模型消费者，不能破坏输出定义')
   }
  }
 }}
}
function parameterReferences(dataSet:DataSet,host:ApiModelRuleHost):DataTableQuerySaveReferences{
 return{fields:parameterFields,triggerFields:parameterFields,operations:['create','update'],validate:async({changes})=>{
  const check=scope(dataSet,host),providerId=provider(dataSet)
  for(const change of changes){
   if(change.values['providerId']!==providerId||change.originalValues&&(change.originalValues['providerId']!==providerId||change.originalValues['paramName']!==change.values['paramName']))throw Error('API_PARAMETER_IDENTITY: 不能改变所属服务或已有参数名称')
  }
  const before=await readApiDefinitionRows({dataSet,modelName:PUBLIC,fields:['rowid',...parameterFields],filter:apiEqual('providerId',providerId),check})
  if(before.some(row=>row['providerId']!==providerId))throw Error('API_REFERENCE_SCOPE: 公共参数查询超出当前服务')
  const after=applyChanges(before,changes,parameterFields),names=new Set<string>()
  for(const row of after){const name=text(row['paramName'],'paramName');if(names.has(name))throw Error('API_PARAMETER_DUPLICATE: 同服务参数名称重复');names.add(name)}
  for(const change of changes){
   const id=text(change.values['interfaceId'],'interfaceId'),name=text(change.values['outputfield'],'outputfield'),iface=await readEndpointDefinition({dataSet,id,providerId,check})
   const outputs=await readApiDefinitionRows({dataSet,modelName:OUTPUT,fields:['rowid','tblid','enname'],filter:apiAnd(apiEqual('tblid',id),apiEqual('enname',name)),check})
   if(outputs.length!==1||outputs[0]?.['tblid']!==id||outputs[0]['enname']!==name)throw Error('API_PARAMETER_OUTPUT: 正式输出不存在或不唯一')
   if(change.values['interfaceName']!==iface['Name']||change.values['accessPath']!==iface['LinkUrl'])throw Error('API_PARAMETER_DERIVED: 接口名称及路径必须来自当前正式接口')
  }
 }}
}
/** 仅注册当前场景的既有正式模型；不加载额外模型或查询引用。 */
export function registerApiModelRules(dataSet:DataSet,host:ApiModelRuleHost={}):void{
 if(dataSet.scenarioId!==API&&dataSet.scenarioId!==CONFIG)return
 const bind=(name:string,id:string)=>{
  const matches=Object.values(dataSet.tables).filter(table=>table.modelBinding?.modelName===name||table.modelBinding?.modelId===id),table=matches[0]
  if(matches.length>1||table&&(table.modelBinding?.modelName!==name||table.modelBinding.modelId!==id))throw Error(`API_MODEL_IDENTITY: ${name}正式模型不匹配或不唯一`)
  return table
 }
 const table=bind(OUTPUT,dataSet.scenarioId===API?`${API}p009`:`${CONFIG}p006`)
 const groups:DataTableQuerySaveRuleGroup[]=[]
 if(dataSet.scenarioId===CONFIG){
  groups.push({fields:['tblid'],validate:({created})=>{if(created)throw Error('API_OUTPUT_OPTION_CREATE: 此场景仅供选择既有接口输出，新增请从接口输出维护入口进行');return undefined}})
  groups.push({fields:['DataType'],validate:()=>{throw Error('API_OUTPUT_OPTION_TYPE: 此场景未承接类型选项合同，请从接口输出维护入口修改类型')}})
 }
 groups.push({fields:outputFields,validate:({values})=>{
   text(values['tblid'],'tblid');text(values['enname'],'enname');text(values['DataType'],'DataType')
   if(values['IsPKey']!==0&&values['IsPKey']!==1)throw Error('API_OUTPUT_PRIMARY: 主键标记必须显式为0或1')
   return undefined
  },references:outputReferences(dataSet,host)})
 table?.setQuerySaveRule({groups})
 bind(PUBLIC,dataSet.scenarioId===API?`${API}p005`:`${CONFIG}p002`)?.setQuerySaveRule({groups:[
  {fields:['providerId'],validate:()=>undefined,references:{fields:['providerId'],triggerFields:[],operations:['delete'],validate:()=>Promise.reject(Error('API_PARAMETER_DELETE: 公共参数不允许从此模型删除'))}},
  {fields:parameterFields,validate:({values})=>{for(const key of parameterFields)text(values[key],key);return undefined},references:parameterReferences(dataSet,host)},
 ]})
}
