/**
 * @module app:views/features/application/smart-bid/authoring/model/adoption/adopted-production-reader
 * 职责：以原采用及同版内容根证明准备正式制件输入。
 */
import {inspectAdoptionRecovery} from '@/services/smart-bid/content/adoption/adoption-recovery'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'
import {readContentAdoption} from './content-adoption-reader'
import {isRecord} from '@spark-appworks/spark-utils'

type RecoveryInput=Parameters<typeof inspectAdoptionRecovery>
type Production=Parameters<typeof prepareProductionRequest>

/** 正式制件既需原责任域提交实核，也需本次独立读取同版修订和册节点。 */
export async function prepareAdoptedProduction(
 host:Parameters<typeof readContentAdoption>[0],
 input:Omit<Production[0],'purpose'>,
 source:Readonly<{adoption:RecoveryInput;assertCurrent:()=>void;readEvidence:(version:Production[1])=>Promise<Production[2]>}>,
){
 source.assertCurrent()
 const request=structuredClone(input)
 const result=inspectAdoptionRecovery(...source.adoption)
 const [adoptionRequest]=source.adoption
 const error='BID_PRODUCTION_ADOPTION_REQUIRED'
 if(result.effect!=='COMMITTED'||!result.commitCheckRef||adoptionRequest.projectId!==host.projectId||
  request.projectId!==host.projectId||result.mergeRevisionId!==request.revisionId)throw Error(error)
 const scopedHost={...host,assertCurrent:()=>{host.assertCurrent();source.assertCurrent()}}
 const original=await readContentAdoption(scopedHost,adoptionRequest)
 if(!original.recordFound)throw Error(error)
 original.assertCurrent()
 if(original.adoptionRef!==result.adoptionRef||original.commitCheckRef!==result.commitCheckRef||
  original.mergeRevisionId!==result.mergeRevisionId)throw Error(error)
 const merge=await original.readMergeRevision()
 const snapshot=await merge.readSnapshot()
 const documentView=snapshot.nodes.dataViewKey?host.runtime.resolveView(snapshot.nodes.dataViewKey):undefined
 const document=documentView?.rows.find(item=>item['nodeId']===request.documentId)
 const payload=document?.['payload']
 if(snapshot.snapshot.index.baselineId!==request.baselineId||!isRecord(payload)||payload['type']!=='document')
  throw Error('BID_PRODUCTION_DOCUMENT_REQUIRED')
 const root=await snapshot.verifyRootHash(CONTENT_ROOT_HASH_CONTRACT)
 const version=Object.freeze({projectId:host.projectId,documentId:request.documentId,revisionId:result.mergeRevisionId,
  baselineId:snapshot.snapshot.index.baselineId,state:'ADOPTED' as const,rootHash:root.rootHash,assertCurrent:root.assertCurrent})
 const evidence=await source.readEvidence(version)
 return prepareProductionRequest({...request,purpose:'FORMAL'},version,evidence)
}
