/**
 * @module app:lowcode/resources/structured-config/logic-view/function-context
 * 职责：从原逻辑设计的选中节点及祖先投影值函数字段目录。
 * 边界：只读定义，不查询数据、不以节点别名猜资源名、不替换系统参数目录或执行函数。
 */
import type {DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {getValueAtJsonPath,isJsonObject,type JsonDocument,type JsonPath,type JsonValue} from '@spark-appworks/spark-json-document'
type ContextField=NonNullable<NonNullable<DataViewFilterFunctionContext['tables']>[number]['fields']>[number]
function nodeAt(root:JsonDocument,path:JsonPath){const node=getValueAtJsonPath(root,path);return isJsonObject(node)&&!Array.isArray(node)?node:undefined}
function text(value:JsonValue|undefined):string{return typeof value==='string'?value.trim():''}
function fields(node:Record<string,JsonValue>|undefined):ContextField[]{
  const value=node?.['Fields'];if(!Array.isArray(value))return []
  return value.filter(isJsonObject).flatMap(field=>{const name=text(field['Name']);return name?[{name,label:text(field['Description'])||text(field['description'])||name}]:[]})
}
export function logicNodeFunctionContext(input:Readonly<{root:JsonDocument;path:JsonPath}>):DataViewFilterFunctionContext {
  const {root,path}=input
  if(!path.length||path.length%2!==1||path.some((part,index)=>index%2===0?typeof part!=='number'||!Number.isSafeInteger(part)||part<0:part!=='ChildTables'))throw new Error('值函数节点路径无效')
  const selected=nodeAt(root,path);if(!selected)throw new Error('值函数节点不存在')
  const name=text(selected['MetaName'])
  const definitions=selected['inputParams']
  const inputParams=Array.isArray(definitions)?definitions.filter(isJsonObject).flatMap(parameter=>{
    const value=text(parameter['Name']);return value?[{value,label:text(parameter['Description'])||text(parameter['description'])||value}]:[]
  }):[]
  const relatedFields:Array<NonNullable<DataViewFilterFunctionContext['relatedFields']>[number]>=[]
  for(let length=1;length<path.length;length+=2){
    const parent=nodeAt(root,path.slice(0,length)),resource=text(parent?.['MetaName'])
    if(!resource)continue
    const label=text(parent?.['Name'])||resource
    for(const field of fields(parent))relatedFields.push({value:`${resource}.${field.name}`,label:`表[${label}]的（${field.label??field.name}）`})
  }
  return {tables:name?[{name,label:text(selected['Name'])||name,fields:fields(selected)}]:[],relatedFields,...(inputParams.length?{inputParams}:{})}
}
