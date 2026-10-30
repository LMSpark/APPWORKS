import {afterEach, describe, expect, it} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, reactive, ref} from 'vue'
import ElementPlus, {ElInput, ElInputNumber, ElSelect, ElRadioGroup} from 'element-plus'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import JsonObjectForm from '../../../../packages/spark-component/src/components/fields/data-components/text/FieldJson/JsonObjectForm.vue'
import JsonObjectProperties from '../../../../packages/spark-component/src/components/fields/data-components/text/FieldJson/JsonObjectProperties.vue'
const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w=>w.unmount()); runtimes.splice(0).forEach(r=>r.dispose()); config.global.stubs=original})
async function fixture(json = '{"arg":"","keep":{"nested":0}}', formSchema?: JsonSchemaObject) {
  registerAllRenderers()
  const ds=SparkData.fromJson({scenarioId:'S',dataSetName:'S',tables:{Inputs:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'json',type:'string'}],views:{default:{commitMode:'staged',rows:[{id:'a',json},{id:'b',json:'{}'}]}}}}})
  const runtime=new PageRuntime({pageId:'properties-test',scenarioIds:['S'],loadScenario:async()=>ds}); await runtime.load(); runtimes.push(runtime)
  const view=ds.getView('Inputs')!; view.setCurrentRowById('a'); const readonly=ref(false), editing=ref(false)
  const schemaProperties=reactive({arg:{description:'来源参数','x-typeLabel':'varchar'}})
  const schema=ref<JsonSchemaObject>(formSchema??{type:'object',properties:schemaProperties})
  const stubs={...original}; for(const name of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column']) delete stubs[name]; config.global.stubs=stubs
  const wrapper=mount(defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'properties-test'});sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererForm,{dataViewKey:'S@Inputs@default',children:[{type:'r-json',props:{field:'json',mode:formSchema?'form':'properties',readonly:readonly.value,valueLabel:'测试值',schema:schema.value,onEditingChange:(value:boolean)=>{editing.value=value}}}]})}}),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
  wrappers.push(wrapper);await flushPromises();return{wrapper,view,readonly,schema,schemaProperties,editing}
}
function parameterControl(wrapper: VueWrapper) {
  return wrapper.findAllComponents(ElInput).find(input=>input.find('[data-json-property="arg"]').exists())!
}
describe('bound JSON object properties',()=>{
  it('mounts select choices only when opened while showing initial labels and preserving typed edits and cancellation',async()=>{
    const schema: JsonSchemaObject={type:'object',properties:{mode:{title:'模式',type:'string',oneOf:[{const:'first',title:'第一项'},{const:'second',title:'第二项'}]}}}
    const f=await fixture('{"mode":"first","keep":false}',schema)
    const select=f.wrapper.getComponent(ElSelect)
    expect(select.text()).toContain('第一项')
    const dropdownId=select.get('input').attributes('aria-controls')!
    const documentRoot=new DOMWrapper(document.body)
    expect(documentRoot.find(`#${dropdownId}`).exists()).toBe(false)
    await select.get('.el-select__wrapper').trigger('click');await flushPromises()
    const choices=documentRoot.get(`#${dropdownId}`).findAll('[role="option"]')
    expect(choices.map(option=>option.text())).toEqual(['第一项','第二项'])
    await choices[1]!.trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({mode:'second',keep:false})
    expect(select.text()).toContain('第二项')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('第一项')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('retains unconfirmed parameter text when an equivalent schema is republished and commits through its view',async()=>{
    const f=await fixture(), input=parameterControl(f.wrapper)
    input.vm.$emit('update:modelValue','still typing');await flushPromises()
    expect(input.props('modelValue')).toBe('still typing')
    expect(f.view.hasEditingChanges()).toBe(false)
    f.schema.value={...f.schema.value,properties:{...f.schema.value.properties}}
    await flushPromises()
    expect(input.props('modelValue')).toBe('still typing')
    expect(f.view.hasEditingChanges()).toBe(false)
    input.vm.$emit('change','still typing');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({arg:'still typing',keep:{nested:0}})
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(parameterControl(f.wrapper).props('modelValue')).toBe('')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each(['schema','readonly','row','data'] as const)('clears unconfirmed parameter text when the actual %s context changes',async change=>{
    const f=await fixture(), input=parameterControl(f.wrapper)
    input.vm.$emit('update:modelValue','old draft');await flushPromises()
    expect(f.editing.value).toBe(true)
    if(change==='schema') f.schemaProperties.arg={description:'新的参数定义','x-typeLabel':'number'}
    else if(change==='readonly') f.readonly.value=true
    else if(change==='row') f.view.setCurrentRowById('b')
    else {f.view.replaceRows([{id:'a',json:'{"arg":"from query"}'}]);f.view.setCurrentRowById('a')}
    await flushPromises()
    const current=parameterControl(f.wrapper)
    expect(current.props('modelValue')).toBe(change==='data'?'from query':'')
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.editing.value).toBe(false)
  })
  it('keeps JSON parameter edits in the bound view when the form receives native submit and still cancels',async()=>{
    const f=await fixture()
    await f.wrapper.get('[data-json-property="arg"]').setValue('new-parameter');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({arg:'new-parameter',keep:{nested:0}})
    const submit=new Event('submit',{bubbles:true,cancelable:true})
    f.wrapper.get('form').element.dispatchEvent(submit);await flushPromises()
    expect(submit.defaultPrevented).toBe(true)
    expect(f.view.rows[0]?.['json']).toBe('{"arg":"","keep":{"nested":0}}')
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({arg:'new-parameter',keep:{nested:0}})
    f.view.discardEditingRows(['a']);await flushPromises()
    expect((f.wrapper.get('[data-json-property="arg"]').element as HTMLInputElement).value).toBe('')
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.editing.value).toBe(false)
  })
  it.each(['correct','cancel'] as const)('reports rejected parameter input until %s and preserves accepted siblings',async finish=>{
    const f=await fixture('{"arg":0,"other":"old","keep":false}')
    f.schema.value={type:'object',properties:{arg:{},other:{}}};await flushPromises()
    const input=f.wrapper.get<HTMLInputElement>('[data-json-property="arg"]')
    await input.setValue('1e999');await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-property="other"]').setValue('accepted');await flushPromises()
    expect(input.element.value).toBe('1e999');expect(f.editing.value).toBe(true)
    expect(f.wrapper.text()).toContain('输入超出有效JSON值范围')
    if(finish==='correct') {await input.setValue('false');await flushPromises()}
    else {await f.wrapper.get('[data-json-cancel-property="arg"]').trigger('click');await flushPromises()}
    expect(f.editing.value).toBe(false)
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({arg:finish==='correct'?false:0,other:'accepted',keep:false})
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.get<HTMLInputElement>('[data-json-property="arg"]').element.value).toBe('0');expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each([true,false])('reports parameter write in flight and preserves rejection (accepted=%s)',async accepted=>{
    const stubs={...original};for(const name of ['el-table','el-table-column'])delete stubs[name];config.global.stubs=stubs
    const value=ref('{"arg":"old"}'),editing=ref(false)
    let finish:(()=>void)|undefined
    const deferred=new Promise<void>(resolve=>{finish=resolve})
    const wrapper=mount(defineComponent({setup:()=>()=>h(JsonObjectProperties,{modelValue:value.value,readOnly:false,
      schema:{type:'object',properties:{arg:{}}},height:320,valueLabel:'值',
      commit:async text=>{if(accepted)value.value=text;await deferred;return accepted},onEditingChange:(next:boolean)=>{editing.value=next}})}),{global:{plugins:[ElementPlus]}})
    wrappers.push(wrapper);await flushPromises()
    const input=wrapper.get<HTMLInputElement>('[data-json-property="arg"]')
    await input.setValue('new');await flushPromises()
    expect(editing.value).toBe(true);expect(input.attributes('disabled')).toBeDefined()
    finish!();await flushPromises()
    expect(editing.value).toBe(!accepted)
    if(!accepted) {await wrapper.get('[data-json-cancel-property="arg"]').trigger('click');await flushPromises();expect(input.element.value).toBe('old')}
    input.element.value='unfinished';await input.trigger('input');await flushPromises()
    expect(editing.value).toBe(true);wrapper.unmount();expect(editing.value).toBe(false)
  })
  it.each(['form','properties'] as const)('clears unaccepted %s input only when its original row is explicitly discarded',async mode=>{
    const f=await fixture('{"arg":"old"}',mode==='form'?{type:'object',properties:{arg:{type:'string'}}}:undefined)
    const selector=mode==='form'?'[data-json-member="arg"] input':'[data-json-property="arg"]'
    const input=f.wrapper.get<HTMLInputElement>(selector)
    input.element.value='unfinished';await input.trigger('input');await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['b']);await flushPromises()
    expect(f.editing.value).toBe(true);expect(input.element.value).toBe('unfinished')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.wrapper.get<HTMLInputElement>(selector).element.value).toBe('old')
    const next=f.wrapper.get<HTMLInputElement>(selector)
    next.element.value='another draft';await next.trigger('input');await flushPromises()
    f.view.discardEditingRows();await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.wrapper.get<HTMLInputElement>(selector).element.value).toBe('old')
  })

  it('shows an unset numeric member as empty even when its schema has a minimum',async()=>{
    const f=await fixture('{}',{type:'object',properties:{limit:{type:'integer',minimum:1}}})
    expect((f.wrapper.get('[data-json-member="limit"] input').element as HTMLInputElement).value).toBe('')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('edits radio schema choices as typed values without defaults and preserves other members on cancel',async()=>{
    const schema: JsonSchemaObject = {type:'object',properties:{mode:{title:'模式','x-control':'radio',oneOf:[{const:'0',title:'文本零'},{const:0,title:'数值零'},{const:false,title:'否'}]}}}
    const f=await fixture('{"keep":{"a":false}}',schema)
    expect(f.wrapper.getComponent(ElRadioGroup).props('modelValue')).toBeUndefined()
    expect(f.view.hasEditingChanges()).toBe(false)
    for (const value of [0,false,'0']) {
      f.wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue',value);await flushPromises()
      expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:{a:false},mode:value})
    }
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:{a:false}})
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('preserves unknown radio values and rejects events after binding changes or readonly',async()=>{
    const schema: JsonSchemaObject = {type:'object',properties:{mode:{'x-control':'radio',enum:['Table','Join']}}}
    const f=await fixture('{"mode":"legacy"}',schema)
    expect(f.wrapper.text()).toContain('legacy')
    expect(f.view.hasEditingChanges()).toBe(false)
    const old=f.wrapper.getComponent(ElRadioGroup)
    f.view.setCurrentRowById('b');await flushPromises();old.vm.$emit('update:modelValue','Join');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value=true;await flushPromises()
    const current=f.wrapper.getComponent(ElRadioGroup)
    expect(current.props('disabled')).toBe(true);current.vm.$emit('update:modelValue','Table');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('edits enumerated scalar arrays without coercion or loss of unlisted values and cancels through the bound field',async()=>{
    const schema: JsonSchemaObject = {type:'object',properties:{fields:{title:'输出字段',type:'array',items:{oneOf:[{const:'0',title:'文本零'},{const:0,title:'数值零'},{const:false,title:'否'}]}}}}
    const f=await fixture('{"fields":["legacy",0],"keep":{"a":false}}',schema)
    const select=f.wrapper.get('[data-json-member="fields"]').getComponent(ElSelect)
    expect(select.props('multiple')).toBe(true)
    expect(select.props('modelValue')).toEqual(['legacy',0])
    expect(select.text()).toContain('legacy')
    expect(select.text()).toContain('数值零')
    expect(f.view.hasEditingChanges()).toBe(false)
    select.vm.$emit('update:modelValue',['legacy',0,'0',false]);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({fields:['legacy',0,'0',false],keep:{a:false}})
    expect(select.text()).toContain('文本零')
    expect(select.text()).toContain('否')
    await f.wrapper.get('[data-json-member="fields"] [data-json-remove]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:{a:false}})
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.get('[data-json-member="fields"]').getComponent(ElSelect).props('modelValue')).toEqual(['legacy',0])
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('keeps malformed array members available as JSON and rejects stale or readonly multi-select writes',async()=>{
    const schema: JsonSchemaObject = {type:'object',properties:{fields:{type:'array',items:{enum:['id','name']}}}}
    const f=await fixture('{"fields":[{"keep":0}]}',schema)
    expect(f.wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(f.wrapper.get('[data-json-member="fields"]').getComponent(ElInput).props('modelValue')).toBe('[{"keep":0}]')
    expect(f.view.hasEditingChanges()).toBe(false)
    f.view.replaceRows([{id:'a',json:'{"fields":["id"]}'},{id:'b',json:'{}'}]);f.view.setCurrentRowById('a');await flushPromises()
    const old=f.wrapper.get('[data-json-member="fields"]').getComponent(ElSelect)
    f.view.setCurrentRowById('b');await flushPromises();old.vm.$emit('update:modelValue',['name']);await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value=true;await flushPromises()
    const current=f.wrapper.get('[data-json-member="fields"]').getComponent(ElSelect)
    expect(current.props('disabled')).toBe(true);current.vm.$emit('update:modelValue',['name']);await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  const formSchema: JsonSchemaObject = {type:'object',properties:{
    mode:{title:'查询模式',type:'string',oneOf:[{const:'Table',title:'单表'},{const:'SelfRefData',title:'自引用'}]},
    enabled:{title:'开启',type:'boolean'}, limit:{title:'条数',type:'integer',minimum:1},
    tree:{title:'树参数',type:'object',properties:{parent:{title:'父字段',type:'string'}}},
  }}
  it.each([
    {schema:{type:'string'} as JsonSchemaObject, text:' /api/query ', value:' /api/query '},
    {schema:{} as JsonSchemaObject, text:'{"active":false}', value:{active:false}},
  ])('retains form input across separate input and change events ($text)',async({schema,text,value})=>{
    const f=await fixture('{"keep":0,"api":{}}',{type:'object',properties:{api:{type:'object',properties:{entry:schema}}}})
    const input=f.wrapper.get<HTMLInputElement | HTMLTextAreaElement>('[data-json-member="entry"] input, [data-json-member="entry"] textarea')
    let typed=''
    for(const character of text) {
      typed+=character;input.element.value=typed
      await input.trigger('input');await flushPromises()
      expect(input.element.value).toBe(typed)
      expect(f.view.hasEditingChanges()).toBe(false)
    }
    f.schema.value=JSON.parse(JSON.stringify(f.schema.value));await flushPromises()
    expect(input.element.value).toBe(text)
    await input.trigger('change');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:0,api:{entry:value}})
    expect(f.view.rows[0]?.['json']).toBe('{"keep":0,"api":{}}')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.get<HTMLInputElement | HTMLTextAreaElement>('[data-json-member="entry"] input, [data-json-member="entry"] textarea').element.value).toBe('')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each(['schema','readonly','row','data'] as const)('clears unconfirmed form text when its %s context changes',async change=>{
    const f=await fixture('{"name":"original"}',{type:'object',properties:{name:{type:'string'}}})
    const input=f.wrapper.get<HTMLInputElement>('[data-json-member="name"] input')
    input.element.value='unfinished';await input.trigger('input');await flushPromises()
    expect(input.element.value).toBe('unfinished');expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.editing.value).toBe(true)
    if(change==='schema') f.schema.value={type:'object',properties:{name:{type:'string',title:'New definition'}}}
    else if(change==='readonly') f.readonly.value=true
    else if(change==='row') f.view.setCurrentRowById('b')
    else {f.view.replaceRows([{id:'a',json:'{"name":"from query"}'}]);f.view.setCurrentRowById('a')}
    await flushPromises()
    expect(f.wrapper.get<HTMLInputElement>('[data-json-member="name"] input').element.value)
      .toBe(change==='data'?'from query':change==='row'?'':'original')
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.editing.value).toBe(false)
  })
  it('retains invalid JSON text for correction without changing the bound field',async()=>{
    const f=await fixture('{"payload":{"keep":0}}',{type:'object',properties:{payload:{}}})
    const input=f.wrapper.get<HTMLTextAreaElement>('[data-json-member="payload"] textarea')
    input.element.value='{"active":';await input.trigger('input');await flushPromises()
    expect(input.element.value).toBe('{"active":')
    await input.trigger('change');await flushPromises()
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.view.hasEditingChanges()).toBe(false);expect(input.element.value).toBe('{"active":')
    input.element.value='{"active":false}';await input.trigger('input');await flushPromises()
    await input.trigger('change');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({payload:{active:false}})
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it.each(['correct','cancel'] as const)('reports nested invalid form input until explicit %s and preserves accepted sibling changes',async finish=>{
    const f=await fixture('{"nested":{"payload":{"keep":0},"name":"original"},"keep":false}',{type:'object',properties:{nested:{type:'object',properties:{payload:{},name:{type:'string'}}}}})
    const input=f.wrapper.get<HTMLTextAreaElement>('[data-json-member="payload"] textarea')
    input.element.value='{"active":';await input.trigger('input');await flushPromises()
    expect(f.editing.value).toBe(true)
    await input.trigger('change');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-member="name"] input').setValue('accepted');await flushPromises()
    expect(input.element.value).toBe('{"active":')
    expect(f.editing.value).toBe(true)
    if(finish==='correct') {await input.setValue('{"active":false}');await flushPromises()}
    else {await f.wrapper.get('[data-json-member="payload"] [data-json-cancel-input]').trigger('click');await flushPromises()}
    expect(f.editing.value).toBe(false)
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({nested:{name:'accepted',payload:finish==='correct'?{active:false}:{keep:0}},keep:false})
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({nested:{name:'original',payload:{keep:0}},keep:false})
  })
  it.each([true,false])('keeps nested form editing active until asynchronous write settles (accepted=%s)',async accepted=>{
    const value=ref('{"nested":{"name":"original"}}'), editing=ref(false)
    let finish: (()=>void) | undefined
    const deferred=new Promise<void>(resolve=>{finish=resolve})
    const schema:JsonSchemaObject={type:'object',properties:{nested:{type:'object',properties:{name:{type:'string'}}}}}
    const wrapper=mount(defineComponent({setup:()=>()=>h(JsonObjectForm,{modelValue:value.value,readOnly:false,schema,
      commit:async text=>{if(accepted)value.value=text;await deferred;return accepted},
      onEditingChange:(next:boolean)=>{editing.value=next}})}),{global:{plugins:[ElementPlus]}})
    wrappers.push(wrapper)
    const input=wrapper.get<HTMLInputElement>('[data-json-member="name"] input')
    await input.setValue('next');await flushPromises()
    expect(editing.value).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
    finish!();await flushPromises()
    expect(editing.value).toBe(!accepted)
    if(!accepted) {
      expect(input.element.value).toBe('next')
      expect(wrapper.text()).toContain('原字段未接受修改')
      await wrapper.get('[data-json-cancel-input]').trigger('click');await flushPromises()
      expect(editing.value).toBe(false);expect(input.element.value).toBe('original')
    }
    input.element.value='unfinished';await input.trigger('input');await flushPromises()
    expect(editing.value).toBe(true)
    wrapper.unmount();expect(editing.value).toBe(false)
  })
  it('edits typed and nested JSON form members through the original field and cancels without losing unlisted data',async()=>{
    const f=await fixture('{"keep":{"nested":0},"tree":{"keep":false}}',formSchema)
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.text()).toContain('查询模式')
    f.wrapper.get('[data-json-member="mode"]').getComponent(ElSelect).vm.$emit('update:modelValue','SelfRefData');await flushPromises()
    f.wrapper.get('[data-json-member="enabled"]').getComponent(ElSelect).vm.$emit('update:modelValue',false);await flushPromises()
    f.wrapper.get('[data-json-member="limit"]').getComponent(ElInputNumber).vm.$emit('update:modelValue',25);await flushPromises()
    await f.wrapper.get('[data-json-member="tree"] [data-json-member="parent"] input').setValue('parentId');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:{nested:0},tree:{keep:false,parent:'parentId'},mode:'SelfRefData',enabled:false,limit:25})
    await f.wrapper.get('[data-json-member="enabled"] [data-json-remove]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).not.toHaveProperty('enabled')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({keep:{nested:0},tree:{keep:false}})
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('does not replace malformed nested values and rejects form events after row switch or readonly',async()=>{
    const f=await fixture('{"tree":[]}',formSchema)
    expect(f.wrapper.get('[data-json-member="tree"]').text()).toContain('JSON必须是对象')
    expect(f.view.hasEditingChanges()).toBe(false)
    f.view.replaceRows([{id:'a',json:'{"tree":{}}'},{id:'b',json:'{}'}]);f.view.setCurrentRowById('a');await flushPromises()
    const old=f.wrapper.get('[data-json-member="parent"]').getComponent(ElInput)
    f.view.setCurrentRowById('b');await flushPromises();old.vm.$emit('change','stale');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value=true;await flushPromises()
    const current=f.wrapper.get('[data-json-member="parent"]').getComponent(ElInput)
    expect(current.props('disabled')).toBe(true);current.vm.$emit('change','forbidden');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('does not fill schema defaults or coerce existing scalar values and removes optional objects explicitly',async()=>{
    const schema: JsonSchemaObject = {type:'object',required:['name'],properties:{name:{type:'string',default:'default'},enabled:{type:'boolean'},count:{type:'number'},tree:{type:'object',properties:{parent:{type:'string'}}}}}
    const f=await fixture('{"name":"","enabled":false,"count":0,"tree":null,"__proto__":{"keep":0}}',schema)
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.get('[data-json-member="name"]').find('[data-json-remove]').exists()).toBe(false)
    expect(f.wrapper.get('[data-json-member="enabled"]').getComponent(ElSelect).props('modelValue')).toBe(false)
    expect(f.wrapper.get('[data-json-member="count"]').getComponent(ElInputNumber).props('modelValue')).toBe(0)
    await f.wrapper.get('[data-json-member="tree"] [data-json-remove]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual(JSON.parse('{"name":"","enabled":false,"count":0,"__proto__":{"keep":0}}'))
    await f.wrapper.get('[data-json-member="name"] input').setValue('false');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))['name']).toBe('false')
  })
  it('rejects non-finite numbers instead of replacing them with null',async()=>{
    const f=await fixture('{"limit":20}',formSchema)
    f.wrapper.get('[data-json-member="limit"]').getComponent(ElInputNumber).vm.$emit('update:modelValue',Infinity);await flushPromises()
    expect(f.wrapper.text()).toContain('输入超出有效JSON值范围')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each([{text:'false',value:false},{text:'0',value:0},{text:'null',value:null},{text:'',value:''},
    {text:'[1,false]',value:[1,false]},{text:'{"a":0}',value:{a:0}},{text:' hello ',value:'hello'},{text:'"0"',value:'0'}])('edits $text as a typed object member and preserves unrelated data',async({text,value})=>{
    const f=await fixture()
    expect(f.wrapper.text()).toContain('来源参数');expect(f.wrapper.text()).toContain('varchar');expect(f.wrapper.text()).toContain('测试值')
    await f.wrapper.get('[data-json-property="arg"]').setValue(text);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({arg:value,keep:{nested:0}})
    expect(f.view.rows[0]?.['json']).toBe('{"arg":"","keep":{"nested":0}}')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect((f.wrapper.get('[data-json-property="arg"]').element as HTMLInputElement).value).toBe('')
  })
  it('keeps quoted scalar strings distinguishable from JSON scalars',async()=>{
    const f=await fixture('{"arg":"false"}')
    expect((f.wrapper.get('[data-json-property="arg"]').element as HTMLInputElement).value).toBe('"false"')
  })
  it('preserves own special object keys and rejects non-finite values without changing the original',async()=>{
    const f=await fixture('{"arg":"","__proto__":{"keep":true}}')
    await f.wrapper.get('[data-json-property="arg"]').setValue('{"__proto__":{"nested":0}}');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual(JSON.parse('{"arg":{"__proto__":{"nested":0}},"__proto__":{"keep":true}}'))
    f.view.discardEditingRows(['a']);await flushPromises()
    await f.wrapper.get('[data-json-property="arg"]').setValue('1e999');await flushPromises()
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('rejects stale or readonly editor events and malformed original objects',async()=>{
    const f=await fixture(), input=f.wrapper.get('[data-json-property="arg"]')
    f.view.setCurrentRowById('b');await flushPromises();await input.setValue('stale');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value=true;await flushPromises()
    expect(f.wrapper.get('[data-json-property="arg"]').attributes('disabled')).toBeDefined()
    f.view.replaceRows([{id:'b',json:'[]'}]);f.view.setCurrentRowById('b');await flushPromises()
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.wrapper.find('[data-json-property="arg"]').exists()).toBe(false)
  })
})
