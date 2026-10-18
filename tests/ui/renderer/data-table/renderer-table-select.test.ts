import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus, {ElSelect, ElTable, ElTableColumn} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldSelect, RendererTable, Spark, PAGE_RUNTIME, DATA_ROW, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const originalStubs = config.global.stubs, cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})

async function fixture(onChange?: () => Promise<void>) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = DataSet.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {
    Items: {modelBinding: {modelId: 'M', modelName: 'Items'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'rule', type: 'string'},
    ], views: {default: {commitMode: 'staged'}, other: {commitMode: 'staged'}}},
    Rules: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
      views: {default: {valueField: 'id', labelField: 'name', rows: [{id: 'one', name: '规则一'}, {id: 'two', name: '规则二'}]}}},
  }})
  const source = new DataSpaceQueryTable({scenarioId: 'S', metaName: 'Items'})
  for (const viewId of ['default', 'other']) {
    const view = ds.getView('Items', viewId)!
    view.bindQueryExecutor({executeQuery: async () => new DataSpaceQueryContext({identity: source.identity, scope: 'q', readScope: () => 'q',
      snapshot: source.applyResult({Result: {primaryKeyField: 'id', data: {Items: [
        {id: 'a', rule: 'one', lingma_sys_params: {r: [], e: ['rule'], h: [], m: [], d: false}},
        {id: 'b', rule: 'two', lingma_sys_params: {r: [], e: ['rule'], h: [], m: [], d: false}},
        {id: 'denied', rule: 'one', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}},
        {id: 'hidden', rule: 'one', lingma_sys_params: {r: [], e: ['rule'], h: ['rule'], m: [], d: false}},
        {id: 'masked', rule: 'one', lingma_sys_params: {r: [], e: [], h: [], m: ['rule'], d: false}},
      ], Count: 5}}})})})
    await view.refresh(); view.setCurrentRowById('a')
  }
  const runtime = new PageRuntime({pageId: 'select-test', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); cleanups.push(() => runtime.dispose())
  const registry = Spark.createRegistry(); registry.register({type: 'r-select', component: FieldSelect})
  const binding = shallowRef('S@Items@default'), readonly = shallowRef(false), locked = shallowRef(''), showControl = shallowRef(true), doubleClick = shallowRef(false)
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'select-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_ROW, {id: 'OUTER', rule: 'one'})
    return () => h(RendererTable, {dataViewKey: binding.value, autoColumns: false, showPagination: false, showDataViewMeta: false,
      children: [{type: 'r-select', props: {dataViewKey: binding.value, field: 'rule', label: '规则', showCellControl: showControl.value,
        editOnDblclick: doubleClick.value, optionDataViewKey: 'S@Rules@default', readonly: readonly.value,
        cellReadonly: (row: Readonly<Record<string, unknown>>) => row['id'] === locked.value, onChange}}]})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view: ds.getView('Items')!, other: ds.getView('Items', 'other')!, binding, readonly, locked, showControl, doubleClick}
}

describe('standard select table cells', () => {
  it('writes the cell row without moving the pointer, keeps native storage and cancels through its DataView', async () => {
    const {wrapper, view} = await fixture()
    const selects = wrapper.findAllComponents(ElSelect)
    expect(selects.map(select => select.props('modelValue'))).toEqual(['one', 'two', 'one'])
    expect(selects[1]!.text()).toContain('规则二')
    selects[1]!.vm.$emit('update:modelValue', 'one'); await flushPromises()
    expect(view.getEditingPatch('b')).toEqual({rule: 'one'})
    expect(view.currentRow?.['id']).toBe('a')
    expect(view.hasEditingChanges('a')).toBe(false)
    expect(view.rows[1]?.['rule']).toBe('two')
    view.discardEditingRows(); await flushPromises()
    expect(selects[1]!.props('modelValue')).toBe('two')
  })

  it('uses row and field permissions plus additional readonly restrictions without exposing hidden or masked values', async () => {
    const {wrapper, view, locked, readonly} = await fixture(), rows = wrapper.findAll('tbody tr')
    expect(rows[2]!.getComponent(ElSelect).props('disabled')).toBe(true)
    expect(rows[3]!.findComponent(ElSelect).exists()).toBe(false)
    expect(rows[4]!.findComponent(ElSelect).exists()).toBe(false)
    expect(rows[4]!.text()).not.toContain('规则一')
    locked.value = 'b'; await flushPromises()
    expect(rows[1]!.getComponent(ElSelect).props('disabled')).toBe(true)
    rows[1]!.getComponent(ElSelect).vm.$emit('update:modelValue', 'one'); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    readonly.value = true; await flushPromises()
    expect(rows[0]!.getComponent(ElSelect).props('disabled')).toBe(true)
  })

  it.each(['view', 'readonly', 'reload'] as const)('rejects an awaited cell write after %s changes', async change => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    const {wrapper, view, other, binding, readonly} = await fixture(() => pending)
    wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue', 'one')
    await flushPromises()
    if (change === 'view') binding.value = 'S@Items@other'
    else if (change === 'readonly') readonly.value = true
    else await view.refresh()
    await flushPromises(); release(); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false); expect(other.hasEditingChanges()).toBe(false)
  })

  it('preserves text and double-click modes unless direct controls are requested', async () => {
    const {wrapper, showControl, doubleClick} = await fixture()
    showControl.value = false; await flushPromises()
    expect(wrapper.findAllComponents(FieldSelect)[0]!.props('showCellControl')).toBe(false)
    expect(wrapper.findAllComponents(ElSelect)).toHaveLength(0)
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('规则一')
    doubleClick.value = true; await flushPromises()
    await wrapper.findAll('tbody tr')[0]!.get('.field-table-cell').trigger('dblclick'); await flushPromises()
    expect(wrapper.findAllComponents(ElSelect)).toHaveLength(1)
    showControl.value = true; await flushPromises()
    expect(wrapper.findAllComponents(ElSelect)).toHaveLength(3)
  })
})
