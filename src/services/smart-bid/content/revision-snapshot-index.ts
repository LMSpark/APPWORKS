/**
 * @module app:services/smart-bid/content/revision-snapshot-index
 * 职责：从固定修订清单读取项目、基线和排序节点版本索引。
 * 边界：只核清单外形及节点索引，不计算完整清单摘要或证明各业务分组有效，不代完整快照。
 * AI用途：正式快照读取后取得完整节点成员清单，继续由原视图装配并核业务引用。
 */
/** 快照中的节点版本引用；nodeId保留精确身份，nodeHash指向独立版本载荷。 */
export type SnapshotNodeVersion=Readonly<{nodeId:string;nodeHash:string}>
/** 本次新清单的持久摘要合同；无版本旧清单不自动补值或改写。 */
export const SNAPSHOT_HASH_CONTRACT='spark-bid.revision-snapshot/1' as const
/** 仅清单索引投影；业务分组待核不能被用于放行采用或交付。 */
export type RevisionSnapshotNodeIndex=Readonly<{
 projectId:string;baselineId:string;nodes:readonly SnapshotNodeVersion[];hashContract:typeof SNAPSHOT_HASH_CONTRACT
 requiresBusinessSectionChecks:true
}>
function object(value:unknown,error:string):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error(error)
 const entries:Array<[string,unknown]>=[]
 for(const key of Reflect.ownKeys(value)){
  const descriptor=Object.getOwnPropertyDescriptor(value,key)
  if(typeof key!=='string'||descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error(error)
  entries.push([key,descriptor.value])
 }
 return Object.fromEntries(entries)
}
function list(value:unknown,error:string):unknown[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error(error)
 const items:unknown[]=[]
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error(error)
  items.push(descriptor.value)
 }
 return items
}
function identity(value:unknown):value is string {
 if(typeof value!=='string'||!value.trim()||value.trim()!==value)return false
 return Array.from(value).every(character=>{const code=character.codePointAt(0)??0;return code<0xD800||code>0xDFFF})
}
function nodeIndex(value:unknown):readonly SnapshotNodeVersion[] {
 const nodes:SnapshotNodeVersion[]=[],ids=new Set<string>()
 for(const item of list(value,'SNAPSHOT_NODE_INDEX')){
  const row=object(item,'SNAPSHOT_NODE_INDEX'),nodeId=row['nodeId'],nodeHash=row['nodeHash']
  if(Object.keys(row).length!==2||!identity(nodeId)||typeof nodeHash!=='string'||!/^[a-f0-9]{64}$/u.test(nodeHash)
   ||ids.has(nodeId.normalize('NFC'))||(nodes.length>0&&(nodes[nodes.length-1]?.nodeId??'')>=nodeId))throw Error('SNAPSHOT_NODE_INDEX')
  ids.add(nodeId.normalize('NFC'));nodes.push(Object.freeze({nodeId,nodeHash}))
 }
 return Object.freeze(nodes)
}
const groups=['templateRefs','requirementPins','responseAssignments','responses','qualificationReviews','sensitiveRefs']
/** 要求所有分组显式存在；空列表与未加载不同，不推定尚未核定的记录内部合同。 */
export function readSnapshotNodeIndex(value:unknown,projectId:string):RevisionSnapshotNodeIndex {
 const manifest=object(value,'SNAPSHOT_MANIFEST_MODEL'),keys=['hashContract','projectId','stageRef','baselineId','nodes',...groups]
 if(Object.keys(manifest).length!==keys.length||keys.some(key=>!Object.hasOwn(manifest,key))
  ||!identity(manifest['projectId'])||!identity(manifest['baselineId']))throw Error('SNAPSHOT_MANIFEST_MODEL')
 if(manifest['hashContract']!==SNAPSHOT_HASH_CONTRACT)throw Error('SNAPSHOT_HASH_CONTRACT')
 if(manifest['projectId']!==projectId)throw Error('SNAPSHOT_MANIFEST_PROJECT')
 if(manifest['stageRef']===null||manifest['stageRef']===undefined)throw Error('SNAPSHOT_MANIFEST_MODEL')
 for(const group of groups)list(manifest[group],'SNAPSHOT_MANIFEST_MODEL')
 return Object.freeze({projectId,baselineId:manifest['baselineId'],nodes:nodeIndex(manifest['nodes']),
  hashContract:SNAPSHOT_HASH_CONTRACT,requiresBusinessSectionChecks:true})
}
