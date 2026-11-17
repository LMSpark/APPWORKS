import {expect,it} from 'vitest'
import {readSnapshotNodeIndex} from '@/services/smart-bid/content/revision-snapshot-index'

const manifest=()=>({hashContract:'spark-bid.revision-snapshot/1',projectId:'P',stageRef:{decisionId:'STAGE'},baselineId:'BASE',templateRefs:[],nodes:[{nodeId:'A',nodeHash:'a'.repeat(64)}],
 requirementPins:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]})
it('reads only the fixed node index without substituting it for full snapshot validation',()=>{
 const input=manifest(),result=readSnapshotNodeIndex(input,'P')
 expect(result).toEqual({projectId:'P',baselineId:'BASE',nodes:input.nodes,hashContract:'spark-bid.revision-snapshot/1',requiresBusinessSectionChecks:true})
 expect(result.nodes).not.toBe(input.nodes)
})
it('requires every explicit group, including empty ones, and rejects Markdown or presentation metadata',()=>{
 const input=manifest();Reflect.deleteProperty(input,'responses')
 expect(()=>readSnapshotNodeIndex(input,'P')).toThrow('SNAPSHOT_MANIFEST_MODEL')
 expect(()=>readSnapshotNodeIndex('# 标书','P')).toThrow('SNAPSHOT_MANIFEST_MODEL')
 expect(()=>readSnapshotNodeIndex({...manifest(),fontSize:'12'},'P')).toThrow('SNAPSHOT_MANIFEST_MODEL')
})
it('rejects a different project, missing basis, malformed node hashes and embedded node payloads',()=>{
 expect(()=>readSnapshotNodeIndex(manifest(),'OTHER')).toThrow('SNAPSHOT_MANIFEST_PROJECT')
 expect(()=>readSnapshotNodeIndex({...manifest(),baselineId:''},'P')).toThrow('SNAPSHOT_MANIFEST_MODEL')
 expect(()=>readSnapshotNodeIndex({...manifest(),nodes:[{nodeId:'A',nodeHash:'self-reported'}]},'P')).toThrow('SNAPSHOT_NODE_INDEX')
 expect(()=>readSnapshotNodeIndex({...manifest(),nodes:[{...manifest().nodes[0],payload:{value:'正文'}}]},'P')).toThrow('SNAPSHOT_NODE_INDEX')
})
it('requires sorted unique node identities and does not normalize exact identities into replacements',()=>{
 const n=(nodeId:string)=>({nodeId,nodeHash:'b'.repeat(64)})
 for(const nodes of [[n('B'),n('A')],[n('A'),n('A')],[n('e\u0301'),n('é')]])
  expect(()=>readSnapshotNodeIndex({...manifest(),nodes},'P')).toThrow('SNAPSHOT_NODE_INDEX')
 expect(readSnapshotNodeIndex({...manifest(),nodes:[n('e\u0301')]},'P').nodes[0]?.nodeId).toBe('e\u0301')
})
it('does not invoke getters or accept sparse arrays as loaded index members',()=>{
 let reads=0
 const input=manifest();Object.defineProperty(input,'nodes',{enumerable:true,get:()=>{reads++;return []}})
 expect(()=>readSnapshotNodeIndex(input,'P')).toThrow('SNAPSHOT_MANIFEST_MODEL');expect(reads).toBe(0)
 expect(()=>readSnapshotNodeIndex({...manifest(),nodes:new Array(1)},'P')).toThrow('SNAPSHOT_NODE_INDEX')
})
it('does not invent the internal shape of an opaque original stage reference',()=>{
 expect(readSnapshotNodeIndex({...manifest(),stageRef:'ORIGINAL_STAGE_REFERENCE'},'P').requiresBusinessSectionChecks).toBe(true)
})
