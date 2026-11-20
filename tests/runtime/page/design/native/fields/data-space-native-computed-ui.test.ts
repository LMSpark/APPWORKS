import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, ref} from 'vue'
import ElementPlus from 'element-plus'
import {FieldJson, FieldText, FieldTextarea, Spark, PAGE_RUNTIME, DATA_ROW, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveDataViewKey} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import DataSpaceTableConfiguration from '@/views/features/data-platform/data-set-management/design/ui/node-panel/configuration/DataSpaceTableConfiguration.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const cleanups: Array<() => void> = []
const originalStubs = {...config.global.stubs}
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); config.global.stubs = originalStubs})

async function setup(missing = false) {
  const rows = [{rowid: 'O1', amount: 7, qty: 3}]
  const f = dataSpacePageFixture({overviewOnly: true, missing, businessRows: {Orders: rows}, sourceFields: [
    {rowid: 'F0', dataModelId: 'M1', type: 'dataModel', Name: 'rowid', FieldType: 'string', IsOutput: 1, IsPKey: 1},
    {rowid: 'F1', dataModelId: 'M1', type: 'dataModel', Name: 'amount', FieldType: 'number', IsOutput: 1},
    {rowid: 'F2', dataModelId: 'M1', type: 'dataModel', Name: 'qty', FieldType: 'number', IsOutput: 1},
  ]}); cleanups.push(() => f.dispose())
  const session = await f.open('A'), dataSet = session.metadataDataSet
  const runtime = new PageRuntime({pageId: 'computed-test', scenarioIds: [dataSet.scenarioId!], loadScenario: async () => dataSet})
  await runtime.load(); cleanups.push(() => runtime.dispose()); registerAllRenderers()
  const pending = vi.fn()
  const Host = defineComponent({setup() {
    const revision = ref(0), {sparkProvide} = useSparkComponent({type: 'computed-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_ROW, {rowid: 'outer', configuration: {columns: []}})
    const changed = () => {revision.value++}
    const off = dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed})
    onBeforeUnmount(off)
    return () => h(DataSpaceTableConfiguration, {session, modelId: 'M1', fieldIds: [], revision: revision.value,
      section: 'columns', onChanged: changed, onPending: pending})
  }})
  const stubs = {...config.global.stubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[key]
  config.global.stubs = stubs
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  return {f, session, dataSet, wrapper, pending, rows}
}

async function beginFields(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-action="initialize-table-columns"]').trigger('click'); await flushPromises()
  const editor = wrapper.getComponent(FieldJson)
  return editor
}
async function addColumn(wrapper: ReturnType<typeof mount>, name = 'total', expression = 'amount * qty') {
  const json = wrapper.getComponent(FieldJson)
  await json.get('[data-json-add]').trigger('click'); await flushPromises()
  const texts = json.findAllComponents(FieldText)
  for (const [index, value] of ['name', 'label', 'type'].map((field, index) => [index, field === 'name' ? name : field === 'label' ? '合计' : 'number'] as const)) {
    const input = texts[index]!.get('input'); await input.setValue(value); await input.trigger('change')
  }
  const input = json.getComponent(FieldTextarea).get('textarea')
  await input.setValue(expression); await input.trigger('change'); await flushPromises()
  await json.get('[data-json-save-row]').trigger('click'); await flushPromises()
}

