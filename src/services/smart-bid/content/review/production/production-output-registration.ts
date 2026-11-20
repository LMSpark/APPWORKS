/**
 * @module app:services/smart-bid/content/review/production/production-output-registration
 * 职责：动作41核验工具导出实件，固定原制作及输出的待登记数据。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {hashContentBytes} from '../../revision-snapshot-hash'
import type {prepareProductionRequest} from './production-request'

type Prepared=Awaited<ReturnType<typeof prepareProductionRequest>>
type Origin=Pick<Prepared['request'],'projectId'|'documentId'|'revisionId'|'requestKey'|'inputDigest'>
type ExportReceipt=Origin&Readonly<{
 productionRequestRef:string;outputRef:string;resourceVersionId:string;fileHash:string
 assertCurrent:()=>void
}>
const scope=['projectId','documentId','revisionId','requestKey','inputDigest'] as const

/** 按制作凭据重开指定资源版本，核对实件字节后才交待登记数据。 */
export async function prepareExportRegistration(prepared:Prepared,receipt:ExportReceipt,reopen:(version:Readonly<{
 projectId:string;resourceVersionId:string
}>)=>Promise<Readonly<{projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void}>>){
 const {request}=prepared
 const {productionRequestRef,outputRef,resourceVersionId,fileHash}=receipt
 const assertOrigin=()=>{
  prepared.assertCurrent()
  receipt.assertCurrent()
  if(scope.some(key=>receipt[key]!==request[key])||receipt.productionRequestRef!==productionRequestRef||
   receipt.outputRef!==outputRef||receipt.resourceVersionId!==resourceVersionId||receipt.fileHash!==fileHash)
   throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 }
 assertOrigin()
 if(![productionRequestRef,outputRef,resourceVersionId].every(identity)||!/^[a-f0-9]{64}$/u.test(fileHash))
  throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 const resource=await reopen(Object.freeze({projectId:request.projectId,resourceVersionId}))
 const assertCurrent=()=>{
  assertOrigin()
  resource.assertCurrent()
  if(resource.projectId!==request.projectId||resource.resourceVersionId!==resourceVersionId)
   throw Error('BID_EXPORT_REGISTRATION_RESOURCE')
 }
 assertCurrent()
 if(resource.bytes.byteLength===0||await hashContentBytes(resource.bytes)!==fileHash)
  throw Error('BID_EXPORT_REGISTRATION_HASH')
 assertCurrent()
 const {projectId,documentId,revisionId,requestKey,inputDigest,templateVersionRef,ruleVersionRef,formVersionRef}=request
 return Object.freeze({record:Object.freeze({projectId,documentId,revisionId,requestKey,inputDigest,productionRequestRef,
  outputRef,resourceVersionId,fileHash,templateVersionRef,ruleVersionRef,formVersionRef}),assertCurrent})
}
