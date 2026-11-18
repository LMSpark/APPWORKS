/**
 * @module app:services/smart-bid/content/computed-query-tool
 * 职责：定义候选计算结果的只读函数及闭合参数。
 * 边界：调用方按工位和原实例范围挂接；读取权及原证明由候选绑定检查。
 */
import type {AiAgentToolSpec} from '@spark-appworks/spark-ai/agent'

/** 本次工位固定的计算结果身份。 */
export type ComputedQueryInput=Readonly<{projectId:string;revisionId:string;nodeId:string;inputHash:string}>
export type ComputedQueryOutput=Readonly<{nodeId:string;inputHash:string;data:Readonly<Record<string,unknown>>}>

/** 工位绑定的只读 ClassModel 根，每次读取前复核宿主授权。 */
export class ComputedQueryRoot {
 readonly #read:(input:unknown)=>ComputedQueryOutput
 readonly #assertAllowed:()=>void

 constructor(read:(input:unknown)=>ComputedQueryOutput,assertAllowed:()=>void){
  this.#read=read
  this.#assertAllowed=assertAllowed
 }

 /** 读取当前工位同次展开的固定表格 JSON。 */
 computed_get(input:ComputedQueryInput):ComputedQueryOutput {
  this.#assertAllowed()
  const result=this.#read(input)
  this.#assertAllowed()
  return result
 }
}

export const computedGetTool = {
 type:'function',
 function:{
  name:'computed_get',
  description:'读取本次固定修订中指定节点和输入摘要对应的已展开表格。',
  strict:true,
  parameters:{
   type:'object',
   additionalProperties:false,
   properties:{projectId:{type:'string'},revisionId:{type:'string'},nodeId:{type:'string'},
    inputHash:{type:'string',pattern:'^[a-f0-9]{64}$'}},
   required:['projectId','revisionId','nodeId','inputHash'],
  },
 },
} satisfies AiAgentToolSpec
