import {expect,it,vi} from 'vitest'
import {expandCalculationTable} from '@/services/smart-bid/content/calculation-table-expansion'
import {ATTACHMENT_INDEX_GENERATOR,generateAttachmentIndex} from '@/services/smart-bid/content/attachment-index-generator'

const placeholder={nodeId:'T',parentId:'C',type:'table',index:0,class:['deviation'],value:'',data:{header:[],rows:[]}}
const data={header:['页'],rows:[[{value:'{{页}}',data:{页:{type:'page',nodeId:'H'}}}]]}
const input={placeholder,generatorKey:'deviation',generatorVersion:'1',inputHash:'a'.repeat(64),nodeIds:new Set(['T','H']),assertCurrent:()=>{},generate:()=>data}

it('retains original position and input identity and returns independent structured output',()=>{
 const result=expandCalculationTable(input)
 expect(result).toEqual({nodeId:'T',generatorKey:'deviation',generatorVersion:'1',inputHash:'a'.repeat(64),data})
 expect(result.data).not.toBe(data)
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
 const result=expandCalculationTable({...input,generatorKey:ATTACHMENT_INDEX_GENERATOR.key,
  generatorVersion:ATTACHMENT_INDEX_GENERATOR.version,generate:()=>generateAttachmentIndex(entries)})
 expect(result.data).toEqual({
  header:['附件','页码'],
  rows:entries.map(({resourceVersionId,nodeId})=>[
   {value:'{{附件}}',data:{附件:{type:'resource',resourceVersionId}}},
   {value:'{{页码}}',data:{页码:{type:'page',nodeId}}},
  ]),
 })
 expect(()=>generateAttachmentIndex([entries[0],entries[0]])).toThrow('CONTENT_ATTACHMENT_INDEX_ENTRY')
})
