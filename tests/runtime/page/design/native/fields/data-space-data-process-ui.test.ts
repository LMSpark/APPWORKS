import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, ref} from 'vue'
import ElementPlus from 'element-plus'
import {FieldJson, Spark, PAGE_RUNTIME, DATA_ROW, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import DataSpaceTableConfiguration from '@/views/features/data-platform/data-set-management/design/ui/node-panel/configuration/DataSpaceTableConfiguration.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks()})

async function setup(prepare?: (fixture: ReturnType<typeof dataSpacePageFixture>) => void) {
  const f = dataSpacePageFixture({overviewOnly: true}); cleanups.push(() => f.dispose())
  prepare?.(f)
  const session = await f.open('A'), dataSet = session.metadataDataSet
  const runtime = new PageRuntime({pageId: 'process-test', scenarioIds: [dataSet.scenarioId!], loadScenario: async () => dataSet})
  await runtime.load(); cleanups.push(() => runtime.dispose())
  registerAllRenderers()
  const parentBusy = ref(true), pending = vi.fn()
  const Host = defineComponent({setup() {
    const revision = ref(0), {sparkProvide} = useSparkComponent({type: 'process-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_ROW, {rowid: 'wrong-outer-row', Name: '外层模型'})
    const changed = () => {revision.value++}
    const off = dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed})
    onBeforeUnmount(off)
    return () => h(DataSpaceTableConfiguration, {session, modelId: 'M1', fieldIds: [], revision: revision.value, disabled: parentBusy.value, onChanged: changed, onPending: pending})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {JsonTreeEditor: true}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  return {f, session, dataSet, wrapper, parentBusy, pending}
}

describe('native data processing component lifecycle', () => {
  it.each(['partial', 'idle'] as const)('locates the existing model binding when the shared directory is %s', async state => {
    const {f, dataSet, wrapper, parentBusy} = await setup()
    const directory = dataSet.getView('DataTableBindingDefinition')!
    if (state === 'partial') {
      const result = await directory.loadFromServer({page: 1, pageSize: 1, sort: 'tableName:asc', allPages: false})
      expect(result.success).toBe(true)
      expect(directory.rows.map(row => row['tableName'])).toEqual(['CustomersAlias'])
      expect(directory.total).toBe(2)
    } else directory.clearAll()
    const query = vi.spyOn(directory, 'loadFromServer')
    parentBusy.value = false; await flushPromises()
    const owned = dataSet.getTable('DataTableBindingDefinition')!.viewList.find(view => view.viewId.startsWith('tableConfiguration:'))!
    expect(owned.rows.map(row => row['tableName'])).toEqual(['OrdersAlias'])
    expect(wrapper.find('[data-action="create-table-api-binding"]').exists()).toBe(false)
    expect(wrapper.findAllComponents(FieldJson)).toHaveLength(2)
    expect(query).not.toHaveBeenCalled()
    expect(f.fileWrites).toEqual([])
    const before = JSON.parse(f.stored.get('A')!)
    await wrapper.get('[data-json-member="url"] input').setValue('/api/Cancelled/query'); await flushPromises()
    await wrapper.get('[data-action="discard-table-api"]').trigger('click'); await flushPromises()
    expect(owned.hasEditingChanges()).toBe(false)
    await wrapper.get('[data-json-member="url"] input').setValue('/api/DataOperation/GetData'); await flushPromises()
    await wrapper.get('[data-action="save-table-api"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    const stored = JSON.parse(f.stored.get('A')!)
    expect(Object.keys(stored.tables)).toEqual(Object.keys(before.tables))
    expect(stored.tables.CustomersAlias).toEqual(before.tables.CustomersAlias)
    expect(stored.tables.OrdersAlias.api.list.url).toBe('/api/DataOperation/GetData')
    expect(stored.tables.OrdersAlias).not.toHaveProperty('dataModelId')
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.api?.list?.url).toBe('/api/DataOperation/GetData')
  })
  it.each(['name-collision', 'stale-model-name', 'occupied-default-name'] as const)('handles %s without borrowing shared directory rows', async kind => {
    const {f, dataSet, wrapper, parentBusy} = await setup(fixture => {
      const file = {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
        ...(kind !== 'name-collision' ? {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: kind === 'stale-model-name' ? 'OldOrders' : 'Orders'}, views: {default: {}}}} : {}),
        ...(kind !== 'stale-model-name' ? {Orders: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}} : {}),
      }}
      fixture.stored.set('A', JSON.stringify(file))
    })
    dataSet.getView('DataTableBindingDefinition')!.clearAll()
    parentBusy.value = false; await flushPromises()
    if (kind === 'occupied-default-name') {
      const owned = dataSet.getTable('DataTableBindingDefinition')!.viewList.find(view => view.viewId.startsWith('tableConfiguration:'))!
      expect(owned.rows.map(row => row['tableName'])).toEqual(['OrdersAlias'])
      expect(wrapper.findAllComponents(FieldJson)).toHaveLength(2)
    } else {
      expect(wrapper.text()).toContain('模型绑定身份不匹配或名称已被占用')
      expect(wrapper.findComponent(FieldJson).exists()).toBe(false)
    }
    expect(wrapper.find('[data-action="create-table-api-binding"]').exists()).toBe(false)
    expect(f.fileWrites).toEqual([])
  })
  it('waits for its parent, exposes a failed query for retry and releases only its own views', async () => {
    const {f, dataSet, wrapper, parentBusy} = await setup()
    expect(wrapper.findComponent(FieldJson).exists()).toBe(false)
    const load = vi.spyOn(DataView.prototype, 'loadFromServer').mockResolvedValueOnce({success: false, message: '文件读取失败'})
    parentBusy.value = false; await flushPromises()
    expect(wrapper.text()).toContain('文件读取失败')
    expect(wrapper.findComponent(FieldJson).exists()).toBe(false)
    load.mockRestore()
    await wrapper.findAll('button').find(button => button.text() === '重读数据处理')!.trigger('click'); await flushPromises()
    expect(wrapper.findAllComponents(FieldJson)).toHaveLength(2)
    const table = dataSet.getTable('DataTableBindingDefinition')!, original = table.getView('default')
    const owned = table.viewList.find(view => view.viewId.startsWith('tableConfiguration:'))!
    expect(owned.rows.map(row => row['tableName'])).toEqual(['OrdersAlias'])
    const controls = Object.keys(dataSet.tables).find(name => name.startsWith('DataProcessControl_'))!
    wrapper.unmount(); await flushPromises()
    expect(table.getView(owned.viewId)).toBeUndefined(); expect(table.getView('default')).toBe(original)
    expect(dataSet.getTable(controls)).toBeUndefined(); expect(f.fileWrites).toEqual([])
  })
  it('edits the definition row instead of the outer model and cancels without discarding another view', async () => {
    const {f, dataSet, wrapper, parentBusy, pending} = await setup()
    parentBusy.value = false; await flushPromises()
    const defaults = dataSet.getView('DataTableBindingDefinition')!, other = defaults.rows.find(row => row['tableName'] === 'CustomersAlias')!
    const key = defaults.getPkKey(other)!
    const configuration = other['configuration']
    if (!isRecord(configuration)) throw new Error('缺少模型绑定配置')
    defaults.updateEditingValue(key, 'configuration', {...configuration, crudConfig: {timeout: 1234}})
    const input = wrapper.get('[data-json-member="url"] input')
    await input.setValue('/api/Orders/query'); await input.trigger('change'); await flushPromises()
    const owned = dataSet.getTable('DataTableBindingDefinition')!.viewList.find(view => view.viewId.startsWith('tableConfiguration:'))!
    expect(owned.getEditingRow(owned.getPkKey(owned.currentRow!)!)?.['configuration']).toHaveProperty('api.list.url', '/api/Orders/query')
    expect(pending).toHaveBeenLastCalledWith(true)
    await wrapper.get('[data-action="discard-table-api"]').trigger('click'); await flushPromises()
    expect(owned.hasEditingChanges()).toBe(false); expect(defaults.hasEditingChanges()).toBe(true)
    expect(defaults.getEditingRow(key)?.['configuration']).toHaveProperty('crudConfig.timeout', 1234)
    expect(pending).toHaveBeenLastCalledWith(false); expect(f.fileWrites).toEqual([])
  })
})
