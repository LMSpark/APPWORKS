import {afterEach,expect,it} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElInput,ElSelect} from 'element-plus'
import VXETable,{VxeTable} from 'vxe-table'
import JsonTreeEditor from '../../components/editors/JsonTreeEditor.vue'

const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
async function editor(text:string,rootKind:'document'|'value'='value'){
 const wrapper=mount(JsonTreeEditor,{attachTo:document.body,props:{modelValue:text,rootKind},global:{plugins:[ElementPlus,VXETable],stubs:{JsonTreeEditor:false}}})
 wrappers.push(wrapper);await flushPromises();return wrapper
}
it.each(['null','false','0','""','"text"','[]','{}'])('represents %s as an actual editable root without publishing on load',async text=>{
 const wrapper=await editor(text),table=wrapper.getComponent(VxeTable),root=table.props('data')![0]!
 expect(root.path).toEqual([]);expect(root.typeEditable).toBe(true);expect(root.deletable).toBe(false);expect(root.keyEditable).toBe(false)
 expect(wrapper.find('[data-json-repair-input]').exists()).toBe(false)
 expect(wrapper.emitted('update:modelValue')).toBeUndefined();expect(wrapper.emitted('update:documentValue')).toBeUndefined()
})
it('changes a scalar root to an array and back without sending a scalar document event',async()=>{
 const wrapper=await editor('false')
 const type=()=>wrapper.findAllComponents(ElSelect).find(select=>select.props('modelValue')!=='all')!
 expect(type()).toBeDefined();type().vm.$emit('update:modelValue','array');await flushPromises()
 expect(JSON.parse(wrapper.emitted('update:modelValue')!.at(-1)![0] as string)).toEqual([])
 type().vm.$emit('update:modelValue','string');await flushPromises()
 const input=wrapper.findAllComponents(ElInput).find(item=>item.props('modelValue')==='' && !item.classes().includes('vxe-json-tree-editor__keyword'))!
 input.vm.$emit('update:modelValue','latest');await flushPromises()
 expect(wrapper.emitted('editing-change')!.at(-1)).toEqual([true])
 expect(JSON.parse(wrapper.emitted('update:modelValue')!.at(-1)![0] as string)).toBe('')
 input.vm.$emit('change','latest');await flushPromises()
 expect(JSON.parse(wrapper.emitted('update:modelValue')!.at(-1)![0] as string)).toBe('latest')
 expect(wrapper.emitted('update:documentValue')).toBeUndefined()
})
it.each(['','{invalid'])('keeps missing or invalid value %s until explicit repair, with cancel and readonly protection',async text=>{
 const wrapper=await editor(text)
 const repair=()=>wrapper.findAllComponents(ElInput).find(input=>input.props('type')==='textarea')!
 expect(repair()).toBeDefined();expect(repair().props('modelValue')).toBe(text)
 await repair().setValue('false');await flushPromises()
 await wrapper.findAll('button').find(button=>button.text()==='取消修复')!.trigger('click')
 expect(repair().props('modelValue')).toBe(text);expect(wrapper.emitted('update:modelValue')).toBeUndefined()
 await repair().setValue('null');await wrapper.setProps({readOnly:true})
 expect(repair().props('modelValue')).toBe(text);expect(repair().props('readonly')).toBe(true)
 await wrapper.setProps({readOnly:false});await repair().setValue('false')
 await wrapper.findAll('button').find(button=>button.text()==='应用修复')!.trigger('click');await flushPromises()
 expect(wrapper.emitted('update:modelValue')).toEqual([['false\n']]);expect(wrapper.emitted('update:documentValue')).toBeUndefined()
})
it('retains the document root contract when scalar text is supplied',async()=>{
 const wrapper=await editor('false','document')
 expect(wrapper.text()).toContain('JSON 顶层必须是对象或数组')
 expect(wrapper.findComponent(VxeTable).exists()).toBe(false)
})
