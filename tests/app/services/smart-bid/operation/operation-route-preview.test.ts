import {expect,it} from 'vitest'
import {previewOperationRoute} from '@/services/smart-bid/operation/operation-route-preview'

const node=(id:string,parentId:string|null,index:number,type:string,classes:string[]=[])=>({id,parentId,index,type,class:classes,value:'',data:{}})
it('uses task classes before the nearest phase and presents tasks in preorder rather than input order',()=>{
 const nodes=[node('R',null,0,'route',['root']),node('P','R',0,'phase',['write']),node('S','P',0,'sequence',['ignored']),
  node('A','S',0,'task',['review']),node('B','S',1,'task'),node('C','R',1,'task')].reverse()
 const before=structuredClone(nodes),result=previewOperationRoute({nodes})
 expect(result.errors).toEqual([])
 expect(result.taskClasses).toEqual([
  {taskId:'A',sourceId:'A',classes:['review']},{taskId:'B',sourceId:'P',classes:['write']},{taskId:'C',sourceId:null,classes:[]},
 ])
 expect(nodes).toEqual(before)
})
it('does not bypass an empty nearest phase to borrow an outer phase classification',()=>{
 const nodes=[node('R',null,0,'route'),node('P','R',0,'phase',['write']),node('EMPTY','P',0,'phase'),node('T','EMPTY',0,'task')]
 expect(previewOperationRoute({nodes}).taskClasses).toEqual([{taskId:'T',sourceId:'EMPTY',classes:[]}])
})
it('keeps independent phase branches and exact decomposed identities while normalizing classes by the shared payload contract',()=>{
 const nodes=[node('R',null,0,'route'),node('e\u0301','R',0,'phase',['😀','\uE000','e\u0301','é']),node('A','e\u0301',0,'task'),
  node('OTHER','R',1,'phase',['parse']),node('B','OTHER',0,'task')]
 expect(previewOperationRoute({nodes}).taskClasses).toEqual([
  {taskId:'A',sourceId:'e\u0301',classes:['é','\uE000','😀']},{taskId:'B',sourceId:'OTHER',classes:['parse']},
 ])
})
it.each([
 {nodes:[{id:'T'}]},
 {nodes:[node('R',null,0,'route'),{...node('T','R',0,'task'),data:{maxTimes:2}}]},
 {nodes:[node('R',null,0,'route'),{...node('T','R',0,'task'),class:['\uD800']}]},
])('refuses invalid full payloads before returning any usable task classification',({nodes})=>{
 const result=previewOperationRoute({nodes})
 expect(result.errors.some(error=>error.startsWith('PAYLOAD:'))).toBe(true)
 expect(result.taskClasses).toEqual([])
})
it('refuses invalid structure and historical type changes before traversing a candidate',()=>{
 const nodes=[node('R',null,0,'route'),node('T','R',0,'task'),node('A','B',0,'phase'),node('B','A',0,'phase')]
 const result=previewOperationRoute({nodes})
 expect(result.errors.some(error=>error.startsWith('CYCLE:'))).toBe(true)
 expect(result.taskClasses).toEqual([])
 const changed=previewOperationRoute({nodes:[node('R',null,0,'route'),node('T','R',0,'task')],previousNodes:[{id:'T',type:'call'}]})
 expect(changed.errors).toContain('TYPE_CHANGED:T')
 expect(changed.taskClasses).toEqual([])
})
it.each([null,{},'route'])('reports invalid node collection %j without throwing',nodes=>{
 expect(previewOperationRoute({nodes})).toEqual({errors:['OPERATION_NODES'],taskClasses:[]})
})
