/**
 * @module app:services/smart-bid/content/draft/content-draft-save-request
 * 职责：固定一次个人草稿保存的原版本、基准修订和拟写内容摘要。
 */
import {validateContentDraftPayload} from '../../content-draft-save-rule'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

/** 权威保存消费原请求；构造载荷本身不提交或推进草稿版本。 */
export async function prepareContentDraftSaveRequest(input:Readonly<{
 projectId:string;draftId:string;baseRevisionId:string|null;expectedDraftVersion:string|null
 requestKey:string;draft:unknown;assertCurrent:()=>void
}>){
 input.assertCurrent()
 const {projectId,draftId,baseRevisionId,expectedDraftVersion,requestKey}=input
 if(![projectId,draftId,requestKey].every(identity)||
  [baseRevisionId,expectedDraftVersion].some(value=>value!==null&&!identity(value)))throw Error('CONTENT_DRAFT_SAVE_SCOPE')
 const draft=canonicalSnapshotValue(input.draft)
 const snapshot:unknown=JSON.parse(draft)
 validateContentDraftPayload({projectId,draft:snapshot})
 const envelope=canonicalSnapshotValue({projectId,draftId,baseRevisionId,expectedDraftVersion,requestKey,draft:snapshot})
 const [requestDigest,contentDigest]=await Promise.all([
  hashCanonicalSnapshotText(`["spark-bid.draft-save/1",${envelope}]`),hashCanonicalSnapshotText(draft),
 ])
 input.assertCurrent()
 return Object.freeze({projectId,draftId,baseRevisionId,expectedDraftVersion,requestKey,
  requestJson:envelope,requestDigest,contentDigest,assertCurrent:()=>input.assertCurrent()})
}
