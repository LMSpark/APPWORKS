/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-scenario-views
 * 职责：为正式共享场景提供页18所需的命名视图定义；模型身份和字段仍来自已登记模型。
 * 边界：场景配置责任方用正式主键装配视图，发布和存储仍由原场景负责。
 * AI用途：配置工艺目录、原指南版本、派发凭据、办理回执和返工查询的命名视图。
 */
import type {DataViewFilterTree,ViewMetadata} from '@spark-appworks/spark-data'

const attemptScope=['projectId','runId','attemptRef','requestKey']
const directoryScope=['projectId','directoryRef']
const attemptFields=[...attemptScope,'targetDigest','configurationLockHash']
const guideFields=['guideRef','versionRef','guideDigest','kind','actionName','source','publicationRef']

function view(keys:readonly string[],fields:readonly string[],options:Readonly<{primaryKey:string;completeDirectory?:boolean}>):ViewMetadata{
 const {primaryKey,completeDirectory}=options
 if(!primaryKey.trim()||primaryKey.trim()!==primaryKey)throw Error('OPERATION_SCENARIO_PRIMARY_KEY_REQUIRED')
 const filters:DataViewFilterTree[]=keys.map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))
 if(completeDirectory)filters.push({field:'state',operator:'eq',value:'EFFECTIVE'})
 return {autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  scopeFilter:{logic:'and',filters},
  queryConfig:{autoQuery:false,cacheType:'none',fields:[...new Set([primaryKey,...keys,...fields])],
   ...(completeDirectory?{allPages:true}:{pagination:'none'})}}
}

/** 提交给场景配置责任方合入已登记模型，不生成模型、覆盖 default 或注入运行数据。 */
export function contentOperationScenarioViews(primaryKeys:Readonly<Record<'KnowledgeGuide'|'ContextManifest'|'GenerationRun',string>>){
 const {KnowledgeGuide,ContextManifest,GenerationRun}=primaryKeys
 return {
  KnowledgeGuide:{
   effectiveDirectory:view(directoryScope,[...guideFields,'state','pathRefs','materialRefs'],{primaryKey:KnowledgeGuide,completeDirectory:true}),
   originalVersion:view(['projectId','guideRef','versionRef'],guideFields,{primaryKey:KnowledgeGuide}),
  },
  ContextManifest:{
   originalFrozen:view(attemptScope,[...attemptFields,'guideRef','guideVersionRef','guideDigest','usable','inputDigest'],{primaryKey:ContextManifest}),
   originalDispatch:view(attemptScope,[...attemptFields,'dispatchRef','actualInputDigest','actualInput'],{primaryKey:ContextManifest}),
  },
  GenerationRun:{
   originalResult:view(attemptScope,[...attemptFields,'receiptRef','state','output'],{primaryKey:GenerationRun}),
   originalReworkEvidence:view(attemptScope,['inputRef','returnRef','calls','findings','priorResults'],{primaryKey:GenerationRun}),
  },
 }
}
