import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSet, type DataRow, type DataView } from '@spark-appworks/spark-data'
import type { PageRuntime } from '@spark-appworks/spark-project-model'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { resolveProjectPlanningDomainRoot } from '@/services/project-planning/project-planning-agent-workflow-binding'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'
import NodeBasicInfo from '@/views/app/dev-system/components/NodeBasicInfo.vue'
import NodeTargetConfig from '@/views/app/dev-system/components/NodeTargetConfig.vue'
import NodeStateConfig from '@/views/app/dev-system/components/NodeStateConfig.vue'
import NodeLayoutConfig from '@/views/app/dev-system/components/NodeLayoutConfig.vue'

const api = vi.hoisted(() => ({
  createSnapshot: vi.fn(),
  readRequestScope: vi.fn(() => ({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })),
}))
vi.doMock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: {}, lowcodeApi: {
    readRequestScope: api.readRequestScope,
    design: {},
  },
}))
const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.doMock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: runtime.load}))
const {default: BlueprintWorkspace} = await import('@/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue')

const Slot = defineComponent({ template: '<div><slot name="extra" /><slot /></div>' })
const TabPane = defineComponent({ props: ['label'], template: '<section class="tab-pane"><h3>{{ label }}</h3><slot /></section>' })
const TestInput = defineComponent({props:{modelValue:null,disabled:Boolean,type:String},emits:['update:modelValue','change'],template:'<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value);$emit(\'change\',$event.target.value)" />'})
const TestFormItem = defineComponent({props:{label:String},template:'<div class="form-item"><span>{{label}}</span><slot /></div>'})
const TestAlert = defineComponent({props:{title:String},template:'<div>{{title}}</div>'})
const TestEmpty = defineComponent({props:{description:String},template:'<div>{{description}}</div>'})
const StandardField = defineComponent({props:['dataViewKey','dataMember','dataField','optionDataViewKey','optionValueField','optionLabelField','readonly','clearable'],template:'<div data-test-standard-field />'})
const StandardRenderer = defineComponent({props:['dataViewKey','label','disabled','modelValue','title','width','closeDisabled','children','highlightCurrentRow'],emits:['click','update:modelValue'],template:'<div data-test-standard-renderer><slot /></div>'})
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
  const pageRuntime={instanceId:'blueprint-workspace-test-runtime',isLoaded:true,getDataSet:()=>dataSet,
    resolveView:()=>dataSet.getView('Base_NavigationInfo','default'),dispose:vi.fn(),materialize:vi.fn()} as unknown as PageRuntime
  let owner: BlueprintWorkspaceDataView | undefined
  const accessRevision = ref(0)
  const capability = new Proxy({} as {name?:string;description?:string}, {get(_target,key){const row=owner?.nodeData();return key==='name'?row?.capability.name:row?.capability.description},set(_target,key,value){const row=owner?.nodeData();if(!owner||!row)return false;owner.updateNodeData({...row,capability:{...row.capability,[key==='name'?'name':'description']:value}});accessRevision.value++;return true}})
  const state = {
    selectedNode: ref<{nodeId: string} | null>({ nodeId: 'node-A' }), activePageId: ref('tool-A'), projectId: 'APP-A', addStatus: vi.fn(),
    blueprintPageRuntime: ref(pageRuntime),
    registerExternalDataViewSession: vi.fn((_session: {isDirty: () => boolean; save: () => Promise<void>}) => () => {}), notifyExternalDataViewChanged: vi.fn(() => {accessRevision.value++}),
    loadBlueprintWorkspaceDataView: vi.fn(async () => {
      const current=owner??new BlueprintWorkspaceDataView(dataSet,'APP-A',()=>{})
      owner=current
      if(state.registerExternalDataViewSession.mock.calls.length===0)state.registerExternalDataViewSession({isDirty:()=>current.dirty,save:()=>current.save()})
      return current
    }),
    createPageToolSnapshot: api.createSnapshot,
    refreshBlueprintTreeProjection: vi.fn(),
    blueprintDraft: {nodeId:'node-A',kind:'page',capability,navigation:undefined,dataSpace:undefined,prototype:undefined},
    pageDataDirty: ref(false),
    persistedDataSpaceId: ref(''), sceneBindingPending: ref(false),
    hasAnyDirty: computed(() => {void accessRevision.value;return owner?.dirty ?? false}),
    blueprintNodeFieldAccess: (field:string) => {void accessRevision.value;return {read:owner?.canRead(field)??false,write:owner?.canWrite(field)??false}},
    blueprintNodeSectionWritable: () => false,
    markBlueprintDirty: vi.fn(),
    project: { readPageFileText: vi.fn((name: string) => name === 'script.js' ? '' : `text:${name}`) },
  }
  const wrapper = mount({ ...BlueprintWorkspace, props: ['state'] }, {
    props: { state }, global: {
      directives: { loading: () => {} }, stubs: {
        ElTabs: Slot, ElTabPane: TabPane, ElEmpty: TestEmpty, ElAlert: TestAlert, PlanningPane: Planning, PrototypePane: true,
        EstimatePane: true, DeliveryPane: Delivery, ReleasePane: true,
        NodeBasicInfo, NodeTargetConfig: true, NodeLayoutConfig: true, NodeStateConfig: defineComponent({template:'<div data-test-node-state-stub />'}),
        ElDivider: true, ElFormItem: TestFormItem, ElInput: TestInput, ElSelect: true, ElSwitch: true, ElOption: true, IconPicker: true,
        FieldSelect: StandardField, RendererButton: StandardRenderer, RendererDialog: StandardRenderer, RendererFilter: StandardRenderer, RendererTable: StandardRenderer,
      },
    },
  })
  return { state, wrapper, dataSet }
}

