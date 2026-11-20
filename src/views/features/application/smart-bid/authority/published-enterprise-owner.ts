/**
 * @module app:views/features/application/smart-bid/authority/published-enterprise-owner
 * 职责：从当前低码认证会话取得已发布企业页的企业身份。
 */
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

export type PublishedEnterpriseBinding=Readonly<{enterpriseId:string;assertCurrent:()=>void}>

/** 企业身份只能来自本次认证会话；发布导航及后续绑定不得从 URL 覆盖。 */
export function readPublishedEnterpriseOwner(assertCurrent:()=>void):PublishedEnterpriseBinding{
 const session=lowcodeApi.session.get()
 const enterpriseId=session?.enterprise.id??session?.identity.enterpriseId
 if(!identity(enterpriseId))throw Error('BID_AUTHORITY_ENTERPRISE_OWNER_REQUIRED')
 return Object.freeze({enterpriseId,assertCurrent:()=>{
  assertCurrent()
  const current=lowcodeApi.session.get()
  if((current?.enterprise.id??current?.identity.enterpriseId)!==enterpriseId)
   throw Error('BID_AUTHORITY_ENTERPRISE_OWNER_STALE')
 }})
}

/** 有额外企业宿主时仍须与当前认证企业一致，随后合并两方失效证明。 */
export function verifyPublishedEnterpriseOwner(assertCurrent:()=>void,binding?:PublishedEnterpriseBinding)
:PublishedEnterpriseBinding{
 const owner=readPublishedEnterpriseOwner(assertCurrent)
 if(binding){
  binding.assertCurrent()
  if(binding.enterpriseId!==owner.enterpriseId)throw Error('BID_AUTHORITY_ENTERPRISE_OWNER_CONFLICT')
 }
 return Object.freeze({enterpriseId:owner.enterpriseId,assertCurrent:()=>{
  owner.assertCurrent()
  binding?.assertCurrent()
 }})
}
