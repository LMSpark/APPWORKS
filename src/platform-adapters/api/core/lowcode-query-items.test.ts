// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {readLowcodeQueryItems} from './lowcode-query-items.js'

describe('readLowcodeQueryItems',()=>{
 it.each([
  {value:{Items:[{id:'A'}]},keys:['Items','items'],expected:[{id:'A'}]},
  {value:{data:{items:[{id:'B'}]}},keys:['Items','items'],expected:[{id:'B'}]},
  {value:{Items:null,items:[{id:'N'}]},keys:['Items','items'],expected:[{id:'N'}]},
  {value:{Data:{result:[{id:'C'}]}},keys:['Items','items','Result','result'],expected:[{id:'C'}]},
 ])('unwraps supported lowcode result envelopes',({value,keys,expected})=>{
  expect(readLowcodeQueryItems(value,{label:'fixture',itemKeys:keys,requireRecords:true})).toEqual(expected)
 })

 it('keeps caller strictness explicit',()=>{
  expect(readLowcodeQueryItems({Items:[{id:'A'},'ignored']},{label:'fixture',itemKeys:['Items']}))
   .toEqual([{id:'A'},'ignored'])
  expect(()=>readLowcodeQueryItems({Items:[{id:'A'},'invalid']},{
   label:'fixture',itemKeys:['Items'],requireRecords:true,
  })).toThrow('fixture Result.items 不是对象数组')
  expect(()=>readLowcodeQueryItems({Data:{Items:{}}},{label:'fixture',itemKeys:['Items']}))
   .toThrow('fixture Result.items 不是数组')
 })
})
