/**
 * @module app:services/smart-bid/content/review/production/disclosed-output-registration
 * 职责：动作41按原发布记录与实际包成员准备披露件只读登记。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {hashContentBytes} from '../../revision-snapshot-hash'

type Publication=Readonly<{
 projectId:string;publicationRef:string;subjectId:string;packageRef:string;assertCurrent:()=>void
}>
type Member=Readonly<Omit<Publication,'assertCurrent'>&{
 memberRef:string;resourceVersionId:string;fileHash:string;bytes:ArrayBuffer;assertCurrent:()=>void
}>

/** 附件名供查找，只有原发布包中实际取得的成员可以登记。 */
export async function prepareDisclosedOutputRegistration(
 publication:Publication,memberRef:string,readMember:(input:Readonly<Omit<Publication,'assertCurrent'>&{memberRef:string}>)=>Promise<Member>,
){
 const {projectId,publicationRef,subjectId,packageRef}=publication
 const selection=Object.freeze({projectId,publicationRef,subjectId,packageRef,memberRef})
 const assertPublication=()=>{
  publication.assertCurrent()
  if(publication.projectId!==projectId||publication.publicationRef!==publicationRef||
   publication.subjectId!==subjectId||publication.packageRef!==packageRef)throw Error('BID_DISCLOSED_OUTPUT_SCOPE')
 }
 assertPublication()
 if(!Object.values(selection).every(identity))throw Error('BID_DISCLOSED_OUTPUT_SCOPE')
 const member=await readMember(selection)
 const {resourceVersionId,fileHash}=member
 const assertCurrent=()=>{
  assertPublication()
  member.assertCurrent()
  if(member.projectId!==projectId||member.publicationRef!==publicationRef||member.subjectId!==subjectId||
   member.packageRef!==packageRef||member.memberRef!==memberRef||member.resourceVersionId!==resourceVersionId||
   member.fileHash!==fileHash)throw Error('BID_DISCLOSED_OUTPUT_MEMBER')
 }
 assertCurrent()
 if(!identity(resourceVersionId)||!/^[a-f0-9]{64}$/u.test(fileHash)||member.bytes.byteLength===0||
  await hashContentBytes(member.bytes)!==fileHash)throw Error('BID_DISCLOSED_OUTPUT_HASH')
 assertCurrent()
 return Object.freeze({record:Object.freeze({...selection,resourceVersionId,fileHash,usage:'READ_ONLY' as const}),assertCurrent})
}
