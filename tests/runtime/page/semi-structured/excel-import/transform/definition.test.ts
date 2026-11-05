import {describe,expect,it} from 'vitest'
import {createExcelTransformConfig} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'
import {validateExcelTransformRule} from '@/lowcode/resources/semi-structured/excel-import/transform/validation'
import evidence from '../../../../../../evidence/data-chain-smoke/2026-11-05-excel-transform-preflight-runtime.json'

const base = {rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:10,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{"executionScope":"IMPORT"}'}
const validate=(patch:Record<string,unknown>)=>validateExcelTransformRule({values:{...base,...patch},created:true,changedFields:Object.keys(base)})
describe('Excel transformation formal rule definitions',()=>{
 it.each(evidence.intent.cases)('accepts the service-verified $label structure without modifying its JSON',item=>{
  const row=item.body.rules[0]!,before=JSON.stringify(row)
  expect(()=>validateExcelTransformRule({values:row,created:true,changedFields:Object.keys(row)})).not.toThrow()
  expect(JSON.stringify(row)).toBe(before)
 })
 it('avoids the two reference defaults that change actual backend meaning',()=>{
  expect(createExcelTransformConfig('VALIDATE')).toEqual({executionScope:'IMPORT',requiredFields:[]})
  expect(createExcelTransformConfig('CONVERT')).toEqual({executionScope:'IMPORT',targetType:'STRING'})
  expect(()=>validate({rule_type:'VALIDATE',config_json:'{"requiredFields":["code"]}'})).not.toThrow()
  expect(()=>validate({rule_type:'VALIDATE',config_json:'{"requiredFields":["code"],"expression":null}'})).toThrow(/expression/)
  expect(()=>validate({rule_type:'CONVERT',config_json:'{"targetType":"DATE"}'})).not.toThrow()
  expect(()=>validate({rule_type:'CONVERT',config_json:'{"targetType":"DATE","pattern":""}'})).toThrow(/pattern/)
 })
 it.each([0,false,'',null])('distinguishes an explicit OVERRIDE value %j from a missing member',value=>{
  expect(()=>validate({rule_type:'OVERRIDE',config_json:JSON.stringify({value})})).not.toThrow()
 })
 it('rejects missing values and unsupported scope, type or policy without fallback',()=>{
  for(const patch of [{rule_type:'UNKNOWN'},{enabled:2},{on_error:'FALLBACK'},{config_json:'{"executionScope":"INVALID"}'},{config_json:'{"executionScope":"EXPORT"}'}])expect(()=>validate(patch)).toThrow()
 })
 it('checks shape collisions while preserving native UNPIVOT keys and LOOKUP mapping values',()=>{
  const columns=[{sourceField:'amount',key:0},{sourceField:'other',key:false}]
  const config={columns,keyTargetField:'kind',valueTargetField:'value',maxItems:2}
  expect(()=>validate({rule_type:'UNPIVOT',config_json:JSON.stringify(config)})).not.toThrow()
  expect(()=>validate({rule_type:'UNPIVOT',config_json:JSON.stringify({...config,keyTargetField:'AMOUNT'})})).toThrow()
  expect(()=>validate({rule_type:'PIVOT',config_json:'{"groupFields":["customer"],"keyField":"kind","valueField":"amount","columns":{"A":"CUSTOMER"}}'})).toThrow()
  const mapping={'0':false,'1':0};const json=JSON.stringify({mapping})
  expect(()=>validate({rule_type:'LOOKUP',config_json:json})).not.toThrow();expect(JSON.parse(json).mapping).toEqual(mapping)
 })
 it('preserves literal whitespace patterns and ignores DATE-only pattern in STRING conversions',()=>{
  expect(()=>validate({rule_type:'REPLACE',config_json:'{"search":" ","replacement":""}'})).not.toThrow()
  expect(()=>validate({rule_type:'EXPLODE',config_json:JSON.stringify({delimiterRegex:'\t'})})).not.toThrow()
  expect(()=>validate({rule_type:'CONVERT',config_json:'{"targetType":"STRING","pattern":""}'})).not.toThrow()
 })
 it('rejects PIVOT keys and collisions using the service comparison semantics without rewriting raw input',()=>{
  const baseConfig={groupFields:['g'],keyField:'kind',valueField:'amount',columns:{A:'x'}}
  for(const config of [{...baseConfig,columns:{' ':'amount'}},{...baseConfig,columns:{A:'x',B:' x '}},{...baseConfig,groupFields:['g',' g ']}]){
   const before=JSON.stringify(config)
   expect(()=>validate({rule_type:'PIVOT',config_json:before})).toThrow()
   expect(JSON.stringify(config)).toBe(before)
  }
 })
 it('accepts the actual expression-first OVERRIDE and normalized service enum without changing original JSON',()=>{
  const config_json='{"executionScope":" import ","value":0,"expression":{"const":false}}'
  expect(()=>validate({rule_type:'override',on_error:'fail_row',config_json})).not.toThrow()
  expect(config_json).toBe('{"executionScope":" import ","value":0,"expression":{"const":false}}')
 })

 it('keeps established defaults and literal blank config text without filling members back into stored JSON',()=>{
  for(const config_json of ['', '  ', '{}'])expect(()=>validate({rule_type:'TRIM',config_json})).not.toThrow()
  expect(()=>validate({rule_type:'DEFAULT',config_json:'{}'})).not.toThrow()
  expect(()=>validate({rule_type:'OVERRIDE',config_json:'{}'})).not.toThrow()
  expect(()=>validate({rule_type:'OVERRIDE',config_json:'{"expression":null,"value":7}'})).not.toThrow()
  for(const kind of ['COMPUTE','FILTER'])expect(()=>validate({rule_type:kind,config_json:'{"expression":null}'})).toThrow('expression')
 })
 it('uses the original change scope instead of turning an unrelated edit into an implicit migration',()=>{
  const values={...base,enabled:null,on_error:null,sort_order:null,config_json:null}
  const before=JSON.stringify(values)
  expect(()=>validateExcelTransformRule({values:{...values,sort_order:20},created:false,changedFields:['sort_order']})).not.toThrow()
  expect(()=>validateExcelTransformRule({values:{...values,enabled:0},created:false,changedFields:['enabled']})).not.toThrow()
  expect(()=>validateExcelTransformRule({values:{...values,enabled:1},created:false,changedFields:['enabled']})).toThrow('config_json')
  expect(()=>validateExcelTransformRule({values:{...values,config_json:'null'},created:false,changedFields:['config_json']})).toThrow('config_json')
  expect(JSON.stringify(values)).toBe(before)
 })

})
