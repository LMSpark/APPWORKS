/**
 * @module app:views/features/application/smart-bid/authoring/model/review/production/candidate-production-reader
 * 职责：动作40从固定候选及原册节点准备供审稿制作请求。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'
import {readCandidateContent} from '../../content-candidate-reader'

type Production=Parameters<typeof prepareProductionRequest>

/** 供审请求复用候选的正式节点与根摘要证明，不沿当前活动修订猜选。 */
export async function prepareCandidateProduction(
 host:Parameters<typeof readCandidateContent>[0],
 input:Readonly<{selection:Parameters<typeof readCandidateContent>[1];request:Omit<Production[0],'purpose'>}>,
 readEvidence:(version:Production[1])=>Promise<Production[2]>,
){
 const selection={...input.selection}
 const request={...input.request,outputOptions:structuredClone(input.request.outputOptions)}
 if(request.projectId!==host.projectId||request.revisionId!==selection.candidateRevisionId)
  throw Error('BID_PRODUCTION_CANDIDATE_SCOPE')
 const candidate=await readCandidateContent(host,selection)
 candidate.assertCurrent()
 const {snapshot,nodes}=candidate
 const view=nodes.dataViewKey?host.runtime.resolveView(nodes.dataViewKey):undefined
 const payload=view?.rows.find(item=>item['nodeId']===request.documentId)?.['payload']
 if(snapshot.index.baselineId!==request.baselineId||!isRecord(payload)||payload['type']!=='document')
  throw Error('BID_PRODUCTION_DOCUMENT_REQUIRED')
 const root=await candidate.verifyRootHash(CONTENT_ROOT_HASH_CONTRACT)
 const version=Object.freeze({projectId:request.projectId,documentId:request.documentId,revisionId:selection.candidateRevisionId,
  baselineId:snapshot.index.baselineId,state:'CANDIDATE' as const,rootHash:root.rootHash,assertCurrent:root.assertCurrent})
 const evidence=await readEvidence(version)
 return prepareProductionRequest({...request,purpose:'REVIEW'},version,evidence)
}
