import {expect,it,vi} from 'vitest'
import {DataSpaceQueryContext,DataSpaceQueryTable,type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {buildPageService} from '@spark-appworks/spark-component'
import {createMemoryHistory,createRouter} from 'vue-router'
import style from '@/views/features/application/smart-bid/authoring/page11/style.css?raw'
import {preparePublishedContentAuthoringCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'
import {createCandidateReadFixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import {executeActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/action-executor'
import {nodeToActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/node-to-descriptor'
import type {ActionExecutionContext} from '../../../../../../packages/spark-component/src/page/actions/action-types'
import {isRecord} from '@spark-appworks/spark-utils'

function isSparkNode(value:unknown):value is SparkNode{
 return isRecord(value)&&typeof value['type']==='string'
}

function buttons(nodes:unknown):SparkNode[]{
 if(!Array.isArray(nodes))return []
 return nodes.filter(isSparkNode).flatMap(node=>{
  const children=Array.isArray(node.children)?node.children:[]
  return [...(node.type==='r-button'?[node]:[]),...buttons(children)]
 })
}

function descriptor(label:string){
 const node=buttons(rule).find(item=>item.props?.['label']===label)
 if(!node)throw Error(`TEST_BUTTON_REQUIRED: ${label}`)
 const result=nodeToActionDescriptor(node)
 if(!result)throw Error(`TEST_DESCRIPTOR_REQUIRED: ${label}`)
 return result
}

function context(overrides:Partial<ActionExecutionContext>={}):ActionExecutionContext{
 return {
  getDataSet:()=>null,
  resolveView:()=>null,
  getDataSource:()=>null,
  getPageService:()=>null,
  getRouter:()=>null,
  ...overrides,
 }
}

it('uses the original DataView and gates its standard form and cancel button on the authoring host',()=>{
 expect(script).toContain("$page.invokeHostCommand('content.authoring.connect')")
 expect(rule[0]).toMatchObject({
  type:'r-section',
  props:{title:'标书正文编制'},
 })
 const form=rule[0]?.children?.[1]
 expect(form).toMatchObject({
  type:'r-form',
  props:{
   dataViewKey:'D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft',
   dataMember:'currentRow',
   contextRowId:{$route:'draftId'},
   onBeforeRender:'bindDraftForm',
  },
 })
 expect(buttons(rule).map(node=>node.props?.['label'])).toEqual(expect.arrayContaining([
  '取消本次草稿编辑','查看分册策划依据','预演候选变更','重查原保存结果',
 ]))
 const cancel=buttons(rule).find(item=>item.props?.['label']==='取消本次草稿编辑')
 expect(cancel?.props).toMatchObject({onBeforeRender:'bindDraftCancel',onClick:'cancelDraft'})
 expect(cancel?.props).not.toHaveProperty('action')
})

it('dispatches the original-save lookup through the standard host-command action',async()=>{
 const assertCurrent=vi.fn(),showAlert=vi.fn(async()=>{})
 const invokeHostCommand=vi.fn(async()=>({state:'SAVED',draftVersion:'V2',assertCurrent}))
 const query={
  saveRequestKey:'Q',saveRequestDigest:'a'.repeat(64),saveContentDigest:'b'.repeat(64),
  saveExpectedDraftVersion:'V1',
 }
 await executeActionDescriptor(descriptor('重查原保存结果'),context({
  invokeHostCommand,getRouteQuery:()=>query,getPageService:()=>({showAlert}) as never,
 }))
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.authoring.readOriginalSave',{
  requestKey:'Q',requestDigest:query.saveRequestDigest,contentDigest:query.saveContentDigest,
  expectedDraftVersion:'V1',
 })
 expect(assertCurrent).toHaveBeenCalledOnce()
 expect(showAlert).toHaveBeenCalledWith(expect.any(String),'原保存结果',{})
})

const auth=vi.hoisted(()=>({applicationId:'D8490EC99436A8B9AFDE205BE3153802',token:'candidate-test-session'}))
vi.mock('@/platform-adapters/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'U'}})},
 readRequestScope:()=>({token:auth.token,headers:{'X-AppId':auth.applicationId}}),
}}))