describe('native model computed column configuration', () => {
  it('preserves a stopped legacy formula through cancel, unrelated save and independent reopen until explicit removal', async () => {
    const {f, wrapper} = await setup()
    const expression = "$count('CustomersAlias')"
    await beginFields(wrapper); await addColumn(wrapper, 'total', expression)
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('旧子表聚合公式已停止本地统计并保留原文')
    expect(f.fileWrites).toHaveLength(1)
    const json = wrapper.getComponent(FieldJson)
    await json.get('.el-table__body tr').trigger('click')
    await json.get('[data-json-edit]').trigger('click'); await flushPromises()
    const input = json.getComponent(FieldTextarea).get('textarea')
    await input.setValue('amount * qty'); await input.trigger('change')
    await json.get('[data-json-cancel-row]').trigger('click'); await flushPromises()
    expect(json.text()).toContain(expression)
    await addColumn(wrapper, 'safeTotal', 'amount * qty')
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(2)
    const fresh = await f.open('A'), view = fresh.definitionDataSet!.getView('OrdersAlias')!
    await view.loadFromServer()
    expect(view.rows[0]?.['safeTotal']).toBe(21)
    expect(view.rows[0]?.['total']).toBeUndefined()
    expect(view.computedAggregateError?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
    expect(view.dataTable!.columns.find(column => column.name === 'total')?.computeExpression).toBe(expression)
    const currentJson = wrapper.getComponent(FieldJson)
    const legacyRow = currentJson.findAll('.el-table__body tr').find(row => row.text().includes(expression))!
    await legacyRow.trigger('click'); await flushPromises()
    await currentJson.get('[data-json-delete]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(3)
    const next = await f.open('A'), nextView = next.definitionDataSet!.getView('OrdersAlias')!
    await nextView.loadFromServer()
    expect(nextView.computedAggregateError).toBeNull()
    expect(nextView.rows[0]?.['safeTotal']).toBe(21)
    expect(nextView.dataTable!.columns.some(column => column.name === 'total')).toBe(false)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toEqual([])
  }, 15000)

  it('opens without writing, edits through the definition view and cancels only that view', async () => {
    const {f, dataSet, wrapper, pending} = await setup()
    expect(f.fileWrites).toEqual([])
    expect(wrapper.find('[data-action="initialize-table-columns"]').exists()).toBe(true)
    const json = await beginFields(wrapper)
    expect(json.props()).toMatchObject({field: 'configuration', valueFormat: 'native', valuePath: ['columns'], mode: 'rows', reorderable: true})
    const view = resolveDataViewKey(json.props('dataViewKey')!, dataSet)!
    await addColumn(wrapper)
    expect(view.getEditingRow(view.getPkKey(view.currentRow!)!)?.['configuration']).toHaveProperty('columns.0.computeExpression', 'amount * qty')
    expect(pending).toHaveBeenLastCalledWith(true)
    expect(f.fileWrites).toEqual([])
    await wrapper.get('[data-action="discard-table-columns"]').trigger('click'); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(wrapper.find('[data-action="initialize-table-columns"]').exists()).toBe(true)
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('preserves other configuration, saves columns and reopens both views with native computation', async () => {
    const {f, dataSet, wrapper, rows} = await setup()
    const before = JSON.parse(f.stored.get('A')!)
    const json = await beginFields(wrapper)
    const view = resolveDataViewKey(json.props('dataViewKey')!, dataSet)!, key = view.getPkKey(view.currentRow!)!
    const config = view.getEditingRow(key)?.['configuration']
    if (!isRecord(config)) throw new Error('Expected a native table configuration')
    view.updateEditingValue(key, 'configuration', {...config, columns: [{name: 'amount', required: true}], crudConfig: {timeout: 3000}})
    await flushPromises(); await addColumn(wrapper)
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('字段配置已保存并回读确认')
    expect(f.fileWrites).toHaveLength(1)
    expect(f.requests.filter(r => r.url.includes('BatchTableOperate'))).toEqual([])
    const stored = JSON.parse(f.stored.get('A')!)
    expect(stored.tables.CustomersAlias).toEqual(before.tables.CustomersAlias)
    expect(stored.tables.OrdersAlias.views).toEqual(before.tables.OrdersAlias.views)
    expect(stored.tables.OrdersAlias.columns).toEqual([{name: 'amount', required: true}, {name: 'total', label: '合计', type: 'number', computeExpression: 'amount * qty'}])
    expect(stored.tables.OrdersAlias.crudConfig).toEqual({timeout: 3000})
    const reopened = await f.open('A'), table = reopened.definitionDataSet!.getTable('OrdersAlias')!
    for (const id of ['default', 'shared']) {
      const output = table.getView(id)!
      expect((await output.loadFromServer()).success).toBe(true)
      expect(output.rows[0]?.['total']).toBe(21)
      expect(output.fieldAccess(output.rows[0]!, 'total').write).toBe('denied')
      expect(JSON.stringify(f.requests.at(-1)!.data)).not.toContain('total')
    }
    rows[0]!.amount = 9
    await table.getView('default')!.refresh()
    expect(table.getView('default')!.rows[0]?.['total']).toBe(27)
    const preview = await reopened.openPreview({tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders', viewId: 'shared'})
    try {
      await preview.query({context: {}})
      expect(preview.dataViewKey).toBe('A@Orders@shared')
      expect(preview.view.rows[0]?.['total']).toBe(27)
      expect(preview.view.fieldAccess(preview.view.rows[0]!, 'total').write).toBe('denied')
      expect(f.fileWrites).toHaveLength(1)
    } finally {preview.dispose()}
  })

  it.each([['amount', 'qty * 2', '重名'], ['total', '??invalid!!', '编译失败']])('rejects %s / %s before writing and retains edits', async (name, expression, error) => {
    const {f, dataSet, wrapper} = await setup()
    const json = await beginFields(wrapper)
    await addColumn(wrapper, name, expression)
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain(error)
    expect(f.fileWrites).toEqual([])
    const view = resolveDataViewKey(json.props('dataViewKey')!, dataSet)!
    expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
  })

  it('creates a missing binding with a default view without adding a DB field', async () => {
    const {f, wrapper} = await setup(true)
    await wrapper.get('[data-action="create-table-api-binding"]').trigger('click'); await flushPromises()
    await beginFields(wrapper); await addColumn(wrapper)
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('字段配置已保存并回读确认')
    const stored = JSON.parse(f.stored.get('A')!)
    expect(stored.tables.Orders).toMatchObject({modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}, columns: [{name: 'total', computeExpression: 'amount * qty'}]})
    expect(f.requests.filter(r => r.url.includes('BatchTableOperate'))).toEqual([])
  })

  it('cancels a formula edit and can delete the saved local definition', async () => {
    const {f, wrapper} = await setup()
    await beginFields(wrapper); await addColumn(wrapper)
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    const json = wrapper.getComponent(FieldJson)
    await json.get('.el-table__body tr').trigger('click')
    await json.get('[data-json-edit]').trigger('click'); await flushPromises()
    const input = json.getComponent(FieldTextarea).get('textarea')
    await input.setValue('amount + qty'); await input.trigger('change')
    await json.get('[data-json-cancel-row]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(json.text()).toContain('amount * qty')
    await json.get('[data-json-delete]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(2)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.some(c => c.name === 'total')).toBe(false)
  })

  it('refreshes a clean editor after another binding view saves, preserving the newer API config', async () => {
    const {dataSet, wrapper} = await setup()
    const other = dataSet.getView('DataTableBindingDefinition')!, row = other.rows.find(row => row['tableName'] === 'OrdersAlias')!
    const key = other.getPkKey(row)!, configuration = row['configuration']
    if (!isRecord(configuration)) throw new Error('Expected a native table configuration')
    other.updateEditingValue(key, 'configuration', {...configuration, crudConfig: {timeout: 3210}})
    expect((await dataSet.saveChanges({views: [{tableName: other.tableName, viewId: other.viewId}]})).success).toBe(true)
    await flushPromises()
    const json = await beginFields(wrapper), view = resolveDataViewKey(json.props('dataViewKey')!, dataSet)!
    expect(view.getEditingRow(view.getPkKey(view.currentRow!)!)?.['configuration']).toHaveProperty('crudConfig.timeout', 3210)
  })

  it('reports a failed post-save view refresh and retries reading without replaying the write', async () => {
    const {f, dataSet, wrapper} = await setup()
    const json = await beginFields(wrapper), view = resolveDataViewKey(json.props('dataViewKey')!, dataSet)!
    await addColumn(wrapper)
    vi.spyOn(view, 'loadFromServer').mockImplementationOnce(async () => {
      view.loadingError = new Error('读取中断')
      return {success: false, message: '读取中断'}
    })
    await wrapper.get('[data-action="save-table-columns"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('读取中断')
    expect(wrapper.text()).not.toContain('字段配置已保存并回读确认')
    expect(f.fileWrites).toHaveLength(1)
    await wrapper.findAll('button').find(button => button.text() === '重读字段配置')!.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(FieldJson).exists()).toBe(true)
    expect(f.fileWrites).toHaveLength(1)
  })
})
