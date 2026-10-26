import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSet, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { BlueprintWorkspaceDataView } from '@/views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview'

const api = vi.hoisted(() => ({
  listFileVersions: vi.fn(), upload: vi.fn(),
  readRequestScope: vi.fn(() => ({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })),
}))
vi.doMock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: {}, lowcodeApi: {
    readRequestScope: api.readRequestScope,
    design: { listFileVersions: api.listFileVersions },
  },
}))
const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.doMock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: runtime.load}))
vi.doMock('@spark-appworks/spark-lowcode-api', async importOriginal => ({
  ...await importOriginal<typeof import('@spark-appworks/spark-lowcode-api')>(),
  LowcodeDesignFileUpload: class { uploadTextVersion = api.upload },
}))
const {default: BlueprintWorkspace} = await import('@/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue')

const Slot = defineComponent({ template: '<div><slot name="extra" /><slot /></div>' })
const Delivery = defineComponent({ props: ['canPublish'], emits: ['save'], template: '<button @click="$emit(\'save\')">交付</button>' })
const Planning = defineComponent({props:['modelValue','fieldAccess'],emits:['update:modelValue'],template:'<div v-if="fieldAccess.read"><input data-testid="planning" :disabled="!fieldAccess.write" :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)"></div><span v-else>无读取权限</span>'})
const scenarioId = '7AB874097A1E8711A42FD845939A6E05'
const initialRow = (target = 'cfg:APP-A/tool-A', versionId = 'rule=1;script=1;style=1'): DataRow => ({rowid: 'node-A', SysId: 'APP-A',
  memo: 'planning', htmlDesc: '', conid: 'scene-A', NavigationUrl: target, VersionId: versionId, DifficultyFactor: 1,
  Manhour: 2, Number: 3, Sum: 6, Total: 6, personCharge: '', status: '', IsShowAtNav: 0, NavigationType: 0})
