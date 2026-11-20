/**
 * @module app:services/smart-bid/content/references/response/bid-volume-plan
 * 职责：动作32按原应交义务策划分册、独立落点及披露范围。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import {validateContentTreeStructure,type ContentStructureNode} from '../../../content-tree-structure'

type Scope=Readonly<{projectId:string;baselineId:string}>
type Destination=Readonly<{obligationRef:string;targetRef:string;disclosureRefs:readonly string[]}>&(
 Readonly<{kind:'DOCUMENT';documentId:string}>|Readonly<{kind:'INDEPENDENT'}>
)
type Obligation=Readonly<{obligationRef:string;kind:Destination['kind'];required:boolean;allowedDisclosureRefs:readonly string[]}>

/** 策划可先固定新册ID；实际树结构仍须在首次采用时核归属。 */
export function prepareBidVolumePlan(input:Scope&Readonly<{destinations:readonly Destination[]}>,source:Scope&Readonly<{
 obligations:readonly Obligation[];assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {projectId,baselineId}=input
 if(![projectId,baselineId].every(identity)||projectId!==source.projectId||
  baselineId!==source.baselineId)throw Error('BID_VOLUME_PLAN_SCOPE')
 const obligations=new Map(source.obligations.map(item=>[item.obligationRef,item]))
 if(!obligations.size||obligations.size!==source.obligations.length||
  source.obligations.some(item=>!identity(item.obligationRef)||!['DOCUMENT','INDEPENDENT'].includes(item.kind)||
   typeof item.required!=='boolean'||!item.allowedDisclosureRefs.every(identity)))throw Error('BID_VOLUME_PLAN_OBLIGATIONS')
 const targetRefs=new Set<string>(),selected=new Set<string>(),volumes=new Set<string>()
 const destinations=Object.freeze(input.destinations.map(item=>{
  const rule=obligations.get(item.obligationRef)
  if(rule?.kind!==item.kind||!identity(item.targetRef)||targetRefs.has(item.targetRef)||selected.has(item.obligationRef)||
   new Set(item.disclosureRefs).size!==item.disclosureRefs.length||
   item.disclosureRefs.some(ref=>!rule.allowedDisclosureRefs.includes(ref)))throw Error('BID_VOLUME_PLAN_DESTINATION')
  targetRefs.add(item.targetRef)
  selected.add(item.obligationRef)
  const base={obligationRef:item.obligationRef,targetRef:item.targetRef,disclosureRefs:Object.freeze([...item.disclosureRefs].sort())}
  if(item.kind==='INDEPENDENT')return Object.freeze({...base,kind:item.kind})
  if(!identity(item.documentId)||item.documentId===projectId)throw Error('BID_VOLUME_PLAN_DESTINATION')
  volumes.add(item.documentId)
  return Object.freeze({...base,kind:item.kind,documentId:item.documentId})
 }))
 if(source.obligations.some(item=>item.required&&!selected.has(item.obligationRef)))throw Error('BID_VOLUME_PLAN_INCOMPLETE')
 source.assertCurrent()
 return Object.freeze({projectId,baselineId,destinations,documentIds:Object.freeze([...volumes].sort()),
  assertCurrent:source.assertCurrent})
}

/** 首次采用时从同项目、同基线的拟采用树核实分册和章节归属。 */
export function verifyBidVolumePlanPlacement(plan:ReturnType<typeof prepareBidVolumePlan>,tree:Scope&Readonly<{
 nodes:readonly ContentStructureNode[];assertCurrent:()=>void
}>){
 const assertCurrent=()=>{plan.assertCurrent();tree.assertCurrent()}
 assertCurrent()
 if(tree.projectId!==plan.projectId||tree.baselineId!==plan.baselineId||
  validateContentTreeStructure(tree).length)throw Error('BID_VOLUME_PLAN_TREE')
 const byId=new Map(tree.nodes.map(node=>[node.nodeId,node]))
 for(const destination of plan.destinations){
  if(destination.kind!=='DOCUMENT')continue
  const document=byId.get(destination.documentId)
  const target=byId.get(destination.targetRef)
  if(document?.type!=='document'||document.parentId!==plan.projectId||!target)
   throw Error('BID_VOLUME_PLAN_PLACEMENT')
  let ancestor:ContentStructureNode|undefined=target
  while(ancestor&&ancestor.type!=='document')ancestor=byId.get(ancestor.parentId)
  if(ancestor?.nodeId!==document.nodeId)throw Error('BID_VOLUME_PLAN_PLACEMENT')
 }
 return Object.freeze({documentIds:plan.documentIds,assertCurrent})
}
