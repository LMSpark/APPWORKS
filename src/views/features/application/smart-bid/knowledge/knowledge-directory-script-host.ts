/**
 * @module app:views/features/application/smart-bid/knowledge/knowledge-directory-script-host
 * 职责：页16复用已核知识目录及同版指南读取。
 */
import {createContentOperationScriptHost} from '../authoring/ui/entry/content-operation-script-host'

type OperationHost=Parameters<typeof createContentOperationScriptHost>

/** 页16只消费目录及同版指南读取。 */
export function createKnowledgeDirectoryScriptHost<Runtime extends OperationHost[0]>(
 runtime:Runtime,classModel:OperationHost[1],scope:Omit<OperationHost[2],'resolveOriginalGuide'>){
 const directory=createContentOperationScriptHost(runtime,classModel,scope)
 return {runtime,assertCurrent:directory.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name!=='knowledge.directory.read')throw Error('KNOWLEDGE_DIRECTORY_COMMAND_REQUIRED')
  return directory.invoke('content.operation.discover',input,signal)
 }}
}
