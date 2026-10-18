import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, markRaw, ref} from 'vue'
import ElementPlus, {ElButton, ElInput, ElTable, ElTableColumn} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'
import {dataSpacePageFixture} from './data-space-page.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
beforeAll(() => registerAllRenderers())
beforeEach(() => vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}}))
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  fixtures.splice(0).forEach(fixture => fixture.dispose())
  vi.unstubAllGlobals()
})

it('preserves parameter typing across other view configuration edits, saves through DataSet and reopens the same values', async () => {
  const fixture = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(fixture)
  const original = {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      default: {}, shared: {queryContext: {customer: 'before', retained: {flag: false}}},
    }},
    CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {pageSize: 24}}},
  }}
  fixture.stored.set('A', JSON.stringify(original))
  const session = await fixture.open('A'), dataSet = session.metadataDataSet
  const definitions = dataSet.getView('DataViewDefinition')!
  const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
  const key = definitions.getPkKey(row)!, revision = ref(0), scenarioId = dataSet.scenarioId!
  const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [scenarioId], loadScenario: async () => dataSet})
  runtimes.push(runtime); await runtime.load()
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'data-space-design'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(DataSpaceViewEditor, {session: markRaw(session), modelId: 'M1', modelName: 'Orders', rowKey: key,
      revision: revision.value, onChanged: () => revision.value++})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {
    SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton,
    'el-table': ElTable, 'el-table-column': ElTableColumn,
  }}})
  wrappers.push(wrapper); await flushPromises()
  const input = wrapper.findAllComponents(ElInput).find(field => field.find('[data-json-property="customer"]').exists())!
  expect(input.props('modelValue')).toBe('before')
  input.vm.$emit('update:modelValue', 'after'); await flushPromises()
  expect(definitions.hasEditingChanges()).toBe(false)
  definitions.updateEditingValue(key, 'autoLoad', false); await flushPromises()
  expect(input.props('modelValue')).toBe('after')
  expect(definitions.getEditingRow(key)?.['queryContext']).toEqual(original.tables.OrdersAlias.views.shared.queryContext)
  input.vm.$emit('change', 'after'); await flushPromises()
  expect(definitions.getEditingRow(key)?.['queryContext']).toEqual({customer: 'after', retained: {flag: false}})
  const assemblies = fixture.assemblyScopes.length
  await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
  expect(definitions.hasEditingChanges(), wrapper.text()).toBe(false)
  expect(fixture.fileWrites).toHaveLength(1)
  expect(fixture.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  // 提交校验只装配修改所属模型，不重装整个目标空间。
  expect(fixture.assemblyScopes.slice(assemblies)).toEqual([['OrdersAlias']])
  const saved = JSON.parse(fixture.stored.get('A')!)
  expect(saved.tables.OrdersAlias.views.default).toEqual(original.tables.OrdersAlias.views.default)
  expect(saved.tables.CustomersAlias).toEqual(original.tables.CustomersAlias)
  const reopened = await fixture.open('A', {deferDefinition: false})
  const restored = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
  expect(restored.queryContext).toEqual({customer: 'after', retained: {flag: false}})
  expect(restored.autoLoad).toBe(false)
  expect(reopened.metadataDataSet).not.toBe(dataSet)
})
