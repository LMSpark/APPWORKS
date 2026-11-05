import {afterEach, describe, expect, it} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {SparkData,RequestState} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {PAGE_RUNTIME, RendererForm, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture(key = 'O@Choices@default', field: unknown = 'old', multiple = false, remoteOptions = false) {
  registerAllRenderers()
  const owner = SparkData.fromJson({scenarioId: 'S', dataSetName: 'Owner', tables: {
    Inputs: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'json', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'a', json: JSON.stringify({field, keep: false})}]}}},
    Choices: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}],
      views: {default: {valueField: 'id', labelField: 'title', rows: [{id: 'old', title: '错误空间候选'}]}}},
  }})
  const options = SparkData.fromJson({scenarioId: 'O', dataSetName: 'Options', tables: {
    Choices: {resourceType: remoteOptions ? 'database-table' : 'static-data', ...(remoteOptions?{resourceId:'Options'}:{}), columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'code', type: 'string'}, {name: 'title', type: 'string'}, {name:'disabled',type:'boolean'}],
      views: {default: {autoLoad:false,valueField: 'code', labelField: 'title', ...(remoteOptions ? {} : {rows: [{id: '1', code: 'old', title: '原业务字段'}, {id: '2', code: 'new', title: '新业务字段'}]})},
        other: {autoLoad:false,valueField: 'code', labelField: 'title', ...(remoteOptions?{}:{rows: [{id: '3', code: 'third', title: '第三字段'}]})}}},
  }})
  const failOptions=ref(false)
  if(remoteOptions)options.getView('Choices')!.bindQueryExecutor({executeQuery:async()=>{if(failOptions.value)throw new Error('Expected option source failure');return {rows:[],total:0,countReported:true,assertIdentity:identity=>{expect(identity).toEqual({scenarioId:'O',metaName:'Choices',resource:{resourceType:'database-table',resourceId:'Options'}})},rowKey:row=>row['id'],fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),readFieldAccess:()=> 'visible' as const,addActionState:()=> 'disabled' as const,editActionState:()=> 'disabled' as const,deleteActionState:()=> 'disabled' as const,createChildActionState:()=> 'disabled' as const,viewActionState:()=> 'disabled' as const}}},{resource:{resourceType:'database-table',resourceId:'Options'}})
  const runtime = new PageRuntime({pageId: 'json-options', scenarioIds: ['S', 'O'], loadScenario: async id => id === 'S' ? owner : options})
  await runtime.load(); runtimes.push(runtime)
  const view = owner.getView('Inputs')!, choices = options.getView('Choices')!, readonly = ref(false)
  view.setCurrentRowById('a')
  const onChange=ref<(...args:unknown[])=>unknown>()
  const schema = ref<JsonSchemaObject>({type: 'object', properties: {field: {type: multiple ? 'array' : 'string', title: '业务字段',
    ...(multiple ? {items: {type: 'string'}} : {enum: ['static-fallback']}), 'x-optionDataViewKey': key}}})
  const stubs = {...original}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'json-options-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: 'S@Inputs@default', children: [{type: 'r-json', props: {
      field: 'json', mode: 'form', schema: schema.value, readonly: readonly.value, onChange:onChange.value,
    }}]})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, view, choices, readonly, schema,onChange,failOptions}
}

