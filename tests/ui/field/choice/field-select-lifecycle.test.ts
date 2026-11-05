import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {SparkData,DataViewOptionCatalog} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererForm, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], originalStubs = {...config.global.stubs}
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  config.global.stubs = originalStubs
})

async function fixture(value: string | number = 'first', selection = false, inherited=false) {
  registerAllRenderers()
  const dataSet = SparkData.fromJson({scenarioId: 'S', dataSetName: 'Selection', tables: {
    Inputs: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'choice', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'a', choice: value}, {id: 'b', choice: 'second'}]}}},
    Choices: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}, {name:'disabled',type:'boolean'}],
      views: {default: {valueField: 'id', labelField: 'title', rows: [{id: 'first', title: '第一项'}, {id: 'second', title: '第二项'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'select-lifecycle', scenarioIds: ['S'], loadScenario: async () => dataSet})
  await runtime.load(); runtimes.push(runtime)
  const view = dataSet.getView('Inputs')!, choices = dataSet.getView('Choices')!, readonly = ref(false)
  const selectionKey = ref('S@Choices@default')
  const formKey=ref(inherited?'S@Choices@default':'S@Inputs@default')
  const allowCreate=ref(false),filterable=ref(true),staticOptions=ref<unknown[]>()
  const onChange = ref<((...args: unknown[]) => unknown) | undefined>()
  view.setCurrentRowById('a')
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'select-lifecycle'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: formKey.value, children: [{type: 'r-select', props: {
      ...(selection ? {...(inherited?{}:{dataViewKey: selectionKey.value}), dataMember: 'value'} : {field: 'choice'}),
      ...(staticOptions.value?{options:staticOptions.value}:{optionDataViewKey:'S@Choices@default'}), optionDisabledField:'disabled', filterable: filterable.value, allowCreate:allowCreate.value, readonly: readonly.value,
      onChange: onChange.value,
    }}]})
  }}), {global: {stubs: {transition: false}, plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, view, choices, readonly, selectionKey, onChange,formKey,dataSet,allowCreate,filterable,staticOptions}
}

