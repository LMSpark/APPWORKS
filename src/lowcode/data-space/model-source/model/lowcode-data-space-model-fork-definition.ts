/**
 * @module lowcode/data-space/model-source/model/lowcode-data-space-model-fork-definition
 * 职责：正式模型fork的只读定义投影，复用注册名改名的结构化引用规则。
 * 边界：调用方负责原查询完整性和可读权限；不创建记录，不复制身份、归属、凭据或系统维护值。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceFilterMigration} from '../migration/lowcode-data-space-filter-migration'
import {LowcodeDataSpaceModelNameProjection} from '../rename/lowcode-data-space-model-name-projection'
type Row=Readonly<Record<string,unknown>>
type Input=Readonly<{dataSpaceId:string;modelId:string;name:string;models:readonly Row[];model:Row;fields:readonly Row[]}>
const maintained=new Set(['rowid','datasetid','datamodelid','createuser','createtime','updateuser','updatetime','wfid','flowstate','reportid','_pk'])
/** 正式定义复制边界，不包含原身份、查询凭据及自动维护成员。 */
export function isModelForkBusinessMember(key:string):boolean{const normalized=key.toLowerCase();return !maintained.has(normalized)&&!normalized.startsWith('lingma_sys_')}
function copy(row:Row):Record<string,unknown>{return structuredClone(Object.fromEntries(Object.entries(row).filter(([key])=>isModelForkBusinessMember(key))))}
/** 返回不可编辑的创建值与原字段顺序，真正新身份仍由原DataView.addRow生成。 */
export class LowcodeDataSpaceModelForkDefinition{
 static prepare(input:Input):{model:Readonly<Record<string,unknown>>;fields:ReadonlyArray<Readonly<Record<string,unknown>>>;sourceFieldIds:readonly string[]}{
  const {dataSpaceId,modelId,name,model,models,fields}=input,oldName=model['Name']
  if(!dataSpaceId.trim()||!modelId.trim()||model['rowid']!==modelId||model['dataSetId']!==dataSpaceId||typeof oldName!=='string'||!oldName||typeof name!=='string'||!name.trim()||name!==name.trim()||name.includes('@')||name.startsWith('#'))throw Error('原模型或隔离模型注册身份无效')
  const names=new Set<string>(),ids=new Set<string>()
  for(const row of models){const key=row['rowid'],registered=row['Name'];if(row['dataSetId']!==dataSpaceId||typeof key!=='string'||!key||ids.has(key)||typeof registered!=='string'||!registered||names.has(registered))throw Error('正式模型目录身份或注册名不唯一');ids.add(key);names.add(registered)}
  if(!ids.has(modelId)||names.has(name))throw Error('原模型不存在或隔离模型注册名已存在')
  if(models.some(row=>row['rowid']!==modelId&&typeof row['Name']==='string'&&[oldName,name].some(qualifier=>String(row['Name']).startsWith(`${qualifier}.`)||qualifier.startsWith(`${row['Name']}.`))))throw Error('原名或隔离注册名存在重叠限定名，须先完整核定其他候选模型字段，不能按部分字段猜测自引用')
  const fieldIds=new Set<string>(),fieldNames=new Set<string>()
  for(const row of fields){const key=row['rowid'],fieldName=row['Name'],kind=row['type'],identity=JSON.stringify([kind,fieldName]);if(typeof key!=='string'||!key||key.startsWith('new:')||fieldIds.has(key)||row['dataSetId']!==dataSpaceId||row['dataModelId']!==modelId||typeof fieldName!=='string'||!fieldName||!['dataModel','inputParams'].includes(String(kind))||fieldNames.has(identity))throw Error('原模型字段身份、用途或归属无效');fieldIds.add(key);fieldNames.add(identity)}
  const references=new LowcodeDataSpaceModelNameProjection({models,fields,previousName:oldName,nextName:name}),result=copy(model)
  delete result['Name']
  for(const property of ['Filter','JoinFilter']){const before=model[property];if(before===undefined||before===null||before==='')continue;if(typeof before!=='string')throw Error(`原${property}不是文本`);result[property]=LowcodeDataSpaceFilterMigration.rewrite(before,value=>references.field(value,modelId,property==='JoinFilter'?[model['MetaName']]:[]),value=>references.value(value,modelId,property==='JoinFilter'?[model['MetaName']]:[]))}
  references.assertOpaque(model['RequestComplete'],'原模型RequestComplete')
  for(const property of ['addApi','updateApi','deleteApi'])if(result[property]===oldName)result[property]=name
  const copied=fields.map(row=>{
   const field=copy(row),before=row['ValueFun']
   if(before!==undefined&&before!==null&&before!==''){
    if(typeof before!=='string')throw Error('原字段ValueFun不是文本')
    DataSpaceDesignApi.parseValueFunction(before);const raw:unknown=JSON.parse(before)
    if(!isRecord(raw))throw Error('原字段ValueFun不是正式对象')
    if(!(raw['Type']==='GetRefData'&&row['type']==='dataModel')){const next=references.value(raw,modelId);if(JSON.stringify(next)!==JSON.stringify(raw)){const text=JSON.stringify(next);DataSpaceDesignApi.parseValueFunction(text);field['ValueFun']=text}}
   }
   return field
  })
  return{model:result,fields:copied,sourceFieldIds:[...fieldIds]}
 }
}
