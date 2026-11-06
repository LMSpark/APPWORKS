import {afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElInput} from 'element-plus'
import VXETable,{VxeTable} from 'vxe-table'
import FilterExpressionEditor from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import JsonTreeEditor from '../../components/editors/JsonTreeEditor.vue'
const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
async function editor(){
 const editing=vi.fn(),original={field:'Name',operator:'eq' as const,value:'kept'}
 const wrapper=mount(FilterExpressionEditor,{attachTo:document.body,props:{display:'inline',modelValue:original,columns:[{name:'Name',type:'string'}],onEditingChange:editing},
  global:{plugins:[ElementPlus,VXETable],stubs:{JsonTreeEditor:false}}})
 wrappers.push(wrapper);await wrapper.get('[data-action="json"]').trigger('click');await flushPromises()
 const tree=wrapper.getComponent(JsonTreeEditor),table=tree.getComponent(VxeTable)
 const row=table.props('data')?.find(row=>JSON.stringify(row.path)==='["value"]')
 if(!row)throw Error('missing actual value row')
 table.vm.$emit('current-row-change',{newValue:row});await flushPromises()
 const input=tree.findAllComponents(ElInput).find(input=>input.props('modelValue')==='kept')
 if(!input)throw Error('missing actual string editor')
 return{wrapper,tree,input,editing,original}
}
it('uses the actual tree table and applies its latest committed value only through the filter action',async()=>{
 const {wrapper,input,editing,original}=await editor()
 expect(wrapper.find('.spark-json-editor').exists()).toBe(false)
 input.vm.$emit('update:modelValue','latest');await flushPromises()
 expect(editing).toHaveBeenLastCalledWith(true)
 await wrapper.get('[data-action="apply"]').trigger('click')
 expect(wrapper.emitted('update:modelValue')).toBeUndefined()
 input.vm.$emit('change','latest');await flushPromises()
 await wrapper.get('[data-action="apply"]').trigger('click')
 expect(wrapper.emitted('update:modelValue')).toEqual([[{...original,value:'latest'}]])
})
it('releases a discarded tree input notification when disabled then enabled',async()=>{
 const {wrapper,input,editing,original}=await editor()
 input.vm.$emit('update:modelValue','pending');await flushPromises()
 expect(editing).toHaveBeenLastCalledWith(true)
 await wrapper.setProps({disabled:true});await wrapper.setProps({disabled:false});await flushPromises()
 expect(editing).toHaveBeenLastCalledWith(false)
 await wrapper.get('[data-action="apply"]').trigger('click')
 expect(wrapper.emitted('update:modelValue')).toEqual([[original]])
})
it('preserves malformed input for the tree repair action without prematurely applying the filter',async()=>{
 const {wrapper,tree,original}=await editor()
 tree.vm.$emit('update:modelValue','{invalid');await flushPromises()
 await wrapper.get('[data-action="apply"]').trigger('click')
 expect(wrapper.get('[role="alert"]').text()).toContain('过滤表达式不是有效 JSON')
 const repair=tree.findAllComponents(ElInput).find(input=>input.props('type')==='textarea')
 if(!repair)throw Error('missing actual tree repair control')
 const fixed={...original,value:'repaired'}
 await repair.setValue(JSON.stringify(fixed));await flushPromises()
 await tree.findAll('button').find(button=>button.text()==='应用修复')!.trigger('click');await flushPromises()
 expect(wrapper.emitted('update:modelValue')).toBeUndefined()
 await wrapper.get('[data-action="apply"]').trigger('click')
 expect(wrapper.emitted('update:modelValue')).toEqual([[fixed]])
})
