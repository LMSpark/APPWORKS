import {describe,it,expect} from 'vitest'
import {assertExcelTransformReferenceTransition} from '@/lowcode/resources/semi-structured/excel-import/transform/pipeline'
const rule=(id:string,type:string,sort:number,config:Record<string,unknown>={},source='',target='')=>({id,rule_type:type,sort_order:sort,enabled:1,on_error:'FAIL_ROW',source_field:source,target_field:target,condition_json:'',config_json:JSON.stringify({executionScope:'IMPORT',...config})})
describe('Excel transform formal dependency transition',()=>{
 const producer=rule('P','DEFAULT',10,{value:0},'','generated')
 const consumer=rule('C','TRIM',20,{},'generated','result')
 const check=(before:ReturnType<typeof rule>[],after:ReturnType<typeof rule>[],changed:string[]=[])=>assertExcelTransformReferenceTransition({fields:{IMPORT:['source'],EXPORT:['physical']},before,after,changed:row=>changed.includes(String(row['id'])),allowRowShapes:true})
 it('recognizes a stored native null config as the runtime empty object when proving a producer',()=>{
  const producer={...rule('P','TRIM',10,{},'source','generated'),config_json:null}
  expect(()=>assertExcelTransformReferenceTransition({fields:{IMPORT:['source'],EXPORT:[]},before:[producer,consumer],after:[consumer],changed:()=>false,allowRowShapes:true})).toThrow('generated')
 })
 it('uses trimmed PIVOT group field names without rewriting their stored spelling',()=>{
  const pivot=rule('P','PIVOT',10,{groupFields:[' source '],keyField:'source',valueField:'source',columns:{a:'output'}})
  expect(()=>check([],[pivot],['P'])).not.toThrow()
  expect(pivot.config_json).toContain(' source ')
 })
 it('rejects deleting a producer alone and accepts deleting producer and consumer together',()=>{
  expect(()=>check([producer,consumer],[consumer])).toThrow('generated')
  expect(()=>check([producer,consumer],[])).not.toThrow()
 })
 it('requires strictly earlier producers and rejects disabling or reordering them',()=>{
  for(const patch of [{enabled:0},{sort_order:20},{sort_order:30}])expect(()=>check([producer,consumer],[{...producer,...patch},consumer],['P'])).toThrow('generated')
  expect(()=>check([], [producer,consumer],['P','C'])).not.toThrow()
 })
 it('does not infer a dependency from a constant containing field-shaped JSON',()=>{
  expect(()=>check([],[rule('A','COMPUTE',10,{expression:{const:{field:'absent'}}},'','result')],['A'])).not.toThrow()
 })
 it('keeps an unrelated old invalid rule from blocking an independent valid addition',()=>{
  const old=rule('OLD','TRIM',5,{},'missing','old')
  expect(()=>check([old],[old,producer],['P'])).not.toThrow()
  expect(()=>check([old],[old],['OLD'])).toThrow('missing')
 })
 it('removes UNPIVOT source columns and resets PIVOT output shape',()=>{
  const unpivot=rule('U','UNPIVOT',10,{columns:[{sourceField:'source',key:false}],keyTargetField:'key',valueTargetField:'value',sourceFieldPolicy:'REMOVE'})
  const after=rule('AFTER','TRIM',20,{},'source','result')
  expect(()=>check([],[unpivot,after],['U','AFTER'])).toThrow('source')
  expect(()=>check([],[{...unpivot,config_json:unpivot.config_json.replace('REMOVE','KEEP')},after],['U','AFTER'])).not.toThrow()
  const pivot=rule('V','PIVOT',10,{groupFields:['source'],keyField:'source',valueField:'source',columns:{a:'output'}})
  expect(()=>check([producer],[producer,{...pivot,sort_order:20},rule('T','TRIM',30,{},'generated','end')],['V','T'])).toThrow('generated')
 })
 it('keeps IMPORT and EXPORT field scopes separate',()=>{
  const exportRule=rule('E','UNPIVOT',10,{executionScope:'EXPORT',columns:[{sourceField:'physical',key:0}],keyTargetField:'key',valueTargetField:'value'})
  expect(()=>check([],[exportRule],['E'])).not.toThrow()
  expect(()=>check([],[{...exportRule,config_json:exportRule.config_json.replace('physical','source')}],['E'])).toThrow('source')
 })
 it('does not restore a removed field from a producer at the same ambiguous execution order',()=>{
  const unpivot=rule('U','UNPIVOT',10,{columns:[{sourceField:'source',key:0}],keyTargetField:'key',valueTargetField:'value'})
  const recreate=rule('D','DEFAULT',10,{value:0},'','source'),consumer=rule('C','TRIM',20,{},'source','end')
  for(const tied of [[unpivot,recreate],[recreate,unpivot]])expect(()=>check([],[...tied,consumer],['U','D','C'])).toThrow('source')
 })
 it('rejects active row-shape rules on a parent while preserving disabled rules',()=>{
  const shape=rule('S','FILTER',10,{expression:{const:true}})
  const input={fields:{IMPORT:['source'],EXPORT:[]},before:[],after:[shape],changed:()=>true,allowRowShapes:false}
  expect(()=>assertExcelTransformReferenceTransition(input)).toThrow('父')
  expect(()=>assertExcelTransformReferenceTransition({...input,after:[{...shape,enabled:0}]})).not.toThrow()
 })
})
