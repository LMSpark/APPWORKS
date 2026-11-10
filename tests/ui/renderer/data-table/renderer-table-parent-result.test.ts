import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldText, PAGE_RUNTIME, RendererTable, RendererFilter, Spark, useSparkComponent} from '@spark-appworks/spark-component'
const cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(f => f()); vi.unstubAllGlobals()})
async function fixture(children?: SparkNode[], slot = false) {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {
    Parent: {tableName: 'Parent', resourceType: 'static-data', columns: [{name: 'name', type: 'string'}], views: {default: {rows: [{name: 'Parent'}]}}},
    Child: {tableName: 'Child', resourceType: 'static-data', modelBinding: {modelId: 'C', modelName: 'Child'}, columns: [{name: 'name', type: 'string'}], views: {
      default: {queryConfig: {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'S@Parent@default', childModelName: 'Child'}}},
      ordinary: {rows: [{name: 'ordinary'}]},
    }},
  }})
  const runtime = new PageRuntime({pageId: 'parent-query-ui', scenarioIds: ['S'], loadScenario: async () => ds}); await runtime.load()
  cleanups.push(() => {runtime.dispose(); ds.destroy()})
  const binding = shallowRef('S@Child@default'), filterBinding = shallowRef('S@Child@default'), showRowIndex = shallowRef(false)
  const registry = Spark.createRegistry(); registry.register({type: 'r-text', component: FieldText}); registry.register({type: 'r-filter', component: RendererFilter})
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'parent-query-ui'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererTable, {dataViewKey: binding.value, autoColumns: !slot, showPagination: false, showDataViewMeta: false, showRowIndex: showRowIndex.value,
      filter: {dataViewKey: filterBinding.value, autoQuery: false}, ...(children ? {children} : {})}, slot ? {default: () => h(FieldText, {field: 'name', sortable: 'custom'})} : undefined)
  }})
  const stubs = {...config.global.stubs}; for (const n of ['el-table','el-table-column','SparkComponentRenderer','spark-component-renderer']) delete stubs[n]
  const originalStubs = config.global.stubs; config.global.stubs = stubs; cleanups.push(() => {config.global.stubs = originalStubs})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})], stubs, components: {'el-table': ElTable,'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, ds, binding, filterBinding, showRowIndex}
}

it('renders an optional page-local row index without changing the data fields', async () => {
  const {wrapper, binding, showRowIndex, ds} = await fixture()
  binding.value = 'S@Child@ordinary'
  await flushPromises()
  const columns = ds.getView('Child', 'ordinary')!.columns.map(column => column.name)
  expect(wrapper.find('.el-table__header-wrapper').text()).not.toContain('#')
  showRowIndex.value = true
  await flushPromises()
  expect(wrapper.findAll('.el-table__header-wrapper th').map(header => header.text())).toEqual(['', '#', 'name'])
  expect(wrapper.findAll('.el-table__body-wrapper tbody tr td').map(cell => cell.text())).toContain('1')
  expect(ds.getView('Child', 'ordinary')!.columns.map(column => column.name)).toEqual(columns)
  showRowIndex.value = false
  await flushPromises()
  expect(wrapper.find('.el-table__header-wrapper').text()).not.toContain('#')
})
it.each(['auto','explicit','group','slot'] as const)('removes child sorting for %s fields and restores ordinary binding', async mode => {
  const field: SparkNode = {type: 'r-text', props: {field: 'name', sortable: true}}
  const children = mode === 'explicit' ? [field] : mode === 'group' ? [{type: 'r-text', props: {label: 'group'}, children: [{type: 'r-text', props: {label: 'nested'}, children: [field]}]}] : undefined
  const {wrapper, binding, ds} = await fixture(children, mode === 'slot')
  expect(wrapper.findAll('th.is-sortable')).toHaveLength(0)
  const child = ds.getView('Child')!, setSort = vi.spyOn(child, 'setSort')
  wrapper.getComponent(ElTable).vm.$emit('sort-change', {prop: 'name', order: 'ascending'}); await flushPromises()
  expect(setSort).not.toHaveBeenCalled(); expect(child.sortExpression).toBeUndefined()
  binding.value = 'S@Child@ordinary'; await flushPromises()
  expect(wrapper.findAll('th.is-sortable').length).toBeGreaterThan(0)
  binding.value = 'S@Child@default'; await flushPromises()
  expect(wrapper.findAll('th.is-sortable')).toHaveLength(0)
})
it('disables filtering by the Filter own binding and preserves ordinary parent filters', async () => {
  const {wrapper, filterBinding, ds} = await fixture()
  const child = ds.getView('Child')!, before = JSON.stringify(child.toJson())
  expect(wrapper.get('[data-action="open"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('父查询')
  expect(JSON.stringify(child.toJson())).toBe(before)
  filterBinding.value = 'S@Parent@default'; await flushPromises()
  expect(wrapper.get('[data-action="open"]').attributes('disabled')).toBeUndefined()
})

it('preserves explicit manual mode when the same filter view switches to parentResult', async () => {
  const {filterBinding, ds} = await fixture()
  filterBinding.value = 'S@Child@ordinary'; await flushPromises()
  const view = ds.getView('Child', 'ordinary')!
  expect(view.queryConfig.autoQuery).toBe(false)
  view.queryConfig = {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'S@Parent@default', childModelName: 'Child'}}
  await flushPromises()
  expect(view.queryConfig.autoQuery).toBe(false)
  expect(view.supportsQueryFiltering).toBe(false)
})

it('reacts to same-view query configuration and preserves explicit sortable false', async () => {
  const {wrapper, ds} = await fixture([{type: 'r-text', props: {field: 'name', sortable: false}}])
  const child = ds.getView('Child')!
  child.queryConfig = {pagination: 'none', autoQuery: false}
  await flushPromises()
  expect(child.supportsQuerySorting).toBe(true)
  expect(wrapper.findAll('th.is-sortable')).toHaveLength(0)
  child.queryConfig = {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'S@Parent@default', childModelName: 'Child'}}
  await flushPromises()
  expect(child.supportsQuerySorting).toBe(false)
  expect(wrapper.findAll('th.is-sortable')).toHaveLength(0)
})
