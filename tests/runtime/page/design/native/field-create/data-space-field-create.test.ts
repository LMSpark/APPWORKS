import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {FieldText, FieldValueFunction, FilterValueFunctionDialog, PAGE_RUNTIME, RendererForm, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import DataSpaceFieldCreate from '@/views/features/data-platform/data-set-management/design/ui/node-panel/fields/create/DataSpaceFieldCreate.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import DataSpaceDesignPage from '@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'
import {createDynamicRouter} from '../../../../../../packages/spark-app/src/router/dynamic'

vi.mock('@/lowcode/data-space/lowcode-data-space-design', () => ({openLowcodeDataSpaceDesignSession: vi.fn()}))
const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
const runtimes: PageRuntime[] = []
beforeAll(() => registerAllRenderers())
beforeEach(() => {vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); runtimes.splice(0).forEach(runtime => runtime.dispose()); fixtures.splice(0).forEach(f => f.dispose()); vi.unstubAllGlobals()})
const fields = [
  {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: '', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
  {rowid: 'PARENT', dataModelId: 'M1', Name: 'parentId', AsName: '', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
]
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowFieldAdd: true, sourceFields: fields, ...options})
  fixtures.push(f); vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementation(f.open)
  return f
}
async function page() {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: DataSpaceDesignPage, componentMap: {'/data-space-design': DataSpaceDesignPage},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
      items: [{id: 'design', title: '数据空间设计', path: '/data-space-design', itemKind: 'system-page'}]})})
  await dynamic.registerRoutes()
  await router.push('/data-space-design?scenarioId=A')
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
  const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()],
    stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  wrappers.push(wrapper); await flushPromises()
  return wrapper
}
describe('computed field creation', () => {
  it.each(['formal', 'local'])('rejects standalone non-output creation colliding with a %s column', async kind => {
    const f = fixture({sourceFields: fields.map(row => row.rowid === 'PARENT' ? {...row, IsOutput: 0} : row)})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      columns: [{name: 'localTotal', type: 'number', computeExpression: '1'}], views: {default: {}}}}}))
    const session = await f.open('A'), owner = session.getFieldCreate('M1')
    owner.begin()
    for (const [key, value] of Object.entries({Name: 'newColumn', AsName: kind === 'formal' ? 'parentId' : 'localTotal', IsOutput: 0})) owner.input.updateEditingValue('draft', key, value)
    await expect(owner.save()).rejects.toThrow('冲突')
    expect(owner.getState().status).toBe('editing'); owner.cancel()
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it('binds the standalone function editor to its creation DataView and saves or cancels the same draft', async () => {
    const f = fixture(), session = await f.open('A')
    const runtime = new PageRuntime({pageId: 'field-create', scenarioIds: ['META'], loadScenario: async () => session.metadataDataSet})
    await runtime.load(); runtimes.push(runtime)
    const host = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'field-create-test'}); sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(DataSpaceFieldCreate, {session, modelId: 'M1', revision: 0})
    }})
    const wrapper = mount(host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {JsonTreeEditor: true}}})
    wrappers.push(wrapper); await flushPromises()
    const owner = session.getFieldCreate('M1')
    const edit = async () => {
      await wrapper.get('[data-action="create-field"]').trigger('click'); await flushPromises()
      const field = wrapper.getComponent(FieldValueFunction)
      expect(field.props('dataViewKey')).toBe(owner.getState().dataViewKey)
      expect(field.props('field')).toBe('ValueFun'); expect(field.props('modelValue')).toBeUndefined()
      await field.get('[data-function-open]').trigger('click'); await flushPromises()
      const dialog = field.getComponent(FilterValueFunctionDialog)
      dialog.vm.$emit('confirm', {Type: 'GetConstValue', Value: 0}); await flushPromises()
      dialog.vm.$emit('update:modelValue', false); await flushPromises()
      expect(owner.input.getEditingRow('draft')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":0}')
    }
    await edit()
    await wrapper.get('[data-action="cancel-field-create"]').trigger('click'); await flushPromises()
    expect(owner.input.rows).toEqual([]); expect(f.created.get('Base_DataModel_Field') ?? []).toEqual([])
    await edit(); owner.input.updateEditingValue('draft', 'Name', 'standardComputed')
    await wrapper.get('[data-action="save-field-create"]').trigger('click'); await flushPromises()
    expect(f.created.get('Base_DataModel_Field')).toContainEqual(expect.objectContaining({Name: 'standardComputed', ValueFun: '{"Type":"GetConstValue","Value":0}'}))
    expect(f.fileWrites).toEqual([])
  })
  it('opens a standard bound input view and cancels without a database or file write', async () => {
    const f = fixture(), wrapper = await page()
    const model = wrapper.findAll('[data-design-node]').find(item => item.text() === 'Orders')!
    await model.trigger('click'); await flushPromises()
    await wrapper.get('#tab-source').trigger('click'); await flushPromises()
    const create = wrapper.find('[data-action="create-field"]')
    expect(create.exists()).toBe(true)
    await create.trigger('click'); await flushPromises()
    const form = wrapper.findAllComponents(RendererForm).find(item => item.props('dataViewKey')?.includes('@FieldCreate_'))!
    expect(form.props('dataViewKey')).toMatch(/^META@FieldCreate_.*@default$/)
    expect(wrapper.findAllComponents(FieldText).some(item => item.props('field') === 'Name')).toBe(true)
    await new DOMWrapper(document.body).get('[data-action="cancel-field-create"]').trigger('click'); await flushPromises()
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
    expect(f.fileWrites).toEqual([])
  })
  async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
    const f = fixture(options), session = await f.open('A'), owner = session.getFieldCreate('M1')
    owner.begin()
    for (const [key, value] of Object.entries({Name: 'total', AsName: 'totalOutput', description: '计算结果', ValueFun: '{"Type":"GetConstValue","Value":0}'})) owner.input.updateEditingValue('draft', key, value)
    return {f, session, owner, fields: session.metadataDataSet.getView('Base_DataModel_Field', 'default')!,
      writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
  }
  it('creates through one original batch, rereads the exact field and reopens the target DataSet', async () => {
    const {f, owner, session, writes} = await setup()
    expect(session.hasPendingFieldEdits()).toBe(true)
    const id = await owner.save()
    expect(writes()).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toEqual([expect.objectContaining({rowid: id, dataSetId: 'A', dataModelId: 'M1', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1, ValueFun: '{"Type":"GetConstValue","Value":0}'})])
    expect(session.hasPendingFieldEdits()).toBe(false)
    expect(owner.input.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.some(field => field.name === 'totalOutput')).toBe(true)
  })
  it('uses formal add permission without borrowing existing row edit permission', async () => {
    const f = fixture({allowFieldAdd: false}), session = await f.open('A'), owner = session.getFieldCreate('M1')
    expect(() => owner.begin()).toThrow('不允许新增')
    expect(owner.input.rows).toEqual([])
  })
  it('preserves an empty alias through standalone save and runtime field projection', async () => {
    const {f, owner, writes} = await setup()
    owner.input.updateEditingValue('draft', 'AsName', '')
    const id = await owner.save()
    expect(writes()).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toContainEqual(expect.objectContaining({rowid: id, Name: 'total', AsName: ''}))
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.map(column => column.name)).toContain('total')
  })
  it.each(['formal', 'local'] as const)('rejects empty-alias collisions with %s outputs before standalone submission', async kind => {
    const {f, owner, writes} = await setup(kind === 'formal' ? {sourceFields: fields.map(field => field.rowid === 'PARENT' ? {...field, AsName: 'total'} : field)} : {})
    owner.cancel()
    if (kind === 'local') {
      const stored = JSON.parse(f.stored.get('A')!)
      stored.tables.OrdersAlias.columns = [{name: 'total', type: 'number', computeExpression: '1'}]
      f.stored.set('A', JSON.stringify(stored))
    }
    const session = await f.open('A'), next = session.getFieldCreate('M1')
    next.begin(); next.input.updateEditingValue('draft', 'Name', 'total')
    await expect(next.save()).rejects.toThrow(/模型列名称.*冲突/)
    expect(next.input.getEditingRow('draft')).toMatchObject({Name: 'total', AsName: ''})
    expect(writes()).toEqual([])
  })
  it.each([['Name', 'rowid'], ['AsName', 'rowid'], ['Name', ''], ['AsName', '_pk'], ['IsOutput', true], ['ValueFun', '{bad']])('preserves invalid %s input and submits nothing', async (key, value) => {
    const {owner, writes} = await setup()
    owner.input.updateEditingValue('draft', key, value)
    await expect(owner.save()).rejects.toThrow()
    expect(owner.input.getEditingRow('draft')?.[key]).toBe(value)
    expect(owner.getState().status).toBe('editing')
    expect(writes()).toEqual([])
  })
  it('rejects a collision with a saved local computed field', async () => {
    const {owner, f, writes} = await setup()
    owner.cancel()
    const saved = JSON.parse(f.stored.get('A')!)
    saved.tables.OrdersAlias.columns = [{name: 'totalOutput', type: 'number', computeExpression: '1'}]
    f.stored.set('A', JSON.stringify(saved))
    const session = await f.open('A'), next = session.getFieldCreate('M1'); next.begin()
    for (const [key, value] of Object.entries({Name: 'total', AsName: 'totalOutput'})) next.input.updateEditingValue('draft', key, value)
    await expect(next.save()).rejects.toThrow('本地计算字段冲突')
    expect(writes()).toEqual([])
  })
  it.each(['draft', 'scope', 'metadata', 'file'])('rejects stale %s during formal validation without writing', async kind => {
    const {f, owner, writes} = await setup(), release = f.holdDefinitionRead()
    const saving = owner.save(); const rejected = expect(saving).rejects.toThrow()
    await flushPromises()
    if (kind === 'draft') owner.input.updateEditingValue('draft', 'Name', 'later')
    if (kind === 'scope') f.invalidate()
    if (kind === 'metadata') f.setModelValues({Name: 'Renamed'})
    if (kind === 'file') f.stored.set('A', '{"scenarioId":"A","tables":{}}')
    release(); await rejected
    expect(writes()).toEqual([])
  })
  it('keeps unrelated field edits and blocks creation before staging', async () => {
    const {owner, fields, writes} = await setup()
    fields.updateEditingValue('PK', 'description', 'other draft')
    await expect(owner.save()).rejects.toThrow('其他模型或字段草稿')
    expect(fields.getEditingPatch('PK')).toEqual({description: 'other draft'})
    expect(fields.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(writes()).toEqual([])
  })
  it.each([{}, {omitFieldReceipt: true}])('verifies an unknown create without replay: %j', async options => {
    const {f, owner, writes} = await setup(options)
    if (!options.omitFieldReceipt) f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.save()).rejects.toThrow('不能重复提交')
    expect(() => owner.cancel()).toThrow('先核验')
    const id = await owner.verify()
    expect(id).toBe(f.created.get('Base_DataModel_Field')?.[0]?.['rowid'])
    expect(owner.getState().status).toBe('idle')
    expect(writes()).toHaveLength(1)
  })
  it('retains missing readback as a difference, explicitly accepts it and never retries', async () => {
    const {owner, writes} = await setup({omitFieldWrite: true})
    await expect(owner.save()).rejects.toThrow('未读取到新增字段')
    expect(owner.getState().status).toBe('readback')
    expect(await owner.verify()).toBeNull()
    expect(owner.getState().status).toBe('different')
    owner.acceptCurrent()
    expect(owner.getState().pending).toBe(false)
    expect(writes()).toHaveLength(1)
  })
  it('cleans only its staged new row after interruption before dispatch', async () => {
    const {fields, owner, writes} = await setup(), add = fields.addRow.bind(fields)
    vi.spyOn(fields, 'addRow').mockImplementationOnce(async value => {await add(value); throw new Error('staging interrupted')})
    await expect(owner.save()).rejects.toThrow('staging interrupted')
    expect(fields.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(owner.getState().status).toBe('editing')
    expect(owner.input.getEditingRow('draft')?.['Name']).toBe('total')
    expect(writes()).toEqual([])
  })
  it('loses current add permission while formal validation is pending', async () => {
    const {f, fields, owner, writes} = await setup(), release = f.holdDefinitionRead()
    const saving = owner.save(); const rejected = expect(saving).rejects.toThrow('权限已变化')
    await flushPromises(); f.denyFieldAdd(); await fields.loadFromServer({allPages: true})
    release(); await rejected
    expect(writes()).toEqual([])
    expect(owner.getState().status).toBe('editing')
  })
  it('retries a failed readback without reissuing creation', async () => {
    const {f, owner, writes} = await setup(), release = f.holdModelResponse()
    const saving = owner.save(); const rejected = expect(saving).rejects.toThrow()
    await flushPromises(); f.failNextFieldRead(); release(); await rejected
    expect(owner.getState().status).toBe('readback')
    expect(await owner.verify()).toBeTypeOf('string')
    expect(writes()).toHaveLength(1)
  })
  it('keeps targets independent and supports a model with no fields', async () => {
    const {f, owner} = await setup({missing: true, sourceFields: []})
    const other = await f.open('B'), otherOwner = other.getFieldCreate('M1')
    otherOwner.begin()
    const id = await owner.save()
    expect(f.created.get('Base_DataModel_Field')?.[0]).toMatchObject({rowid: id, dataSetId: 'A'})
    expect(other.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(otherOwner.getState().status).toBe('editing')
    expect(otherOwner.input.getEditingRow('draft')?.['Name']).toBe('')
    otherOwner.cancel()
  })
  it('edits via standard child bindings and saves from the real page', async () => {
    const f = fixture(), wrapper = await page()
    await wrapper.findAll('[data-design-node]').find(item => item.text() === 'Orders')!.trigger('click'); await flushPromises()
    await wrapper.get('#tab-source').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="create-field"]').trigger('click'); await flushPromises()
    const form = wrapper.findAllComponents(RendererForm).find(item => item.props('dataViewKey')?.includes('@FieldCreate_'))!
    expect(form.findAllComponents(FieldText).map(item => item.props('field'))).toEqual(['Name'])
    await form.getComponent(FieldText).get('input').setValue('fromUi')
    await flushPromises()
    expect(f.sessions[0]!.getFieldCreate('M1', 'modelFields').input.getEditingRow('draft')).toMatchObject({Name: 'fromUi', AsName: ''})
    await new DOMWrapper(document.body).get('[data-action="save-field-create"]').trigger('click'); await flushPromises()
    expect(f.created.get('Base_DataModel_Field')).toBeUndefined()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('批量保存')
    expect(f.created.get('Base_DataModel_Field')).toEqual([expect.objectContaining({Name: 'fromUi', ValueFun: ''})])
    expect(f.fileWrites).toEqual([])
  })
  it('offers creation from the empty fields tree node and guards navigation while the draft is open', async () => {
    const f = fixture({missing: true, sourceFields: []}), wrapper = await page()
    const model = wrapper.findAll('[data-design-node]').find(item => item.text() === 'Orders')!
    const arrow = model.element.closest('.el-tree-node__content')?.querySelector('.el-tree-node__expand-icon')
    expect(arrow).toBeTruthy()
    await new DOMWrapper(arrow!).trigger('click'); await flushPromises()
    await wrapper.findAll('[data-design-node]').find(item => item.text() === '字段（0）')!.trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="create-field"]').exists()).toBe(true)
    await wrapper.get('[data-action="create-field"]').trigger('click'); await flushPromises()
    await wrapper.findAll('[data-design-node]').find(item => item.text() === '输入参数')!.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('请先保存、取消或核验当前字段配置')
    expect(f.sessions[0]!.hasPendingFieldEdits()).toBe(true)
    await wrapper.get('[data-action="cancel-field-create"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.hasPendingFieldEdits()).toBe(false)
  })
})

