import {describe,expect,it} from 'vitest'
import {visitExcelTransformExpression as visit} from '@/lowcode/resources/semi-structured/excel-import/transform/expression'
describe('Excel controlled expression references',()=>{
 it('walks only actually consumed field nodes, keeps native args and ignores literal-shaped fields',()=>{
  const names:string[]=[]
  const value={op:'IF',args:[false,{const:{field:'literal_only'}},{op:'ADD',args:[{field:'amount'},0]}],extension:{field:'not_consumed'}}
  const before=JSON.stringify(value)
  visit({value,path:'expression',field:name=>names.push(name)})
  expect(names).toEqual(['amount']);expect(JSON.stringify(value)).toBe(before)
 })
 it.each([null,false,0,'literal'])('accepts native service-evaluated value %j but requires object condition roots',value=>{
  expect(()=>visit({value,path:'expression'})).not.toThrow()
  expect(()=>visit({value,path:'condition_json',objectRoot:true})).toThrow()
 })
 it.each([{op:'JS',args:[]},{op:'ADD',args:[1]},{op:'IF',args:[1,2]},{op:'AND',args:{}},{field:''},[],{}])('rejects invalid controlled syntax %j',value=>{
  expect(()=>visit({value,path:'expression'})).toThrow()
 })
 it('preserves valid existing extra args because the service eagerly evaluates them',()=>{
  const fields:string[]=[]
  visit({value:{op:'ADD',args:[1,2,{field:'extra'}]},path:'expression',field:name=>fields.push(name)})
  expect(fields).toEqual(['extra'])
  expect(()=>visit({value:{op:'AND',args:[]},path:'expression'})).not.toThrow()
 })
 it('follows the service field-before-const precedence without rewriting an existing node',()=>{
  const value={field:'amount',const:0,op:'IGNORED'},fields:string[]=[]
  visit({value,path:'expression',field:name=>fields.push(name)})
  expect(fields).toEqual(['amount']);expect(value).toEqual({field:'amount',const:0,op:'IGNORED'})
 })

})
