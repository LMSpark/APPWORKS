import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {previewContentTextSnapshot} from '@/services/smart-bid/content/content-text-snapshot-preview'

const owner={kind:'NODE' as const,nodeId:'N'}
const node=(nodeId:string,parentId:string,index:number,type:string,value='')=>({nodeId,parentId,index,type,class:[],value,data:{}})
const tree=(value:string,data:Record<string,unknown>={})=>[node('book','P',0,'document'),node('chapter','book',0,'chapter'),node('heading','chapter',0,'heading','标题'),{...node('N','chapter',1,'paragraph',value),data}]
const span=(text:string,revisionId:string)=>({schemaVersion:2,projectId:'P',revisionId,owner,path:'/value',start:0,end:text.length,unit:'utf16',textDigest:createHash('sha256').update(text,'utf8').digest('hex')})
const command=(source:string,target:string)=>({projectId:'P',candidateRevisionId:'C',expectedHead:'H',candidateNodes:tree(source),currentNodes:tree(target),
 candidateResponses:[],currentResponses:[],targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'NODE',nodeId:'N',extent:'NODE'}]},
 changes:[{operation:'replace',sourceRef:span(source,'C'),targetRef:span(target,'H')}]})
it('rechecks the complete current tree after materializing only selected text',async()=>{
 const c=command('新文字','旧文字'),before=structuredClone(c)
 const result=await previewContentTextSnapshot(c)
 expect(result.textPreview.patches[0]?.after).toBe('新文字')
 expect(result.nodeScopePreview.scopeCheckPassed).toBe(true)
 expect(result.nodeScopePreview.comparison.nodes.find(n=>n.nodeId==='N')?.content).toBe('CANDIDATE_ONLY')
 expect(c).toEqual(before)
 expect(result.requiresCurrentAuthorityChecks).toBe(true)
})
it('rejects removing a complete placeholder while leaving its original binding behind',async()=>{
 const c={...command('普通文字','{{工期}}'),currentNodes:tree('{{工期}}',{工期:{type:'fact',factId:'F'}})}
 await expect(previewContentTextSnapshot(c)).rejects.toThrow('UNUSED_DATA')
})
it('rejects adding a placeholder without adding or inventing a current binding',async()=>{
 const c={...command('{{工期}}','普通文字'),candidateNodes:tree('{{工期}}',{工期:{type:'fact',factId:'F'}})}
 await expect(previewContentTextSnapshot(c)).rejects.toThrow()
})
it('rejects silently changing a fact identity even when selected placeholder text is identical',async()=>{
 const c={...command('{{工期}}','{{工期}}'),candidateNodes:tree('{{工期}}',{工期:{type:'fact',factId:'NEW'}}),
  currentNodes:tree('{{工期}}',{工期:{type:'fact',factId:'OLD'}})}
 await expect(previewContentTextSnapshot(c)).rejects.toThrow('BINDING')
})
it('keeps equal bindings even when JSON object property order differs',async()=>{
 const c={...command('{{工期}}','{{工期}}'),candidateNodes:tree('{{工期}}',{工期:{factId:'F',type:'fact'}}),
  currentNodes:tree('{{工期}}',{工期:{type:'fact',factId:'F'}})}
 expect((await previewContentTextSnapshot(c)).nodeScopePreview.scopeCheckPassed).toBe(true)
})
it('returns an actual scope violation when selected text writes an unselected node',async()=>{
 const c={...command('新','旧'),targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'NODE',nodeId:'heading',extent:'NODE'}]}}
 expect((await previewContentTextSnapshot(c)).nodeScopePreview.scopeCheckPassed).toBe(false)
})
it('does not NFC-fold exact fact identities during selected binding comparison',async()=>{
 const c={...command('{{字段}}','{{字段}}'),candidateNodes:tree('{{字段}}',{字段:{type:'fact',factId:'e\u0301'}}),
  currentNodes:tree('{{字段}}',{字段:{type:'fact',factId:'é'}})}
 await expect(previewContentTextSnapshot(c)).rejects.toThrow('BINDING')
})
it('materializes independent response text without overwriting its old version or making a chapter',async()=>{
 const sourceOwner={kind:'RESPONSE' as const,assignmentId:'A',responseId:'V2'},targetOwner={kind:'RESPONSE' as const,assignmentId:'A',responseId:'V1'}
 const c={projectId:'P',candidateRevisionId:'C',expectedHead:'H',candidateNodes:[],currentNodes:[],
  candidateResponses:[{projectId:'P',assignmentId:'A',responseId:'V2',statement:'新答',data:{}}],
  currentResponses:[{projectId:'P',assignmentId:'A',responseId:'V1',statement:'旧答',data:{}}],
  targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'RESPONSE',assignmentId:'A',responseId:'V1'}]},
  changes:[{operation:'replace',sourceRef:{...span('新答','C'),owner:sourceOwner,path:'/statement'},targetRef:{...span('旧答','H'),owner:targetOwner,path:'/statement'}}]}
 const result=await previewContentTextSnapshot(c)
 expect(result.checkedResponseTexts).toEqual([{assignmentId:'A',responseId:'V1',before:'旧答',after:'新答'}])
 expect(result.nodeScopePreview.comparison.nodes).toEqual([])
 expect(result.requiresNewResponseVersionAllocation).toBe(true)
 expect(c.currentResponses[0]?.statement).toBe('旧答')
 await expect(previewContentTextSnapshot({...c,targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'PROJECT'}]}})).rejects.toThrow('RESPONSE_SCOPE')
})
it('materializes a table cell in its existing row and column',async()=>{
 const tableTree=(value:string)=>tree('').map(n=>n.nodeId==='N'?{...n,type:'table',data:{header:['列'],rows:[[{value,data:{}}]]}}:n)
 const c={...command('新','旧'),candidateNodes:tableTree('新'),currentNodes:tableTree('旧'),changes:[{operation:'replace',
  sourceRef:{...span('新','C'),path:'/data/rows/0/0/value'},targetRef:{...span('旧','H'),path:'/data/rows/0/0/value'}}]}
 const result=await previewContentTextSnapshot(c)
 expect(result.textPreview.patches[0]?.after).toBe('新')
 expect(result.nodeScopePreview.comparison.nodes.find(n=>n.nodeId==='N')?.content).toBe('CANDIDATE_ONLY')
})
it('rechecks a new placeholder formed only across splice boundaries',async()=>{
 const c={...command('{}','{名字}'),changes:[
  {operation:'insert',sourceRef:span('{','C'),targetRef:{...span('','H'),start:1,end:1}},
  {operation:'insert',sourceRef:{...span('}','C'),start:1,end:2},targetRef:{...span('','H'),start:4,end:4}}
 ]}
 await expect(previewContentTextSnapshot(c)).rejects.toThrow('MISSING_DATA')
})
