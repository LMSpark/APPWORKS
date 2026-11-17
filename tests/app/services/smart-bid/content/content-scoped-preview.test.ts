import {expect,it} from 'vitest'
import {previewScopedContentTree} from '@/services/smart-bid/content/content-scoped-preview'

const node=(nodeId:string,parentId:string,index:number,type:string,value='')=>({nodeId,parentId,index,type,class:[],value,data:{}})
const basis=()=>[node('book','P',0,'document'),node('one','book',0,'chapter'),node('h1','one',0,'heading','一'),
 node('a','one',1,'paragraph','原文'),node('two','book',1,'chapter'),node('h2','two',0,'heading','二'),node('b','two',1,'paragraph','其它')]
const target=(nodeId='one',extent='SUBTREE')=>({kind:'NODE',nodeId,extent})
const input=(candidate:unknown[],targets:unknown[]=[target()])=>({projectId:'P',basis:basis(),current:basis(),candidate,
 targetScope:{schemaVersion:2,projectId:'P',targets},responses:[{projectId:'P',assignmentId:'Q',responseId:'R'}],
 declaredAddedNodeIds:[],responseChanges:[]})
it('accepts selected node content while retaining current-only edits and pending authority checks',()=>{
 const candidate=basis().map(n=>n.nodeId==='a'?{...n,value:'候选'}:n)
 const result=previewScopedContentTree({...input(candidate,[target('a','NODE')]),current:basis().map(n=>n.nodeId==='b'?{...n,value:'他人新改'}:n)})
 expect(result.scopeCheckPassed).toBe(true)
 expect(result.changedNodeIds).toEqual(['a'])
 expect(result.comparison.nodes.find(n=>n.nodeId==='b')?.content).toBe('CURRENT_ONLY')
 expect(result.requiresCurrentAuthorityChecks).toBe(true)
 expect(result).not.toHaveProperty('adoptAllowed')
})
it('rejects an unrelated node edit even if it is the same change already present in the current head',()=>{
 const candidate=basis().map(n=>n.nodeId==='b'?{...n,value:'越界'}:n)
 const result=previewScopedContentTree({...input(candidate),current:candidate})
 expect(result.scopeCheckPassed).toBe(false)
 expect(result.violations).toContainEqual({code:'NODE_OUTSIDE_SCOPE',ownerKind:'NODE',ownerId:'b',relatedId:null})
})
it('accepts explicitly declared new descendants inside the selected subtree',()=>{
 const candidate=[...basis(),node('new','one',2,'paragraph','新文')]
 const result=previewScopedContentTree({...input(candidate),declaredAddedNodeIds:['new']})
 expect(result.scopeCheckPassed).toBe(true)
 expect(result.addedNodeIds).toEqual(['new'])
})
it('rejects undeclared additions and additions under an unselected subtree',()=>{
 const undeclared=previewScopedContentTree(input([...basis(),node('new','one',2,'paragraph','新文')]))
 expect(undeclared.violations.some(v=>v.code==='UNDECLARED_ADDITION')).toBe(true)
 const outside=previewScopedContentTree({...input([...basis(),node('new','two',2,'paragraph','新文')]),declaredAddedNodeIds:['new']})
 expect(outside.violations.some(v=>v.code==='ADDITION_OUTSIDE_SCOPE')).toBe(true)
})
it('does not enlarge node-only scope into permission to add children',()=>{
 const candidate=[...basis(),node('new','one',2,'paragraph','新文')]
 const result=previewScopedContentTree({...input(candidate,[target('one','NODE')]),declaredAddedNodeIds:['new']})
 expect(result.scopeCheckPassed).toBe(false)
})
it('rejects moving a selected node out or an unselected node into the selected subtree',()=>{
 const out=basis().map(n=>n.nodeId==='a'?{...n,parentId:'two',index:2}:n)
 expect(previewScopedContentTree(input(out)).violations.some(v=>v.code==='STRUCTURE_PARENT_OUTSIDE_SCOPE')).toBe(true)
 const into=basis().map(n=>n.nodeId==='b'?{...n,parentId:'one',index:2}:n)
 expect(previewScopedContentTree(input(into)).violations.some(v=>v.code==='NODE_OUTSIDE_SCOPE')).toBe(true)
})
it('allows moving between two explicitly selected subtrees',()=>{
 const candidate=basis().map(n=>n.nodeId==='a'?{...n,parentId:'two',index:2}:n)
 expect(previewScopedContentTree(input(candidate,[target('one'),target('two')])).scopeCheckPassed).toBe(true)
})
it('checks deletion and structural side effects rather than only text fields',()=>{
 const candidate=basis().filter(n=>n.nodeId!=='b')
 expect(previewScopedContentTree(input(candidate)).violations.some(v=>v.code==='NODE_OUTSIDE_SCOPE')).toBe(true)
 expect(previewScopedContentTree(input(basis(),[target('a','NODE')])).scopeCheckPassed).toBe(true)
})
it('allows explicit project first-draft construction without granting response scope',()=>{
 const first={...input(basis(),[{kind:'PROJECT'}]),basis:[],current:[],declaredAddedNodeIds:basis().map(n=>n.nodeId)}
 expect(previewScopedContentTree(first).scopeCheckPassed).toBe(true)
 const result=previewScopedContentTree({...first,responseChanges:[{assignmentId:'Q',basisResponseId:'R',responseId:'R2'}]})
 expect(result.violations.some(v=>v.code==='RESPONSE_OUTSIDE_SCOPE')).toBe(true)
})
it('checks explicit response assignment, basis and immutable new version identity',()=>{
 const selected=[{kind:'RESPONSE',assignmentId:'Q',responseId:'R'}]
 const base=input(basis(),selected)
 expect(previewScopedContentTree({...base,responseChanges:[{assignmentId:'Q',basisResponseId:'R',responseId:'R2'}]}).scopeCheckPassed).toBe(true)
 expect(previewScopedContentTree({...base,responseChanges:[{assignmentId:'Q',basisResponseId:null,responseId:'R2'}]}).violations.some(v=>v.code==='RESPONSE_BASIS_MISMATCH')).toBe(true)
 expect(previewScopedContentTree({...base,responseChanges:[{assignmentId:'Q',basisResponseId:'R',responseId:'R'}]}).violations.some(v=>v.code==='RESPONSE_ID_REUSE')).toBe(true)
})
it('rejects missing or sparse change manifests rather than assuming no changes',()=>{
 expect(()=>previewScopedContentTree({...input(basis()),responseChanges:undefined})).toThrow()
 expect(()=>previewScopedContentTree({...input(basis()),declaredAddedNodeIds:Array(1)})).toThrow()
})
it('rejects a changing response basis accessor before reading it',()=>{
 let reads=0
 const command={...input(basis(),[{kind:'RESPONSE',assignmentId:'Q',responseId:'R'}]),
  responseChanges:[{assignmentId:'Q',basisResponseId:'R2',responseId:'R3'}]}
 Object.defineProperty(command,'responses',{enumerable:true,get(){reads++;return [{projectId:'P',assignmentId:'Q',responseId:reads===1?'R':'R2'}]}})
 expect(()=>previewScopedContentTree(command)).toThrow()
 expect(reads).toBe(0)
})
it('requires the addition manifest to match the actual new-node difference',()=>{
 expect(()=>previewScopedContentTree({...input(basis()),declaredAddedNodeIds:['fake','fake']})).toThrow()
 const result=previewScopedContentTree({...input(basis()),declaredAddedNodeIds:['a','missing']})
 expect(result.scopeCheckPassed).toBe(false)
 expect(result.violations.filter(v=>v.code==='UNEXPECTED_ADDITION_DECLARATION').map(v=>v.ownerId)).toEqual(['a','missing'])
})
it('traces multiple new levels to the selected basis subtree',()=>{
 const additions=[node('newChapter','one',2,'chapter'),node('newHeading','newChapter',0,'heading','新章'),node('newText','newChapter',1,'paragraph','新文')]
 const result=previewScopedContentTree({...input([...basis(),...additions]),declaredAddedNodeIds:additions.map(n=>n.nodeId)})
 expect(result.scopeCheckPassed).toBe(true)
})
