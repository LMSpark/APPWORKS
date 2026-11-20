/**
 * @module @spark-appworks/spark-lowcode-api:core/lowcode-query-items
 * 职责：统一低代码查询响应 data/Data 与 Items/items/Result/result 包裹解析。
 * 边界：不规范化领域行；调用方声明允许的键和 item 严格度。
 */
import {isRecord} from '@spark-appworks/spark-utils'

import {LowcodeApiError} from './lowcode-api-error.js'

type LowcodeQueryItemsOptions=Readonly<{
 label:string
 itemKeys:readonly string[]
 requireRecords?:boolean
}>

export function readLowcodeQueryItems(
 value:unknown,options:LowcodeQueryItemsOptions&Readonly<{requireRecords:true}>,
):ReadonlyArray<Record<string,unknown>>
export function readLowcodeQueryItems(value:unknown,options:LowcodeQueryItemsOptions):readonly unknown[]
export function readLowcodeQueryItems(value:unknown,options:LowcodeQueryItemsOptions):readonly unknown[]{
 if(!isRecord(value))throw new LowcodeApiError(0,`${options.label} Result 不是对象`)
 const data=isRecord(value['data'])?value['data']:isRecord(value['Data'])?value['Data']:value
 let items:unknown
 for(const key of options.itemKeys){
  const candidate=data[key]
  if(candidate!==undefined&&candidate!==null){items=candidate;break}
 }
 if(items===undefined||items===null)return []
 if(!Array.isArray(items))throw new LowcodeApiError(0,`${options.label} Result.items 不是数组`)
 if(options.requireRecords===true&&!items.every(isRecord))
  throw new LowcodeApiError(0,`${options.label} Result.items 不是对象数组`)
 return items
}
