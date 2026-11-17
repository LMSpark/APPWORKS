/**
 * @module app:services/smart-bid/content/references/content-reference-editor-schema
 * 职责：以正文占位与已有原绑定生成标准JSON表单Schema。
 * 边界：只生成显示合同，不复制或填充绑定，不确认事实/资源/敏感字段的版本与授权。
 * AI用途：同一原节点编辑实例维护正文、分类和字段引用；呈现属性不进入内容。
 */
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {inspectContentPlaceholders} from '../../content-placeholders'
import {contentReferenceTypes,contentReferenceFields} from '../../content-reference'

const titles:Readonly<Record<string,string>>={factId:'事实标识',number:'规范数值',unit:'单位',date:'日期',bool:'布尔值',nodeId:'目标节点',
 show:'显示内容',resourceVersionId:'资源版本标识',ownerRef:'受控对象引用',field:'受控字段'}
function referenceSchema(value:unknown):JsonSchemaObject {
 const types=contentReferenceTypes(),record=isRecord(value)?value:{}
 // 种类变化不更换Schema，避免清掉同一编辑实例中其它尚未确认的输入。
 const fields=[...new Set(types.flatMap(type=>contentReferenceFields(type)))],keys=['type',...fields,...Object.keys(record)]
 const properties=Object.fromEntries([...new Set(keys)].map(key=>{
  const definition:JsonSchemaObject=key==='type'?{type:'string',title:'引用类型',enum:[...types]}:
   key==='bool'?{type:'boolean',title:titles[key]??key}:key==='show'?{type:'string',title:titles[key]??key,enum:['title','number']}:
    fields.includes(key)&&key!=='ownerRef'?{type:'string',title:titles[key]??key}:{title:titles[key]??key}
  return [key,definition]
 }))
 return {type:'object',required:['type'],properties,description:'仅填写所选引用类型所需字段；事实、资源及受控字段的适用版本另行核验。'}
}
/** 已有但未被正文使用的绑定仍可见并可显式移除；不静默清理或填入默认值。 */
export function contentReferenceEditorSchema(value:string,data:unknown):JsonSchemaObject {
 const names=inspectContentPlaceholders(value).names,bindings=isRecord(data)?data:{}
 const properties=Object.fromEntries([...new Set([...names,...Object.keys(bindings)])].map(name=>[name,{
  ...referenceSchema(Object.hasOwn(bindings,name)?bindings[name]:undefined),title:name}]))
 return {type:'object',required:['value','class','data'],properties:{
  value:{type:'string',title:'正文'},class:{type:'array',items:{type:'string'},title:'内容分类'},
  data:{type:'object',title:'字段引用',required:[...names],properties},
 }}
}
