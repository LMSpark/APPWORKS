import {afterEach, describe, expect, it} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {buildDataViewKey, DataViewFilterCodec} from '@spark-appworks/spark-data'
import {FilterExpressionEditor, JsonTreeEditor, PAGE_RUNTIME, RendererFilterExpression, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {dataSpacePageFixture} from './data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
const runtimes: PageRuntime[] = []
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); fixtures.splice(0).forEach(f => f.dispose())})
async function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}, table = 'Base_DataModel', field = 'Filter') {
  const f = dataSpacePageFixture(options); fixtures.push(f)
  const session = await f.open('A'), ds = session.metadataDataSet, view = ds.getView(table)!
  const record = table === 'Base_DataModel' ? view.rows.find(row => row['rowid'] === 'M1')! : view.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')!
  const key = view.getPkKey(record)!
  view.setCurrentRowById(key)
  const runtime = new PageRuntime({pageId: '/filter-fixture', scenarioIds: [ds.scenarioId!], loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime)
  const binding = ref(buildDataViewKey(table, 'default', ds.scenarioId))
  const host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'filter-runtime-fixture'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererFilterExpression, {dataViewKey: binding.value, dataMember: 'currentRow', field,
      format: table === 'Base_DataModel' ? 'spark-json' : 'tree', columns: [{name: 'rowid', type: 'string'}]})
  }})
  const wrapper = mount(host, {attachTo: document.body, global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true}}})
  wrappers.push(wrapper)
  return {f, session, view, key, wrapper, binding}
}
const predicate = {logic: 'or', filters: [{field: 'rowid', operator: 'eq', value: ''},
  {logic: 'and', filters: [{field: 'rowid', operator: 'ne', value: 'excluded'}, {field: 'rowid', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID'}}]}]}
async function apply(wrapper: ReturnType<typeof mount>) {
  const body = new DOMWrapper(document.body)
  await wrapper.get('[data-action="open"]').trigger('click')
  await body.get('[data-action="json"]').trigger('click')
  wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue', JSON.stringify(predicate)); await flushPromises()
  await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
}

describe('system filter component formal persistence chain', () => {
  it('registers the public rule.json type', () => {
    registerAllRenderers()
    expect(Spark.getRegistry().get('r-filter-expression')?.component).toBe(RendererFilterExpression)
  })
  it('rejects the retired model Filter write and preserves its stored value', async () => {
    const {f, session, view, wrapper} = await fixture()
    const storedFilter = view.rows.find(row => row['rowid'] === 'M1')?.['Filter']
    await apply(wrapper)
    expect(DataViewFilterCodec.parseStored(String(view.getEditingRow('M1')?.['Filter']))?.toJSON()).toEqual(predicate)
    const requestsBeforeSave = f.requests.length
    await expect(session.getModelEdit('M1').save()).rejects.toThrow('不能修改模型请求属性，请使用「2 请求方案」页签')
    expect(f.requests).toHaveLength(requestsBeforeSave)
    expect(view.hasEditingChanges()).toBe(true)
    session.getModelEdit('M1').discard()
    expect(view.hasEditingChanges()).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.getEditingRow('M1')?.['Filter']).toEqual(storedFilter)
    expect(f.fileWrites).toHaveLength(0)
  })
  it('saves native view definitions through pagedata and reconstructs the same DataView filter', async () => {
    const {f, session, wrapper} = await fixture({}, 'DataViewDefinition', 'filterExpression')
    await apply(wrapper)
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'shared')?.filterExpression).toEqual(predicate)
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'default')?.filterExpression).toBeUndefined()
    expect(f.fileWrites).toHaveLength(1)
  })
  it.each([{readOnly: true}, {hiddenModelProperties: ['Filter']}])('consumes formal field permission without allowing writes: %j', async options => {
    const {view, wrapper} = await fixture(options)
    const editor = wrapper.findComponent(FilterExpressionEditor)
    expect(!editor.exists() || editor.props('readonly')).toBe(true)
    if (editor.exists()) {
      await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
      expect(new DOMWrapper(document.body).find('[data-action="apply"]').exists()).toBe(false)
      editor.vm.$emit('update:modelValue', predicate)
      await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click')
    }
    expect(view.hasEditingChanges()).toBe(false)
  })
  it('rejects an old editor callback after a fresh query revokes field write permission', async () => {
    const {f, view, wrapper} = await fixture()
    const stale: unknown = wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
    f.denyModelField('Filter'); await view.refresh(); await flushPromises()
    if (typeof stale !== 'function') throw new Error('missing callback')
    stale(predicate)
    expect(view.hasEditingChanges()).toBe(false)
    expect(wrapper.getComponent(FilterExpressionEditor).props('readonly')).toBe(true)
  })
})
