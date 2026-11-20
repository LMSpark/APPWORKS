/**
 * @module app:lowcode/data-space/model-source/model/lowcode-data-space-model-fork-graph
 * 职责：核定关系连通分量及完整隔离身份映射，复用原fork和改名投影生成创建值。
 * 边界：只读正式定义投影；新ID须由原DataView分配，不创建记录或持有可编辑草稿。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceModelForkDefinition,isModelForkBusinessMember} from './lowcode-data-space-model-fork-definition'
import {LowcodeDataSpaceModelNameProjection} from '../rename/lowcode-data-space-model-name-projection'
import {LowcodeDataSpaceFilterMigration} from '../migration/lowcode-data-space-filter-migration'

type Row=Readonly<Record<string,unknown>>
type ScopeInput=Readonly<{dataSpaceId:string;modelId:string;models:readonly Row[];relations:readonly Row[];nodeIds:readonly string[]}>
type Binding=Readonly<{from:string;to:string;name:string}>
type Input=ScopeInput&Readonly<{fields:readonly Row[];bindings:readonly Binding[]}>
type Projection=Readonly<{from:string;value:Row}>
function identity(row:Row,key:string):string{const value=row[key];if(typeof value!=='string'||!value.trim())throw Error(`隔离定义身份缺失：${key}`);return value}
function business(row:Row):Record<string,unknown>{return structuredClone(Object.fromEntries(Object.entries(row).filter(([key])=>isModelForkBusinessMember(key))))}

/** 原图与副本图完全分离；节点条件不属于模型关系图。 */
export class LowcodeDataSpaceModelForkGraph{
 /** 创建前展示全部关联模型的新注册名；不预分配正式身份、不产生草稿。 */
 static registrations(input:ScopeInput&Readonly<{name:string}>):{models:Array<{from:string;name:string;previousName:string}>;relationCount:number}{
  const scope=this.scope(input),models=scope.modelIds.map(from=>{const source=input.models.find(row=>row['rowid']===from);if(!source)throw Error('隔离原模型缺失');const previousName=identity(source,'Name');return{from,previousName,name:from===input.modelId?input.name:`${input.name}__${previousName}`}})
  if(models.some(plan=>!plan.name.trim()||plan.name!==plan.name.trim()||plan.name.includes('@')||plan.name.startsWith('#')||input.models.some(row=>row['Name']===plan.name))||new Set(models.map(plan=>plan.name)).size!==models.length)throw Error('隔离模型注册名无效或已存在')
  return{models,relationCount:scope.relationIds.length}
 }
 /** 双向闭包同时涵盖入边与出边，按正式目录顺序输出，环及自关系不重复。 */
 static scope(input:ScopeInput):{modelIds:string[];relationIds:string[]}{
  if(!input.dataSpaceId.trim())throw Error('隔离空间身份缺失')
  const names=new Set<string>(),ids=new Set<string>(),nodeIds=new Set(input.nodeIds)
  for(const row of input.models){const id=identity(row,'rowid'),name=identity(row,'Name');if(row['dataSetId']!==input.dataSpaceId||ids.has(id)||names.has(name))throw Error('隔离正式模型目录不唯一或跨空间');if(nodeIds.has(id))throw Error('模型与节点身份重叠');ids.add(id);names.add(name)}
  if(!ids.has(input.modelId))throw Error('隔离目标模型不存在')
  const relationIds=new Set<string>(),modelRelations:Row[]=[]
  for(const row of input.relations){const id=identity(row,'rowid'),parent=identity(row,'parentModId'),child=identity(row,'childModId');if(row['dataSetId']!==input.dataSpaceId||relationIds.has(id))throw Error('隔离关系身份不唯一或跨空间');relationIds.add(id)
   if(ids.has(parent)&&ids.has(child))modelRelations.push(row)
   else if(!nodeIds.has(parent)||!nodeIds.has(child))throw Error(`隔离关系端点混合或孤立：${id}`)
  }
  const links=modelRelations.map(row=>[identity(row,'parentModId'),identity(row,'childModId')] as const)
  for(const row of input.models){const parent=row['PId'];if(parent===undefined||parent===null||parent==='')continue;const matches=input.models.filter(model=>model['Name']===parent);if(typeof parent!=='string'||matches.length!==1||!matches[0])throw Error('隔离父模型注册名无法核定');links.push([identity(matches[0],'rowid'),identity(row,'rowid')])}
  const selected=new Set([input.modelId]);let changed=true
  while(changed){changed=false;for(const [parent,child] of links)if(selected.has(parent)||selected.has(child)){for(const id of [parent,child])if(!selected.has(id)){selected.add(id);changed=true}}}
  return{modelIds:input.models.map(row=>identity(row,'rowid')).filter(id=>selected.has(id)),relationIds:modelRelations.filter(row=>selected.has(identity(row,'parentModId'))).map(row=>identity(row,'rowid'))}
 }
 /** 映射必须精确覆盖分量；调用方分配的新ID只用于准备值，提交仍由原数据层完成。 */
 static prepare(input:Input):{models:Projection[];fields:Projection[];relations:Projection[]}{
  const scope=this.scope(input),selected=new Set(scope.modelIds),byId=new Map<string,Binding>(),newIds=new Set<string>(),newNames=new Set<string>()
  for(const binding of input.bindings){if(!selected.has(binding.from)||byId.has(binding.from)||!binding.to.trim()||input.models.some(row=>row['rowid']===binding.to)||newIds.has(binding.to)||newNames.has(binding.name)||input.models.some(row=>row['Name']===binding.name))throw Error('隔离身份映射不完整、重复或与原目录冲突');byId.set(binding.from,binding);newIds.add(binding.to);newNames.add(binding.name)}
  if(byId.size!==selected.size)throw Error('隔离身份映射未完整覆盖关系分量')
  const fieldIds=new Set<string>()
  for(const row of input.fields){const id=identity(row,'rowid');if(fieldIds.has(id)||row['dataSetId']!==input.dataSpaceId||!input.models.some(model=>model['rowid']===row['dataModelId']))throw Error('隔离字段身份重复、跨空间或所属模型缺失');fieldIds.add(id)}
  const nextModels=input.models.map(row=>({...row,Name:byId.get(identity(row,'rowid'))?.name??row['Name']}))
  const projections=input.bindings.map(binding=>{const model=input.models.find(row=>row['rowid']===binding.from);if(!model)throw Error('隔离原模型已缺失');return new LowcodeDataSpaceModelNameProjection({models:input.models,fields:input.fields,previousName:identity(model,'Name'),nextName:binding.name,nextModels})})
  const rewrite=(before:unknown,owner:string,options:Readonly<{preserved?:readonly unknown[];functionOwner?:string}>={})=>{
   const preserved=options.preserved??[],functionOwner=options.functionOwner??owner
   if(before===undefined||before===null||before==='')return before
   if(typeof before!=='string')throw Error('隔离过滤定义不是文本')
   return projections.reduce((text,projection)=>LowcodeDataSpaceFilterMigration.rewrite(text,value=>projection.field(value,owner,preserved),value=>projection.value(value,functionOwner,preserved)),before)
  }
  const models:Projection[]=[],fields:Projection[]=[],relations:Projection[]=[]
  for(const modelId of scope.modelIds){const model=input.models.find(row=>row['rowid']===modelId),binding=byId.get(modelId),ownFields=input.fields.filter(row=>row['dataModelId']===modelId)
   if(!model||!binding)throw Error('隔离原模型或映射已缺失')
   const prepared=LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:input.dataSpaceId,modelId,name:binding.name,models:input.models,model,fields:ownFields}),value:Record<string,unknown>={...prepared.model,rowid:binding.to,dataSetId:input.dataSpaceId,Name:binding.name}
   for(const property of ['Filter','JoinFilter'])value[property]=rewrite(model[property],modelId,{preserved:property==='JoinFilter'?[model['MetaName']]:[]})
   for(const projection of projections)projection.assertOpaque(model['RequestComplete'],'隔离模型RequestComplete')
   for(const property of ['addApi','updateApi','deleteApi']){const referenced=input.models.find(row=>row['Name']===model[property]);if(referenced){const renamed=byId.get(String(referenced['rowid']));if(renamed)value[property]=renamed.name}}
   if(typeof model['PId']==='string'&&model['PId']){const parent=input.models.find(row=>row['Name']===model['PId']),mapped=parent?byId.get(identity(parent,'rowid')):undefined;if(!mapped)throw Error('隔离父模型映射缺失');value['PId']=mapped.name}
   models.push({from:modelId,value})
   ownFields.forEach((row,index)=>{const field:Record<string,unknown>={...prepared.fields[index],dataSetId:input.dataSpaceId,dataModelId:binding.to},before=row['ValueFun']
    if(before!==undefined&&before!==null&&before!==''){if(typeof before!=='string')throw Error('隔离字段ValueFun不是文本');DataSpaceDesignApi.parseValueFunction(before);const parsed:unknown=JSON.parse(before);if(!isRecord(parsed))throw Error('隔离字段值函数不是对象');if(!(parsed['Type']==='GetRefData'&&row['type']==='dataModel')){const next=projections.reduce((node,projection)=>projection.value(node,modelId),parsed);field['ValueFun']=JSON.stringify(next);DataSpaceDesignApi.parseValueFunction(String(field['ValueFun']))}}
    fields.push({from:identity(row,'rowid'),value:field})
   })
  }
  for(const row of input.relations.filter(relation=>scope.relationIds.includes(String(relation['rowid'])))){const parent=identity(row,'parentModId'),child=identity(row,'childModId'),value=business(row)
   const parentBinding=byId.get(parent),childBinding=byId.get(child);if(!parentBinding||!childBinding)throw Error('隔离关系映射缺失')
   value['dataSetId']=input.dataSpaceId;value['parentModId']=parentBinding.to;value['childModId']=childBinding.to
   // parentTable/childTable为关系自身的限定名；注册名迁移不得改变物理及关系限定名。
   value['filter']=rewrite(row['filter'],child,{preserved:[row['parentTable'],row['childTable']],functionOwner:parent});relations.push({from:identity(row,'rowid'),value})
  }
  return{models,fields,relations}
 }
}
