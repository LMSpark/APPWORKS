import {expect,it,vi} from 'vitest'
import {expandCalculationTable} from '@/services/smart-bid/content/calculation-table-expansion'
import {ATTACHMENT_INDEX_GENERATOR,generateAttachmentIndex} from '@/services/smart-bid/content/attachment-index-generator'
import {expandBuiltInCalculationTable} from '@/services/smart-bid/content/calculation-table-registry'
import {projectContentPageReferences} from '@/services/smart-bid/content/page-reference-projection'

const placeholder={nodeId:'T',parentId:'C',type:'table',index:0,class:['deviation'],value:'',data:{header:[],rows:[]}}
const data={header:['页'],rows:[[{value:'{{页}}',data:{页:{type:'page',nodeId:'H'}}}]]}
const input={placeholder,generatorKey:'deviation',generatorVersion:'1',inputHash:'a'.repeat(64),nodeIds:new Set(['T','H']),assertCurrent:()=>{},generate:()=>data}

it('retains original position and input identity and returns independent structured output',()=>{
 const result=expandCalculationTable(input)
 expect(result).toEqual({nodeId:'T',generatorKey:'deviation',generatorVersion:'1',inputHash:'a'.repeat(64),data,
  presentationNode:{...placeholder,data}})
 expect(result.data).not.toBe(data)
 expect(result.presentationNode.data).toBe(result.data)
 expect(Object.isFrozen(result.presentationNode)).toBe(true)
 expect(Object.isFrozen(result.data['rows'])).toBe(true)
 expect(Object.isFrozen(data.rows)).toBe(false)
 expect(placeholder.data).toEqual({header:[],rows:[]})
})

it('rejects unresolved, incomplete or stale generated results',()=>{
 expect(()=>expandCalculationTable({...input,nodeIds:new Set(['T'])})).toThrow('CONTENT_CALCULATION_EXPANSION')
 expect(()=>expandCalculationTable({...input,generate:()=>({header:['页'],rows:[[]]})})).toThrow('CONTENT_LINK_TABLE_ROW')
 const assertCurrent=vi.fn().mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw Error('SOURCE_STALE')})
 expect(()=>expandCalculationTable({...input,assertCurrent})).toThrow('SOURCE_STALE')
})

it('expands an attachment index in recorded order with fixed resource and page references',()=>{
 const entries=[{resourceVersionId:'ATTACHMENT-2',nodeId:'H'},{resourceVersionId:'ATTACHMENT-1',nodeId:'H'}]
 const {generate:_generate,...scope}=input
 const request={...scope,generatorKey:ATTACHMENT_INDEX_GENERATOR.key,generatorVersion:ATTACHMENT_INDEX_GENERATOR.version,entries}
 const result=expandBuiltInCalculationTable(request)
 const page={nodeId:'H',pageLabel:'iv'}
 const references=projectContentPageReferences([result.presentationNode],[page])
 expect(references.map(({path,pageLabel})=>[path,pageLabel])).toEqual([
  [['data','rows','0','1','data','页码'],'iv'],
  [['data','rows','1','1','data','页码'],'iv'],
 ])
 expect(()=>projectContentPageReferences([result.presentationNode],[])).toThrow('CONTENT_PAGE_TARGET_MISSING:T:H')
 expect(()=>projectContentPageReferences([result.presentationNode],[page,page])).toThrow('CONTENT_PAGE_PAGINATION_MODEL')
 expect(result.data).toEqual({
  header:['附件','页码'],
  rows:entries.map(({resourceVersionId,nodeId})=>[
   {value:'{{附件}}',data:{附件:{type:'resource',resourceVersionId}}},
   {value:'{{页码}}',data:{页码:{type:'page',nodeId}}},
  ]),
 })
 expect(()=>generateAttachmentIndex([entries[0],entries[0]])).toThrow('CONTENT_ATTACHMENT_INDEX_ENTRY')
 expect(()=>expandBuiltInCalculationTable({...request,generatorVersion:'previous'})).toThrow('CONTENT_CALCULATION_GENERATOR_VERSION')
 expect(()=>expandBuiltInCalculationTable({...request,generatorKey:'unknown'})).toThrow('CONTENT_CALCULATION_GENERATOR_VERSION')
})