function createDataSet(options: {target?: string; versionId?: string; deniedWrite?: string; readbackVersion?: string} = {}) {
  let persisted = initialRow(options.target, options.versionId)
  const names = Object.keys(persisted)
  const context = (rows: DataRow[]) => ({rows, total: rows.length, countReported: true,
    assertIdentity(identity: {scenarioId: string; metaName: string}) {if (identity.scenarioId !== scenarioId || identity.metaName !== 'Base_NavigationInfo') throw new Error('identity mismatch')},
    rowKey: (item: DataRow) => item['rowid'],
    fieldAccess: (key: unknown, field: string) => {const item = rows.find(candidate => candidate['rowid'] === key); const visible = !!item && Object.hasOwn(item, field)
      const writable = visible && field !== options.deniedWrite
      return {read: visible ? 'visible' as const : 'invisible' as const, write: writable ? 'allowed' as const : 'denied' as const,
        component: !visible ? 'hidden' as const : writable ? 'editable' as const : 'readonly' as const, required: false, writeMode: writable ? 'editable' as const : 'readonly' as const}},
    readFieldAccess: (item: DataRow, field: string) => Object.hasOwn(item, field) ? 'visible' as const : 'invisible' as const,
    addActionState: () => 'hidden' as const, editActionState: () => 'enabled' as const, deleteActionState: () => 'hidden' as const,
    createChildActionState: () => 'hidden' as const, viewActionState: () => 'enabled' as const})
  const dataSet = DataSet.fromJson({scenarioId, tables: {Base_NavigationInfo: {modelBinding: {modelId: `${scenarioId}p000`, modelName: 'Base_NavigationInfo'},
    columns: names.map(name => ({name, type: typeof persisted[name] === 'number' ? 'number' : 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false, fieldProjection: names.map((name, index) => ({fieldId: `F${index}`, source: 'resource', resourceFieldId: `F${index}`,
      resourceField: name, viewField: name, type: typeof persisted[name] === 'number' ? 'number' : 'string', label: name, output: true,
      sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: name === 'rowid', value: '', valueFunction: '', expression: ''}))}}}}})
  const view = dataSet.getView('Base_NavigationInfo')!
  view.bindQueryExecutor({queryColumns: current => current.columns, executeQuery: async () => context([structuredClone(persisted)]),
    save: async command => command.changes.map(change => {
      const changed = [...(change.changes.changed ?? [])]
      if (changed[0]) persisted = {...persisted, ...changed[0], ...(options.readbackVersion ? {VersionId: options.readbackVersion} : {})}
      return {metaName: 'Base_NavigationInfo', added: [], changed, deleted: [],
        changedFields: changed.map(item => Object.keys(item)), context: context([structuredClone(persisted)])}
    })})
  return dataSet
}
function setup(options: Parameters<typeof createDataSet>[0] = {}) {
  const dataSet = createDataSet(options)
  runtime.load.mockResolvedValue(dataSet)
  const state = {
    selectedNode: ref<{nodeId: string} | null>({ nodeId: 'node-A' }), activePageId: ref('tool-A'), projectId: 'APP-A', addStatus: vi.fn(),
    registerExternalDataViewSession: vi.fn((_session: {isDirty: () => boolean; save: () => Promise<void>}) => () => {}), notifyExternalDataViewChanged: vi.fn(),
    project: { readPageFileText: vi.fn((name: string) => name === 'script.js' ? '' : `text:${name}`) },
  }
  const wrapper = mount({ ...BlueprintWorkspace, props: ['state'] }, {
    props: { state }, global: {
      directives: { loading: () => {} }, stubs: {
        ElTabs: Slot, ElTabPane: Slot, ElEmpty: true, PlanningPane: Planning, PrototypePane: true,
        DataPlanningPane: true, EstimatePane: true, DeliveryPane: Delivery, ReleasePane: true,
      },
    },
  })
  return { state, wrapper, dataSet }
}

describe('BlueprintWorkspace file delivery', () => {
  beforeEach(() => {
    api.readRequestScope.mockReset().mockReturnValue({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })
    runtime.load.mockReset()
    api.listFileVersions.mockReset().mockResolvedValue([{ version: 7, fileName: '7__rule.json', lastModified: null }])
    api.upload.mockReset().mockResolvedValue({ state: 'success' })
  })

  it('allocates from actual snapshots and confirms independent references, preserving empty text', async () => {
    const { wrapper, dataSet } = setup(); await flushPromises()
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(true)
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.upload.mock.calls.map(call => call[0])).toEqual([
      { customPath: 'APP-A/tool-A', fileName: '8__rule.json', text: 'text:rule.json' },
      { customPath: 'APP-A/tool-A', fileName: '8__script.js', text: '' },
      { customPath: 'APP-A/tool-A', fileName: '8__style.css', text: 'text:style.css' },
    ])
    expect(api.upload).toHaveBeenCalledTimes(3)
    expect(dataSet.getView('Base_NavigationInfo')?.rows[0]?.['VersionId']).toBe('rule=8;script=8;style=8')
    wrapper.unmount()
  })

  it('reports the confirmed snapshot when its reference fails without claiming rollback', async () => {
    const { wrapper, state, dataSet } = setup()
    vi.spyOn(dataSet, 'saveChanges').mockRejectedValueOnce(new Error('pointer rejected'))
    await flushPromises()
    const changedBeforeDelivery = state.notifyExternalDataViewChanged.mock.calls.length
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.upload).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json；已确认发布引用：无'), 'error')
    expect(state.notifyExternalDataViewChanged).toHaveBeenCalledTimes(changedBeforeDelivery + 1)
    wrapper.unmount()
  })

  it.each(['cfg:APP-B/tool-A', 'cfg:APP-A/../APP-B/tool-A'])('rejects a path outside the current application: %s', async target => {
    const { wrapper } = setup({target}); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.upload).not.toHaveBeenCalled()
    expect(api.listFileVersions).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops after a target switch without publishing the uploaded snapshot', async () => {
    let finish!: () => void
    api.upload.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    state.selectedNode.value = { nodeId: 'node-B' }; await flushPromises()
    finish(); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('preserves a confirmed snapshot but stops publishing edits made during upload', async () => {
    let finish!: () => void
    api.upload.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    state.project.readPageFileText.mockReturnValue('edited')
    finish(); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('does not publish an unconfirmed snapshot upload', async () => {
    api.upload.mockRejectedValueOnce(new Error('snapshot readback changed'))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已尝试快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('stops when the published reference readback disagrees with the requested pointer', async () => {
    const { wrapper, state } = setup({readbackVersion: 'rule=99;script=1;style=1'}); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.upload).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('字段 VersionId 保存后读回不一致'), 'error')
    wrapper.unmount()
  })

  it('updates the DataView overlay immediately and reflects dirty state in Save All registration', async () => {
    const {wrapper, state, dataSet} = setup(); await flushPromises()
    const input = wrapper.get('[data-testid="planning"]')
    await input.setValue('changed through input')
    const view = dataSet.getView('Base_NavigationInfo')!
    expect(view.getEditingPatch('node-A')).toMatchObject({memo: 'changed through input'})
    const save = wrapper.findAll('button').find(button => button.text().includes('保存节点修改'))
    expect(save?.attributes('disabled')).toBeUndefined()
    const registered = state.registerExternalDataViewSession.mock.calls[0]?.[0]
    expect(registered?.isDirty()).toBe(true)
    wrapper.unmount()
  })

  it('gates a field with current DataView write permission and leaves its overlay untouched', async () => {
    const {wrapper, dataSet} = setup({deniedWrite: 'memo'}); await flushPromises()
    const input = wrapper.get('[data-testid="planning"]')
    expect(input.attributes('disabled')).toBeDefined()
    await input.setValue('must not write')
    expect(dataSet.getView('Base_NavigationInfo')!.hasEditingChanges()).toBe(false)
    wrapper.unmount()
  })

  it('refreshes delivery permission when the loaded DataView denies a required field', async () => {
    const {wrapper} = setup({deniedWrite: 'NavigationUrl'}); await flushPromises()
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(false)
    wrapper.unmount()
  })

  it('recreates a DataView session when the node selection is cleared and restored', async () => {
    const {wrapper, state} = setup(); await flushPromises()
    state.selectedNode.value = null
    await flushPromises()
    state.selectedNode.value = {nodeId: 'node-A'}
    await flushPromises()
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 未初始化'), 'error')
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 加载失败'), 'error')
    wrapper.unmount()
  })
})

const blueprintFields = ['rowid', 'SysId', 'name', 'memo', 'htmlDesc', 'conid', 'NavigationUrl', 'VersionId', 'DifficultyFactor', 'Manhour',
  'Number', 'Sum', 'Total', 'personCharge', 'status']
const blueprintIdentity = {scenarioId: '7AB874097A1E8711A42FD845939A6E05', metaName: 'Base_NavigationInfo'}
const blueprintRow = () => ({rowid: 'NODE-1', SysId: 'APP-1', name: 'Node one', memo: 'before', htmlDesc: '<p>before</p>',
  conid: 'SCENE-1', NavigationUrl: 'cfg:APP-1/page-1', DifficultyFactor: 1, Manhour: 2, Number: 3, Sum: 6, Total: 6,
  personCharge: 'U1', status: 'ready', VersionId: 'rule=1;script=1;style=1'})

function createBlueprintDataViewFixture(options: {outputs?: string[]; readable?: string[]; writable?: string[]; unknownSave?: boolean} = {}) {
  const outputs = options.outputs ?? blueprintFields
  const readable = new Set(options.readable ?? outputs)
  const writable = new Set(options.writable ?? outputs.filter(field => field !== 'rowid' && field !== 'SysId'))
  let stored: DataRow[] = [blueprintRow()]
  const rows = () => structuredClone(stored)
  let unknownReceipt = false
  const result = (view: DataView, resultRows: DataRow[]) => ({
    rows: resultRows, total: resultRows.length, countReported: true,
    assertIdentity(actual: {scenarioId: string; metaName: string}) {
      if (actual.scenarioId !== blueprintIdentity.scenarioId || actual.metaName !== blueprintIdentity.metaName) throw new Error('identity mismatch')
    },
    rowKey: (item: DataRow) => item['rowid'],
    fieldAccess: (key: unknown, field: string) => {
      const target = resultRows.find(item => item['rowid'] === key)
      const visible = target !== undefined && readable.has(field) && Object.hasOwn(target, field)
      const allowed = visible && writable.has(field)
      return {read: visible ? 'visible' as const : 'invisible' as const, write: allowed ? 'allowed' as const : 'denied' as const,
        component: !visible ? 'hidden' as const : allowed ? 'editable' as const : 'readonly' as const,
        required: false, writeMode: allowed ? 'editable' as const : 'readonly' as const}
    },
    readFieldAccess: (item: DataRow, field: string) => readable.has(field) && Object.hasOwn(item, field) ? 'visible' as const : 'invisible' as const,
    addActionState: () => 'hidden' as const, editActionState: () => 'enabled' as const,
    deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const, viewActionState: () => 'enabled' as const,
  })
  type SaveCommand = Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]
  const save = vi.fn(async (command: SaveCommand) => {
    if (options.unknownSave && !unknownReceipt) {unknownReceipt = true; throw new Error('transport timeout')}
    return command.changes.map(change => {
      const changed = [...(change.changes.changed ?? [])]
      if (changed[0]) stored = stored.map(current => current['rowid'] === changed[0]?.['rowid'] ? {...changed[0]} : current)
      const nextContext = result(view, rows())
      return {metaName: change.identity.metaName, added: [], changed, deleted: [],
        changedFields: changed.map(item => Object.keys(item)), context: nextContext}
    })
  })
  const dataSet = DataSet.fromJson({scenarioId: blueprintIdentity.scenarioId, dataSetName: 'Blueprint fixture', tables: {
    Base_NavigationInfo: {modelBinding: {modelId: `${blueprintIdentity.scenarioId}p000`, modelName: blueprintIdentity.metaName},
      columns: blueprintFields.map(name => ({name, type: ['DifficultyFactor', 'Manhour', 'Number', 'Sum', 'Total'].includes(name) ? 'number' : 'string', isPrimaryKey: name === 'rowid'})),
      views: {default: {autoLoad: false, fieldProjection: blueprintFields.map((name, index) => ({fieldId: `F${index}`, source: 'resource',
        resourceFieldId: `F${index}`, resourceField: name, viewField: name, type: 'string', label: name, output: outputs.includes(name),
        sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: name === 'rowid', value: '', valueFunction: '', expression: ''}))}}},
  }})
  const view = dataSet.getView('Base_NavigationInfo')!
  view.bindQueryExecutor({queryColumns: target => target.columns.filter(column => outputs.includes(column.name)),
    executeQuery: async target => result(target, rows()), save, hasUnconfirmedSave: () => unknownReceipt})
  return {dataSet, view, save, rows, destroy: () => dataSet.destroy()}
}

describe('BlueprintWorkspace DataView ownership', () => {
  it('reads the selected node through a project and row scoped formal view', async () => {
    const f = createBlueprintDataViewFixture()
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      expect(f.view.queryConfig.fields).toEqual(blueprintFields)
      expect(session.hasOutput('Manhour')).toBe(true)
      await session.load('NODE-1')
      expect(session.value('memo')).toBe('before')
      expect(session.canWrite('NavigationUrl')).toBe(true)
      expect(session.canRead('VersionId')).toBe(true)
      expect(session.view.filterExpression).toMatchObject({logic: 'and', filters: [
        {field: 'SysId', operator: 'eq', value: 'APP-1'}, {field: 'rowid', operator: 'eq', value: 'NODE-1'},
      ]})
      session.dispose()
    } finally {f.destroy()}
  })

  it('keeps edits in DataView, saves only authorized changed fields, and confirms by query readback', async () => {
    const f = createBlueprintDataViewFixture()
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      await session.load('NODE-1')
      session.update('memo', 'after')
      expect(session.value('memo')).toBe('after')
      expect(f.view.rows[0]?.['memo']).toBe('before')
      await session.save()
      expect(f.save).toHaveBeenCalledTimes(1)
      expect(f.save.mock.calls[0]?.[0].changes[0]?.changes.changed).toEqual([expect.objectContaining({rowid: 'NODE-1', memo: 'after'})])
      expect(session.value('memo')).toBe('after')
      session.dispose()
    } finally {f.destroy()}
  })

  it('cancels edits through the DataView edit overlay without writing', async () => {
    const f = createBlueprintDataViewFixture()
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      await session.load('NODE-1')
      session.update('memo', 'cancel me')
      session.cancel()
      expect(session.value('memo')).toBe('before')
      expect(f.view.hasEditingChanges()).toBe(false)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.save).not.toHaveBeenCalled()
      session.dispose()
    } finally {f.destroy()}
  })

  it('rejects new edits while an earlier save receipt is unknown', async () => {
    const f = createBlueprintDataViewFixture({unknownSave: true})
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      await session.load('NODE-1')
      session.update('memo', 'first edit')
      await expect(session.save()).rejects.toThrow('transport timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(() => session.update('memo', 'second edit')).toThrow(/结果|核验/)
      expect(f.view.dirtyTracking.hasPendingChanges('NODE-1')).toBe(true)
      session.dispose()
    } finally {f.destroy()}
  })

  it('fails closed when an estimate is not a formal output column or lacks read/write permission', async () => {
    const f = createBlueprintDataViewFixture({outputs: blueprintFields.filter(field => field !== 'Manhour'),
      readable: blueprintFields.filter(field => field !== 'personCharge'), writable: blueprintFields.filter(field => field !== 'status')})
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      await session.load('NODE-1')
      expect(session.hasOutput('Manhour')).toBe(false)
      expect(f.view.queryConfig.fields).not.toContain('Manhour')
      expect(session.canRead('personCharge')).toBe(false)
      expect(session.canWrite('status')).toBe(false)
      expect(() => session.update('status', 'changed')).toThrow(/权限|字段|列/)
      session.dispose()
    } finally {f.destroy()}
  })
})
