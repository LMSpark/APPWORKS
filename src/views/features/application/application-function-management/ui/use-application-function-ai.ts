/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-ai
 * 职责：项目蓝图页的 AI 生成/预览/确认流程；候选、表单预览与逐项结果仅存于当前 owner DataSet 的命名 DataView。
 * 边界：AI 草稿只经严格协议校验；写入候选身份、保存回执与 unknown 续办由 BlueprintWorkspaceDataView 拥有。
 * 取消、节点或上下文切换会作废迟到结果；unknown 后只能沿原候选身份核验，不能重新生成节点。
 */
import {computed, onScopeDispose, ref, shallowRef, watch, type Ref} from 'vue'
import {buildDataViewKey, ensureDataSetStaticInputTable, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import type {BlueprintModuleCreateCandidate} from '@/services/project/blueprint-workspace-dataview'
import type {BlueprintTreeContext} from './use-application-function-page'
import {
  BLUEPRINT_AI_FORM_LABELS, BLUEPRINT_AI_REJECTED, blueprintAiDraftFields, blueprintConTypeToAiKind, buildBlueprintFormAiPrompt,
  buildBlueprintTreeAiPrompt, parseBlueprintAiForm, parseBlueprintAiRows, readBlueprintCurrentText, type BlueprintAiDraft,
} from './application-function-page-contract'

type TreeAiPreviewMeta = Readonly<{kind:'tree'; contextKey:string; parentNodeId:string|null; parentLabel:string}>
type FormAiPreviewMeta = Readonly<{kind:'form'; contextKey:string; nodeId:string}>
type AiViewResource = Readonly<{
  context:BlueprintTreeContext
  dataSet:DataSet
  candidateTableName:string
  resultTableName:string
  candidate:DataView
  result:DataView
  candidateViewKey:string
  resultViewKey:string
}>
type ResultStatus='待写入'|'写入中'|'已写入'|'失败'|'结果未知'

const textColumn = (field:string,label:string,minWidth:number):SparkNode =>
  ({type:'r-text',props:{field,label,readonly:true,minWidth,sortable:false,showOverflowTooltip:true}})
export const BLUEPRINT_AI_CANDIDATE_COLUMNS:readonly SparkNode[]=Object.freeze([
  textColumn('navigationTitle','导航标题',180),textColumn('capabilityName','能力名称',180),textColumn('kind','节点类型',100),
  textColumn('deliveryStatus','交付状态',100),textColumn('description','能力简述',360),
])
export const BLUEPRINT_AI_FORM_COLUMNS:readonly SparkNode[]=Object.freeze([
  textColumn('label','表单字段',140),textColumn('value','AI 回填值',420),
])
export const BLUEPRINT_AI_RESULT_COLUMNS:readonly SparkNode[]=Object.freeze([
  textColumn('candidateOrder','序号',70),textColumn('candidateLabel','候选',220),textColumn('status','进度',100),
  textColumn('message','说明',360),
])

/** 页面向 AI 流程提供的上下文与正式 owner 入口。 */
export type ApplicationFunctionAiInput = Readonly<{
  context:()=>BlueprintTreeContext|undefined
  selectedNodeId:Readonly<Ref<string>>
  isLive:(context:BlueprintTreeContext,nodeId:string)=>boolean
  applicationLabel:()=>string
  createRunner:(context:BlueprintTreeContext)=>Readonly<{run:(message:string,signal?:AbortSignal)=>Promise<string>}>
  /** 提交精确候选 DataView 行构成的证明，并返回确认后的正式节点 ID。 */
  createNode:(candidate:BlueprintModuleCreateCandidate)=>Promise<string>
  expand:(nodeId:string)=>void
  notifyChanged:()=>void
  readInput:(field:string)=>string
  resetInput:(field:string)=>void
  error:Ref<string>
  notice:Ref<string>
}>

function describe(cause:unknown):string{return cause instanceof Error?cause.message:String(cause)}

function appendCandidate(view:DataView,candidate:Readonly<Record<string,unknown>>):void{view.appendRow({...candidate})}

function readCandidateDraft(row:DataRow):BlueprintAiDraft{
  const draft={
    navigationTitle:row['navigationTitle'],
    capabilityName:row['capabilityName'],
    description:row['description'],
    kind:row['kind'],
    deliveryStatus:row['deliveryStatus'],
  }
  return parseBlueprintAiForm(JSON.stringify(draft))
}

function readTreeCandidate(row:DataRow,parentNodeId:string|null):BlueprintModuleCreateCandidate{
  const candidateId=String(row['candidateId']??'')
  const rowParent=String(row['parentNodeId']??'').trim()
  const expectedParent=parentNodeId??''
  if(rowParent!==expectedParent)throw new Error('蓝图 AI 候选 DataView 行的父节点与当前预览不一致')
  return {candidateId,parentNodeId:rowParent||null,fields:blueprintAiDraftFields(readCandidateDraft(row))}
}

export function useApplicationFunctionAi(input:ApplicationFunctionAiInput){
  const treeAiOpen=ref(false)
  const treeAiRequirement=computed(()=>input.readInput('requirement'))
  const treeAiPreview=shallowRef<TreeAiPreviewMeta>()
  const formAiPreview=shallowRef<FormAiPreviewMeta>()
  const treeAiConfirming=ref(false)
  const aiGenerating=ref(false)
  const aiCandidateViewKey=ref('')
  const aiResultViewKey=ref('')
  const viewRevision=ref(0)
  let revision=0
  let controller:AbortController|undefined
  let resources:AiViewResource|undefined

  const treeAiCandidateRows=computed(()=>{void viewRevision.value;return treeAiPreview.value?resources?.candidate.rows??[]:[]})
  const formAiPreviewItems=computed(()=>{void viewRevision.value;return formAiPreview.value?resources?.candidate.rows??[]:[]})
  const treeAiCreated=computed(()=>{void viewRevision.value;return resources?.result.rows.filter(row=>row['status']==='已写入').length??0})

  function nodeLabel(context:BlueprintTreeContext,nodeId:string):string{
    const row=context.owner.view.rows.find(candidate=>String(candidate['rowid']??'')===nodeId)
    const title=row?.['FunName']??row?.['name']
    return typeof title==='string'?title:nodeId
  }

  function clearViews():void{
    const current=resources
    if(!current)return
    if(!current.candidate.destroyed&&current.context.owner.dataSet.getView(current.candidateTableName,'default')===current.candidate)current.candidate.replaceRows([])
    if(!current.result.destroyed&&current.context.owner.dataSet.getView(current.resultTableName,'default')===current.result)current.result.replaceRows([])
    viewRevision.value++
  }

  function invalidate():void{
    revision++
    controller?.abort()
    controller=undefined
    aiGenerating.value=false
    clearViews()
    treeAiPreview.value=undefined
    formAiPreview.value=undefined
  }

  /** 作废请求与全部预览；确认写入中的候选在当前 owner 请求完成后停止。 */
  function cancelAi():void{invalidate();treeAiOpen.value=false}

  function releaseResources():void{
    const current=resources
    resources=undefined
    aiCandidateViewKey.value=''
    aiResultViewKey.value=''
    if(!current)return
    if(!current.dataSet.destroyed){
      if(current.dataSet.getView(current.candidateTableName,'default')===current.candidate)current.dataSet.removeTable(current.candidateTableName)
      if(current.dataSet.getView(current.resultTableName,'default')===current.result)current.dataSet.removeTable(current.resultTableName)
    }
  }

  function mountResources(context:BlueprintTreeContext):void{
    const dataSet=context.owner.dataSet
    const suffix=crypto.randomUUID().replaceAll('-','')
    const candidateTableName=`BlueprintAiCandidate${suffix}`
    const resultTableName=`BlueprintAiResult${suffix}`
    for(const tableName of [candidateTableName,resultTableName])if(dataSet.getTable(tableName))throw new Error('蓝图 AI 临时视图名称冲突')
    ensureDataSetStaticInputTable(dataSet,candidateTableName,[
      {name:'candidateId',primary:true},{name:'candidateOrder',type:'number'},{name:'candidateLabel'},{name:'navigationTitle'},
      {name:'capabilityName'},{name:'description'},{name:'kind'},{name:'deliveryStatus'},{name:'parentNodeId'},
      {name:'field'},{name:'label'},{name:'value'},
    ])
    ensureDataSetStaticInputTable(dataSet,resultTableName,[
      {name:'candidateId',primary:true},{name:'candidateOrder',type:'number'},{name:'candidateLabel'},{name:'status'},{name:'message'},
    ])
    const candidate=dataSet.getView(candidateTableName,'default')
    const result=dataSet.getView(resultTableName,'default')
    if(!candidate||!result)throw new Error('蓝图 AI 候选或结果 DataView 未装配')
    const candidateViewKey=buildDataViewKey(candidateTableName,'default',dataSet.scenarioId)
    const resultViewKey=buildDataViewKey(resultTableName,'default',dataSet.scenarioId)
    if(context.runtime.resolveView(candidateViewKey)!==candidate||context.runtime.resolveView(resultViewKey)!==result)throw new Error('蓝图 AI 临时 DataView 不属于当前运行时')
    resources={context,dataSet,candidateTableName,resultTableName,candidate,result,candidateViewKey,resultViewKey}
    aiCandidateViewKey.value=candidateViewKey
    aiResultViewKey.value=resultViewKey
    viewRevision.value++
  }

  watch(()=>input.context()?.key,()=>{
    invalidate()
    releaseResources()
    const context=input.context()
    if(!context)return
    try{mountResources(context)}
    catch(cause){input.error.value=cause instanceof Error?cause.message:String(cause)}
  },{immediate:true,flush:'sync'})

  async function generate(context:BlueprintTreeContext,nodeId:string,prompt:string):Promise<string|undefined>{
    invalidate()
    const request=revision
    const current=new AbortController()
    controller=current
    aiGenerating.value=true
    try{
      const text=await input.createRunner(context).run(prompt,current.signal)
      return request===revision&&input.isLive(context,nodeId)?text:undefined
    }catch(cause){
      if(request===revision&&input.isLive(context,nodeId))input.error.value=`AI生成失败：${describe(cause)}`
      return undefined
    }finally{
      if(request===revision){aiGenerating.value=false;controller=undefined}
    }
  }

  function openTreeAi():void{
    if(!input.context())return
    cancelAi()
    input.resetInput('requirement')
    treeAiOpen.value=true
  }

  async function generateTreeAi():Promise<void>{
    const context=input.context()
    const requirement=treeAiRequirement.value
    if(!context||!requirement.trim()||aiGenerating.value)return
    const nodeId=input.selectedNodeId.value
    const parentLabel=nodeId?nodeLabel(context,nodeId):''
    let prompt:string
    try{prompt=buildBlueprintTreeAiPrompt({applicationLabel:input.applicationLabel(),parentLabel,requirement})}
    catch(cause){input.error.value=describe(cause);return}
    const text=await generate(context,nodeId,prompt)
    if(text===undefined)return
    try{
      const parsed=parseBlueprintAiRows(text)
      const current=resources
      if(current?.context.key!==context.key)throw new Error('AI 候选 DataView 已失效')
      current.candidate.replaceRows([])
      current.result.replaceRows([])
      for(const [index,draft] of parsed.entries()){
        const candidateId=context.owner.createModuleCandidateId()
        appendCandidate(current.candidate,{candidateId,candidateOrder:index+1,candidateLabel:draft.capabilityName,
          ...draft,parentNodeId:nodeId})
        appendCandidate(current.result,{candidateId,candidateOrder:index+1,candidateLabel:draft.capabilityName,
          status:'待写入',message:''})
      }
      treeAiPreview.value={kind:'tree',contextKey:context.key,parentNodeId:nodeId||null,
        parentLabel:parentLabel||input.applicationLabel()||'应用根层'}
      treeAiOpen.value=false
      viewRevision.value++
      input.error.value=''
    }catch(cause){
      clearViews()
      treeAiPreview.value=undefined
      input.error.value=`${BLUEPRINT_AI_REJECTED}：${describe(cause)}`
    }
  }

  function setResult(candidateId:string,status:ResultStatus,message=''):void{
    if(resources?.result.updateRowById(candidateId,{status,message})===true)viewRevision.value++
  }

  /** 逐项沿原候选确认；失败项保留在结果 DataView，再次确认只续办该身份。 */
  async function confirmTreeAi():Promise<void>{
    const preview=treeAiPreview.value
    const context=input.context()
    const current=resources
    if(!preview||!context||!current||treeAiConfirming.value)return
    if(current.context.key!==context.key||context.key!==preview.contextKey||(input.selectedNodeId.value||null)!==preview.parentNodeId){
      cancelAi()
      input.error.value='蓝图上下文或选中节点已变化，AI 草案未写入'
      return
    }
    const request=revision
    treeAiConfirming.value=true
    try{
      for(const candidate of current.candidate.rows){
        const candidateId=String(candidate['candidateId']??'')
        const progress=current.result.rows.find(row=>String(row['candidateId']??'')===candidateId)
        if(!candidateId||progress?.['status']==='已写入')continue
        setResult(candidateId,'写入中')
        try{
          const proof=readTreeCandidate(candidate,preview.parentNodeId)
          if(proof.candidateId!==candidateId)throw new Error('蓝图 AI 候选 DataView 主键与行身份不一致')
          const nodeId=await input.createNode(proof)
          if(request!==revision)return
          setResult(candidateId,'已写入',`正式节点 ${nodeId}`)
        }catch(cause){
          if(request!==revision)return
          const unknown=context.owner.hasUnconfirmedSave||context.owner.hasPendingRootCreate||context.owner.hasPendingChildCreate
          setResult(candidateId,unknown?'结果未知':'失败',describe(cause))
          input.error.value=unknown
            ?`AI 草案已写入 ${treeAiCreated.value}/${current.candidate.rows.length} 个节点，第 ${candidate['candidateOrder']} 项结果未知：${describe(cause)}；请再次确认核验原候选`
            :`AI 草案已写入 ${treeAiCreated.value}/${current.candidate.rows.length} 个节点，其余未写入：${describe(cause)}；可再次确认继续`
          return
        }
        if(!input.isLive(context,preview.parentNodeId??'')){
          input.error.value=`蓝图上下文已变化，AI 草案已写入 ${treeAiCreated.value}/${current.candidate.rows.length} 个节点后停止`
          return
        }
      }
      if(preview.parentNodeId!==null)input.expand(preview.parentNodeId)
      input.notice.value=`已写入 ${current.candidate.rows.length} 个下一级蓝图节点`
      input.error.value=''
      clearViews()
      treeAiPreview.value=undefined
    }finally{treeAiConfirming.value=false}
  }

  async function generateFormAi():Promise<void>{
    const context=input.context()
    const nodeId=input.selectedNodeId.value
    if(!context||!nodeId||aiGenerating.value)return
    const owner=context.owner
    const read=(field:string)=>readBlueprintCurrentText(owner,field)
    const prompt=buildBlueprintFormAiPrompt({applicationLabel:input.applicationLabel(),nodeLabel:nodeLabel(context,nodeId),current:{
      navigationTitle:read('FunName'),capabilityName:read('name'),kind:blueprintConTypeToAiKind(read('conType')),
      deliveryStatus:read('status'),description:read('memo'),
    }})
    const text=await generate(context,nodeId,prompt)
    if(text===undefined)return
    try{
      const draft=parseBlueprintAiForm(text)
      const current=resources
      if(current?.context.key!==context.key)throw new Error('AI 回填 DataView 已失效')
      current.candidate.replaceRows([])
      current.result.replaceRows([])
      for(const [index,[field,label]] of BLUEPRINT_AI_FORM_LABELS.entries()){
        appendCandidate(current.candidate,{candidateId:`FORM:${nodeId}:${field}`,candidateOrder:index+1,candidateLabel:label,
          field,label,value:draft[field]})
      }
      formAiPreview.value={kind:'form',contextKey:context.key,nodeId}
      viewRevision.value++
      input.error.value=''
    }catch(cause){
      clearViews()
      formAiPreview.value=undefined
      input.error.value=`${BLUEPRINT_AI_REJECTED}：${describe(cause)}`
    }
  }

  /** 回填仅写入预览对应原节点的 DataView 编辑覆盖；不保存。 */
  function confirmFormAi():void{
    const preview=formAiPreview.value
    const context=input.context()
    formAiPreview.value=undefined
    if(!preview||!context)return
    if(!input.isLive(context,preview.nodeId)||context.key!==preview.contextKey){
      clearViews()
      input.error.value='蓝图上下文或选中节点已变化，AI 回填未写入'
      return
    }
    const owner=context.owner
    const current=resources
    if(current?.context.key!==context.key){
      input.error.value='AI 回填候选 DataView 已失效'
      return
    }
    const values:Record<string,unknown>={}
    for(const [field] of BLUEPRINT_AI_FORM_LABELS){
      const matches=current.candidate.rows.filter(row=>row['field']===field)
      if(matches.length!==1||String(matches[0]?.['candidateId']??'')!==`FORM:${preview.nodeId}:${field}`){
        clearViews()
        input.error.value=`AI 回填候选 DataView 字段 ${field} 身份不唯一`
        return
      }
      values[field]=matches[0]?.['value']
    }
    let draft:BlueprintAiDraft
    try{draft=parseBlueprintAiForm(JSON.stringify(values))}
    catch(cause){clearViews();input.error.value=`${BLUEPRINT_AI_REJECTED}：${describe(cause)}`;return}
    const fields=Object.entries(blueprintAiDraftFields(draft))
    const denied=fields.find(([field])=>!owner.canWrite(field))
    if(denied){clearViews();input.error.value=`当前 DataView 不允许写入字段 ${denied[0]}，AI 回填未写入`;return}
    try{
      for(const [field,value] of fields)owner.update(field,value)
      input.error.value=''
      input.notice.value='AI内容已回填到表单'
    }catch(cause){input.error.value=`AI 回填失败：${describe(cause)}`}
    finally{clearViews();input.notifyChanged()}
  }

  watch(()=>[input.selectedNodeId.value,input.context()?.key],()=>cancelAi())
  onScopeDispose(()=>{cancelAi();releaseResources()})

  return {
    treeAiOpen,treeAiRequirement,treeAiPreview,treeAiCandidateRows,treeAiCreated,treeAiConfirming,formAiPreview,formAiPreviewItems,aiGenerating,
    aiCandidateViewKey,aiResultViewKey,treeCandidateColumns:BLUEPRINT_AI_CANDIDATE_COLUMNS,formCandidateColumns:BLUEPRINT_AI_FORM_COLUMNS,
    resultColumns:BLUEPRINT_AI_RESULT_COLUMNS,openTreeAi,generateTreeAi,confirmTreeAi,generateFormAi,confirmFormAi,cancelAi,
  }
}
