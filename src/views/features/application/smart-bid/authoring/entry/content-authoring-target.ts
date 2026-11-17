/**
 * @module app:views/features/application/smart-bid/authoring/entry/content-authoring-target
 * 职责：从正式导航解析结果和明确项目草稿参数确定正文入口目标。
 * 边界：不授予权限、不查询、不从URL取得作者、不选择活动项目或默认草稿。
 * AI用途：真实原生入口在打开原ContentAuthoringHost前核对绑定身份。
 */
import type {ContentAuthoringTarget} from '../model/content-authoring-host'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {isRecord} from '@spark-appworks/spark-utils'

const applicationId='D8490EC99436A8B9AFDE205BE3153802',scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
function identity(value:unknown):value is string {return typeof value==='string'&&value.length>0&&value.trim()===value}

/** 消费正式工具导航元信息；调用场景由正式工具运行时同样读取的query明确声明。 */
export type ContentAuthoringRoute=Readonly<{path:string;meta:Readonly<Record<string,unknown>>;query:Readonly<Record<string,unknown>>}>
/** 空缺或冲突身份在任何查询前拒绝。 */
export function resolveContentAuthoringTarget(route:ContentAuthoringRoute):ContentAuthoringTarget {
 const tool=route.meta['tool'],nodeId=route.meta['nodeId'],projectId=route.query['projectId'],draftId=route.query['draftId']
 if(resolveExecutionProjectId(route.path)!==applicationId||route.meta['type']!=='config-page'||route.meta['programmaticTool']===true
  ||!identity(nodeId)||!isRecord(tool)||tool['projectId']!==applicationId||!identity(tool['pageId'])
  ||route.meta['pageId']!==tool['pageId']||route.query['scenarioId']!==scenarioId||!identity(projectId)||!identity(draftId)
  ||['actorUserId','currentUserId','userId','scenarioInputs'].some(key=>Object.hasOwn(route.query,key)))throw Error('CONTENT_AUTHORING_ENTRY_IDENTITY_REQUIRED')
 const pageId=tool['pageId']
 for(const [key,value] of Object.entries({applicationId,scenarioId,pageId})){
  if(Object.hasOwn(route.query,key)&&route.query[key]!==value)throw Error('CONTENT_AUTHORING_ENTRY_IDENTITY_CONFLICT')
 }
 return Object.freeze({applicationId,pageId,scenarioId,projectId,draftId})
}
