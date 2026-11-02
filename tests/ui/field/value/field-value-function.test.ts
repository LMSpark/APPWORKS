import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect, ElTabs} from 'element-plus'
import {SparkData, type DataViewFilterFunctionContext, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, RendererTable, registerAllRenderers, useSparkComponent, FilterValueFunctionDialog} from '@spark-appworks/spark-component'
import JsonTreeEditor from '../../../../packages/spark-component/src/components/editors/JsonTreeEditor.vue'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
const originalStubs = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = originalStubs})
async function fixture(value:unknown = '{"Type":"GetApiPublicParam","ParamName":"access_token"}', table = false, grouped = false, native = false) {
  registerAllRenderers()
  const ds = SparkData.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {
    Headers: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'value', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'a', value}, {id: 'b', value: ''}]}}},
    Params: {resourceType: 'static-data', columns: [{name: 'name', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}],
      views: {default: {valueField: 'name', labelField: 'label', rows: [{name: 'access_token', label: '令牌'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'value-function-test', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime)
  const view = ds.getView('Headers')!; view.setCurrentRowById('a')
  const readonly = ref(false), opened = vi.fn(), functionContext = ref<DataViewFilterFunctionContext>({})
  const optionKey = ref('S@Params@default')
  const valueFormat=ref<'native'|'text'>(native?'native':'text')
  const host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'value-function-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => {
      const children: SparkNode[] = [{type: 'r-value-function', props: {field: 'value', label: '值函数', onDialogVisibleChange: opened,
        valueFormat:valueFormat.value,functionContext: functionContext.value, readonly: readonly.value, publicParameterDataViewKey: optionKey.value, inputParameterDataViewKey: optionKey.value}}]
      return h(table ? RendererTable : RendererForm, {autoColumns: false, showPagination: false, dataViewKey: 'S@Headers@default', showDataViewMeta: false,
        children: grouped ? [{type: 'r-text', props: {field: '__group', label: '输出信息', children}}] : children})
    }
  }})
  const stubs = {...config.global.stubs}; delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']; delete stubs['el-button']; delete stubs['el-table']; delete stubs['el-table-column']
  config.global.stubs = stubs
  const wrapper = mount(host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {...stubs, JsonTreeEditor: true}}})
  wrappers.push(wrapper); await flushPromises(); return {wrapper, view, readonly, opened, functionContext, optionKey, valueFormat, params: ds.getView('Params')!}
}
describe('standard value function field', () => {
  it('discards only the bound row dialog and rejects its late confirmation',async()=>{
    const f=await fixture('',true)
    await f.wrapper.findAll('[data-function-open]')[1]!.trigger('click');await flushPromises()
    const dialog=f.wrapper.getComponent(FilterValueFunctionDialog)
    const stale=dialog.vm.$.vnode.props?.['onConfirm'];if(typeof stale!=='function')throw Error('Missing confirm handler')
    f.view.discardPendingChanges(['a']);await flushPromises()
    expect(f.wrapper.findComponent(FilterValueFunctionDialog).exists()).toBe(true)
    f.view.discardPendingChanges(['b']);await flushPromises()
    expect(f.wrapper.findComponent(FilterValueFunctionDialog).exists()).toBe(false)
    await stale({Type:'GetConstValue',Value:'discarded'});await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('combines readable bound inputs with declared node inputs by exact value, keeping bound labels and rejecting stale removed definitions',async()=>{
    const f=await fixture()
    f.functionContext.value={inputParams:[{value:'local',label:'节点入参'},{value:'access_token',label:'旧标题'}]};await flushPromises()
    await f.wrapper.get('[data-function-open]').trigger('click');await flushPromises()
    const dialog=f.wrapper.getComponent(FilterValueFunctionDialog)
    expect(dialog.props('context').inputParams).toEqual([{value:'access_token',label:'令牌'},{value:'local',label:'节点入参'}])
    const stale=dialog.vm.$.vnode.props?.['onConfirm'];if(typeof stale!=='function')throw new Error('Missing confirm handler')
    f.functionContext.value={inputParams:[]};await flushPromises()
    await stale({Type:'GetInputParam',ParamName:'local'});await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('preserves an unsupported native definition when its dialog is cancelled',async()=>{
    const original={Type:'LegacyFunction',extra:{keep:false}},f=await fixture(original,false,false,true)
    expect(f.wrapper.get('[data-function-diagnostic]').text()).toContain('原文已保留')
    await f.wrapper.get('[data-function-open]').trigger('click');await flushPromises()
    f.wrapper.getComponent(FilterValueFunctionDialog).vm.$emit('update:modelValue',false);await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.view.rows[0]?.['value']).toEqual(original)
  })
  it('invalidates native dialog callbacks when the storage format changes',async()=>{
    const original={Type:'GetConstValue',Value:0},f=await fixture(original,false,false,true)
    await f.wrapper.get('[data-function-open]').trigger('click');await flushPromises()
    const callback=f.wrapper.getComponent(FilterValueFunctionDialog).vm.$.vnode.props?.['onConfirm']
    if(typeof callback!=='function')throw new Error('Missing confirm handler')
    f.valueFormat.value='text';await flushPromises()
    await callback({Type:'GetConstValue',Value:'stale'});await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.view.rows[0]?.['value']).toEqual(original)
  })
  it('writes a native function in the selected table cell without moving current row',async()=>{
    const original={Type:'GetConstValue',Value:false},f=await fixture(original,true,false,true)
    await f.wrapper.findAll('[data-function-open]')[1]!.trigger('click');await flushPromises()
    f.wrapper.getComponent(FilterValueFunctionDialog).vm.$emit('confirm',{Type:'GetConstValue',Value:false});await flushPromises()
    expect(f.view.getEditingRow('b')?.['value']).toEqual(original)
    expect(f.view.getEditingRow('a')?.['value']).toEqual(original);expect(f.view.currentRow?.['id']).toBe('a')
  })
  it('edits a native function object without stringifying storage and cancels through the original DataView',async()=>{
    const original={Type:'GetConstValue',Value:false}
    const f=await fixture(original,false,false,true)
    expect(f.wrapper.text()).toContain('GetConstValue')
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-function-open]').trigger('click');await flushPromises()
    f.wrapper.getComponent(FilterValueFunctionDialog).vm.$emit('confirm',{Type:'GetConstValue',Value:0});await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toEqual({Type:'GetConstValue',Value:0})
    expect(f.view.rows[0]?.['value']).toEqual(original)
    f.view.discardEditingRows();await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toEqual(original)
    await f.wrapper.get('[data-function-clear]').trigger('click');await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBeNull()
  })
  it('preserves an explicit constant-function restriction when configuring the JSON control', async () => {
    const f = await fixture()
    f.functionContext.value = {definitions: [{type: 'GetConstValue', label: '常量', enabled: () => false, fields: []}]}
    await flushPromises(); await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const dialog = f.wrapper.getComponent(FilterValueFunctionDialog)
    dialog.vm.$emit('confirm', {Type: 'GetConstValue', Value: false}); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.get('[role="alert"]').text()).toContain('GetConstValue')
  })
  it('clears the bound form field and cancels through its original DataView', async () => {
    const original = '{"Type":"GetConstValue","Value":false}'
    const f = await fixture(original)
    await f.wrapper.get('[data-function-clear]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBe('')
    expect(f.view.rows[0]?.['value']).toBe(original)
    f.view.discardEditingRows(); await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBe(original)
    f.readonly.value = true; await flushPromises()
    expect(f.wrapper.get('[data-function-clear]').attributes('disabled')).toBeDefined()
  })

  it('rejects a cancelled dialog callback after reopening the same bound field', async () => {
    const f = await fixture()
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const dialog = f.wrapper.getComponent(FilterValueFunctionDialog)
    const stale = dialog.vm.$.vnode.props?.['onConfirm']
    if (typeof stale !== 'function') throw new Error('Missing confirm handler')
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    await stale({Type: 'GetConstValue', Value: 'cancelled session'}); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('edits backend aggregation in its bound row without referenced-table inputs or pointer changes', async () => {
    const f = await fixture('{"Type":"GetGroupData","ValType":"SUM"}', true)
    await f.wrapper.findAll('[data-function-open]')[1]!.trigger('click'); await flushPromises()
    const editor = f.wrapper.getComponent(FilterValueFunctionDialog)
    editor.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetGroupData'); await flushPromises()
    expect(new DOMWrapper(document.body).findAll('.filter-value-function-field label').map(label => label.text())).toEqual(['聚合方式 *'])
    editor.getComponent(ElSelect).vm.$emit('update:modelValue', 'AVERAGE'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    const value = f.view.getEditingRow('b')?.['value']
    if (typeof value !== 'string') throw new Error('Expected the bound field to contain serialized ValueFun')
    expect(JSON.parse(value)).toEqual({Type: 'GetGroupData', ValType: 'AVERAGE'})
    expect(f.view.getEditingRow('a')?.['value']).toBe('{"Type":"GetGroupData","ValType":"SUM"}')
    expect(f.view.currentRow?.['id']).toBe('a')
    expect(f.opened).toHaveBeenLastCalledWith(false)
  })

  it('retains the original cross-table aggregate when the unsupported legacy declaration cannot be confirmed', async () => {
    const original = '{"Type":"GetGroupData","GroupTableName":"Other","GroupField":"owner","Field":"amount","ValType":"SUM"}'
    const f = await fixture(original)
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(new DOMWrapper(document.body).find('[role="alert"]').text()).toContain('旧引用分组')
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.view.getEditingRow('a')?.['value']).toBe(original)
  })

  it('edits table cells without moving the row pointer and releases dialog state on unmount', async () => {
    const f = await fixture('legacy literal', true)
    const cells = f.wrapper.findAll('input[data-function-text]')
    expect(cells).toHaveLength(2)
    await cells[1]!.setValue('{"Type":"GetConstValue","Value":0}'); await flushPromises()
    expect(f.view.getEditingRow('b')?.['value']).toBe('{"Type":"GetConstValue","Value":0}')
    expect(f.view.currentRow?.['id']).toBe('a'); expect(f.view.getEditingRow('a')?.['value']).toBe('legacy literal')
    const buttons = f.wrapper.findAll('[data-function-open]')
    await buttons[1]!.trigger('click'); await flushPromises()
    expect(f.view.currentRow?.['id']).toBe('a')
    expect(f.opened).toHaveBeenLastCalledWith(true)
    const body = new DOMWrapper(document.body)
    f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value: [false, 2]}); await flushPromises()
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('b')?.['value']).toBe('{"Type":"GetConstValue","Value":[false,2]}')
    expect(f.opened).toHaveBeenLastCalledWith(false)
    await buttons[0]!.trigger('click'); await flushPromises()
    const stale = f.wrapper.findComponent(FilterValueFunctionDialog)
    f.readonly.value = true; await flushPromises()
    expect(f.opened).toHaveBeenLastCalledWith(false)
    stale.vm.$emit('confirm', {Type: 'GetConstValue', Value: 'stale'}); await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBe('legacy literal')
    f.readonly.value = false; await flushPromises(); await buttons[0]!.trigger('click'); await flushPromises()
    f.wrapper.unmount(); wrappers.splice(wrappers.indexOf(f.wrapper), 1)
    expect(f.opened).toHaveBeenLastCalledWith(false)
  })

  it('retains grouped cell drafts as candidates change and invalidates old confirmation callbacks', async () => {
    const f = await fixture('', true, true)
    f.functionContext.value = {relatedFields: [{label: 'subtotal', value: 'subtotal'}]}; await flushPromises()
    await f.wrapper.findAll('[data-function-open]')[1]!.trigger('click'); await flushPromises()
    const editor = f.wrapper.getComponent(FilterValueFunctionDialog)
    expect(editor.props('context').relatedFields).toEqual([{label: 'subtotal', value: 'subtotal'}])
    const confirm = editor.vm.$.vnode.props?.['onConfirm']
    if (typeof confirm !== 'function') throw new Error('Missing confirm handler')
    const body = new DOMWrapper(document.body)
    editor.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value: 'cell draft'}); await flushPromises()
    f.functionContext.value = {relatedFields: [{label: 'renamed', value: 'renamed'}]}; await flushPromises()
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).vm.$).toBe(editor.vm.$)
    expect(editor.getComponent(JsonTreeEditor).props('documentValue')).toEqual({value: 'cell draft'})
    await confirm({Type: 'GetConstValue', Value: 'late valid payload'}); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(editor.props('context').relatedFields).toEqual([{label: 'renamed', value: 'renamed'}])
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('b')?.['value']).toBe('{"Type":"GetConstValue","Value":"cell draft"}')
    expect(f.view.getEditingRow('a')?.['value']).toBe('')
    expect(f.view.currentRow?.['id']).toBe('a')
  })

  it.each(['confirm', 'cancel'] as const)('retains the active function draft when its option DataView finishes loading before %s', async action => {
    const f = await fixture('{"Type":"GetConstValue","Value":"original"}')
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const editor = f.wrapper.getComponent(FilterValueFunctionDialog), body = new DOMWrapper(document.body)
    editor.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value: [false, 0, 'draft']}); await flushPromises()
    const query = vi.spyOn(f.params.crud, 'list').mockResolvedValue({success: true, data: [{name: 'fresh', label: '新参数'}]})
    try {
      const result = await f.params.loadFromServer(); await flushPromises()
      expect(result.success).toBe(true); expect(query).toHaveBeenCalledOnce()
      expect(f.wrapper.getComponent(FilterValueFunctionDialog).vm.$).toBe(editor.vm.$)
      expect(editor.props('context').inputParams).toEqual([{value: 'fresh', label: '新参数'}])
      expect(editor.props('context').apiPublicParams).toEqual([{value: 'fresh', label: '新参数'}])
      expect(editor.getComponent(JsonTreeEditor).props('documentValue')).toEqual({value: [false, 0, 'draft']})
      expect(f.opened.mock.calls).toEqual([[true]])
      if (action === 'confirm') await body.get('[data-function-confirm]').trigger('click')
      else await body.get('.el-dialog__footer button').trigger('click')
      await flushPromises()
      expect(f.view.getEditingRow('a')?.['value']).toBe(action === 'confirm'
        ? '{"Type":"GetConstValue","Value":[false,0,"draft"]}' : '{"Type":"GetConstValue","Value":"original"}')
      expect(f.view.rows[0]?.['value']).toBe('{"Type":"GetConstValue","Value":"original"}')
      expect(f.opened).toHaveBeenLastCalledWith(false)
    } finally {query.mockRestore()}
  })

  it('keeps a removed parameter visible for correction and validates against the latest option DataView', async () => {
    const f = await fixture()
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const editor = f.wrapper.getComponent(FilterValueFunctionDialog), body = new DOMWrapper(document.body)
    f.params.replaceRows([{name: 'fresh', label: '新参数'}]); await flushPromises()
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).vm.$).toBe(editor.vm.$)
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(body.get('[role="alert"]').text()).toContain('不在当前可用选项')
    expect(editor.getComponent(ElSelect).props('modelValue')).toBe('access_token')
    expect(f.wrapper.findComponent(FilterValueFunctionDialog).exists()).toBe(true)
    f.params.replaceRows([{name: 'access_token', label: '恢复参数'}]); await flushPromises()
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(f.wrapper.findComponent(FilterValueFunctionDialog).exists()).toBe(false)
    expect(f.view.getEditingRow('a')?.['value']).toBe('{"Type":"GetApiPublicParam","ParamName":"access_token"}')
  })

  it('closes on option view identity changes and detaches old options before the next editing session', async () => {
    const f = await fixture(), next = f.params.createQueryView('next')
    next.replaceRows([{name: 'next', label: '下一组'}])
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const old = f.wrapper.getComponent(FilterValueFunctionDialog)
    const late = old.vm.$.vnode.props?.['onConfirm']
    if (typeof late !== 'function') throw new Error('Missing confirm handler')
    f.optionKey.value = 'S@Params@next'; await flushPromises()
    expect(f.wrapper.findComponent(FilterValueFunctionDialog).exists()).toBe(false)
    await late({Type: 'GetConstValue', Value: 'stale'}); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const editor = f.wrapper.getComponent(FilterValueFunctionDialog)
    expect(editor.props('context').apiPublicParams).toEqual([{value: 'next', label: '下一组'}])
    const confirm = editor.vm.$.vnode.props?.['onConfirm']
    if (typeof confirm !== 'function') throw new Error('Missing confirm handler')
    f.params.replaceRows([{name: 'old', label: '旧视图变化'}]); await flushPromises()
    expect(editor.props('context').inputParams).toEqual([{value: 'next', label: '下一组'}])
    await confirm({Type: 'GetApiPublicParam', ParamName: 'next'}); await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBe('{"Type":"GetApiPublicParam","ParamName":"next"}')
  })

  it('edits and serializes a constant through the original DataView', async () => {
    const f = await fixture('{"Type":"GetConstValue","Value":"old"}')
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value: 'Bearer '}); await flushPromises()
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['value']).toBe('{"Type":"GetConstValue","Value":"Bearer "}')
    expect(f.view.rows[0]?.['value']).toContain('old')
  })
  it('binds public parameter choices by the complete view identity and preserves cancel', async () => {
    const f = await fixture()
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const editor = f.wrapper.findComponent(FilterValueFunctionDialog)
    expect(editor.props('context').apiPublicParams).toEqual([{value: 'access_token', label: '令牌'}])
    expect(editor.props('context').inputParams).toEqual([{value: 'access_token', label: '令牌'}])
    editor.vm.$emit('update:modelValue', false); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('retains legacy text until explicit editing and rejects confirmation after row or permission changes', async () => {
    const f = await fixture('legacy literal')
    expect(f.view.getEditingRow('a')?.['value']).toBe('legacy literal')
    await f.wrapper.get('[data-function-open]').trigger('click'); await flushPromises()
    const old = f.wrapper.findComponent(FilterValueFunctionDialog)
    f.view.setCurrentRowById('b'); await flushPromises()
    old.vm.$emit('confirm', {Type: 'GetConstValue', Value: 'stale'}); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value = true; await flushPromises()
    expect(f.wrapper.get('[data-function-open]').attributes('disabled')).toBeDefined()
  })
})

