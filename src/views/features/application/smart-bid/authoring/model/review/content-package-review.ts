/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-package-review
 * 职责：重开登记电子包，用同一次原始字节及全量解包逐件核对。
 * 边界：原包授权读取、格式适配和全量枚举由调用方负责，不判签审覆盖。
 */
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {compareSubmissionPackageMembers} from '@/services/smart-bid/content/review/submission-package-members'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

type Members=Parameters<typeof compareSubmissionPackageMembers>[0]
type PackageSource=Readonly<{
 projectId:string;packageId:string;packageHash:string;expected:Members['expected'];packed:Members['packed']
 reopen:()=>Promise<ArrayBuffer>;assertCurrent:()=>void
}>

/** 不用外层附件名或装封声明推断实际成员。 */
export async function readSubmissionPackageMembers(source:PackageSource,
 enumerate:(bytes:ArrayBuffer)=>Promise<Readonly<{
  complete:boolean;members:ReadonlyArray<Readonly<{position:string;bytes:ArrayBuffer}>>
 }>>){
 const {projectId,packageId,packageHash}=source
 source.assertCurrent()
 if(!identity(projectId)||!identity(packageId)||!/^[a-f0-9]{64}$/u.test(packageHash))throw Error('SUBMISSION_PACKAGE_SCOPE')
 const expected=structuredClone(source.expected),packed=structuredClone(source.packed)
 const bytes=(await source.reopen()).slice(0)
 source.assertCurrent()
 if(bytes.byteLength===0||await hashContentBytes(bytes)!==packageHash)throw Error('SUBMISSION_PACKAGE_HASH_MISMATCH')
 source.assertCurrent()
 const inventory=await enumerate(bytes)
 source.assertCurrent()
 if(!inventory.complete)throw Error('SUBMISSION_PACKAGE_INVENTORY_INCOMPLETE')
 const observed=await Promise.all(inventory.members.map(async({position,bytes:memberBytes})=>({
  position,fileHash:await hashContentBytes(memberBytes),
 })))
 source.assertCurrent()
 const result=compareSubmissionPackageMembers({expected,packed,observed})
 return Object.freeze({projectId,packageId,packageHash,...result,assertCurrent:()=>source.assertCurrent()})
}
