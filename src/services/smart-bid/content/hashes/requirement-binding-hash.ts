/**
 * @module app:services/smart-bid/content/hashes/requirement-binding-hash
 * 职责：用审核范围内的原章节挂接、固定基线解析状态和要求内容摘要生成依赖摘要。
 * 边界：要求内容摘要须来自原版本读取；基线状态不替代撤回、采用或当前准用的决定。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'
import type {RevisionRequirementPin} from '../references/revision-requirement-pins'

/** 一项挂接同时保留所挂原版内容摘要和基线选中版本；缺项与换版分别编码。 */
export async function hashRequirementBindings(pins:readonly RevisionRequirementPin[],records:unknown):Promise<string>{
 const identity=(pin:RevisionRequirementPin)=>JSON.stringify([pin.chapterId,pin.lineageId,pin.version])
 const expected=new Set(pins.map(identity)),seen=new Set<string>()
 if(expected.size!==pins.length)throw Error('CONTENT_REQUIREMENT_BINDING_SCOPE')
 const error='CONTENT_REQUIREMENT_BINDING_MODEL'
 const bindings:Array<{key:string;row:Readonly<Record<string,unknown>>}>=[]
 visitSnapshotReferences(records,item=>{
  const row=snapshotReferenceFields(item,['chapterId','lineageId','version','selectedVersion','requirementContentHash'],error)
  const {chapterId,lineageId,version,selectedVersion,requirementContentHash}=row
  if(!snapshotReferenceIdentity(chapterId)||!snapshotReferenceIdentity(lineageId)||!snapshotReferenceIdentity(version)||
   selectedVersion!==null&&!snapshotReferenceIdentity(selectedVersion)||
   typeof requirementContentHash!=='string'||!/^[a-f0-9]{64}$/u.test(requirementContentHash))throw Error(error)
  const key=identity({chapterId,lineageId,version})
  if(!expected.has(key)||seen.has(key))throw Error('CONTENT_REQUIREMENT_BINDING_SCOPE')
  seen.add(key);bindings.push({key,row})
 },error)
 if(seen.size!==expected.size)throw Error('CONTENT_REQUIREMENT_BINDING_SCOPE')
 bindings.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.requirement-bindings/1',bindings.map(item=>item.row)]))
}
