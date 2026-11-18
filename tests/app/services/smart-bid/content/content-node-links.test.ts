import {expect,it} from 'vitest'
import {readContentNodeFactIds,readContentNodeLinkOccurrences,readContentNodeLinks} from '@/services/smart-bid/content/content-node-links'

const node=(type='paragraph',value='',data:Record<string,unknown>={})=>({nodeId:'N',parentId:'P',index:0,type,class:[],value,data})
it('preserves repeated link occurrences in original UTF-16 order',()=>{
 const value='📎{{页}} {{册}} {{页}}'
 const locations=readContentNodeLinkOccurrences(node('paragraph',value,{
  册:{type:'xref',nodeId:'D',show:'title'},页:{type:'page',nodeId:'H'}}))
 expect(locations.map(({kind,start,end})=>[kind,start,value.slice(start,end)])).toEqual([
  ['page',2,'{{页}}'],['xref',8,'{{册}}'],['page',14,'{{页}}'],
 ])
 expect(locations[0]?.path).toEqual(['data','页'])
})
it('reads distinct fact keys in original placeholder order',()=>{
 const input=node('paragraph','{{first}} {{second}} {{first}} {{third}}',{
  third:{type:'fact',factId:'F1'},second:{type:'fact',factId:'F2'},first:{type:'fact',factId:'F1'}})
 expect(readContentNodeFactIds(input)).toEqual(['F1','F2'])
 expect(()=>readContentNodeFactIds(node('paragraph','text',{unused:{type:'fact',factId:'F3'}}))).toThrow('UNUSED_DATA')
})
it('reads table fact keys in row and column order',()=>{
 const cell=(name:string,factId:string)=>({value:`{{${name}}}`,data:{[name]:{type:'fact',factId}}})
 expect(readContentNodeFactIds(node('table','',{header:['a','b'],rows:[
  [cell('a','F2'),cell('b','F1')],[cell('a','F3'),cell('b','F2')]
 ]}))).toEqual(['F2','F1','F3'])
})
it('reads exact node references and paths while preserving other typed fields',()=>{
 const input=node('paragraph','见{{章节}}第{{页码}}页，{{零}}，{{否}}',{
  章节:{type:'xref',nodeId:'e\u0301',show:'title'},页码:{type:'page',nodeId:'A'},
  零:{type:'number',number:'0',unit:'元'},否:{type:'bool',bool:false}})
 const before=structuredClone(input),result=readContentNodeLinks(input)
 expect(result.links).toEqual([
  {ownerNodeId:'N',path:['data','章节'],kind:'xref',targetNodeId:'e\u0301'},
  {ownerNodeId:'N',path:['data','页码'],kind:'page',targetNodeId:'A'}])
 expect(input).toEqual(before)
})
it('reads links inside table cells using row and column paths',()=>{
 const result=readContentNodeLinks(node('table','',{header:['引用'],rows:[[{value:'{{引用}}',data:{引用:{type:'xref',nodeId:'A',show:'number'}}}]]}))
 expect(result.links).toEqual([{ownerNodeId:'N',path:['data','rows','0','0','data','引用'],kind:'xref',targetNodeId:'A'}])
})
it.each([
 node('paragraph','{{缺项}}'),node('paragraph','普通文字',{多余:{type:'page',nodeId:'A'}}),
 node('paragraph','{{引用}}',{引用:{type:'xref',nodeId:'A',show:'html'}}),
 node('table','',{header:['一列'],rows:[[]]}),
 node('chapter','夹带正文'),node('chapter','',{旧状态:'已采用'}),
 node('image','{{图}}',{图:{type:'fact',factId:'F'}})
])('rejects malformed semantic data rather than returning a falsely empty link list',input=>{
 expect(()=>readContentNodeLinks(input)).toThrow()
})
it('does not infer a generator from empty table arrays',()=>{
 const result=readContentNodeLinks(node('table','',{header:[],rows:[]}))
 expect(result.requiresTableGeneratorCheck).toBe(true)
 expect(result.links).toEqual([])
})
it('rejects missing cell data without invoking hidden accessors',()=>{
 let reads=0
 const cell={data:{}}
 Object.defineProperty(cell,'value',{get(){reads++;return ''}})
 expect(()=>readContentNodeLinks(node('table','',{header:['列'],rows:[[cell]]}))).toThrow()
 expect(reads).toBe(0)
})
it('rejects mixed word and data cells in one column',()=>{
 expect(()=>readContentNodeLinks(node('table','',{header:['引用'],rows:[
  [{value:'{{引用}}',data:{引用:{type:'page',nodeId:'A'}}}],
  [{value:'文字',data:{}}]
 ]}))).toThrow('CONTENT_LINK_TABLE_COLUMN')
})
it('retains a literal __proto__ field name without changing the reference record prototype',()=>{
 const data=Object.fromEntries([['__proto__',{type:'page',nodeId:'A'}]])
 expect(readContentNodeLinks(node('paragraph','{{__proto__}}',data)).links).toEqual([
  {ownerNodeId:'N',path:['data','__proto__'],kind:'page',targetNodeId:'A'}])
})
it('does not treat a nodeId nested in a sensitive owner as a content link',()=>{
 const result=readContentNodeLinks(node('paragraph','{{姓名}}',{姓名:{type:'sensitive',ownerRef:{nodeId:'PERSON'},field:'姓名'}}))
 expect(result.links).toEqual([])
})
