import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldCheckbox, RendererTable, Spark, PAGE_RUNTIME, DATA_ROW, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const originalStubs = config.global.stubs
const cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})

async function fixture(onChange?: () => Promise<void>) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = DataSet.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {Items: {
    modelBinding: {modelId: 'M', modelName: 'Items'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'enabled', type: 'number'},
    ], views: {default: {selectionDelimiter: '', commitMode: 'staged'}, other: {selectionDelimiter: '', commitMode: 'staged'}},
  }}})
  const source = new DataSpaceQueryTable({scenarioId: 'S', metaName: 'Items'})
  for (const viewId of ['default', 'other']) {
    const view = ds.getView('Items', viewId)!
    view.bindQueryExecutor({executeQuery: async () => new DataSpaceQueryContext({identity: source.identity, scope: 'q', readScope: () => 'q',
      snapshot: source.applyResult({Result: {primaryKeyField: 'id', data: {Items: [
        {id: 'a', enabled: 1, lingma_sys_params: {r: [], e: ['enabled'], h: [], m: [], d: false}},
        {id: 'b', enabled: 0, lingma_sys_params: {r: [], e: ['enabled'], h: [], m: [], d: false}},
        {id: 'denied', enabled: 1, lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}},
        {id: 'hidden', enabled: 1, lingma_sys_params: {r: [], e: ['enabled'], h: ['enabled'], m: [], d: false}},
        {id: 'masked', enabled: 1, lingma_sys_params: {r: [], e: [], h: [], m: ['enabled'], d: false}},
      ], Count: 5}}})})})
    await view.refresh(); view.setCurrentRowById('a')
  }
  const runtime = new PageRuntime({pageId: 'checkbox-test', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); cleanups.push(() => runtime.dispose())
  const registry = Spark.createRegistry(); registry.register({type: 'r-checkbox', component: FieldCheckbox})
  const binding = shallowRef('S@Items@default'), readonly = shallowRef(false), locked = shallowRef('')
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'checkbox-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_ROW, {id: 'OUTER', enabled: 1})
    return () => h(RendererTable, {dataViewKey: binding.value, autoColumns: false, showPagination: false, showDataViewMeta: false,
      children: [{type: 'r-checkbox', props: {dataViewKey: binding.value, field: 'enabled', label: '输出', trueValue: 1, falseValue: 0,
        readonly: readonly.value, cellReadonly: (row: Readonly<Record<string, unknown>>) => row['id'] === locked.value, onChange}}]})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view: ds.getView('Items')!, other: ds.getView('Items', 'other')!, binding, readonly, locked}
}

describe('standard checkbox table cells', () => {
  it('writes the clicked cell row as 0 or 1 without relying on the selected pointer or an outer row', async () => {
    const {wrapper, view} = await fixture()
    const rows = wrapper.findAll('tbody tr')
    expect((rows[0]!.get('input').element as HTMLInputElement).checked).toBe(true)
    expect((rows[1]!.get('input').element as HTMLInputElement).checked).toBe(false)
    await rows[1]!.get('input').setValue(true); await flushPromises()
    expect(view.getEditingPatch('b')).toEqual({enabled: 1})
    expect(view.hasEditingChanges('a')).toBe(false)
    expect(view.rows[1]?.['enabled']).toBe(0)
    await rows[0]!.get('input').setValue(false); await flushPromises()
    expect(view.getEditingPatch('a')).toEqual({enabled: 0})
    view.discardEditingRows(); await flushPromises()
    expect((rows[0]!.get('input').element as HTMLInputElement).checked).toBe(true)
    expect((rows[1]!.get('input').element as HTMLInputElement).checked).toBe(false)
  })

  it('consumes row permissions and additional readonly constraints without revealing hidden or masked values', async () => {
    const {wrapper, view, locked, readonly} = await fixture()
    const rows = wrapper.findAll('tbody tr')
    expect(rows[2]!.get('input').attributes('disabled')).toBeDefined()
    expect(rows[3]!.find('input').exists()).toBe(false)
    expect(rows[4]!.find('input').exists()).toBe(false)
    locked.value = 'b'; await flushPromises()
    expect(rows[1]!.get('input').attributes('disabled')).toBeDefined()
    readonly.value = true; await flushPromises()
    expect(rows[0]!.get('input').attributes('disabled')).toBeDefined()
    expect(view.hasEditingChanges()).toBe(false)
  })

  it('rejects an awaited change after a view switch, even when the new view has the same row keys', async () => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    const {wrapper, view, other, binding} = await fixture(() => pending)
    await wrapper.findAll('tbody tr')[1]!.get('input').setValue(true)
    binding.value = 'S@Items@other'; await flushPromises()
    release(); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(other.hasEditingChanges()).toBe(false)
  })

  it.each(['readonly', 'reload'] as const)('rejects a pending cell write after %s', async change => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    const {wrapper, view, readonly} = await fixture(() => pending)
    await wrapper.findAll('tbody tr')[1]!.get('input').setValue(true)
    if (change === 'readonly') readonly.value = true
    else await view.refresh()
    await flushPromises(); release(); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(view.rows[1]?.['enabled']).toBe(0)
  })
})
