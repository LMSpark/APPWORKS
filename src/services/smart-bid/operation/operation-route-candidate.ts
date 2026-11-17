/**
 * @module app:services/smart-bid/operation/operation-route-candidate
 * 职责：按确定的JSON模型接收路线候选，复用载荷与结构预演。
 * 边界：接收公共AI层已解析的JSON值，不修复Markdown，不验证发布引用或执行条件。
 * AI用途：工艺输出绑定OperationRouteCandidate，同版模型进入检查后才能继续发布核验。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {OperationNodeType} from './operation-tree-structure'
import {previewOperationRoute} from './operation-route-preview'

/** 工序业务JSON值；数字以规范字符串承载，index另按结构模型处理。 */
export type OperationDataValue=string|boolean|null|readonly OperationDataValue[]|{readonly [key:string]:OperationDataValue}
/** 条件只留声明数据；其表达式、证据与适用性另由正式条件合同核验。 */
type ControlData=Readonly<{when?:OperationDataValue;required?:boolean}>
/** 工序节点输出，不含排版、文件格式、子树缓存或模型自报摘要。 */
export type OperationCandidateNode=Readonly<{
 id:string;parentId:string|null;index:number;class:readonly string[];value:string
}>&(
 | Readonly<{type:'route';data:Readonly<Record<string,never>>}>
 | Readonly<{type:Exclude<OperationNodeType,'route'|'call'|'task'>;data:ControlData}>
 | Readonly<{type:'call';data:ControlData&Readonly<{routeRef:OperationDataValue}>}>
 | Readonly<{type:'task';data:ControlData&Readonly<{stationRef:string;maxTimes?:string}>}>
)
/** 工艺编排的候选JSON输出。版本、hash及发布效力由正式办理生成，不由模型输出。 */
export type OperationRouteCandidate=Readonly<{nodes:readonly OperationCandidateNode[]}>

function recordKeys(value:unknown,allowed:readonly string[],required:readonly string[]):value is Record<string,unknown>{
 if(!isRecord(value))return false
 const prototype:unknown=Object.getPrototypeOf(value)
 if(prototype!==Object.prototype&&prototype!==null)return false
 const descriptors=Object.getOwnPropertyDescriptors(value)
 return Reflect.ownKeys(value).every(key=>typeof key==='string'&&allowed.includes(key)
  && descriptors[key]?.enumerable===true&&Object.hasOwn(descriptors[key]??{},'value'))
  &&required.every(key=>Object.hasOwn(value,key))
}
function nodeList(value:unknown):value is readonly unknown[]{
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)return false
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))return false
 }
 return true
}
const nodeKeys=['id','parentId','index','type','class','value','data']
function validData(node:Record<string,unknown>):boolean {
 const type=node['type'],data=node['data']
 const allowed=type==='route'?[]:type==='task'?['stationRef','when','maxTimes','required']
  :type==='call'?['routeRef','when','required']:['when','required']
 const required=type==='task'?['stationRef']:type==='call'?['routeRef']:[]
 if(!recordKeys(data,allowed,required))return false
 if(Object.hasOwn(data,'required')&&typeof data['required']!=='boolean')return false
 if(type==='task'&&(typeof data['stationRef']!=='string'||!data['stationRef'].trim()))return false
 if(Object.hasOwn(data,'maxTimes')&&(typeof data['maxTimes']!=='string'||!/^[1-9]\d*$/.test(data['maxTimes'])))return false
 return true
}

function assertOperationRouteCandidate(value:unknown):asserts value is OperationRouteCandidate {
 if(!recordKeys(value,['nodes'],['nodes'])||!nodeList(value['nodes']))throw Error('OPERATION_ROUTE_JSON_MODEL')
 for(const node of value['nodes'])if(!recordKeys(node,nodeKeys,nodeKeys)||!nodeList(node['class'])||!validData(node))throw Error('OPERATION_ROUTE_NODE_MODEL')
 const preview=previewOperationRoute({nodes:value['nodes']})
 if(preview.errors.length)throw Error(`OPERATION_ROUTE_CANDIDATE: ${preview.errors.join(';')}`)
}

/** 读取已解析JSON并返回独立快照；只有模型/载荷/结构通过，不授予执行或发布效力。 */
export function readOperationRouteCandidate(value:unknown):OperationRouteCandidate {
 assertOperationRouteCandidate(value)
 return structuredClone(value)
}
