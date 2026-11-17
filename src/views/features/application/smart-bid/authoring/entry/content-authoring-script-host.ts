/**
 * @module app:views/features/application/smart-bid/authoring/entry/content-authoring-script-host
 * 职责：将同次正文宿主的业务能力交页11脚本消费。
 * 边界：不创建运行实例、不查询/保存、不持有业务草稿或全局命令表。
 */
import type {ContentAuthoringBinding} from '../model/content-authoring-host'
import type {ContentAuthoringCommands} from './content-authoring-commands'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {contentTreeDraftActionLayout,contentTreeEditorLayout,type ContentTreeEditorLayoutInput} from '@/services/smart-bid/content-tree-editor-layout'
import {isCallable,isRecord} from '@spark-appworks/spark-utils'
type Binding=Pick<ContentAuthoringBinding,'runtime'|'dataViewKey'|'projectId'|'draftId'|'actorUserId'|'assertCurrent'|'setPending'>
/** 脚本句柄只有业务能力和选择代次，没有业务数据副本。 */
export type ContentAuthoringScriptSession=Readonly<{
 assertCurrent:()=>void;select:()=>void;cancel:()=>void;setInputPending:(pending:boolean)=>void
 canLeave:boolean
 actionProps:(label:string,path:JsonPath|null)=>Readonly<{disabled:boolean;onClick:()=>void}>
 editorProps:(path:JsonPath)=>Readonly<Record<string,unknown>>
}>
/** 供正式SparkPageRenderer.host使用；命令对象仍归原薄宿主释放。 */
export function createContentAuthoringScriptHost(binding:Binding,commands:ContentAuthoringCommands){
 return {runtime:binding.runtime,assertCurrent:binding.assertCurrent,
  invoke(name:string,input:unknown,signal:AbortSignal):ContentAuthoringScriptSession{
   const assertCurrent=()=>{
    if(signal.aborted)throw Error('CONTENT_PAGE_RENDER_STALE')
    binding.assertCurrent();commands.assertInputCurrent(commands.epoch)
   }
   assertCurrent()
   if(name!=='content.authoring.connect'||input!==undefined)throw Error('CONTENT_PAGE_COMMAND_UNKNOWN')
   const layoutInput=(path:JsonPath|null):ContentTreeEditorLayoutInput=>{
    assertCurrent()
    const view=binding.runtime.resolveView(binding.dataViewKey)
    if(!view)throw Error('CONTENT_COMMAND_VIEW_REQUIRED')
    return {view,dataViewKey:binding.dataViewKey,projectId:binding.projectId,draftId:binding.draftId,selectedPath:path,
     onSelectedPathChange:()=>{},onEditingChange:()=>{}}
   }
   return Object.freeze({assertCurrent,
    get canLeave(){assertCurrent();return commands.canLeave},
    select(){assertCurrent();commands.selectionChanged(commands.epoch)},
    cancel(){assertCurrent();commands.cancel(commands.epoch)},
    setInputPending(pending:boolean){assertCurrent();commands.setInputPending('page11-detail',pending,commands.epoch)},
    editorProps(path:JsonPath){
     const original=layoutInput(path),epoch=commands.epoch,layout=contentTreeEditorLayout(original),node=layout.children?.[1]
     const props=isRecord(node)&&isRecord(node['props'])?node['props']:undefined
     if(!props)throw Error('CONTENT_PAGE_EDITOR_REQUIRED')
     return {...props,onChange(){assertCurrent();commands.assertInputCurrent(epoch)},onEditingChange(pending:boolean){
      if(typeof pending!=='boolean')throw Error('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
      // 旧编辑器卸载的false不能清掉下一编辑器的保护。
      if(!pending&&epoch!==commands.epoch)return
      assertCurrent();commands.setInputPending('page11-detail',pending,epoch)
     }}
    },
    actionProps(label:string,path:JsonPath|null){
     const original=layoutInput(path),epoch=commands.epoch
     const actions=contentTreeDraftActionLayout(original,{pending:commands.hasPendingInput,
      beforeChange(){assertCurrent();commands.selectionChanged(epoch)},afterChange(){},onError(cause){throw cause}})
     const action=actions.children?.find(child=>isRecord(child)&&isRecord(child['props'])&&child['props']['label']===label)
     const props=isRecord(action)&&isRecord(action['props'])?action['props']:undefined,click=props?.['onClick']
     if(!props||!isCallable(click))throw Error('CONTENT_PAGE_ACTION_UNKNOWN')
     return Object.freeze({disabled:props['disabled']===true,onClick(){assertCurrent();click()}})
    },
   })
  }}
}
