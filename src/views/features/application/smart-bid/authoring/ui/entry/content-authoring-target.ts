/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-authoring-target
 * 职责：从正式导航解析结果和明确项目草稿参数确定正文入口目标。
 * 边界：不授予权限、不查询、不从URL取得作者、不选择活动项目或默认草稿。
 * AI用途：真实原生入口在打开原ContentAuthoringHost前核对绑定身份。
 */
import {captureContentAuthoringSession, type ContentAuthoringTarget} from '../../model/content-authoring-host'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseDataViewKey} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {createPublishedContentAuthoringHost} from './content-authoring-script-host'
import {bindPublishedPageRuntime,matchesPublishedPageBinding} from './publication/published-page-binding'

const applicationId='D8490EC99436A8B9AFDE205BE3153802',scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
const publishedAuthoringToolId='smart-bid-authoring-page11'
const originalSaveReceiptDataViewKey=`${scenarioId}@SaveReceipt@originalSave`
function identity(value:unknown):value is string {return typeof value==='string'&&value.length>0&&value.trim()===value}

/** 消费正式工具导航元信息；调用场景由正式工具运行时同样读取的query明确声明。 */
export type ContentAuthoringRoute=Readonly<{path:string;meta:Readonly<Record<string,unknown>>;query:Readonly<Record<string,unknown>>}>

/** 生产绑定已登记正文工具。显式入口提供隔离夹具自己的正式节点及工具身份。 */
export type ContentAuthoringPublishedEntry = Readonly<{nodeId:string;pageId:string;receiptDataViewKey?:string}>

/** Prepare the published route with the session inputs expected by the runtime pool. */
export function preparePublishedContentAuthoringCall(route:ContentAuthoringRoute, entry?:ContentAuthoringPublishedEntry) {
 if(entry===undefined&&route.query['draftId']===undefined)return undefined
 const target = resolvePublishedContentAuthoringTarget(route, entry)
 if(!target)return undefined
 const session=captureContentAuthoringSession(target)
 const receiptDataViewKey=entry?.receiptDataViewKey??originalSaveReceiptDataViewKey
 const nodeId=route.meta['nodeId']
 if(!identity(nodeId))throw Error('CONTENT_AUTHORING_PUBLICATION_IDENTITY_CONFLICT')
 return bindPublishedPageRuntime({
  entry:{applicationId,nodeId,pageId:target.pageId,scenarioId:target.scenarioId},
  session,exactScenarioSet:true,runtimeConflictError:'CONTENT_AUTHORING_PUBLICATION_RUNTIME_CONFLICT',
  validateRuntime(runtime:PageRuntime){
   const inputs=runtime.call.scenarioInputs?.[target.scenarioId]
   if(inputs?.['projectId']!==target.projectId||inputs['currentUserId']!==session.actorUserId)
    throw Error('CONTENT_AUTHORING_PUBLICATION_RUNTIME_CONFLICT')
  },
  createHost(runtime:PageRuntime){
   return createPublishedContentAuthoringHost(runtime,target,{
    assertSession:session.assertCurrent,receiptDataViewKey,
   })
  },
 })
}

/** Select only the registered tool before preparing its authenticated runtime inputs. */
export function resolvePublishedContentAuthoringTarget(
 route:ContentAuthoringRoute, entry?:ContentAuthoringPublishedEntry,
):ContentAuthoringTarget | undefined {
 if (resolveExecutionProjectId(route.path) !== applicationId || route.query['scenarioId'] !== scenarioId) return undefined
 const tool=route.meta['tool']
 const expectedPageId=entry?.pageId??publishedAuthoringToolId
 if(entry===undefined&&(!isRecord(tool)||tool['pageId']!==expectedPageId))return undefined
 if(entry!==undefined&&route.meta['nodeId']!==entry.nodeId)return undefined
 if(entry===undefined&&route.meta['blueprintScenarioId']!==scenarioId)throw Error('CONTENT_AUTHORING_PUBLICATION_IDENTITY_CONFLICT')
 const nodeId=entry?.nodeId??route.meta['nodeId']
 const target=resolveContentAuthoringTarget(route)
 if(!identity(nodeId)||!identity(expectedPageId)||target.pageId!==expectedPageId
  ||route.query['additionalScenarioIds']!==undefined){
  throw Error('CONTENT_AUTHORING_PUBLICATION_IDENTITY_CONFLICT')
 }
 const receiptDataViewKey=entry?.receiptDataViewKey??originalSaveReceiptDataViewKey
 const receipt=parseDataViewKey(receiptDataViewKey)
 if(receipt?.scope!==target.scenarioId||receipt.tableName==='WorkingDraft')
  throw Error('CONTENT_AUTHORING_PUBLICATION_RECEIPT_CONFLICT')
 return target
}
/** 空缺或冲突身份在任何查询前拒绝。 */
export function resolveContentAuthoringTarget(route:ContentAuthoringRoute):ContentAuthoringTarget {
 const tool=route.meta['tool'],nodeId=route.meta['nodeId'],projectId=route.query['projectId'],draftId=route.query['draftId']
 const pageId=isRecord(tool)?tool['pageId']:undefined
 const matches=matchesPublishedPageBinding(route,{applicationId,
  nodeId:typeof nodeId==='string'?nodeId:'',pageId:typeof pageId==='string'?pageId:'',scenarioId},{
   identityError:'CONTENT_AUTHORING_ENTRY_IDENTITY_REQUIRED',
   conflictError:'CONTENT_AUTHORING_ENTRY_IDENTITY_CONFLICT',
   allowMissingBlueprintScenario:true,
   requireScenarioQuery:true,
   forbiddenQuery:['actorUserId','currentUserId','userId','scenarioInputs'],
  })
 if(!matches||!identity(nodeId)||!identity(pageId)||!identity(projectId)||!identity(draftId))
  throw Error('CONTENT_AUTHORING_ENTRY_IDENTITY_REQUIRED')
 return Object.freeze({applicationId,pageId,scenarioId,projectId,draftId})
}
