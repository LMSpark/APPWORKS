import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, ref} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {FieldCheckbox, FieldTextarea, registerAllRenderers, Spark, PAGE_RUNTIME, DATA_ROW, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import DataSpaceFieldEditor from '@/views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceFieldEditor.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const originalStubs = config.global.stubs
const cleanups: Array<() => void> = []
beforeAll(() => registerAllRenderers())
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
async function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const f = dataSpacePageFixture({allowFieldEdit: true, editableFieldProperties: ['description', 'IsOutput', 'Order', 'OrderType', 'Group'], sourceFields: [
    {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    {rowid: 'SYS', dataModelId: 'M1', Name: ' ReportID ', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, description: '报表', OrderType: 'ascending', Order: 3, Group: 2},
  ], ...options})
  cleanups.push(() => f.dispose())
  const session = await f.open('A'), fields = await session.loadModelFields('M1')
  const runtime = new PageRuntime({pageId: 'display-test', scenarioIds: [session.metadataDataSet.scenarioId!], loadScenario: async () => session.metadataDataSet})
  await runtime.load(); cleanups.push(() => runtime.dispose())
  const Host = defineComponent({setup() {
    const revision = ref(0)
    const {sparkProvide} = useSparkComponent({type: 'display-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    sparkProvide(DATA_ROW, {rowid: 'M1', Name: '外层模型'})
    const changed = () => {revision.value++}
    const unsubscribe = session.metadataDataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed})
    onBeforeUnmount(unsubscribe)
    return () => h(DataSpaceFieldEditor, {session, fieldId: 'F1', fieldIds: ['PK', 'F1', 'SYS'], viewId: 'modelFields', revision: revision.value,
      onChanged: () => {revision.value++}})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  const toggle = async (field: string, value: boolean) => {
    const input = wrapper.findAllComponents(FieldCheckbox).find(item => item.props('field') === field)
    expect(input, `standard bound checkbox ${field}`).toBeDefined()
    expect(input!.get('input[type="checkbox"]').attributes('disabled')).toBeUndefined()
    await input!.get('input[type="checkbox"]').setValue(value); await flushPromises()
  }
  return {f, session, fields, wrapper, toggle}
}

describe('model field presentation controls', () => {
  it('edits output with row-bound numeric checkboxes, preserves primary output and saves through the existing owner', async () => {
    const {f, fields, wrapper} = await fixture()
    const rows = wrapper.findAll('tbody tr')
    const primary = rows.find(row => row.text().includes('rowid'))!
    const ordinary = rows.find(row => row.text().includes('amount'))!
    expect(primary.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    const output = ordinary.get('input[type="checkbox"]')
    expect(output.attributes('disabled')).toBeUndefined()
    expect((output.element as HTMLInputElement).checked).toBe(true)
    await output.setValue(false); await flushPromises()
    expect(fields.getEditingPatch('F1')).toEqual({IsOutput: 0})
    expect(fields.hasEditingChanges('PK')).toBe(false)
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    const reopened = await f.open('A')
    const stored = reopened.metadataDataSet.getView('Base_DataModel_Field')!
    expect(stored.rows.find(row => row['rowid'] === 'F1')?.['IsOutput']).toBe(0)
    expect(stored.rows.find(row => row['rowid'] === 'PK')?.['IsOutput']).toBe(1)
  })

  it('does not turn missing output permissions into a writable checkbox', async () => {
    const {fields, wrapper} = await fixture({editableFieldProperties: ['description']})
    const row = wrapper.findAll('tbody tr').find(item => item.text().includes('amount'))!
    expect(row.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(fields.hasEditingChanges()).toBe(false)
  })

  it('uses inline field controls and a bounded editor for the same selected field without a second draft', async () => {
    const {f, session, fields, wrapper} = await fixture()
    const row = wrapper.findAll('tbody tr').find(item => item.text().includes('amount'))!
    await row.trigger('click'); await flushPromises()
    const description = row.findAll('td')[1]!
    await description.get('.field-table-value').trigger('dblclick'); await flushPromises()
    const input = description.get('input')
    expect(input.attributes('disabled')).toBeUndefined()
    await input.setValue('表格草稿'); await input.trigger('focusout'); await flushPromises()
    expect(fields.getEditingPatch('F1')).toMatchObject({description: '表格草稿'})
    expect(wrapper.find('[data-field-property="description"]').exists()).toBe(false)
    await wrapper.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    const property = wrapper.findAllComponents(FieldTextarea).find(item => item.props('field') === 'description')!
    expect((property.get('textarea').element as HTMLTextAreaElement).value).toBe('表格草稿')
    await property.get('textarea').setValue('窗口草稿'); await flushPromises()
    expect(fields.getEditingPatch('F1')).toMatchObject({description: '窗口草稿'})
    await new DOMWrapper(document.body).get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(wrapper.get('.model-fields-table').text()).toContain('窗口草稿')
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(item => item['rowid'] === 'F1')?.['description']).toBe('窗口草稿')
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')).toBe(fields)
  })

  it('keeps sort and group numeric values in the same staged row and cancels them together', async () => {
    const {fields, wrapper, toggle} = await fixture()
    await toggle('showSortGroup', true)
    const row = wrapper.findAll('tbody tr').find(item => item.text().includes('amount'))!
    await row.trigger('click'); await flushPromises()
    await row.findAll('td')[7]!.get('.field-table-value').trigger('dblclick'); await flushPromises()
    const input = row.findAll('td')[7]!.get('input')
    expect(input.attributes('disabled')).toBeUndefined()
    await input.setValue('6'); await input.trigger('change'); await flushPromises()
    expect(fields.getEditingPatch('F1')).toMatchObject({Order: 6})
    await input.trigger('focusout'); await flushPromises()
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false)
  })

  it('does not classify or expose a system name hidden by the formal field permission', async () => {
    const {wrapper, toggle} = await fixture({hiddenFieldProperties: ['Name']})
    expect(wrapper.find('.data-space-system-field').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('ReportID')
    await toggle('showSystemFields', true)
    expect(wrapper.find('.data-space-system-field').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('ReportID')
  })

  it('keeps the hidden current field draft, selection and query while toggling system fields and sort/group children', async () => {
    const {f, fields, wrapper, toggle} = await fixture()
    const requests = f.requests.length, originalRows = [...fields.rows]
    expect(wrapper.find('thead input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.get('.model-fields-table').classes()).toContain('hide-system-fields')
    expect(wrapper.findAll('th').map(node => node.text())).not.toContain('顺序')
    await toggle('showSystemFields', true); await toggle('showSortGroup', true)
    expect(wrapper.findAll('th').map(node => node.text())).toEqual(expect.arrayContaining(['排序', '类型', '顺序', '分组标记']))
    const row = wrapper.findAll('tbody tr').find(node => node.text().includes('ReportID'))!
    expect(row.classes()).toContain('data-space-system-field')
    await row.trigger('click'); await flushPromises()
    fields.setSelectedRows([fields.rows.find(item => item['rowid'] === 'SYS')!])
    fields.updateEditingValue('SYS', 'description', '系统字段草稿')
    fields.updateEditingValue('SYS', 'Order', 7); await flushPromises()
    await toggle('showSystemFields', false); await toggle('showSortGroup', false)
    expect(fields.currentRow?.['rowid']).toBe('SYS')
    expect(fields.selectedRows.map(item => item['rowid'])).toContain('SYS')
    expect(fields.getEditingPatch('SYS')).toMatchObject({description: '系统字段草稿', Order: 7})
    expect(fields.rows.every((item, index) => item === originalRows[index])).toBe(true)
    expect(f.requests).toHaveLength(requests)
    expect(wrapper.text()).toContain('当前字段在列表中已隐藏')
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('批量保存')
    const restored = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!.rows.find(item => item['rowid'] === 'SYS')!
    expect(restored).toMatchObject({description: '系统字段草稿', OrderType: 'ascending', Order: 7, Group: 2})
  })

  it('includes hidden fields in output inversion and releases local controls without creating definition drafts', async () => {
    const {session, fields, wrapper, toggle} = await fixture()
    expect(wrapper.find('[aria-label="字段显示设置"]').exists()).toBe(true)
    const controls = Object.keys(session.metadataDataSet.tables).filter(name => name.startsWith('FieldDisplay_'))
    expect(controls).toHaveLength(1)
    await toggle('showSystemFields', true); await toggle('showSystemFields', false)
    const controlsView = session.metadataDataSet.getView(controls[0]!)!
    expect(controlsView.hasEditingChanges()).toBe(false)
    expect(controlsView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(session.hasPendingFieldEdits()).toBe(false)
    await wrapper.get('[data-action="invert-field-output"]').trigger('click'); await flushPromises()
    expect(fields.getEditingRow('SYS')?.['IsOutput']).toBe(0)
    expect(fields.getEditingRow('F1')?.['IsOutput']).toBe(0)
    expect(fields.getEditingRow('PK')?.['IsOutput']).toBe(1)
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false)
    wrapper.unmount()
    expect(session.metadataDataSet.getTable(controls[0]!)).toBeUndefined()
  })
})
