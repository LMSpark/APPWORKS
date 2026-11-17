/**
 * @module app:services/smart-bid/content/hashes/content-root-hash
 * 职责：组合正式方案 §2.2 的已核节点及业务分组摘要。
 * 边界：不从缺失分组推定空摘要，不证明分组原记录或改写历史根摘要。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

/** 新编码产物的明确版本，正式服务须按此版本或交付等价合同后方可验收。 */
export const CONTENT_ROOT_HASH_CONTRACT='spark-bid.content-root/1'
const fields=['projectId','nodes','factTableHash','requirementPinHash','responseSetHash'] as const
function digest(value:unknown):string{
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))throw Error('CONTENT_ROOT_HASH_COMPONENT')
 return value
}

/** 节点位置已包含于各节点摘要；这里只按精确节点身份确定组合顺序。 */
export async function hashContentRoot(input:unknown):Promise<string>{
 const row=snapshotReferenceFields(input,fields,'CONTENT_ROOT_HASH_MODEL')
 const {projectId,factTableHash,requirementPinHash,responseSetHash}=row
 if(!snapshotReferenceIdentity(projectId))throw Error('CONTENT_ROOT_HASH_MODEL')
 const nodes=new Map<string,string>(),identities=new Set<string>()
 visitSnapshotReferences(row['nodes'],value=>{
  const {nodeId,nodeHash}=snapshotReferenceFields(value,['nodeId','nodeHash'],'CONTENT_ROOT_HASH_NODE')
  if(!snapshotReferenceIdentity(nodeId))throw Error('CONTENT_ROOT_HASH_NODE')
  const normalized=nodeId.normalize('NFC')
  if(identities.has(normalized))throw Error('CONTENT_ROOT_HASH_DUPLICATE_NODE')
  identities.add(normalized);nodes.set(nodeId,digest(nodeHash))
 },'CONTENT_ROOT_HASH_NODE')
 const sortedHashes=[...nodes].sort(([left],[right])=>left<right?-1:left>right?1:0).map(([,nodeHash])=>nodeHash)
 const canonical=canonicalSnapshotValue([CONTENT_ROOT_HASH_CONTRACT,projectId,sortedHashes,
  digest(factTableHash),digest(requirementPinHash),digest(responseSetHash)])
 return hashCanonicalSnapshotText(canonical)
}
