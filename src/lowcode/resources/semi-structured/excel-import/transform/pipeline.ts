/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/pipeline
 * 职责：核对正式转换规则变更前后的字段依赖及行结构，不执行转换或保存数据。
 * 边界：导入/导出各用实际初始字段；同顺序的输出不能成为彼此输入，未知扩展不是引用。
 */
import type {DataRow} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {EXCEL_TRANSFORM_ROW_SHAPES,excelTransformEnumValue} from './definition'
import {visitExcelTransformExpression} from './expression'
import {validateExcelTransformRule} from './validation'
/** 同一时点两种执行方向的真实初始字段。 */
export type ExcelTransformReferenceFields=Readonly<{IMPORT:readonly string[];EXPORT:readonly string[]}>
/** 正式规则批次的变更前后投影，不含编辑或查询owner。 */
export type ExcelTransformReferenceTransition = Readonly<{
 /** 两种执行方向各自的正式初始字段。 */
 fields:ExcelTransformReferenceFields
 /** 正式旧规则实际查询投影；规则改变投影时与本次结果分别证明。 */
 beforeFields?:ExcelTransformReferenceFields
 /** 本节点具有有效列号的正式Excel导出映射，不是物理输入列。 */
 exportOutputFields?:readonly string[]
 /** 本次正式完整规则。 */
 before:ReadonlyArray<Readonly<DataRow>>
 /** 仅叠加本批实际变更后的规则，不合入其他草稿。 */
 after:ReadonlyArray<Readonly<DataRow>>
 /** 判定本批实际新增或修改规则；删除通过前后依赖差异检查。 */
 changed(row:Readonly<DataRow>):boolean
 /** 已核实当前节点与整棵导出结构允许改变行结构。 */
 allowRowShapes:boolean
 /** 整棵树的运行导出方式可进一步禁止导出行结构转换，不影响叶节点导入。 */
 allowExportRowShapes?:boolean
}>
type Issue=Readonly<{row:Readonly<DataRow>;key:string;message:string}>
type Effect=Readonly<{add:readonly string[];remove:readonly string[];reset?:readonly string[]}>
function object(value:unknown):Record<string,unknown>{if(!isRecord(value))throw Error('配置须为对象');return value}
function config(row:Readonly<DataRow>):Record<string,unknown>{const raw=row['config_json'];return typeof raw==='string'&&raw.trim()?object(parseJsonDocument(raw)):{}}
function texts(value:unknown):string[]{if(!Array.isArray(value)||value.some(item=>typeof item!=='string'))throw Error('字段须为文本数组');return value.filter((item):item is string=>typeof item==='string')}
function issues(input:ExcelTransformReferenceTransition,rules:ReadonlyArray<Readonly<DataRow>>,fields:ExcelTransformReferenceFields):Issue[]{
 const result:Issue[]=[]
 for(const direction of ['IMPORT','EXPORT'] as const){
  let available=new Set(fields[direction])
  const groups=new Map<number,Array<Readonly<DataRow>>>()
  for(const row of rules){
   if(row['enabled']!==null&&row['enabled']!==1)continue
   try{
    const scope=excelTransformEnumValue(config(row)['executionScope']??'IMPORT')
    if(scope!==direction&&scope!=='BOTH')continue
    const order=Number(row['sort_order']??0),group=groups.get(order)??[];group.push(row);groups.set(order,group)
   }catch(cause){result.push({row,key:`${direction}:config`,message:cause instanceof Error?cause.message:'配置无效'})}
  }
  for(const [,group]of [...groups].sort(([a],[b])=>a-b)){
   const effects:Effect[]=[]
   for(const row of group){
    const issue=(path:string,field:string)=>{result.push({row,key:`${direction}:${path}:${field}`,message:`${direction}.${path}引用不存在或执行顺序未在之前的字段: ${field}`})}
    try{
     // 已存NULL配置在执行器中作为空对象消费；编辑时的显式对象要求仍由原模型保存规则执行。
     validateExcelTransformRule({values:row['config_json']===null?{...row,config_json:''}:row,changedFields:[],created:true})
     const kind=excelTransformEnumValue(row['rule_type']),cfg=config(row)
     if((!input.allowRowShapes||direction==='EXPORT'&&input.allowExportRowShapes===false)&&EXCEL_TRANSFORM_ROW_SHAPES.some(type=>type===kind))issue('父配置或当前导出方式不允许行结构转换',kind)
     const requireField=(value:unknown,path:string)=>{if(typeof value!=='string'||!available.has(value))issue(path,String(value))}
     const expr=(value:unknown,path:string)=>visitExcelTransformExpression({value,path,field:requireField})
     if(['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP'].includes(kind))requireField(row['source_field'],'source_field')
     const raw=row['condition_json'];if(typeof raw==='string'&&raw.trim())expr(parseJsonDocument(raw),'condition_json')
     if(['COMPUTE','OVERRIDE','VALIDATE','FILTER'].includes(kind)&&Object.hasOwn(cfg,'expression'))expr(cfg['expression'],'expression')
     for(const member of kind==='VALIDATE'?['requiredFields']:kind==='DEDUPLICATE'?['fields']:[]){for(const field of texts(cfg[member]??[]))requireField(field,member)}
     if(kind==='UNPIVOT'){
      const columns=cfg['columns'];if(!Array.isArray(columns))throw Error('columns须为数组')
      const source=columns.map(column=>String(object(column)['sourceField']));source.forEach(field=>requireField(field,'columns.sourceField'))
      effects.push({add:[String(cfg['keyTargetField']),String(cfg['valueTargetField'])],remove:excelTransformEnumValue(cfg['sourceFieldPolicy']??'REMOVE')==='REMOVE'?source:[]})
      if(direction==='EXPORT'&&input.exportOutputFields)for(const field of [cfg['keyTargetField'],cfg['valueTargetField']])if(typeof field!=='string'||!input.exportOutputFields.includes(field))issue('目标字段未配置Excel输出列',String(field))
     }else if(kind==='PIVOT'){
      const grouped=texts(cfg['groupFields']).map(field=>field.trim());grouped.forEach(field=>requireField(field,'groupFields'));requireField(cfg['keyField'],'keyField');requireField(cfg['valueField'],'valueField')
      effects.push({add:[],remove:[],reset:[...grouped,...Object.values(object(cfg['columns'])).map(String)]})
      if(direction==='EXPORT'&&input.exportOutputFields)for(const field of Object.values(object(cfg['columns'])))if(typeof field!=='string'||!input.exportOutputFields.includes(field))issue('目标字段未配置Excel输出列',String(field))
     }else if(['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP','COMPUTE','DEFAULT','OVERRIDE'].includes(kind))effects.push({add:[String(row['target_field'])],remove:[]})
    }catch(cause){result.push({row,key:`${direction}:structure`,message:cause instanceof Error?cause.message:'规则结构无效'})}
   }
   const resets=effects.flatMap(effect=>effect.reset===undefined?[]:[effect.reset])
   if(resets.length)available=new Set(resets[0]?.filter(field=>resets.every(reset=>reset.includes(field)))??[])
   else {
    for(const effect of effects)effect.add.forEach(field=>available.add(field))
    for(const effect of effects)effect.remove.forEach(field=>available.delete(field))
   }
  }
 }
 return result
}
/** 拒绝本次规则自身错误及本批引入的下游断链；无关历史错误不阻断独立修改。 */
export function assertExcelTransformReferenceTransition(input:ExcelTransformReferenceTransition):void{
 const original=issues(input,input.before,input.beforeFields??input.fields)
 for(const issue of issues(input,input.after,input.fields)){
  if(input.changed(issue.row)||!original.some(previous=>previous.row['id']===issue.row['id']&&previous.key===issue.key))throw Error(`转换规则[${String(issue.row['id'])}]: ${issue.message}`)
 }
}
