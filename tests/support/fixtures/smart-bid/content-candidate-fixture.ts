import {vi} from 'vitest'
import {DataSet,parseDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {hashContentNode} from '@/services/smart-bid/content-node-hash'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

export async function createCandidateReadFixture(mode='normal',options:{tenderConfirmStatus?:'CONFIRMED'|'REJECTED';threeVersions?:boolean;headingText?:string;computeRoot?:boolean}={}){
 const param=(name:string)=>({Type:'GetInputParam',ParamName:name})
 const eq=(field:string,name=field)=>({field,operator:'eq' as const,value:param(name)})
 const payloads:Array<{nodeId:string;parentId:string;index:number;type:string;class:string[];value:string;data:Record<string,unknown>}>=
  [{nodeId:'D',parentId:'P',index:0,type:'document',class:[],value:'',data:{}},
  {nodeId:'C',parentId:'D',index:0,type:'chapter',class:[],value:'',data:{}},
  {nodeId:'H',parentId:'C',index:0,type:'heading',class:['candidate-heading'],value:options.headingText??'标题{{册名}}',
   data:{册名:{type:'xref',nodeId:'D',show:'title'}}}]
 if(mode==='fact'||mode==='fixed-pin'){
  Object.assign(payloads[2]!,{value:'报价{{报价}}元',data:{报价:{type:'fact',factId:'PRICE'}}})
 }
 if(mode==='sibling-tree')payloads.push({nodeId:'Z',parentId:'C',index:1,type:'paragraph',class:[],value:'第一段',data:{}},
  {nodeId:'A',parentId:'C',index:2,type:'paragraph',class:[],value:'第二段',data:{}})
 if(mode==='calculation')payloads.push({nodeId:'T',parentId:'C',index:1,type:'table',class:['deviation'],value:'',
  data:{header:[],rows:[]}})
 const members=await Promise.all(payloads.map(async payload=>({nodeId:payload.nodeId,nodeHash:await hashContentNode(payload),payload})))
 const populated=['populated','bad-template','bad-pin','valid-pin','fixed-pin','bad-response','sibling-tree','fact','calculation'].includes(mode)
 const templateRefs=populated?[{documentId:mode==='bad-template'?'H':'D',key:'T',version:'1',hash:'a'.repeat(64)}]:[]
 const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:'P',baselineId:'B',stageRef:{id:'ST',version:'1'},
  templateRefs,nodes:populated?members.map(({nodeId,nodeHash})=>({nodeId,nodeHash})).sort((a,b)=>a.nodeId<b.nodeId?-1:1):[],
  requirementPins:['bad-pin','valid-pin','fixed-pin','bad-response'].includes(mode)?[{chapterId:mode==='bad-pin'?'H':'C',lineageId:'L',version:mode==='fixed-pin'?'R2':'R1'}]:[],
  responseAssignments:mode==='response-fact'?[{id:'A',lineageId:'L',version:'R1'}]:[],
  responses:mode==='bad-response'?[{id:'R',assignmentId:'A',lineageId:'L',version:'R1',revisionId:'ORIGINAL',chapterId:'C',anchorNodeId:'D'}]:
   ['bad-response-text','response-fact'].includes(mode)?[{id:'I',assignmentId:'A',lineageId:'L',version:'R1',revisionId:'ORIGINAL',
    statement:mode==='response-fact'?'报价{{金额}}元，再确认{{金额}}元':'报价{{金额}}元',
    data:mode==='response-fact'?{金额:{type:'fact',factId:'PRICE'}}:{}}]:[],
  qualificationReviews:[],sensitiveRefs:[]}
 const snapshotHash=await hashRevisionSnapshot(manifest)
 const rootHash=options.computeRoot?await hashRevisionContentRoot({manifest,
  baseline:{id:'B',projectId:'P',stageRef:manifest.stageRef,factVersions:[{factId:'PRICE',version:2}]}}):null
 const tenderReference={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
 const requirement={id:'REQ',projectId:'P',lineageId:'L',version:'R2',kind:'FORMAT',text:'原文',score:null,sourceSpan:null,
  supportingSpans:[],sourceRecord:mode==='fixed-pin'?tenderReference:null,parseQuality:'TEXT_ONLY',checks:[],constraint:null,applicability:{},status:'ADOPTED'}
 const tender={id:'TR',projectId:'P',...tenderReference,
  payload:{text:'核定原文'},sourceSpan:{page:1},parseQuality:'LOCATED',confirmStatus:options.tenderConfirmStatus??'CONFIRMED'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{
  TenderRecord:{modelBinding:{modelId:'TENDER_MODEL',modelName:'TenderRecord'},
   columns:Object.keys(tender).map(name=>({name,isPrimaryKey:name==='id',type:name==='ordinal'?'number':name==='payload'||name==='sourceSpan'?'object':'string'})),
   views:{default:{},selectedTenderRecord:{commitMode:'staged',scopeFilter:{logic:'and',
    filters:['projectId','runId','type','ordinal','recordVersion','recordHash'].map(field=>eq(field))}}}},
  Requirement:{modelBinding:{modelId:'REQ_MODEL',modelName:'Requirement'},columns:Object.keys(requirement).map(name=>({name,isPrimaryKey:name==='id',type:['sourceSpan','supportingSpans','sourceRecord','checks','constraint','applicability'].includes(name)?'object':name==='score'?'number':'string'})),
   views:{default:{},selectedRequirement:{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('lineageId'),eq('version')]}},
    effectiveRequirementVersions:{commitMode:'staged',scopeFilter:eq('projectId'),queryConfig:{autoQuery:false,allPages:true,pagination:'paged'}}}},
  Baseline:{modelBinding:{modelId:'BM',modelName:'Baseline'},columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'stageRef',type:'object'},{name:'factVersions',type:'object'},{name:'requirementVersions',type:'object'},{name:'tenderRecords',type:'object'}],
   views:{default:{},...Object.fromEntries(['selectedBaseline','selectedBasisBaseline','selectedHeadBaseline'].map(key=>[
    key,{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('id','baselineId')]}},
   ]))}},
  FactVersion:{modelBinding:{modelId:'FM',modelName:'FactVersion'},columns:['id','projectId','key','version','kind','value','unit','sourceIds','claimId','scopeRef','decisionRefs','dependencyRefs','promiseTerms','sourceRecord','status'].map(name=>({name,isPrimaryKey:name==='id',type:name==='version'?'number':['value','sourceIds','scopeRef','decisionRefs','dependencyRefs','promiseTerms','sourceRecord'].includes(name)?'object':'string'})),
   views:{default:{},selectedFactVersion:{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('key'),eq('version')]}},
    effectiveFactVersions:{commitMode:'staged',queryConfig:{allPages:true,pagination:'paged',autoQuery:false},scopeFilter:eq('projectId')}}},
  ContentProject:{modelBinding:{modelId:'PM',modelName:'ContentProject'},columns:[{name:'projectId',type:'string',isPrimaryKey:true},{name:'headRevisionId',type:'string'}],
   views:{default:{},selectedProject:{scopeFilter:eq('projectId')}}},
  ContentRevision:{modelBinding:{modelId:'RM',modelName:'ContentRevision'},columns:[{name:'id',type:'string',isPrimaryKey:true},
   ...['projectId','status','snapshotHash','rootHash','baselineId','basisRevisionId'].map(name=>({name,type:'string'})),{name:'stageRef',type:'object'},{name:'templateRefs',type:'object'},{name:'targetScope',type:'object'}],
   views:{default:{},selectedCandidate:{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('id','candidateRevisionId'),{field:'status',operator:'eq',value:'CANDIDATE'}]}},
    selectedBasis:{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('id','basisRevisionId'),{field:'status',operator:'eq',value:'ADOPTED'}]}},
    selectedHead:{commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('id','expectedHead'),{field:'status',operator:'eq',value:'ADOPTED'}]}}}},
  RevisionSnapshot:{modelBinding:{modelId:'SM',modelName:'RevisionSnapshot'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'snapshotHash',type:'string'},{name:'manifest',type:'object'}],
   views:{default:{},...Object.fromEntries(['selectedSnapshot','selectedBasisSnapshot','selectedHeadSnapshot'].map(key=>[key,
    {commitMode:'staged',scopeFilter:{logic:'and',filters:[eq('projectId'),eq('snapshotHash')]}}]))}},
  ContentNodeVersion:{modelBinding:{modelId:'NM',modelName:'ContentNodeVersion'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},
   {name:'nodeId',type:'string'},{name:'nodeHash',type:'string'},{name:'payload',type:'object'}],views:{default:{},
    ...Object.fromEntries(['snapshotMembers','basisSnapshotMembers','headSnapshotMembers'].map(key=>[key,{commitMode:'staged',queryConfig:{allPages:true,pagination:'paged'},
     scopeFilter:{logic:'and',filters:[eq('projectId'),{field:'nodeHash',operator:'in',value:param('nodeHashes')}]}}]))}}
 }})
 const candidate={id:'C',projectId:'P',status:'CANDIDATE',snapshotHash,rootHash,basisRevisionId:options.threeVersions?'V1':null,baselineId:mode==='baseline'?'OTHER':'B',
  targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'PROJECT'}]},
  stageRef:mode==='stage'?{id:'ST',version:'2'}:{version:'1',id:'ST'},
  templateRefs:mode==='template'?[{documentId:'D',key:'T',version:'2',hash:'a'.repeat(64)}]:templateRefs}
 const query=vi.fn(async(view:DataView)=>{
  const model=view.dataTable!.tableName,q=new DataSpaceQueryTable({scenarioId:'S',metaName:model})
  const rows=model==='TenderRecord'?[tender]:model==='Requirement'?[requirement]:model==='Baseline'?[{id:mode==='wrong-fact-baseline'?'OTHER':'B',projectId:'P',stageRef:{id:'ST',version:'1'},factVersions:[{factId:'PRICE',version:2}],requirementVersions:[{lineageId:'L',version:'R2'}],
   tenderRecords:[{runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}]}]:
   model==='FactVersion'?[{id:'FV2',projectId:'P',key:'PRICE',version:2,kind:'PRICE',value:'0.00',unit:'元',sourceIds:[],claimId:null,scopeRef:null,decisionRefs:[],dependencyRefs:[],promiseTerms:null,sourceRecord:null,status:'ADOPTED'}]:
   model==='ContentProject'?[{projectId:'P',headRevisionId:options.threeVersions?'V2':null}]:
   model==='ContentRevision'?[view.viewId==='selectedCandidate'?candidate:{...candidate,id:view.viewId==='selectedBasis'?'V1':'V2',status:'ADOPTED'}]:
   model==='ContentNodeVersion'?(mode==='sibling-tree'?[...members].sort((a,b)=>a.nodeId<b.nodeId?-1:1):members)
    .map(member=>({id:`ROW_${member.nodeId}`,projectId:'P',...member})):[{id:'SN',projectId:'P',snapshotHash,manifest}]
  return new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{primaryKeyField:model==='ContentProject'?'projectId':'id',data:{
   Count:rows.length,Items:rows.map(row=>({...row,lingma_sys_params:{r:[],e:[],h:mode==='hidden'&&model==='ContentRevision'?['stageRef']:[],m:[],d:false}}))}}})})
 })
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 for(const table of Object.values(ds.tables))for(const view of Object.values(table.views))view.bindQueryExecutor({executeQuery:query,save})
 ds.getView('ContentProject','selectedProject')!.queryContext={projectId:'P'}
 let current=true
 const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},
  assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {ds,host,query,save,expire:()=>{current=false}}
}
