/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/references
 * 职责：在原DataTable公共保存预检中重读精确正式规则，验证本批导致的引用变化。
 * 边界：不保存、不持有草稿，不把未提交解除当正式状态；未知提交由公共数据链恢复。
 */
import type {DataSet,DataRow,DataTableQuerySaveReferences,DataTableQueryReferenceChange} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {assertExcelTransformReferenceTransition} from './pipeline'
import {readExcelTransformRows} from '../metadata/queries'
import {readExcelTransformExportFields} from './export-fields'
import {excelTransformEnumValue} from './definition'
const fields=['scheme_id','config_id','rule_type','source_field','target_field','sort_order','enabled','condition_json','config_json','on_error']
const nodeFields=['rowid','schemeid','pid','exportType','sheet_layout_json','relatedappid','table','parentField','foreignKeyField']
/** 原设计实例及按需访问物理字段的原宿主。 */
export type ExcelTransformReferenceOwner=Readonly<{
 /** 正式0F93 DataSet，不另装配编辑空间。 */
 dataSet:DataSet
 /** EXPORT需要原宿主；IMPORT不为此提前加载物理来源。 */
 getPage?:()=>PageRuntime
}>
function text(value:unknown):string{if(typeof value!=='string'||!value)throw Error('转换规则缺少正式方案或节点身份');return value}
function direction(row:Readonly<DataRow>,scope:string):boolean{
 if(row['enabled']!==null&&row['enabled']!==1)return false
 const raw=row['config_json'],cfg=typeof raw==='string'&&raw.trim()?parseJsonDocument(raw):{}
 if(!isRecord(cfg))throw Error('转换规则配置必须是对象')
 return [scope,'BOTH'].includes(excelTransformEnumValue(cfg['executionScope']??'IMPORT'))
}
/** 所有命名视图及直接DataSet/DataView提交复用同一正式引用约束。 */
export function createExcelTransformReferences(owner:ExcelTransformReferenceOwner):DataTableQuerySaveReferences{
 const ds=owner.dataSet,original=ds.getView('Base_Import_Transform_Rule')
 if(!original)throw Error('转换规则缺少原设计视图')
 return {fields,triggerFields:fields.filter(field=>field!=='on_error'),validate:async({changes})=>{
  const nodes=ds.getView('Base_ImportData_Config')
  if(!nodes)throw Error('转换规则缺少正式节点视图')
  const scheme=text(nodes.queryContext['importConfigId']),scope=JSON.stringify(nodes.queryContext)
  const check=()=>{if(ds.destroyed||ds.getView('Base_Import_Transform_Rule')!==original||ds.getView('Base_ImportData_Config')!==nodes||JSON.stringify(nodes.queryContext)!==scope)throw Error('转换引用的原设计实例已变化')}
  check()
  const groups=new Map<string,DataTableQueryReferenceChange[]>()
  for(const change of changes){
   if(text(change.values['scheme_id'])!==scheme)throw Error('转换规则不属于本次方案')
   const id=text(change.values['config_id'])
   if(change.originalValues&&(change.originalValues['scheme_id']!==scheme||change.originalValues['config_id']!==id))throw Error('转换规则不能迁移到其他方案或节点')
   const group=groups.get(id)??[];group.push(change);groups.set(id,group)
  }
  for(const [id,group]of groups){
   const before=await readExcelTransformRows({dataSet:ds,table:'Base_Import_Transform_Rule',fields:['id',...fields],filter:{logic:'and',filters:[{field:'scheme_id',operator:'eq',value:scheme},{field:'config_id',operator:'eq',value:id}]},check})
   if(before.some(row=>row['scheme_id']!==scheme||row['config_id']!==id))throw Error('转换正式规则查询超出本次节点')
   const changed=new Set<Readonly<DataRow>>(),after=[...before]
   for(const change of group){
    const matches=before.filter(row=>change.matchesKey(row['id'])),row=matches[0]
    if(change.kind==='create'){
     if(matches.length)throw Error('新增转换规则身份已存在')
     const added={...change.values};after.push(added);changed.add(added)
    }else{
     if(matches.length!==1||!row||!change.originalValues||fields.some(field=>JSON.stringify(row[field])!==JSON.stringify(change.originalValues?.[field])))throw Error('转换规则正式原值已变化，请重新读取')
     const index=after.indexOf(row)
     if(change.kind==='delete')after.splice(index,1)
     else {
      const updated={...row,...change.values};after[index]=updated
      if(change.changedFields.some(field=>['rule_type','source_field','target_field','condition_json','config_json'].includes(field))||change.changedFields.includes('enabled')&&(updated['enabled']===null||updated['enabled']===1))changed.add(updated)
     }
    }
   }
   const active=(row:Readonly<DataRow>|undefined)=>row!==undefined&&(row['enabled']===null||row['enabled']===1)
   if(!after.some(active)||!group.some(change=>active(change.values)||active(change.originalValues)))continue
   if(group.every(change=>change.kind==='delete'&&['VALIDATE','FILTER','DEDUPLICATE'].includes(excelTransformEnumValue(change.values['rule_type']))||!active(change.values)&&!active(change.originalValues)))continue
   const readNode=async(nodeId:string)=>{
    const result=await readExcelTransformRows({dataSet:ds,table:'Base_ImportData_Config',fields:nodeFields,filter:{logic:'and',filters:[{field:'rowid',operator:'eq',value:nodeId},{field:'schemeid',operator:'eq',value:scheme}]},check})
    const row=result[0];if(result.length!==1||row?.['rowid'] !== nodeId||row['schemeid']!==scheme)throw Error('转换规则所属正式节点不存在或已变化')
    return row
   }
   const node=await readNode(id),ancestors=new Set<string>([id]);let root=node
   while(root['pid']!==null&&root['pid']!==''&&root['pid']!==scheme){const parent=text(root['pid']);if(ancestors.has(parent))throw Error('转换规则节点父链存在循环');ancestors.add(parent);root=await readNode(parent)}
   const layoutRaw=root['sheet_layout_json'],layout=typeof layoutRaw==='string'&&layoutRaw.trim()?parseJsonDocument(layoutRaw):{}
   const layoutActive=isRecord(layout)&&layout['enabled']===true
   const needsImport=after.some(row=>direction(row,'IMPORT')),needsExport=after.some(row=>direction(row,'EXPORT'))
   if(layoutActive&&needsImport)throw Error('当前版式规则输入范围尚未经验证，请保留草稿')
   const children=await readExcelTransformRows({dataSet:ds,table:'Base_ImportData_Config',fields:['rowid','schemeid','pid'],filter:{logic:'and',filters:[{field:'schemeid',operator:'eq',value:scheme},{field:'pid',operator:'eq',value:id}]},check})
   const imported:string[]=[],output:string[]=[]
   if(needsImport||needsExport){
    const mapping=await readExcelTransformRows({dataSet:ds,table:'Base_ImportData_Field',fields:['rowid','configid','name','index','isReadOnly'],filter:{field:'configid',operator:'eq',value:id},check})
    for(const field of mapping){
     if(field['configid']!==id)throw Error('转换输入映射不属于本节点')
     if(!needsExport&&field['isReadOnly']===1)continue
     if(field['index']===null||field['index']==='')continue
     if(typeof field['index']!=='string'||!(/^[A-Za-z]+$/u).test(field['index']))throw Error('转换输入映射列号尚未纠正')
     let column=0
     for(const letter of field['index'].toUpperCase()){column=column*26+letter.charCodeAt(0)-64;if(column>16384)throw Error('转换输入映射列号超过工作簿最大范围XFD')}
     const name=text(field['name']);output.push(name)
     if(field['isReadOnly']!==1)imported.push(name)
    }
    if(node['pid']!==scheme&&node['pid']!==null&&node['pid']!==''&&typeof node['parentField']==='string'&&node['parentField']&&typeof node['foreignKeyField']==='string'&&node['foreignKeyField'])imported.push(node['foreignKeyField'])
   }
   const exported=needsExport?await readExcelTransformExportFields({dataSet:ds,...(owner.getPage===undefined?{}:{getPage:owner.getPage}),node,before,after,outputFields:output,check}):{before:[],after:[]}
   assertExcelTransformReferenceTransition({fields:{IMPORT:imported,EXPORT:exported.after},beforeFields:{IMPORT:imported,EXPORT:exported.before},exportOutputFields:output,before,after,changed:row=>changed.has(row),allowRowShapes:children.length===0,allowExportRowShapes:!layoutActive&&String(root['exportType']??'').toLowerCase()!=='tree'})
  }
 }}
}