describe('BlueprintWorkspace file delivery', () => {
  beforeEach(() => {
    api.readRequestScope.mockReset().mockReturnValue({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })
    runtime.load.mockReset()
    api.createSnapshot.mockReset().mockImplementation(async (input:{fileName:string;onAttempt?:(result:{version:number;fileName:string})=>void})=>{
      const result={version:8,fileName:`8__${input.fileName}`};input.onAttempt?.(result);return result
    })
  })

  it('organizes the SPA work area by the reference six domains and preserves local extensions', async () => {
    const { wrapper, state } = setup(); await flushPromises()
    const names = wrapper.findAll('.tab-pane').map(node => node.attributes('name'))
    expect(names).toEqual(['basic', 'prototype', 'data', 'navigation', 'nav-host', 'task-info', 'extensions', 'estimate', 'delivery', 'release'])
    const basicInfo = wrapper.findAllComponents(NodeBasicInfo)
    expect(basicInfo.map(component=>component.props('sections'))).toEqual([['capability'], ['data-space']])
    expect(basicInfo[0]?.text()).not.toContain('绑定场景')
    expect(basicInfo[1]?.text()).toContain('绑定场景')
    expect(basicInfo[1]?.element.closest('.tab-pane')?.querySelector('h3')?.textContent).toBe('数据空间')
    const planning = mount(DataPlanningPane, {props:{state: state as never,fieldAccess:{read:true,write:true}},global:{stubs:{ElAlert:TestAlert}}})
    expect(planning.text()).toContain('在当前数据空间中选择并保存')
    expect(planning.text()).not.toContain('在基本信息中选择并保存')
    planning.unmount()
    expect(wrapper.text()).not.toContain('原型历史资源未绑定')
    expect(wrapper.text()).not.toContain('正式模型绑定未就绪')
    expect(wrapper.text()).toContain('参考实现暂无对应任务资源')
    expect(wrapper.text()).toContain('节点估算')
    expect(wrapper.text()).toContain('开发交付')
    expect(wrapper.text()).toContain('发布运行')
    wrapper.unmount()
  })

  it('edits memo from Basic Info through the shared Base_NavigationInfo DataView and global dirty state', async () => {
    const {wrapper,state,dataSet}=setup(); await flushPromises()
    expect(state.blueprintNodeFieldAccess('memo').read).toBe(true)
    const description=wrapper.findAll('.form-item').find(item=>item.text().includes('功能描述'))
    expect(description).toBeDefined()
    await description!.find('textarea').setValue('changed through basic info')
    expect(dataSet.getView('Base_NavigationInfo')?.getEditingPatch('node-A')).toMatchObject({memo:'changed through basic info'})
    expect(wrapper.findAll('button').find(button=>button.text().includes('保存节点修改'))?.attributes('disabled')).toBeUndefined()
    expect(state.registerExternalDataViewSession.mock.calls[0]?.[0].isDirty()).toBe(true)
    await wrapper.findAll('button').find(button=>button.text().includes('取消节点修改'))!.trigger('click')
    expect(dataSet.getView('Base_NavigationInfo')?.getEditingPatch('node-A')).toBeUndefined()
    expect(state.registerExternalDataViewSession.mock.calls[0]?.[0].isDirty()).toBe(false)
    wrapper.unmount()
  })

  it('prevents memo edits when the current Base_NavigationInfo DataView denies write access', async () => {
    const {wrapper,dataSet}=setup({deniedWrite:'memo'}); await flushPromises()
    const description=wrapper.findAll('.form-item').find(item=>item.text().includes('功能描述'))
    expect(description?.find('textarea').attributes('disabled')).toBeDefined()
    await description?.find('textarea').setValue('must not write')
    expect(dataSet.getView('Base_NavigationInfo')!.hasEditingChanges()).toBe(false)
    wrapper.unmount()
  })

  it('allocates from actual snapshots and confirms independent references, preserving empty text', async () => {
    const { wrapper, dataSet } = setup(); await flushPromises()
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(true)
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot.mock.calls.map(call => ({pageId:call[0].pageId,customPath:call[0].customPath,fileName:call[0].fileName,text:call[0].text}))).toEqual([
      { pageId:'tool-A',customPath: 'APP-A/tool-A', fileName: 'rule.json', text: 'text:rule.json' },
      { pageId:'tool-A',customPath: 'APP-A/tool-A', fileName: 'script.js', text: '' },
      { pageId:'tool-A',customPath: 'APP-A/tool-A', fileName: 'style.css', text: 'text:style.css' },
    ])
    expect(api.createSnapshot).toHaveBeenCalledTimes(3)
    expect(dataSet.getView('Base_NavigationInfo')?.rows[0]?.['VersionId']).toBe('rule=8;script=8;style=8')
    wrapper.unmount()
  })

  it('reports the confirmed snapshot when its reference fails without claiming rollback', async () => {
    const { wrapper, state, dataSet } = setup()
    vi.spyOn(dataSet, 'saveChanges').mockRejectedValueOnce(new Error('pointer rejected'))
    await flushPromises()
    const changedBeforeDelivery = state.notifyExternalDataViewChanged.mock.calls.length
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json；已确认发布引用：无'), 'error')
    expect(state.notifyExternalDataViewChanged).toHaveBeenCalledTimes(changedBeforeDelivery + 1)
    wrapper.unmount()
  })

  it.each(['cfg:APP-B/tool-A', 'cfg:APP-A/../APP-B/tool-A'])('rejects a path outside the current application: %s', async target => {
    const { wrapper } = setup({target}); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops after a target switch without publishing the uploaded snapshot', async () => {
    let finish!: () => void
    api.createSnapshot.mockImplementationOnce(async (input:{onAttempt?:(result:{version:number;fileName:string})=>void})=>{input.onAttempt?.({version:8,fileName:'8__rule.json'});return await new Promise(resolve=>{finish=()=>resolve({version:8,fileName:'8__rule.json'})})})
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    state.selectedNode.value = { nodeId: 'node-B' }; await flushPromises()
    finish(); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('preserves a confirmed snapshot but stops publishing edits made during upload', async () => {
    let finish!: () => void
    api.createSnapshot.mockImplementationOnce(async (input:{onAttempt?:(result:{version:number;fileName:string})=>void})=>{input.onAttempt?.({version:8,fileName:'8__rule.json'});return await new Promise(resolve=>{finish=()=>resolve({version:8,fileName:'8__rule.json'})})})
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    state.project.readPageFileText.mockReturnValue('edited')
    finish(); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('does not publish an unconfirmed snapshot upload', async () => {
    api.createSnapshot.mockImplementationOnce(async (input:{fileName:string;onAttempt?:(result:{version:number;fileName:string})=>void})=>{input.onAttempt?.({version:8,fileName:`8__${input.fileName}`});throw new Error('snapshot readback changed')})
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已尝试快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('stops when the published reference readback disagrees with the requested pointer', async () => {
    const { wrapper, state } = setup({readbackVersion: 'rule=99;script=1;style=1'}); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('字段 VersionId 保存后读回不一致'), 'error')
    wrapper.unmount()
  })

  it('refreshes delivery permission when the loaded DataView denies a required field', async () => {
    const {wrapper} = setup({deniedWrite: 'NavigationUrl'}); await flushPromises()
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(false)
    wrapper.unmount()
  })

  it('reuses the DevState-owned DataView when selection clears and is restored', async () => {
    const {wrapper, state} = setup(); await flushPromises()
    state.selectedNode.value = null
    await flushPromises()
    state.selectedNode.value = {nodeId: 'node-A'}
    await flushPromises()
    expect(state.loadBlueprintWorkspaceDataView).toHaveBeenCalledTimes(2)
    expect(state.registerExternalDataViewSession).toHaveBeenCalledTimes(1)
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 未初始化'), 'error')
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 加载失败'), 'error')
    wrapper.unmount()
  })
})

const blueprintFields = ['rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'funCode', 'FunName', 'conType', 'memo', 'htmlDesc', 'conid', 'NavigationUrl',
  'NavigationImageWxz', 'MobileUrl', 'NavigationType', 'ChildItemLocation', 'NavigationShowType', 'HorizontalAlignment', 'IsShowAtNav', 'IsShowChildItem',
  'BeginGroup', 'VersionId', 'DifficultyFactor', 'Manhour', 'Number', 'Sum', 'Total', 'personCharge', 'status']
const blueprintIdentity = {scenarioId: '7AB874097A1E8711A42FD845939A6E05', metaName: 'Base_NavigationInfo'}
const blueprintRow = () => ({rowid: 'NODE-1', SysId: 'APP-1', prowid:'000000', FunOrderValue:0, name: 'Node one', funCode:'NODE-1', FunName:'Node one', conType:'Navitem', memo: 'before', htmlDesc: '<p>before</p>',
  conid: 'SCENE-1', NavigationUrl: 'cfg:APP-1/page-1', NavigationImageWxz:'Document',MobileUrl:'',NavigationType:'',ChildItemLocation:'',NavigationShowType:'',HorizontalAlignment:'',
  IsShowAtNav:1,IsShowChildItem:1,BeginGroup:0,DifficultyFactor: 1, Manhour: 2, Number: 3, Sum: 6, Total: 6,
  personCharge: 'U1', status: 'ready', VersionId: 'rule=1;script=1;style=1'})

function createBlueprintDataViewFixture(options: {outputs?: string[]; readable?: string[]; writable?: string[]; unknownSave?: boolean; unknownSaveAlways?:boolean; refreshFailureAfterSave?:boolean; rows?:DataRow[]; childActionState?:'enabled'|'hidden'|'disabled'; addEnabled?:boolean} = {}) {
  const outputs = options.outputs ?? blueprintFields
  const readable = new Set(options.readable ?? outputs)
  const writable = new Set(options.writable ?? outputs.filter(field => field !== 'rowid'))
  let stored: DataRow[] = options.rows??[blueprintRow()]
  const rows = () => structuredClone(stored)
  let unknownReceipt = false
  let failNextRefresh = false
  const result = (view: DataView, resultRows: DataRow[]) => ({
    rows: resultRows, total: resultRows.length, countReported: true, resultPrimaryKey:'rowid',
    assertIdentity(actual: {scenarioId: string; metaName: string}) {
      if (actual.scenarioId !== blueprintIdentity.scenarioId || actual.metaName !== blueprintIdentity.metaName) throw new Error('identity mismatch')
    },
    rowKey: (item: DataRow) => item['rowid'],
    fieldAccess: (key: unknown, field: string) => {
      const target = resultRows.find(item => item['rowid'] === key)
      const visible = target !== undefined && readable.has(field) && Object.hasOwn(target, field)
      const allowed = target !== undefined && writable.has(field)
      return {read: visible ? 'visible' as const : 'invisible' as const, write: allowed ? 'allowed' as const : 'denied' as const,
        component: !visible ? 'hidden' as const : allowed ? 'editable' as const : 'readonly' as const,
        required: false, writeMode: allowed ? 'editable' as const : 'readonly' as const}
    },
    readFieldAccess: (item: DataRow, field: string) => readable.has(field) && Object.hasOwn(item, field) ? 'visible' as const : 'invisible' as const,
    prepareNewRow: (item: Readonly<Record<string, unknown>>) => ({...item, rowid:`OWNER-${stored.length+1}`}),
    prepareNewRowWithIdentity: (item: Readonly<Record<string, unknown>>, identity: {field: string; value: string | number}) => ({...item, [identity.field]:identity.value}),
    addActionState: () => options.addEnabled ? 'enabled' as const : 'hidden' as const, editActionState: () => 'enabled' as const,
    deleteActionState: () => 'hidden' as const, createChildActionState: () => options.childActionState??'hidden', viewActionState: () => 'enabled' as const,
  })
  type SaveCommand = Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]
  const save = vi.fn(async (command: SaveCommand) => {
    if (options.unknownSaveAlways || (options.unknownSave && !unknownReceipt)) {unknownReceipt = true; throw new Error('transport timeout')}
    const receipts=command.changes.map(change => {
      const added = [...(change.changes.added ?? [])]
      stored = [...stored, ...added]
      const changed = [...(change.changes.changed ?? [])]
      stored = stored.map(current => changed.find(candidate=>candidate['rowid']===current['rowid'])??current)
      const nextContext = result(view, rows())
      return {metaName: change.identity.metaName, added, changed, deleted: [],
        changedFields: changed.map(item => Object.keys(item)), context: nextContext}
    })
    unknownReceipt=false
    failNextRefresh=options.refreshFailureAfterSave===true
    return receipts
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
    executeQuery: async (target,params) => {
      if(failNextRefresh){failNextRefresh=false;throw new Error('refresh failed after accepted receipt')}
      const filter=params.filter
      const matches=(row:DataRow,value:unknown):boolean=>{
        if(value===null||typeof value!=='object')return true
        const item=value as Record<string,unknown>
        if(Array.isArray(item['filters']))return item['filters'].every(child=>matches(row,child))
        const field=item['field'],expected=item['value']
        return typeof field!=='string'||item['operator']!=='eq'||String(row[field]??'')===String(expected??'')
      }
      return result(target,rows().filter(row=>matches(row,filter)))
    }, save, hasUnconfirmedSave: () => unknownReceipt})
  return {dataSet, view, save, rows, destroy: () => dataSet.destroy()}
}

describe('BlueprintWorkspace DataView ownership', () => {
  it('saves two existing leaf updates in one DataSet batch and reads back each formal memo',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection(),requested=before.children.map((node,index)=>({...node,capability:{...node.capability,description:`updated ${index+1}`}}))
      const result=await Promise.resolve(facade.replaceBlueprintChildren({children:requested}))
      expect(f.save).toHaveBeenCalledOnce()
      expect(f.save.mock.calls[0]?.[0].changes[0]?.changes.changed).toHaveLength(2)
      expect(f.rows().filter(row=>['NODE-1','NODE-2'].includes(String(row['rowid']))).map(row=>row['memo'])).toEqual(['updated 1','updated 2'])
      expect(result.children.map(node=>node.capability.description)).toEqual(['updated 1','updated 2'])
      owner.dispose()
    }finally{f.destroy()}
  })

  it('preflights every batch target before staging when the later validator rejects',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const before=owner.treeProjection(),requested=before.children.map((node,index)=>({...node,capability:{...node.capability,description:`updated ${index+1}`}}))
      vi.spyOn(owner.view.validator!,'validateColumns').mockImplementation((row)=>row['rowid']==='NODE-2'?{valid:false,errors:[{message:'second validator rejects'}]} as never:{valid:true,errors:[]} as never)
      await expect(owner.preflightNodeDataBatch(requested)).rejects.toThrow('second validator rejects')
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined();expect(owner.view.getEditingPatch('NODE-2')).toBeUndefined()
      expect(f.save).not.toHaveBeenCalled()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('does not consume the AI write slot or stage either row when the later target lacks memo write access',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const originalAccess=owner.view.fieldAccess.bind(owner.view)
      vi.spyOn(owner.view,'fieldAccess').mockImplementation((row,field)=>row!==null&&row['rowid']==='NODE-2'&&field==='memo'?{...originalAccess(row,field),write:'denied',component:'readonly',writeMode:'readonly'} as never:originalAccess(row,field))
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const tryBeginDataViewBlueprintWrite=vi.fn(()=>true)
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner,tryBeginDataViewBlueprintWrite},{moduleInstanceId:'APP-1'} as never)
      const requested=owner.treeProjection().children.map((node,index)=>({...node,capability:{...node.capability,description:`updated ${index+1}`}}))
      await expect(facade.replaceBlueprintChildren({children:requested})).rejects.toThrow(/memo|权限|字段/iu)
      expect(tryBeginDataViewBlueprintWrite).not.toHaveBeenCalled()
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined();expect(owner.view.getEditingPatch('NODE-2')).toBeUndefined()
      expect(f.save).not.toHaveBeenCalled()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('discards the whole update batch if staging a later target throws',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const write=owner.view.updateEditingValue.bind(owner.view)
      vi.spyOn(owner.view,'updateEditingValue').mockImplementation((id,field,value)=>{if(id==='NODE-2')throw new Error('second overlay write failed');return write(id,field,value)})
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const requested=owner.treeProjection().children.map((node,index)=>({...node,capability:{...node.capability,description:`updated ${index+1}`}}))
      await expect(facade.replaceBlueprintChildren({children:requested})).rejects.toThrow('second overlay write failed')
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined();expect(owner.view.getEditingPatch('NODE-2')).toBeUndefined()
      expect(owner.dirty).toBe(false);expect(f.save).not.toHaveBeenCalled()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('retains an unknown multi-row receipt on the original DataView owner',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second],unknownSaveAlways:true})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const saveChanges=vi.spyOn(owner.dataSet,'saveChanges')
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection(),requested=before.children.map((node,index)=>({...node,capability:{...node.capability,description:`unknown ${index+1}`}}))
      await expect(facade.replaceBlueprintChildren({children:requested})).rejects.toThrow(/未确认.*保留原 DataView command/iu)
      expect(owner.hasUnconfirmedSave).toBe(true);expect(owner.dirty).toBe(true);expect(f.save).toHaveBeenCalledOnce()
      await expect(facade.replaceBlueprintChildren({children:requested})).rejects.toThrow(/one DataView command per AI run/iu)
      expect(f.save).toHaveBeenCalledOnce()
      await expect(owner.save()).rejects.toThrow('transport timeout')
      expect(owner.hasUnconfirmedSave).toBe(true);expect(owner.dirty).toBe(true)
      expect(saveChanges).toHaveBeenCalledTimes(2)
      const submittedIds=saveChanges.mock.calls.map(call=>call[0]?.views?.[0]?.ids)
      expect(submittedIds[1]).toEqual(submittedIds[0])
      expect(f.rows().filter(row=>['NODE-1','NODE-2'].includes(String(row['rowid']))).map(row=>row['memo'])).toEqual(['before','before'])
      expect(f.save).toHaveBeenCalledTimes(2)
      owner.dispose()
    }finally{f.destroy()}
  })

  it('ProjectPlanning updates one existing leaf through the real DataView owner and confirms formal readback', async () => {
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await owner.loadProjectTree()
      const validateColumns=vi.spyOn(owner.view.validator!,'validateColumns')
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection()
      const changed={...before.children[0]!,capability:{...before.children[0]!.capability,description:'AI updated description'}}

      const result=await Promise.resolve(facade.replaceBlueprintChildren({children:[changed]}))

      expect(f.save).toHaveBeenCalledOnce()
      const submitted=f.save.mock.calls[0]?.[0].changes[0]?.changes.changed
      expect(submitted).toHaveLength(1)
      expect(submitted?.[0]).toMatchObject({rowid:'NODE-1',memo:'AI updated description'})
      const changedFields=Object.keys(submitted?.[0]??{}).filter(field=>!Object.is(submitted?.[0]?.[field],(child as DataRow)[field]))
      expect(changedFields).toEqual(['memo'])
      expect(validateColumns).toHaveBeenCalledWith(expect.objectContaining({memo:'AI updated description'}),new Set(['memo']))
      expect(f.rows().find(row=>row['rowid']==='NODE-1')?.['memo']).toBe('AI updated description')
      expect(result.children[0]?.capability.description).toBe('AI updated description')
      expect(facade.completeProjectPlanning()).toMatchObject({ok:true,completed:true})
      owner.dispose()
    }finally{f.destroy()}
  })

  it('ProjectPlanning keeps an unknown update on the same owner without replaying another command', async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child],unknownSave:true})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await owner.loadProjectTree()
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection(), changed={...before.children[0]!,capability:{...before.children[0]!.capability,description:'unknown update'}}
      const original=editor.project.blueprintTree

      await expect(facade.replaceBlueprintChildren({children:[changed]})).rejects.toThrow(/未确认.*保留原 DataView command/iu)
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(owner.dirty).toBe(true)
      expect(editor.project.blueprintTree).toEqual(original)
      await expect(facade.replaceBlueprintChildren({children:[changed]})).rejects.toThrow(/one DataView command per AI run/iu)
      expect(f.save).toHaveBeenCalledOnce()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('recovers an accepted receipt after refresh failure by refreshing and comparing without a second save',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child],refreshFailureAfterSave:true})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree();await owner.load('NODE-1')
      const node=owner.nodeData();owner.updateNodeData({...node,capability:{...node.capability,description:'accepted update'}})
      await expect(owner.saveSelectedNode()).rejects.toThrow('refresh failed after accepted receipt')
      expect(owner.hasUnconfirmedSave).toBe(false)
      expect(owner.dirty).toBe(true)
      expect(owner.hasPendingBlueprintCommand).toBe(true)
      expect(f.save).toHaveBeenCalledOnce()

      await owner.saveSelectedNode()

      expect(f.save).toHaveBeenCalledOnce()
      expect(owner.dirty).toBe(false)
      expect(owner.hasPendingBlueprintCommand).toBe(false)
      expect(owner.treeProjection().children[0]?.capability.description).toBe('accepted update')
      owner.dispose()
    }finally{f.destroy()}
  })

  it('ProjectPlanning does not stage an update when the real DataView already has dirty rows',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree();await owner.load('NODE-1')
      owner.update('memo','pre-existing edit')
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      expect(()=>resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)).toThrow(/无待保存修改/iu)
      expect(owner.view.getEditingPatch('NODE-1')).toEqual({memo:'pre-existing edit'})
      expect(f.save).not.toHaveBeenCalled()
      owner.cancel();owner.dispose()
    }finally{f.destroy()}
  })

  it.each([
    ['write denied', {writable:blueprintFields.filter(field=>field!=='memo')}],
    ['not output', {outputs:blueprintFields.filter(field=>field!=='memo')}],
  ])('ProjectPlanning refuses a description update when memo is %s',async(_label,options)=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child],...options})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await owner.loadProjectTree()
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection(), changed={...before.children[0]!,capability:{...before.children[0]!.capability,description:'denied update'}}

      await expect(facade.replaceBlueprintChildren({children:[changed]})).rejects.toThrow(/memo|permission|权限|字段|输出/iu)
      expect(f.save).not.toHaveBeenCalled()
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('ProjectPlanning leaves no edit overlay when the formal DataView validator rejects memo',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,child]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      vi.spyOn(owner.view.validator!,'validateColumns').mockReturnValue({valid:false,errors:[{message:'validator rejects memo'}]} as never)
      const editor=new ProjectWorkspace({projectId:'APP-1',pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>owner.treeProjection()}})
      const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner},{moduleInstanceId:'APP-1'} as never)
      const before=owner.treeProjection(),changed={...before.children[0]!,capability:{...before.children[0]!.capability,description:'invalid'}}

      await expect(facade.replaceBlueprintChildren({children:[changed]})).rejects.toThrow('validator rejects memo')
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined()
      expect(f.save).not.toHaveBeenCalled()
      owner.dispose()
    }finally{f.destroy()}
  })

  it('saves and formally reads back an explicit rowid while omitted IDs retain owner generation', async () => {
    const f=createBlueprintDataViewFixture({childActionState:'enabled'})
    try {
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.loadProjectTree()
      const stable=await session.addChildNode('NODE-1',{name:'Stable child',FunName:'Stable child'},'STABLE-CHILD')
      expect(stable).toBe('STABLE-CHILD')
      expect(f.rows().find(row=>row['rowid']==='STABLE-CHILD')).toMatchObject({rowid:'STABLE-CHILD',prowid:'NODE-1',SysId:'APP-1'})
      const generated=await session.addChildNode('NODE-1',{name:'Generated child',FunName:'Generated child'})
      expect(generated).toBe('OWNER-3')
      expect(f.rows().find(row=>row['rowid']==='OWNER-3')).toMatchObject({rowid:'OWNER-3',prowid:'NODE-1',SysId:'APP-1'})
      session.dispose()
    } finally {f.destroy()}
  })
  it('requires child-create c and parent-row field E independently', async () => {
    const deniedE=createBlueprintDataViewFixture({childActionState:'enabled',writable:blueprintFields.filter(field=>field!=='name')})
    try {
      const session=new BlueprintWorkspaceDataView(deniedE.dataSet,'APP-1',()=>{})
      await session.loadProjectTree()
      await expect(session.addChildNode('NODE-1',{name:'Denied child'},'DENIED-E')).rejects.toThrow('不允许新增字段 name')
      session.dispose()
    } finally {deniedE.destroy()}
    const deniedC=createBlueprintDataViewFixture({childActionState:'hidden'})
    try {
      const session=new BlueprintWorkspaceDataView(deniedC.dataSet,'APP-1',()=>{})
      await session.loadProjectTree()
      await expect(session.addChildNode('NODE-1',{name:'Denied child'},'DENIED-C')).rejects.toThrow('不允许在所选父节点下新增子节点')
      session.dispose()
    } finally {deniedC.destroy()}
  })
  it('allows child payload fields with E even when their read visibility is hidden', async () => {
    const f=createBlueprintDataViewFixture({childActionState:'enabled',readable:blueprintFields.filter(field=>field!=='name')})
    try {
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.loadProjectTree()
      const id=await session.addChildNode('NODE-1',{name:'Write-only child'},'WRITE-ONLY')
      expect(id).toBe('WRITE-ONLY')
      expect(f.rows().find(row=>row['rowid']==='WRITE-ONLY')?.['name']).toBe('Write-only child')
      session.dispose()
    } finally {f.destroy()}
  })
  it('keeps display mode and horizontal alignment on the same DataView draft, cancel, save, and readback path', async () => {
    const f=createBlueprintDataViewFixture()
    try {
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      const node=session.nodeData()
      session.updateNodeData({...node,navigation:{...node.navigation!,displayMode:'wide',horizontalAlignment:'right'}})
      expect(f.view.getEditingPatch('NODE-1')).toEqual({NavigationShowType:'wide',HorizontalAlignment:'right'})

      session.cancel()
      expect(f.view.getEditingPatch('NODE-1')).toBeUndefined()
      expect(session.nodeData().navigation?.displayMode).toBe('')
      expect(session.nodeData().navigation?.horizontalAlignment).toBe('')

      session.updateNodeData({...session.nodeData(),navigation:{...session.nodeData().navigation!,displayMode:'wide',horizontalAlignment:'right'}})
      await session.save()
      expect(f.rows()[0]?.['NavigationShowType']).toBe('wide')
      expect(f.rows()[0]?.['HorizontalAlignment']).toBe('right')
      session.dispose()
    } finally {f.destroy()}
  })

  it('rejects display attributes when the current formal DataView denies their read or write access', async () => {
    const f=createBlueprintDataViewFixture({writable:blueprintFields.filter(field=>!['NavigationShowType','HorizontalAlignment'].includes(field))})
    try {
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      const node=session.nodeData()
      expect(session.canRead('NavigationShowType')).toBe(true)
      expect(session.canWrite('NavigationShowType')).toBe(false)
      expect(()=>session.updateNodeData({...node,navigation:{...node.navigation!,displayMode:'wide'}})).toThrow('不允许读写正式字段 NavigationShowType')
      session.dispose()
    } finally {f.destroy()}

    const hidden=createBlueprintDataViewFixture({readable:blueprintFields.filter(field=>!['NavigationShowType','HorizontalAlignment'].includes(field))})
    try {
      const session=new BlueprintWorkspaceDataView(hidden.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      expect(session.canRead('NavigationShowType')).toBe(false)
      expect(session.canWrite('HorizontalAlignment')).toBe(false)
      expect(session.nodeData().navigation?.displayMode).toBeUndefined()
      session.dispose()
    } finally {hidden.destroy()}
  })

  it('exposes child-create action only from the loaded formal DataView row state', async () => {
    const f = createBlueprintDataViewFixture({childActionState:'enabled'})
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      expect(session.childCreateActionState('NODE-1')).toBe('unknown')
      await session.loadProjectTree()
      expect(session.childCreateActionState('NODE-1')).toBe('enabled')
      expect(session.childCreateActionState('MISSING')).toBe('unknown')
      session.dispose()
    } finally {f.destroy()}
  })

  it('keeps denied and unavailable child-create action states non-enabled', async () => {
    for (const state of ['hidden','disabled'] as const) {
      const f = createBlueprintDataViewFixture({childActionState:state})
      try {
        const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
        await session.loadProjectTree()
        expect(session.childCreateActionState('NODE-1')).toBe(state)
        expect(session.childCreateActionState('MISSING')).toBe('unknown')
        session.dispose()
      } finally {f.destroy()}
    }
  })

  it('rejects child-create action state after its DataView scope becomes stale', async () => {
    const f = createBlueprintDataViewFixture({childActionState:'enabled'})
    let current=true
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {if(!current)throw new Error('scope stale')})
      await session.loadProjectTree()
      current=false
      expect(()=>session.childCreateActionState('NODE-1')).toThrow('scope stale')
      session.dispose()
    } finally {f.destroy()}
  })
  it('reads the selected node through a project and row scoped formal view', async () => {
    const f = createBlueprintDataViewFixture()
    try {
      const session = new BlueprintWorkspaceDataView(f.dataSet, 'APP-1', () => {})
      expect([...(f.view.queryConfig.fields??[])].sort()).toEqual([...blueprintFields].sort())
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
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'cancel me'}})
      session.cancel()
      expect(session.nodeData().capability.name).toBe('Node one')
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
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'first edit'}})
      await expect(session.saveSelectedNode()).rejects.toThrow('transport timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(() => session.updateNodeData({...before,capability:{...before.capability,name:'second edit'}})).toThrow(/回执|核验/)
      expect(f.view.dirtyTracking.hasPendingChanges('NODE-1')).toBe(true)
      await session.saveSelectedNode()
      expect(f.save).toHaveBeenCalledTimes(2)
      expect(f.save.mock.calls[0]?.[0].changes[0]?.changes.changed).toEqual(f.save.mock.calls[1]?.[0].changes[0]?.changes.changed)
      expect(session.nodeData().capability.name).toBe('first edit')
      session.dispose()
    } finally {f.destroy()}
  })

  it('saveSelectedNode commits only its selected row and refuses another row dirty in the same tree view',async()=>{
    const child={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-1',name:'Child',FunName:'Child'}
    const f=createBlueprintDataViewFixture({rows:[blueprintRow(),child]})
    try{
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.loadProjectTree()
      await session.load('NODE-1')
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'Root renamed'}})
      await session.saveSelectedNode()
      expect(f.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.map(row=>row['rowid'])).toEqual(['NODE-1'])
      f.view.updateEditingValue('NODE-2','memo','other row')
      await expect(session.saveSelectedNode()).rejects.toThrow(/其他节点/)
      expect(f.save).toHaveBeenCalledTimes(1)
      expect(f.view.getEditingPatch('NODE-2')).toMatchObject({memo:'other row'})
      session.dispose()
    }finally{f.destroy()}
  })

  it('blocks changing the selected node while its DataView field edits are pending',async()=>{
    const child={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-1',name:'Child',FunName:'Child'}
    const f=createBlueprintDataViewFixture({rows:[blueprintRow(),child]})
    try{
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.loadProjectTree();await session.load('NODE-1')
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'Pending'}})
      await expect(session.load('NODE-2')).rejects.toThrow(/未保存/)
      expect(session.nodeId).toBe('NODE-1')
      expect(session.nodeData().capability.name).toBe('Pending')
      session.dispose()
    }finally{f.destroy()}
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

  it('checks only the changed wire field and rejects a denied sibling field without partial edits', async () => {
    const f=createBlueprintDataViewFixture({writable:['name']})
    try{
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'Renamed'}})
      expect(f.view.getEditingPatch('NODE-1')).toEqual({name:'Renamed'})
      const after=session.nodeData()
      expect(()=>session.updateNodeData({...after,capability:{...after.capability,description:'denied'}})).toThrow(/memo|权限|字段/)
      expect(f.view.getEditingPatch('NODE-1')).toEqual({name:'Renamed'})
      session.dispose()
    }finally{f.destroy()}
  })

  it('allows a visible capability field without reading or writing unrelated hidden kind and sibling columns',async()=>{
    const f=createBlueprintDataViewFixture({readable:blueprintFields.filter(field=>field!=='conType'),writable:['name']})
    try{
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      const before=session.nodeData()
      expect(before.kind).toBe('unknown')
      session.updateNodeData({...before,capability:{...before.capability,name:'Renamed'}})
      expect(f.view.getEditingPatch('NODE-1')).toEqual({name:'Renamed'})
      session.dispose()
    }finally{f.destroy()}
  })

  it('does not write hidden or unselected wire fields while updating one visible field', async () => {
    const f=createBlueprintDataViewFixture({outputs:blueprintFields.filter(field=>field!=='MobileUrl'),writable:['name']})
    try{
      const session=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await session.load('NODE-1')
      const before=session.nodeData()
      session.updateNodeData({...before,capability:{...before.capability,name:'Renamed'}})
      expect(f.view.getEditingPatch('NODE-1')).toEqual({name:'Renamed'})
      expect(f.view.getEditingPatch('NODE-1')).not.toHaveProperty('MobileUrl')
      session.dispose()
    }finally{f.destroy()}
  })

  it('hides unreadable and disables non-writable fields across all NodeBasicInfo panels',()=>{
    const access=vi.fn((field:string)=>({read:field!=='memo',write:false}))
    const state={blueprintDraft:{nodeId:'NODE-1',projectId:'APP-1',parentNodeId:'000000',kind:'module',capability:{name:'Node',description:'secret'},
      navigation:{title:'Node',icon:'Document',target:'cfg:tool',mobileTarget:'',openMode:'current',placement:'left',order:1,publishInMenu:true,showChildren:true,beginGroup:false},
      dataSpace:{scenarioId:'SCENE',models:[]},prototype:{htmlDescription:'prototype'}},
      projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintPageRuntime:ref(undefined),pageDataDirty:ref(false),blueprintNodeFieldAccess:access,blueprintNodeFieldsWritable:vi.fn(()=>false),blueprintNodeSectionWritable:vi.fn(()=>false),
      markBlueprintDirty:vi.fn(),handlePathChange:vi.fn(),createPageForSelectedNode:vi.fn(),pageList:ref([]),activePageId:ref(''),
      linkProbeLoading:ref(false),linkProbeInfo:ref(null),probeLinkTarget:vi.fn(),addStatus:vi.fn()}
    const Control=defineComponent({name:'FieldControl',props:{disabled:Boolean,readonly:Boolean,modelValue:null},template:'<input :disabled="disabled" :readonly="readonly" />'})
    const FormItem=defineComponent({props:{label:String},template:'<div class="form-item"><span>{{label}}</span><slot /></div>'})
    const Panels=defineComponent({components:{NodeBasicInfo,NodeTargetConfig,NodeStateConfig,NodeLayoutConfig},props:{state:Object},
      template:'<div><NodeBasicInfo :state="state"/><NodeTargetConfig :state="state"/><NodeStateConfig :state="state"/><NodeLayoutConfig :state="state"/></div>'})
    const wrapper=mount(Panels,{props:{state},global:{stubs:{FieldSelect:Control,RendererButton:StandardRenderer,RendererDialog:StandardRenderer,RendererFilter:StandardRenderer,RendererTable:StandardRenderer,ElDivider:true,ElFormItem:FormItem,ElInput:Control,ElSelect:Control,ElSwitch:Control,
      ElInputNumber:Control,ElRadioGroup:Control,ElRadioButton:true,ElOption:true,IconPicker:true}}})
    expect(wrapper.text()).not.toContain('功能描述')
    expect(wrapper.findAllComponents(Control).length).toBeGreaterThan(0)
    expect(wrapper.findAllComponents(Control).every(control=>control.props('disabled')===true||control.props('readonly')===true)).toBe(true)
    expect(access).toHaveBeenCalledWith('name')
    expect(access).toHaveBeenCalledWith('FunName')
    expect(access).toHaveBeenCalledWith('MobileUrl')
    expect(access).toHaveBeenCalledWith('IsShowAtNav')
    expect(access).toHaveBeenCalledWith('ChildItemLocation')
    wrapper.unmount()
  })

  it('filters NodeBasicInfo to capability fields while retaining the default full view',()=>{
    const state={blueprintDraft:{nodeId:'NODE-1',projectId:'APP-1',parentNodeId:'000000',kind:'module',capability:{name:'Node',description:'memo'},navigation:{title:'Node',icon:'Document',target:'cfg:tool',order:1,publishInMenu:true,showChildren:true,beginGroup:false},dataSpace:{scenarioId:'SCENE',models:[]},prototype:{htmlDescription:'prototype'}},projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintPageRuntime:ref(undefined),pageDataDirty:ref(false),
      blueprintNodeFieldAccess:vi.fn(()=>({read:true,write:false})),blueprintNodeFieldsWritable:vi.fn(()=>false),blueprintNodeSectionWritable:vi.fn(()=>false),markBlueprintDirty:vi.fn(),handlePathChange:vi.fn(),createPageForSelectedNode:vi.fn(),pageList:ref([]),activePageId:ref(''),linkProbeLoading:ref(false),linkProbeInfo:ref(null),probeLinkTarget:vi.fn(),addStatus:vi.fn()}
    const FormItem=defineComponent({props:{label:String},template:'<div class="form-item"><span>{{label}}</span><slot /></div>'})
    const Basic=defineComponent({components:{NodeBasicInfo},props:{state:Object,sections:Array},template:'<NodeBasicInfo :state="state" :sections="sections" />'})
    const global={stubs:{FieldSelect:StandardField,RendererButton:StandardRenderer,RendererDialog:StandardRenderer,RendererFilter:StandardRenderer,RendererTable:StandardRenderer,ElAlert:true,ElDivider:true,ElFormItem:FormItem,ElInput:true,ElSelect:true,ElSwitch:true,ElOption:true,IconPicker:true}}
    const filtered=mount(Basic,{props:{state,sections:['capability']},global})
    expect(filtered.text()).toContain('能力名称')
    expect(filtered.text()).not.toContain('提供导航')
    expect(filtered.text()).not.toContain('绑定数据空间')
    expect(filtered.text()).not.toContain('提供原型')
    filtered.unmount()
    const compatible=mount(Basic,{props:{state},global})
    expect(compatible.text()).toContain('提供导航')
    expect(compatible.text()).toContain('绑定场景')
    expect(compatible.text()).toContain('提供原型')
    compatible.unmount()
    const navigation=mount(Basic,{props:{state,sections:['navigation']},global})
    expect(navigation.text()).toContain('菜单标题')
    expect(navigation.text()).toContain('图标')
    expect(navigation.text()).not.toContain('工具或页面目标')
    navigation.unmount()
  })
})
