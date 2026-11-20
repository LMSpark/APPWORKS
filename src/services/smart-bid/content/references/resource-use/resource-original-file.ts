/**
 * @module app:services/smart-bid/content/references/resource-use/resource-original-file
 * 职责：核对企业资料原版登记的文件身份、容量和字节摘要。
 */
import {hashContentBytes} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type OriginalFileIdentity=Readonly<{resourceId:string;resourceVersionId:string;fileVersionId:string}>
type OriginalFileRegistration=OriginalFileIdentity&Readonly<{byteLength:number;fileHash:string;assertCurrent:()=>void}>
type AuthorizedOriginalFile=OriginalFileIdentity&Readonly<{bytes:ArrayBuffer;assertCurrent:()=>void}>

/** 从登记的版本打开原件；由读取方提供当次文件授权证明。 */
export async function verifyResourceOriginalFile(
 registration:OriginalFileRegistration,
 openAuthorized:(target:OriginalFileIdentity)=>Promise<AuthorizedOriginalFile>,
){
 const {resourceId,resourceVersionId,fileVersionId,byteLength,fileHash}=registration
 const target=Object.freeze({resourceId,resourceVersionId,fileVersionId})
 registration.assertCurrent()
 if(!Object.values(target).every(identity)||!Number.isSafeInteger(byteLength)||byteLength<1||!/^[a-f0-9]{64}$/u.test(fileHash))
  throw Error('BID_RESOURCE_ORIGINAL_REGISTRATION')
 const file=await openAuthorized(target)
 const assertCurrent=()=>{registration.assertCurrent();file.assertCurrent()}
 assertCurrent()
 if(file.resourceId!==resourceId||file.resourceVersionId!==resourceVersionId||file.fileVersionId!==fileVersionId)
  throw Error('BID_RESOURCE_ORIGINAL_VERSION')
 if(file.bytes.byteLength!==byteLength)throw Error('BID_RESOURCE_ORIGINAL_LENGTH')
 const bytes=file.bytes.slice(0)
 if(await hashContentBytes(bytes)!==fileHash)throw Error('BID_RESOURCE_ORIGINAL_HASH')
 assertCurrent()
 return Object.freeze({...target,byteLength,fileHash,assertCurrent,readBytes:()=>{assertCurrent();return bytes.slice(0)}})
}
