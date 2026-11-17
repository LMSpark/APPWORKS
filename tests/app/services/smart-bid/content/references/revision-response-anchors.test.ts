import {expect,it} from 'vitest'
import {assertRevisionResponseAnchors} from '@/services/smart-bid/content/references/revision-response-anchors'

const nodes=[{nodeId:'D',parentId:'P',type:'document'},{nodeId:'C',parentId:'D',type:'chapter'},
 {nodeId:'H',parentId:'C',type:'heading'},{nodeId:'OTHER',parentId:'D',type:'chapter'},{nodeId:'OH',parentId:'OTHER',type:'heading'}]
const pins=[{chapterId:'C',lineageId:'L',version:'R1'}]
const chapterResponse={id:'R',assignmentId:'A',lineageId:'L',version:'R1',revisionId:'ORIGINAL',chapterId:'C',anchorNodeId:'H'}
it('accepts actual chapter anchors and independent response identity without manufacturing chapters',()=>{
 expect(()=>assertRevisionResponseAnchors([chapterResponse],pins,nodes)).not.toThrow()
 expect(()=>assertRevisionResponseAnchors([{id:'I',assignmentId:'B',lineageId:'L',version:'R1',revisionId:'OLD'}],[],[])).not.toThrow()
})
it.each([{chapterId:'H'},{chapterId:'missing'},{anchorNodeId:'OH'},{anchorNodeId:'D'},{anchorNodeId:'missing'}])(
 'rejects a chapter anchor outside its actual chapter: %j',change=>{
 expect(()=>assertRevisionResponseAnchors([{...chapterResponse,...change}],pins,nodes)).toThrow('SNAPSHOT_RESPONSE_ANCHOR')
})
it('requires the same exact chapter requirement pin and does not choose another version',()=>{
 expect(()=>assertRevisionResponseAnchors([chapterResponse],[{...pins[0],version:'R2'}],nodes)).toThrow('SNAPSHOT_RESPONSE_PIN')
 expect(()=>assertRevisionResponseAnchors([chapterResponse],[],nodes)).toThrow('SNAPSHOT_RESPONSE_PIN')
})
it('rejects independent response with a fabricated body anchor and chapter response with missing anchor',()=>{
 const {chapterId:omitted,...independent}=chapterResponse
 expect(omitted).toBe('C')
 expect(()=>assertRevisionResponseAnchors([independent],[],nodes)).toThrow('SNAPSHOT_RESPONSE_ANCHOR')
 const {anchorNodeId:anchor,...unanchored}=chapterResponse
 expect(anchor).toBe('H')
 expect(()=>assertRevisionResponseAnchors([unanchored],pins,nodes)).toThrow('SNAPSHOT_RESPONSE_ANCHOR')
})
it.each([{id:''},{assignmentId:''},{version:1},{revisionId:null}])('requires fixed response identity %j',change=>{
 expect(()=>assertRevisionResponseAnchors([{...chapterResponse,...change}],pins,nodes)).toThrow('SNAPSHOT_RESPONSE_MODEL')
})
it('rejects duplicate response versions but does not overwrite other payload fields',()=>{
 const value={...chapterResponse,statement:'',data:{},promiseRefs:['kept'],answerLocation:{source:'original'}}
 expect(()=>assertRevisionResponseAnchors([value],pins,nodes)).not.toThrow()
 expect(value.promiseRefs).toEqual(['kept'])
 expect(()=>assertRevisionResponseAnchors([value,{...value}],pins,nodes)).toThrow('SNAPSHOT_RESPONSE_DUPLICATE')
})
it('does not evaluate getters or normalize identities while matching chapter pins',()=>{
 let invoked=false
 const invalid={...chapterResponse};Object.defineProperty(invalid,'reviewedBy',{enumerable:true,get(){invoked=true;return 'actor'}})
 expect(()=>assertRevisionResponseAnchors([invalid],pins,nodes)).toThrow('SNAPSHOT_RESPONSE_MODEL');expect(invoked).toBe(false)
 expect(()=>assertRevisionResponseAnchors([{...chapterResponse,lineageId:'e\u0301'}],[{...pins[0],lineageId:'é'}],nodes)).toThrow('SNAPSHOT_RESPONSE_PIN')
})
it('does not inherit response identity from an own JSON __proto__ member',()=>{
 const invalid:unknown=JSON.parse('{"__proto__":{"id":"R","assignmentId":"A","lineageId":"L","version":"R1","revisionId":"OLD"}}')
 expect(()=>assertRevisionResponseAnchors([invalid],[],[])).toThrow('SNAPSHOT_RESPONSE_MODEL')
})