describe('FieldSelect native option lifecycle', () => {
  it('refreshes the control callback after a row event with unchanged current-row identity while rejecting its previous callback',async()=>{
    const f=await fixture(),oldApply=f.wrapper.getComponent(ElSelect).vm.$.vnode.props?.['onUpdate:modelValue']
    const row=f.view.currentRow
    f.view.replaceRows(f.view.rows)
    await flushPromises()
    expect(f.view.currentRow).toBe(row)
    if(typeof oldApply!=='function')throw Error('Missing select callback')
    await oldApply('second');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','second');await flushPromises()
    expect(f.view.getEditingRow('a')?.['choice']).toBe('second')
    expect(f.view.rows[0]?.['choice']).toBe('first')
  })
  it('rebinds an inherited selection when its form switches to a derived option view',async()=>{
    const f=await fixture('first',true,true),catalog=new DataViewOptionCatalog(f.dataSet)
    catalog.replace([{value:'first',label:'第一项'},{value:'second',label:'第二项'}])
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','second');await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual(['second'])
    f.formKey.value=catalog.dataViewKey;await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','first');await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual(['second'])
    expect(catalog.view.getSelectedValues()).toEqual(['first'])
    catalog.dispose()
  })
  it('uses the latest field change handler after its parent updates the interaction target', async () => {
    const f=await fixture(), first=vi.fn(), second=vi.fn()
    f.onChange.value=first;await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','second');await flushPromises()
    expect(first).toHaveBeenCalledTimes(1)
    f.view.setCurrentRowById('b');f.onChange.value=second;await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','first');await flushPromises()
    expect(second).toHaveBeenCalledTimes(1);expect(first).toHaveBeenCalledTimes(1)
    expect(f.view.getEditingRow('b')?.['choice']).toBe('first')
  })
  it('selects and clears view members without editing records, and respects readonly', async () => {
    const f = await fixture('first', true), select = f.wrapper.getComponent(ElSelect)
    expect(select.props('disabled')).toBe(false)
    select.vm.$emit('update:modelValue', 'second'); await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual(['second'])
    expect(select.props('modelValue')).toBe('second')
    expect(f.choices.hasEditingChanges()).toBe(false)
    f.readonly.value = true; await flushPromises()
    expect(select.props('disabled')).toBe(true)
    select.vm.$emit('update:modelValue', 'first'); await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual(['second'])
    f.readonly.value = false; await flushPromises()
    select.vm.$emit('update:modelValue', ''); await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual([])
  })

  it('rejects a delayed selection after the bound view changes', async () => {
    const f = await fixture('first', true), select = f.wrapper.getComponent(ElSelect)
    let release!: () => void
    f.onChange.value = () => new Promise<void>(resolve => {release = resolve})
    await flushPromises()
    select.vm.$emit('update:modelValue', 'second'); await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual([])
    f.selectionKey.value = 'S@Inputs@default'; await flushPromises()
    release(); await flushPromises()
    expect(f.choices.getSelectedValues()).toEqual([])
    expect(f.view.getSelectedValues()).toEqual([])
  })

  it('filters candidates without editing the bound DataView until an option is selected', async () => {
    const f=await fixture(),select=f.wrapper.getComponent(ElSelect),documentRoot=new DOMWrapper(document.body)
    const dropdownId=select.get('input').attributes('aria-controls')!
    await select.get('.el-select__wrapper').trigger('click');await flushPromises()
    await select.get('input').setValue('第二');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.view.rows[0]?.['choice']).toBe('first')
    const visibleOptions=documentRoot.get(`#${dropdownId}`).findAll('[role="option"]').filter(option=>option.isVisible())
    expect(visibleOptions.map(option=>option.text())).toEqual(['第二项'])
    await visibleOptions[0]!.trigger('click');await flushPromises()
    expect(f.view.getEditingRow('a')?.['choice']).toBe('second')
    expect(f.view.rows[0]?.['choice']).toBe('first')
  })

  it('opens options on demand and edits, clears and cancels through the bound DataView', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect), documentRoot = new DOMWrapper(document.body)
    const dropdownId = select.get('input').attributes('aria-controls')!
    expect(select.text()).toContain('第一项')
    expect(documentRoot.find(`#${dropdownId}`).exists()).toBe(false)
    await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
    const options = documentRoot.get(`#${dropdownId}`).findAll('[role="option"]')
    expect(options.map(option => option.text())).toEqual(['第一项', '第二项'])
    await options[1]!.trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['choice']).toBe('second')
    expect(f.view.rows[0]?.['choice']).toBe('first')
    expect(select.text()).toContain('第二项')
    await vi.waitFor(() => expect(documentRoot.find(`#${dropdownId}`).exists()).toBe(false))
    await select.trigger('mouseenter'); await flushPromises()
    await select.get('.el-select__clear').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['choice']).toBe('')
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(select.text()).toContain('第一项')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('uses current option-view labels before opening and forgets a removed cached label without changing the field', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect), documentRoot = new DOMWrapper(document.body)
    const dropdownId = select.get('input').attributes('aria-controls')!
    f.choices.replaceRows([{id: 'first', title: '更新标题'}, {id: 'second', title: '第二项'}]); await flushPromises()
    expect(select.text()).toContain('更新标题')
    expect(documentRoot.find(`#${dropdownId}`).exists()).toBe(false)
    await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
    await select.get('input').trigger('keydown', {code: 'Escape', key: 'Escape'}); await flushPromises()
    await vi.waitFor(() => expect(documentRoot.find(`#${dropdownId}`).exists()).toBe(false))
    f.choices.replaceRows([{id: 'second', title: '第二项'}]); await flushPromises()
    expect(select.text()).toContain('first')
    expect(select.text()).not.toContain('更新标题')
    expect(f.view.rows[0]?.['choice']).toBe('first')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it.each([0, '0'])('matches the typed value %j without substituting an option or moving the current row', async value => {
    const f = await fixture(value), select = f.wrapper.getComponent(ElSelect)
    f.choices.replaceRows([{id: '0', title: '文本零'}]); await flushPromises()
    expect(select.text()).toContain(typeof value === 'string' ? '文本零' : '0')
    if (typeof value === 'number') expect(select.text()).not.toContain('文本零')
    expect(f.view.rows[0]?.['choice']).toBe(value)
    f.view.setCurrentRowById('b'); await flushPromises()
    expect(select.props('modelValue')).toBe('second')
    f.readonly.value = true; await flushPromises()
    expect(select.props('disabled')).toBe(true)
    select.vm.$emit('update:modelValue', '0'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('creates only a bound text value through an explicit searchable control without changing the option view',async()=>{
    const f=await fixture();f.allowCreate.value=true;await flushPromises()
    const select=f.wrapper.getComponent(ElSelect);expect(select.props('allowCreate')).toBe(true)
    select.vm.$emit('update:modelValue','generated');await flushPromises()
    expect(f.view.getEditingRow('a')?.['choice']).toBe('generated')
    expect(f.view.rows[0]?.['choice']).toBe('first')
    expect(f.choices.rows).toHaveLength(2);expect(f.choices.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('modelValue')).toBe('first')
  })
  it('does not expose creation for a record selector or non-searchable field',async()=>{
    const field=await fixture();field.allowCreate.value=true;field.filterable.value=false;await flushPromises()
    expect(field.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(false)
    const selection=await fixture('first',true);selection.allowCreate.value=true;await flushPromises()
    expect(selection.wrapper.getComponent(ElSelect).props('allowCreate')).toBe(false)
    selection.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','generated');await flushPromises()
    expect(selection.choices.rows).toHaveLength(2);expect(selection.choices.getSelectedValues()).toEqual([])
  })
  it('cannot create a disabled candidate by typing the same value',async()=>{
    const f=await fixture();f.allowCreate.value=true
    f.choices.replaceRows([{id:'first',title:'第一项'},{id:'blocked',title:'禁用项',disabled:true}]);await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','blocked');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('does not apply a late create event from the previous target row popup',async()=>{
    const f=await fixture();f.allowCreate.value=true;await flushPromises()
    const old=f.wrapper.getComponent(ElSelect)
    old.vm.$emit('visible-change',true);await flushPromises()
    f.view.setCurrentRowById('b');await flushPromises()
    old.vm.$emit('update:modelValue','generated');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','current');await flushPromises()
    expect(f.view.getEditingRow('b')?.['choice']).toBe('current')
  })

  it.each(['disabled','allowCreate','filterable','allowCycle','filterCycle'])('rejects a custom input invalidated during async onChange by %s',async kind=>{
    const f=await fixture();f.allowCreate.value=true;f.staticOptions.value=[{value:'first',label:'第一项'}]
    let started=false,release=()=>{};const barrier=new Promise<void>(resolve=>{release=resolve})
    f.onChange.value=async()=>{started=true;await barrier};await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue','generated');await flushPromises();expect(started).toBe(true)
    if(kind==='disabled')f.staticOptions.value=[{value:'first',label:'第一项'},{value:'generated',label:'已禁用',disabled:true}]
    else if(kind==='allowCreate')f.allowCreate.value=false
    else if(kind==='allowCycle'){f.allowCreate.value=false;await flushPromises();f.allowCreate.value=true}
    else if(kind==='filterCycle'){f.filterable.value=false;await flushPromises();f.filterable.value=true}
    else f.filterable.value=false
    await flushPromises();release();await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.view.rows[0]?.['choice']).toBe('first')
  })

})