describe('JSON member DataView option bindings', () => {
  it('resolves the full option-space identity, writes only the original JSON member and cancels through its view', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect)
    expect(select.text()).toContain('原业务字段')
    expect(select.text()).not.toContain('错误空间候选')
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: 'new', keep: false})
    expect(f.view.rows[0]!['json']).toBe('{"field":"old","keep":false}')
    expect(f.choices.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('原业务字段')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('updates labels from the same option view without replacing an unknown stored value', async () => {
    const f = await fixture()
    f.choices.replaceRows([{id: '1', code: 'old', title: '实时字段'}]); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('实时字段')
    f.choices.replaceRows([]); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('old')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('keeps readonly JSON unchanged even when a control emits a new candidate', async () => {
    const f = await fixture()
    f.readonly.value = true; await flushPromises()
    const select = f.wrapper.getComponent(ElSelect)
    expect(select.props('disabled')).toBe(true)
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it.each(['MISSING@Choices@default', 'Choices@default', ''])('reports invalid binding %s without using static enum candidates', async key => {
    const f = await fixture(key)
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('releases old option controls when the schema binding switches', async () => {
    const f = await fixture(), old = f.wrapper.getComponent(ElSelect)
    f.schema.value = {type: 'object', properties: {field: {type: 'string', 'x-optionDataViewKey': 'O@Choices@other'}}}
    await flushPromises()
    old.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    const current = f.wrapper.getComponent(ElSelect)
    current.vm.$emit('update:modelValue', 'third'); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: 'third', keep: false})
  })

  it('does not accept a late choice after the option view is destroyed', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect)
    f.choices.destroy()
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('edits a native string array through the option view and cancels only the original JSON field', async () => {
    const f = await fixture('O@Choices@default', ['old', 'missing'], true), select = f.wrapper.getComponent(ElSelect)
    expect(select.props('multiple')).toBe(true)
    expect(f.wrapper.text()).toContain('missing')
    expect(f.view.hasEditingChanges()).toBe(false)
    select.vm.$emit('update:modelValue', ['old', 'missing', 'new']); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: ['old', 'missing', 'new'], keep: false})
    expect(f.choices.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('modelValue')).toEqual(['old', 'missing'])
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('rejects unoffered values, duplicate values and wrong native item types without losing an existing array', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    for (const value of [['old', 'not-offered'], ['new', 'new'], [0], 'new', [{field: 'new'}]]) {
      f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', value); await flushPromises()
      expect(f.view.hasEditingChanges()).toBe(false)
    }
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', []); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [], keep: false})
  })

  it('keeps array edits under the original readonly and released-view guards', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    f.readonly.value = true; await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['new']); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value = false; await flushPromises()
    f.choices.destroy()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['new']); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('preserves native zero and boolean values from the bound option view without string coercion', async () => {
    const f = await fixture('O@Choices@default', [], true)
    f.schema.value = {type: 'object', properties: {field: {type: 'array', items: {}, 'x-optionDataViewKey': 'O@Choices@default'}}}
    f.choices.replaceRows([{id: 'zero', code: 0, title: '零'}, {id: 'false', code: false, title: '否'}]); await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [0, false]); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [0, false], keep: false})
    expect(f.choices.hasEditingChanges()).toBe(false)
  })

  it('enforces array item type even when an incorrectly typed candidate is offered', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    f.choices.replaceRows([{id: 'zero', code: 0, title: '零'}]); await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [0]); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('retains an existing unmatched item while applying the item type only to newly chosen values', async () => {
    const f = await fixture('O@Choices@default', [7], true)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [7, 'new']); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [7, 'new'], keep: false})
  })

  it.each([{value:[{field: 'old'}]}, {value:[null]}])('keeps complex array $value in the JSON editor instead of replacing it through a scalar picker', async ({value:field}) => {
    const f = await fixture('O@Choices@default', field, true)
    expect(f.wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(f.wrapper.find('textarea').exists()).toBe(true)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('creates an explicit string JSON member without mutating or selecting option records',async()=>{
    const f=await fixture()
    f.schema.value={type:'object',properties:{field:{type:'string','x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}};await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(true)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','generated');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field:'generated',keep:false})
    expect(f.choices.rows).toHaveLength(2);expect(f.choices.hasEditingChanges()).toBe(false);expect(f.choices.getSelectedValues()).toEqual([])
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('modelValue')).toBe('old')
  })
  it('does not create disabled candidates, whitespace values or arbitrary array members',async()=>{
    const f=await fixture()
    f.schema.value={type:'object',properties:{field:{type:'string','x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}}
    f.choices.replaceRows([{id:'1',code:'old',title:'原业务字段'},{id:'2',code:'blocked',title:'禁用字段',disabled:true}]);await flushPromises()
    for(const value of ['blocked','  ']){f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)}
    const array=await fixture('O@Choices@default',[],true)
    array.schema.value={type:'object',properties:{field:{type:'array',items:{type:'string'},'x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}};await flushPromises()
    expect(array.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(false)
    array.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue',['generated']);await flushPromises();expect(array.view.hasEditingChanges()).toBe(false)
  })
  it('releases old custom input events when the source binding or original owner row changes',async()=>{
    const f=await fixture()
    const schema=(key:string)=>({type:'object',properties:{field:{type:'string','x-optionDataViewKey':key,'x-optionAllowCreate':true}}} satisfies JsonSchemaObject)
    f.schema.value=schema('O@Choices@default');await flushPromises();const old=f.wrapper.getComponent(ElSelect)
    f.schema.value=schema('O@Choices@other');await flushPromises()
    old.vm.$emit('update:modelValue','from-old-source');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
    const previous=f.wrapper.getComponent(ElSelect)
    f.view.replaceRows([{id:'b',json:'{"field":"old","keep":false}'}]);f.view.setCurrentRowById('b');await flushPromises()
    previous.vm.$emit('update:modelValue','from-old-row');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','fresh');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('b')?.['json']))).toEqual({field:'fresh',keep:false})
  })
  it('waits for a remote option query and then permits custom text with a genuinely empty result',async()=>{
    const f=await fixture('O@Choices@default','old',false,true)
    f.schema.value={type:'object',properties:{field:{type:'string','x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}}
    expect(f.choices.requestState).toBe(RequestState.Idle)
    await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(false)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','too-early');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
    await f.choices.refresh();await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(true)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','ready');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))['field']).toBe('ready')
  })

  it('rejects custom input after a loaded remote view returns to Idle for a new query configuration',async()=>{
    const f=await fixture('O@Choices@default','old',false,true)
    f.schema.value={type:'object',properties:{field:{type:'string','x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}}
    await f.choices.refresh();await flushPromises();expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(true)
    f.choices.queryConfig={...f.choices.queryConfig,fields:['id','code','title']};await flushPromises()
    expect(f.choices.requestState).toBe(RequestState.Idle)
    expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(false)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','stale');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
    await f.choices.refresh();await flushPromises();expect(f.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(true)
  })
  it('does not write custom JSON text when its option source fails during the original async onChange',async()=>{
    const f=await fixture('O@Choices@default','old',false,true)
    f.schema.value={type:'object',properties:{field:{type:'string','x-optionDataViewKey':'O@Choices@default','x-optionAllowCreate':true}}}
    await f.choices.refresh()
    let started=false,release=()=>{};const barrier=new Promise<void>(resolve=>{release=resolve})
    f.onChange.value=async()=>{started=true;await barrier};await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','generated');await flushPromises();expect(started).toBe(true)
    f.failOptions.value=true;await f.choices.refresh();await flushPromises();expect(f.choices.requestState).toBe(RequestState.Failed)
    release();await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.view.rows[0]?.['json']).toBe('{"field":"old","keep":false}')
  })

})
