import {describe,expect,it} from 'vitest'
import {excelTransformFormSchema} from '@/lowcode/resources/semi-structured/excel-import/transform/forms'
import {EXCEL_TRANSFORM_RULE_TYPES} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'

describe('Excel transformation typed configuration forms',()=>{
 const fields='SPACE@Base_ImportData_Field@foreignKeyFields'
 it.each(EXCEL_TRANSFORM_RULE_TYPES)('describes %s without filling defaults or constraining unknown extensions',ruleType=>{
  const schema=excelTransformFormSchema({ruleType,fieldOptionsKey:fields})
  expect(schema.type).toBe('object');expect(schema.additionalProperties).not.toBe(false)
  expect(JSON.stringify(schema)).not.toContain('"default":')
  expect(schema.properties?.['executionScope']).toMatchObject({enum:['PIVOT','UNPIVOT'].includes(ruleType)?['IMPORT','EXPORT','BOTH']:['IMPORT']})
 })
 it.each([['VALIDATE','requiredFields'],['DEDUPLICATE','fields'],['PIVOT','groupFields']])('binds %s.%s to the original option view as native strings', (ruleType,member)=>{
  const schema=excelTransformFormSchema({ruleType:ruleType!,fieldOptionsKey:fields})
  expect(schema.properties?.[member!]).toMatchObject({type:'array',items:{type:'string'},'x-optionDataViewKey':fields})
  expect(JSON.stringify(schema.properties?.[member!])).not.toContain('x-optionAllowCreate')
 })
 it('keeps expression operands and arbitrary native mapping values as JSON instead of string fields',()=>{
  for(const [ruleType,member] of [['COMPUTE','expression'],['OVERRIDE','expression'],['LOOKUP','mapping'],['PIVOT','columns']]){
   const schema=excelTransformFormSchema({ruleType:ruleType!,fieldOptionsKey:fields})
   expect(schema.properties?.[member!]).not.toHaveProperty('type')
  }
 })
 it('uses scalar generated-field choices for pivot endpoints without changing its mapping shape',()=>{
  const schema=excelTransformFormSchema({ruleType:'PIVOT',fieldOptionsKey:fields})
  expect(schema.properties?.['keyField']).toMatchObject({type:'string','x-optionDataViewKey':fields,'x-optionAllowCreate':true})
  expect(schema.properties?.['valueField']).toMatchObject({type:'string','x-optionDataViewKey':fields,'x-optionAllowCreate':true})
 })
 it('rejects an unknown kind instead of providing a fallback form',()=>{
  expect(()=>excelTransformFormSchema({ruleType:'LEGACY',fieldOptionsKey:fields})).toThrow('不支持')
 })
})