it.each(['ordinary','single-addition','mapped-three-versions','partial-form','stale-session'] as const)(
 'previews Page11 candidate through the configured button: %s',async variant=>{
  const scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
  const threeVersions=variant==='mapped-three-versions'
  const hasForm=threeVersions||variant==='single-addition'
  const f=await createCandidateReadFixture(hasForm?'mapped-form':'populated',{scenarioId,threeVersions})
  const draft=f.ds.addTableFromJson({tableName:'WorkingDraft',modelBinding:{modelId:'DM',modelName:'WorkingDraft'},
   columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'json'}],
   views:{default:{},personalDraft:{commitMode:'staged',scopeFilter:{logic:'and',filters:[
    {field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'userId',operator:'eq',value:{Type:'GetInputParam',ParamName:'currentUserId'}},
   ]}}}}).getView('personalDraft')!
  const draftQuery=new DataSpaceQueryTable({scenarioId,metaName:'WorkingDraft'})
  draft.bindQueryExecutor({save:f.save,executeQuery:async()=>new DataSpaceQueryContext({
   identity:draftQuery.identity,scope:'q',readScope:()=> 'q',
   snapshot:draftQuery.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{
    id:'WD',projectId:'P',userId:'U',draft:{nodes:[],responseChanges:[]},lingma_sys_params:{r:[],e:[],h:[],m:[],d:false},
   }]}}}),
  })})
  const projectId='P',nodeId='candidate-node',pageId='smart-bid-authoring-page11'
  const tool=new PageTool({pageId})
  tool.hydrateFileText('rule.json',JSON.stringify(rule))
  tool.hydrateFileText('script.js',script);tool.hydrateFileText('style.css',style);tool.markLoaded()
  const query={scenarioId,projectId,draftId:'WD',candidateRevisionId:'C',
   ...(variant==='single-addition'?{candidateAddedNodeId:'H'}:{}),
   ...(variant==='partial-form'?{formTemplateRef:'T'}:{}),
   ...(hasForm?{candidateFormDocumentId:'D',formTemplateRef:'T',formTemplateVersion:'1'}:{}),
   ...(threeVersions?{candidateExpectedHead:'V2'}:{}),
  }
  const call=preparePublishedContentAuthoringCall({path:`/apps/${auth.applicationId}/__page/${nodeId}`,
   meta:{type:'config-page',nodeId,pageId,blueprintScenarioId:scenarioId,tool:{pageId,projectId:auth.applicationId}},query})
  if(!call)throw Error('TEST_PUBLISHED_AUTHORING_CALL_REQUIRED')
  const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],scenarioInputs:call.scenarioInputs,loadScenario:async()=>f.ds})
  const originalToken=auth.token, signal=new AbortController().signal
  const alerts:string[]=[],messages:string[]=[]
  const router=createRouter({history:createMemoryHistory(),routes:[]})
  const pageService={...buildPageService(router),
   showAlert:async(text:string)=>{alerts.push(text)},showMessage:(text:string)=>{messages.push(text)}}
  try{
   await runtime.load()
   const host=call.createHost(runtime)
   const action=descriptor('预演候选变更')
   const execute=()=>executeActionDescriptor(action,context({
    invokeHostCommand:(name,input)=>host.invoke(name,input,signal),getRouteQuery:()=>query,
    getPageService:()=>pageService,
   }))
   if(variant==='stale-session'){
    auth.token='expired-candidate-session'
    await execute()
    expect(messages).toEqual([expect.stringContaining('CONTENT_AUTHORING_STALE')])
    expect(f.query).not.toHaveBeenCalled()
   }else if(variant==='partial-form'){
    await execute()
    expect(messages).toEqual([expect.stringContaining('BID_ORIGINAL_FORM_SCOPE')])
    expect(f.query.mock.calls.some(([view])=>view.viewId==='selectedCandidate')).toBe(false)
   }else{
    await execute()
    expect(messages).toEqual([])
    expect(alerts).toHaveLength(1)
    const result:unknown=JSON.parse(alerts[0]!)
    if(threeVersions){
     expect(result).toMatchObject({scopeCheckPassed:true,originalFormBasisCheck:{
      owner:'DocumentTemplate',scopeRef:{projectId:'P',baselineId:'B',documentId:'D'},
      recordRefs:[{templateRef:'T',templateVersion:'1',formRef:'FORM'}],
     }})
     for(const viewId of ['selectedCandidate','selectedBasis','selectedHead','originalFormMapping'])
      expect(f.query.mock.calls.some(([view])=>view.viewId===viewId)).toBe(true)
    }else{
     expect(result).toMatchObject({addedNodeIds:['C','D','H']})
     expect(f.query.mock.calls.some(([view])=>view.viewId==='originalFormMapping')).toBe(hasForm)
     const undeclared=variant==='single-addition'?['C','D']:['C','D','H']
     expect(result).toMatchObject({violations:undeclared.map(ownerId=>
      expect.objectContaining({code:'UNDECLARED_ADDITION',ownerId}))})
    }
   }
   expect(f.save).not.toHaveBeenCalled()
   expect(runtime.isDirty).toBe(false)
  }finally{auth.token=originalToken;runtime.dispose()}
 })
