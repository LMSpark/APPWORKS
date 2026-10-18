import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {FieldText, RendererTable, Spark, SparkJsonEditor, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import RendererFilter from '../../../../packages/spark-component/src/components/containers/zones/RendererFilter.vue'
import type {RFilterProps} from '../../../../packages/spark-component/src/components/containers/zones/RendererFilter.types'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'

const originalStubs = config.global.stubs
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  config.global.stubs = originalStubs
  vi.unstubAllGlobals()
})

async function fixture(filter?: RFilterProps) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'FilterFixture', tables: {
    Orders: {tableName: 'Orders', resourceType: 'static-data',
      columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'Name', type: 'string'}],
      views: {
        default: {rows: [{id: 1, Name: 'first'}, {id: 2, Name: 'kept'}]},
        other: {},
      }},
  }})
  const runtime = new PageRuntime({pageId: 'filter-test', scenarioIds: ['SPACE'], loadScenario: async () => dataSet})
  await runtime.load()
  cleanups.push(() => runtime.dispose())
  const registry = Spark.createRegistry()
  registry.register({type: 'r-filter', component: RendererFilter})
  registry.register({type: 'r-text', component: FieldText})
  const filterConfig = shallowRef(filter)
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'filter-test-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererTable, {dataViewKey: 'SPACE@Orders@default', autoColumns: true, showPagination: false, showDataViewMeta: false,
      ...(filterConfig.value !== undefined ? {filter: filterConfig.value} : {})})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return {wrapper, filterConfig, view: dataSet.getView('Orders', 'default')!, other: dataSet.getView('Orders', 'other')!}
}

async function applyName(wrapper: ReturnType<typeof mount>, value: string) {
  const body = new DOMWrapper(document.body)
  await body.get('[data-action="open"]').trigger('click')
  await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
  wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify({field: 'Name', operator: 'eq', value})); await flushPromises()
  await body.get('[data-action="apply"]').trigger('click')
  await flushPromises()
}

describe('container unified DataView filter', () => {
  it('renders filter:{} and applies and clears the bound DataView through the full editor', async () => {
    const {wrapper, view} = await fixture({})
    expect(wrapper.find('[data-action="open"]').exists()).toBe(true)
    await applyName(wrapper, 'kept')
    expect(view.rows.map(row => row['id'])).toEqual([2])
    expect(wrapper.find('.el-table__body').text()).toContain('kept')
    expect(wrapper.find('.el-table__body').text()).not.toContain('first')
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="clear"]').trigger('click')
    await flushPromises()
    expect(view.filterExpression).toBeUndefined()
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])
  })

  it('uses the explicit filter view and switches without overwriting the previous view filter', async () => {
    const {wrapper, filterConfig, view, other} = await fixture({dataViewKey: 'SPACE@Orders@other', class: 'custom-filter'})
    await applyName(wrapper, 'kept')
    expect(other.rows.map(row => row['id'])).toEqual([2])
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])
    expect(wrapper.find('.custom-filter [data-action="open"]').exists()).toBe(true)
    filterConfig.value = {}
    await flushPromises()
    await applyName(wrapper, 'first')
    expect(view.rows.map(row => row['id'])).toEqual([1])
    expect(other.filterExpression).toEqual({field: 'Name', operator: 'eq', value: 'kept'})
    expect(other.rows.map(row => row['id'])).toEqual([2])
  })

  it('omits the filter only when unconfigured and updates the configured region reactively', async () => {
    const {wrapper, filterConfig, view} = await fixture()
    expect(wrapper.findComponent(RendererFilter).exists()).toBe(false)
    filterConfig.value = {children: [{type: 'r-text', props: {text: 'filter description'}}], class: 'configured-filter'}
    await flushPromises()
    expect(wrapper.find('.configured-filter [data-action="open"]').exists()).toBe(true)
    filterConfig.value = undefined
    await flushPromises()
    expect(wrapper.findComponent(RendererFilter).exists()).toBe(false)
    expect(view.rows).toHaveLength(2)
  })
})
