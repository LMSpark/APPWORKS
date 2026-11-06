import {describe,expect,it} from 'vitest'
import {LowcodeDataSpaceModelNameProjection} from '@/lowcode/data-space/model-source/rename/lowcode-data-space-model-name-projection'
const models=[{rowid:'M1',Name:'Orders'},{rowid:'M2',Name:'Other'}]
const fields=[{dataModelId:'M1',Name:'id',AsName:''},{dataModelId:'M1',Name:'Orders.literal',AsName:''}]
function projection(){return new LowcodeDataSpaceModelNameProjection({models,fields,previousName:'Orders',nextName:'Fork'})}
describe('registered model name reference projection',()=>{
 it('rewrites structured self references while preserving actual dotted field names and physical qualifiers',()=>{
  const p=projection()
  expect(p.field('Orders.id','M1')).toBe('Fork.id')
  expect(p.field('Orders.literal','M1')).toBe('Orders.literal')
  expect(p.field('Orders.id','M1',['Orders'])).toBe('Orders.id')
  expect(p.value({Type:'GetTableField',Field:'Orders.id'},'M1')).toEqual({Type:'GetTableField',Field:'Fork.id'})
 })
 it('keeps constants and node inputs opaque and diagnoses opaque self references',()=>{
  const p=projection(),constant={Type:'GetConstValue',Value:{Type:'GetTableField',Field:'Orders.id'}},input={Type:'GetInputParam',ParamName:'Orders.id'}
  expect(p.value(constant,'M1')).toBe(constant);expect(p.value(input,'M1')).toBe(input)
  expect(()=>p.value({Type:'GetExpData',Exp:'Orders.id'},'M1')).toThrow('尚不能可靠改写')
 })
 it('rejects ambiguous registered qualifiers instead of using physical names',()=>{
  const p=new LowcodeDataSpaceModelNameProjection({models:[...models,{rowid:'M3',Name:'Orders.id'}],fields:[...fields,{dataModelId:'M3',Name:'x',AsName:''},{dataModelId:'M1',Name:'id.x',AsName:''}],previousName:'Orders',nextName:'Fork'})
  expect(()=>p.field('Orders.id.x','M2')).toThrow('不唯一')
 })
})
