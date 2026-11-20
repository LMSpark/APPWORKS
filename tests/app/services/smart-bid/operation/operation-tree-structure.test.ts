import {expect,it} from 'vitest'
import {validateOperationTreeStructure,type OperationStructureNode} from '@/services/smart-bid/operation/operation-tree-structure'

const node=(id:string,parentId:string|null,index:number,type:string):OperationStructureNode=>({id,parentId,index,type})
const valid=()=>[node('R',null,0,'route'),node('S','R',0,'sequence'),node('P','S',0,'phase'),
 node('A','P',0,'parallel'),node('T','A',0,'task'),node('C','A',1,'call'),
 node('X','S',1,'choice'),node('Y','X',0,'task')]
it('accepts every closed structural type without changing the flat source order',()=>{
 const nodes=valid().reverse(),before=structuredClone(nodes)
 expect(validateOperationTreeStructure({nodes})).toEqual([])
 expect(nodes).toEqual(before)
})
it.each([
 ['no root',()=>[node('T','missing',0,'task')],'ROOT'],
 ['two roots',()=>[...valid(),node('OTHER',null,1,'route')],'ROOT'],
 ['wrong root type',()=>[node('R',null,0,'phase'),node('T','R',0,'task')],'ROOT'],
 ['root index',()=>[node('R',null,2,'route'),node('T','R',0,'task')],'ROOT'],
 ['empty container',()=>[node('R',null,0,'route')],'EMPTY_CONTAINER:R'],
 ['unknown type',()=>[node('R',null,0,'route'),node('T','R',0,'__proto__')],'TYPE:T'],
 ['nested route',()=>[node('R',null,0,'route'),node('N','R',0,'route'),node('T','N',0,'task')],'PARENT:N'],
 ['task child',()=>[node('R',null,0,'route'),node('T','R',0,'task'),node('C','T',0,'call')],'PARENT:C'],
 ['call child',()=>[node('R',null,0,'route'),node('C','R',0,'call'),node('T','C',0,'task')],'PARENT:T'],
 ['missing parent',()=>[...valid(),node('LOST','MISSING',0,'task')],'PARENT:LOST'],
 ['index gap',()=>[node('R',null,0,'route'),node('T','R',1,'task')],'ORDER:R'],
 ['fraction index',()=>[node('R',null,0,'route'),node('T','R',0.5,'task')],'ORDER:R'],
] as const)('rejects %s',(_label,make,error)=>{
 expect(validateOperationTreeStructure({nodes:make()})).toContain(error)
})
it('rejects disconnected cycles while retaining an independent valid root branch',()=>{
 const nodes=[node('R',null,0,'route'),node('T','R',0,'task'),node('A','B',0,'phase'),node('B','A',0,'sequence')]
 const errors=validateOperationTreeStructure({nodes})
 expect(errors.some(error=>error.startsWith('CYCLE:'))).toBe(true)
 expect(errors).toContain('UNREACHABLE:A')
 expect(errors).toContain('UNREACHABLE:B')
})
it('rejects duplicate normalized identities but does not rewrite exact parent references',()=>{
 expect(validateOperationTreeStructure({nodes:[node('R',null,0,'route'),node('é','R',0,'task'),node('e\u0301','R',1,'task')]})).toContain('NODE_ID:e\u0301')
 const nodes=[node('R',null,0,'route'),node('e\u0301','R',0,'phase'),node('T','e\u0301',0,'task')]
 expect(validateOperationTreeStructure({nodes})).toEqual([])
 expect(nodes[2]?.parentId).toBe('e\u0301')
 expect(validateOperationTreeStructure({nodes:[node('R',null,0,'route'),node('e\u0301','R',0,'phase'),node('T','é',0,'task')]})).toContain('PARENT:T')
})
it('rejects a historical identity changing type, including an NFC alias',()=>{
 const nodes=[node('R',null,0,'route'),node('é','R',0,'call')]
 expect(validateOperationTreeStructure({nodes,previousNodes:[{id:'e\u0301',type:'task'}]})).toContain('TYPE_CHANGED:é')
 expect(validateOperationTreeStructure({nodes,previousNodes:[{id:'é',type:'call'}]})).toEqual([])
})
it('does not impose the content tree chapter-depth limit on operation containers',()=>{
 const nodes=[node('R',null,0,'route')]
 for(let index=0;index<30;index++)nodes.push(node(`S${index}`,index?`S${index-1}`:'R',0,'sequence'))
 nodes.push(node('T','S29',0,'task'))
 expect(validateOperationTreeStructure({nodes})).toEqual([])
})
it('rejects conflicting historical versions instead of letting the last version overwrite type history',()=>{
 const nodes=[node('R',null,0,'route'),node('é','R',0,'call')]
 expect(validateOperationTreeStructure({nodes,previousNodes:[{id:'é',type:'task'},{id:'e\u0301',type:'call'}]})).toContain('TYPE_HISTORY:e\u0301')
 expect(validateOperationTreeStructure({nodes,previousNodes:[{id:'é',type:'call'},{id:'e\u0301',type:'call'}]})).toEqual([])
})
it.each([{history:null},{history:{}},{history:[null]},{history:[{id:1,type:'task'}]}])('reports invalid historical projection %j without throwing',({history})=>{
 const result=validateOperationTreeStructure({nodes:valid(),previousNodes:history as unknown as ReadonlyArray<Pick<OperationStructureNode,'id'|'type'>>})
 expect(result.some(error=>error.startsWith('HISTORY_'))).toBe(true)
})
it('reports malformed current nodes without throwing or pretending the missing branch is valid',()=>{
 const nodes=[node('R',null,0,'route'),null,{id:'T',parentId:'R',index:0}]
 expect(validateOperationTreeStructure({nodes:nodes as unknown as readonly OperationStructureNode[]})).toContain('NODE_SHAPE:1')
 expect(validateOperationTreeStructure({nodes:{} as readonly OperationStructureNode[]})).toEqual(['OPERATION_NODES'])
})
