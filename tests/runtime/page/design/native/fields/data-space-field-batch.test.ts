import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElTree, ElButton} from 'element-plus'
import {FieldTextarea, RendererButton, RendererForm, RendererTable, registerAllRenderers, Spark} from '@spark-appworks/spark-component'
import DataSpaceDesignPage from '@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import {LowcodeDataSpaceFieldEdit} from '@/lowcode/data-space/model-source/lowcode-data-space-field-edit'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import {createDynamicRouter} from '../../../../../../packages/spark-app/src/router/dynamic'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
vi.mock('@/lowcode/data-space/lowcode-data-space-design', () => ({openLowcodeDataSpaceDesignSession: vi.fn()}))
beforeAll(() => registerAllRenderers())
beforeEach(() => {vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); fixtures.splice(0).forEach(f => f.dispose()); vi.unstubAllGlobals()})
const records = [
  {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
  {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, AsName: 'amount', description: '金额', ValueFun: ''},
  {rowid: 'F3', dataModelId: 'M1', Name: 'price', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, AsName: 'price', description: '单价', ValueFun: ''},
  {rowid: 'OTHER', dataModelId: 'M2', Name: 'name', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
]
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowSourceEdit: true, allowFieldEdit: true, sourceFields: records,
    editableFieldProperties: ['description', 'AsName', 'ValueFun', 'IsOutput', 'Order', 'Group'], ...options})
  fixtures.push(f)
  const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
  const owners = ['F1', 'F3'].map(id => session.getFieldEdit(id))
  return {f, session, fields, owners, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('model field batch maintenance', () => {
  it('saves two edited fields in one signed request and restores their values on independent reopen', async () => {
    const {f, fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'description', '总金额')
    fields.updateEditingValue('F3', 'description', '含税单价')
    await LowcodeDataSpaceFieldEdit.saveBatch(owners)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: {
      Added: [], Deleted: [], Changed: [
        expect.objectContaining({rowid: 'F1', description: '总金额', lingma_sys_key: 'token-A-F1'}),
        expect.objectContaining({rowid: 'F3', description: '含税单价', lingma_sys_key: 'token-A-F3'}),
      ],
    }})])
    expect(owners.map(owner => owner.getState())).toEqual([{status: 'idle', pending: false}, {status: 'idle', pending: false}])
    const reopened = await f.open('A'), loaded = reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(loaded.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('总金额')
    expect(loaded.rows.find(row => row['rowid'] === 'F3')?.['description']).toBe('含税单价')
  })

  it('validates final output names together, permitting an unused alias swap without an invalid intermediate save', async () => {
    const {f, fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'AsName', 'price'); fields.updateEditingValue('F3', 'AsName', 'amount')
    await LowcodeDataSpaceFieldEdit.saveBatch(owners)
    expect(writes()).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.filter(row => ['F1', 'F3'].includes(String(row['rowid']))).map(row => row['AsName'])).toEqual(['price', 'amount'])
  })

  it('rejects a collision created by two simultaneous aliases without applying or submitting either row', async () => {
    const {fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'AsName', 'same'); fields.updateEditingValue('F3', 'AsName', 'same')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners)).rejects.toThrow()
    expect(writes()).toHaveLength(0)
    expect(fields.getEditingPatch('F1')?.['AsName']).toBe('same'); expect(fields.getEditingPatch('F3')?.['AsName']).toBe('same')
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('saves ordinary attributes while preserving drafts outside the selected model', async () => {
    const {fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'description', 'draft'); fields.updateEditingValue('OTHER', 'description', 'keep')
    await LowcodeDataSpaceFieldEdit.saveBatch(owners)
    expect(fields.getEditingPatch('OTHER')?.['description']).toBe('keep'); expect(writes()).toHaveLength(1)
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('draft')
    expect(writes()[0]?.data).toMatchObject([{CrudModel: {Changed: [{rowid: 'F1', description: 'draft'}]}}])
  })

  it('keeps every submitted owner unresolved after a lost response and verifies once without replay', async () => {
    const {f, fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'description', 'first'); fields.updateEditingValue('F3', 'description', 'second')
    f.loseNextResponse()
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners)).rejects.toThrow()
    expect(owners.map(owner => owner.getState().status)).toEqual(['unknown', 'unknown'])
    await expect(owners[0]!.save()).rejects.toThrow()
    await LowcodeDataSpaceFieldEdit.reloadBatch(owners, true)
    expect(writes()).toHaveLength(1)
    expect(owners.map(owner => owner.getState().status)).toEqual(['idle', 'idle'])
    expect(fields.rows.filter(row => ['F1', 'F3'].includes(String(row['rowid']))).map(row => row['description'])).toEqual(['first', 'second'])
  })

  it('rechecks every changed field permission and sends none when one target is denied', async () => {
    const {f, fields, owners, writes} = await setup()
    f.denyFieldProperty('description'); await fields.loadFromServer({allPages: true})
    fields.updateEditingValue('F1', 'Order', 2); fields.updateEditingValue('F3', 'description', 'denied')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners)).rejects.toThrow('不可写')
    expect(writes()).toHaveLength(0); expect(fields.getEditingPatch('F1')?.['Order']).toBe(2)
  })

  it('refuses scope changes and new edits arriving during whole-batch output validation', async () => {
    const {f, fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'AsName', 'total'); fields.updateEditingValue('F3', 'AsName', 'unit')
    const release = f.holdDefinitionRead(), outcome = LowcodeDataSpaceFieldEdit.saveBatch(owners).catch((cause: unknown) => cause)
    fields.updateEditingValue('F3', 'AsName', 'later'); release()
    expect(await outcome).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
    expect(fields.getEditingPatch('F3')?.['AsName']).toBe('later')
    f.invalidate(); await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('rejects mixed models and query instances before applying any draft', async () => {
    const {f, session, fields, owners, writes} = await setup()
    fields.updateEditingValue('F1', 'description', 'keep')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch([owners[0]!, session.getFieldEdit('OTHER')])).rejects.toThrow('同一查询视图和模型')
    const other = await f.open('B')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch([owners[0]!, other.getFieldEdit('F3')])).rejects.toThrow('同一查询视图和模型')
    expect(writes()).toHaveLength(0); expect(fields.getEditingPatch('F1')?.['description']).toBe('keep')
  })

  it('keeps both fields pending verification when a successful receipt disagrees with readback', async () => {
    const {fields, owners, writes} = await setup({omitFieldProperties: ['description']})
    fields.updateEditingValue('F1', 'description', 'not stored'); fields.updateEditingValue('F3', 'Order', 4)
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners)).rejects.toThrow('回读与提交值不一致')
    expect(owners.map(owner => owner.getState().status)).toEqual(['readback', 'readback'])
    await LowcodeDataSpaceFieldEdit.reloadBatch(owners, false)
    expect(writes()).toHaveLength(1)
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('金额')
    expect(fields.rows.find(row => row['rowid'] === 'F3')?.['Order']).toBe(4)
  })

  it('keeps existing references checked against each original output in a combined rename', async () => {
    const {f, fields, owners, writes} = await setup()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.default.valueField = 'amount'
    f.stored.set('A', JSON.stringify(config))
    const current = await f.open('A'), currentFields = current.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    currentFields.updateEditingValue('F1', 'AsName', 'price'); currentFields.updateEditingValue('F3', 'AsName', 'amount')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(['F1', 'F3'].map(id => current.getFieldEdit(id)))).rejects.toThrow('valueField')
    expect(writes()).toHaveLength(0); expect(fields.hasEditingChanges()).toBe(false)
    expect(owners.every(owner => owner.getState().status === 'idle')).toBe(true)
  })

  it('edits a value function with sibling drafts and saves the complete batch', async () => {
    const {fields, owners, writes} = await setup()
    fields.updateEditingValue('F3', 'description', 'sibling draft')
    owners[0]!.stageValueFunction('{"Type":"GetConstValue","Value":"fixed"}', ['F1', 'F3'])
    await LowcodeDataSpaceFieldEdit.saveBatch(owners)
    expect(writes()).toHaveLength(1)
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":"fixed"}')
  })

  it('edits successive model fields through the same DataView, saves once and releases the page guard', async () => {
    const {f, session, writes} = await setup()
    vi.mocked(openLowcodeDataSpaceDesignSession).mockResolvedValue(session)
    const router = createRouter({history: createMemoryHistory(), routes: []})
    const dynamic = createDynamicRouter({router, pageComponent: DataSpaceDesignPage, componentMap: {'/data-space-design': DataSpaceDesignPage},
      loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
        items: [{id: 'design', title: '数据空间设计', path: '/data-space-design', itemKind: 'system-page'}]})})
    await dynamic.registerRoutes(); await router.push('/data-space-design?scenarioId=A')
    const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
    const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton}}})
    wrappers.push(wrapper); await flushPromises()
    wrapper.getComponent(ElTree).vm.getNode(JSON.stringify(['Base_DataModel', 'M1'])).expand()
    await flushPromises()
    const group = wrapper.findAll('[data-design-node]').find(node => node.attributes('data-design-node') === `${JSON.stringify(['Base_DataModel', 'M1'])}:fields`)!
    await group.trigger('click'); await flushPromises()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const table = wrapper.getComponent(RendererTable)
    const selectField = async (id: string) => {
      table.getComponent({name: 'GlobalElTableStub'}).vm.$emit('current-change', fields.rows.find(row => row['rowid'] === id)); await flushPromises()
    }
    const change = async (id: string, value: string) => {
      await selectField(id)
      await wrapper.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
      expect(wrapper.findAllComponents(RendererForm).filter(form => form.findComponent(FieldTextarea).exists()).every(form => form.props('dataSource') === undefined
        && form.props('dataViewKey') === `${session.metadataDataSet.scenarioId}@Base_DataModel_Field@modelFields`)).toBe(true)
      const field = wrapper.findAllComponents(RendererForm).flatMap(form => form.findAllComponents(FieldTextarea)).find(component => component.props('field') === 'description')!
      expect(field.props('modelValue')).toBeUndefined()
      await field.get('textarea').setValue(value); await flushPromises()
      const confirm = wrapper.findAllComponents(RendererButton).find(button => button.attributes('data-action') === 'close-field-editor')!
      await confirm.get('button').trigger('click'); await flushPromises()
    }
    await change('F1', '批量金额'); await change('F3', '批量单价')
    expect(fields.getEditingPatch('F1')?.['description']).toBe('批量金额')
    expect(fields.getEditingPatch('F3')?.['description']).toBe('批量单价')
    expect(wrapper.findAll('button').find(button => button.text() === '重新打开')?.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(writes()).toHaveLength(1)
    expect(wrapper.text()).toContain('批量保存')
    expect(wrapper.findAll('button').find(button => button.text() === '重新打开')?.attributes('disabled')).toBeUndefined()
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('批量金额')
    await change('F1', 'cancel first'); await change('F3', 'cancel second')
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toHaveLength(1)
    expect(wrapper.findAll('button').find(button => button.text() === '重新打开')?.attributes('disabled')).toBeUndefined()
    await change('F1', 'unknown first'); await change('F3', 'unknown second')
    f.loseNextResponse(); await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="verify-field"]').exists()).toBe(true)
    const previous = fields.currentRow?.['rowid']
    await selectField('F1'); expect(fields.currentRow?.['rowid']).toBe(previous)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(writes()).toHaveLength(2)
    await selectField('F1'); expect(fields.currentRow?.['rowid']).toBe('F1')
  })
})
