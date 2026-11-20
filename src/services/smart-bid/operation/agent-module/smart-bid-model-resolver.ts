/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-model-resolver
 * 职责：把生成 ClassModel 的 kind 解析为同名源码 class，并绑定当前 PageRuntime owner。
 * 边界：不声明 action、schema、guide 或 registration；这些只来自源码声明与编译产物。
 */
import * as authority from './models/authority-action-modules'
import * as authoring from './models/authoring-action-modules'
import * as collaboration from './models/collaboration-action-modules'
import * as configuration from './models/configuration/configuration-action-modules'
import * as knowledge from './models/knowledge-action-modules'
import * as production from './models/production-action-modules'
import * as project from './models/project-action-modules'
import * as response from './models/response-action-modules'
import * as submission from './models/submission-action-modules'
import * as tenderAnalysis from './models/tender-analysis-action-modules'
import * as tenderSource from './models/tender-source-action-modules'
import type {SmartBidActionExecutor} from './smart-bid-action-module'

type SmartBidExecutable=object
type SmartBidModuleConstructor=new(execute:SmartBidActionExecutor)=>SmartBidExecutable
const modules:ReadonlyArray<Readonly<Record<string,unknown>>>=[
 authority,authoring,collaboration,configuration,knowledge,production,project,response,submission,tenderAnalysis,tenderSource,
]

/** 只解析已编译公开 class；未知 kind 明确失败，不能回退到任意模块或字符串执行。 */
export function resolveSmartBidModel(kind:string,execute:SmartBidActionExecutor):SmartBidExecutable{
 if(!kind.trim()||kind!==kind.trim())throw Error('SMART_BID_MODEL_KIND_REQUIRED')
 const constructors=modules.flatMap(module=>Object.values(module)).filter(isSmartBidModuleConstructor)
 const matches=constructors.filter(constructor=>constructor.name===kind)
 if(matches.length!==1)throw Error(`SMART_BID_MODEL_KIND_UNAVAILABLE: ${kind}`)
 const constructor=matches[0]
 if(!constructor)throw Error(`SMART_BID_MODEL_KIND_UNAVAILABLE: ${kind}`)
 return new constructor(execute)
}

function isSmartBidModuleConstructor(value:unknown):value is SmartBidModuleConstructor{
 return typeof value==='function'&&typeof value.name==='string'&&value.name.length>0
}
