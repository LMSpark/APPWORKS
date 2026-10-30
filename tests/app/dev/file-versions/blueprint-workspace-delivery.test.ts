import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref, shallowRef, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import { buildDataViewKey, DataSet, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { PageRuntime, ProjectBlueprint, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { DATA_ROW, DATA_SOURCE, FieldText, PAGE_RUNTIME, Spark, useSparkComponent, useSparkConsume } from '@spark-appworks/spark-component'
import * as SparkComponent from '@spark-appworks/spark-component'
import { resolveProjectPlanningDomainRoot } from '@/services/project-planning/project-planning-agent-workflow-binding'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'
import NodeBasicInfo from '@/views/app/dev-system/components/NodeBasicInfo.vue'
import NodeTargetConfig from '@/views/app/dev-system/components/NodeTargetConfig.vue'
import NodeStateConfig from '@/views/app/dev-system/components/NodeStateConfig.vue'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {getBuiltinApplicationDescriptor, getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {readBuiltinSystemNavigation, BUILTIN_BLUEPRINT_BUSINESS_FIELDS} from '@/lowcode/resources/shared/builtin-system-navigation'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME, BuiltinBlueprintNodeResource} from '@/lowcode/resources/shared/builtin-blueprint-node-resource'
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
const AutoSaveTag = defineComponent({name:'DisplayTag',props:['content','tagType','effect','size'],template:'<span data-test-autosave-tag :data-type="tagType">{{content}}</span>'})
const StandardField = defineComponent({props:['dataViewKey','dataMember','dataField','optionDataViewKey','optionValueField','optionLabelField','readonly','clearable','label'],template:'<div data-test-standard-field>{{label}}</div>'})
const StandardRenderer = defineComponent({props:['dataViewKey','label','disabled','modelValue','title','width','closeDisabled','children','highlightCurrentRow'],emits:['click','update:modelValue'],template:'<button data-test-standard-renderer @click="$emit(\'click\',$event)">{{label}}<slot /></button>'})
const Delivery = defineComponent({ props: ['canPublish'], emits: ['save'], template: '<button @click="$emit(\'save\')">交付</button>' })
const scenarioId = '7AB874097A1E8711A42FD845939A6E05'
const initialRow = (target = 'cfg:tool-A', versionId = 'rule=1;script=1;style=1', nodeId = 'node-A', projectId = 'APP-A'): DataRow => ({rowid: nodeId, SysId: projectId,
  memo: 'planning', htmlDesc: '', conid: 'scene-A', NavigationUrl: target, VersionId: versionId, DifficultyFactor: 1,
  Manhour: 2, Number: 3, Sum: 6, Total: 6, personCharge: '', status: '', IsShowAtNav: 0, NavigationType: 0})
function createDataSet(options: {target?: string; versionId?: string; deniedWrite?: string; readbackVersion?: string; nodeId?:string; projectId?:string} = {}) {
  let persisted = initialRow(options.target, options.versionId, options.nodeId, options.projectId)
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
function projectedActivePageId(target: string): string {
  const blueprint = new ProjectBlueprint({projectId: 'APP-A'})
  blueprint.replaceBlueprintTree({nodeId: 'project-root', parentNodeId: '', projectId: 'APP-A', kind: 'module',
    capability: {name: 'APP-A'}, source: {}, children: [{nodeId: 'node-A', parentNodeId: 'project-root', projectId: 'APP-A', kind: 'page',
      capability: {name: 'tool-A'}, navigation: {title: 'tool-A', target, order: 0, publishInMenu: true, showChildren: true, beginGroup: false}, source: {}}]})
  return blueprint.readBlueprintProjection().pageDeliveries.find(node => node.nodeId === 'node-A')?.pageId ?? ''
}
function setup(options: Parameters<typeof createDataSet>[0] = {}, autoSaveStatus:'idle'|'pending'|'saving'|'saved'|'error'='saved', testRuntime?:{dataSet:DataSet;runtime:PageRuntime;stubs?:Record<string,Component|boolean>}) {
  let activeDataSet = testRuntime?.dataSet ?? createDataSet(options)
  const target = options.target ?? 'cfg:tool-A'
  const pageRuntime=testRuntime?.runtime??({instanceId:'blueprint-workspace-test-runtime',isLoaded:true,getDataSet:()=>activeDataSet,
    resolveView:()=>activeDataSet.getView('Base_NavigationInfo','default'),dispose:vi.fn(),materialize:vi.fn()} as unknown as PageRuntime)
  let owner: BlueprintWorkspaceDataView | undefined
  const fileViews=new Map<string,{currentRow:DataRow;createSourceVersion:(onAttempt?:(attempt:{version:number;fileName:string})=>void)=>Promise<{state:string;version:number;fileName:string;message:null}>;acknowledgeSourceHistoryAttempt:()=>void;getPkKey:(row:DataRow)=>string;getEditingRow:()=>DataRow|null;editRowById:(id:string,patch:DataRow)=>Promise<void>;dirtyTracking:{hasPendingChanges:()=>boolean};hasEditingChanges:()=>boolean;hasUnconfirmedSave:boolean}>()
  const blueprintWorkspaceDataView=shallowRef<BlueprintWorkspaceDataView>()
  const accessRevision = ref(0)
  const capability = new Proxy({} as {name?:string;description?:string}, {get(_target,key){const row=owner?.nodeData();return key==='name'?row?.capability.name:row?.capability.description},set(_target,key,value){const row=owner?.nodeData();if(!owner||!row)return false;owner.updateNodeData({...row,capability:{...row.capability,[key==='name'?'name':'description']:value}});accessRevision.value++;return true}})
  const state = {
    selectedNode: ref<{nodeId: string} | null>({ nodeId: 'node-A' }), activePageId: ref(projectedActivePageId(target)), projectId: 'APP-A', addStatus: vi.fn(),
    blueprintPageRuntime: shallowRef(pageRuntime),
    blueprintWorkspaceDataView,
    registerExternalDataViewSession: vi.fn((_session: {isDirty: () => boolean; save: () => Promise<void>}) => () => {}), notifyExternalDataViewChanged: vi.fn(() => {accessRevision.value++}),
    loadBlueprintWorkspaceDataView: vi.fn(async () => {
      const current=owner??new BlueprintWorkspaceDataView(activeDataSet,'APP-A',()=>{})
      owner=current
      blueprintWorkspaceDataView.value=current
      if(state.registerExternalDataViewSession.mock.calls.length===0)state.registerExternalDataViewSession({isDirty:()=>current.dirty,save:()=>current.save()})
      return current
    }),
    loadPageToolFileDataView: vi.fn(async ({pageId,fileName}:{pageId:string;fileName:string})=>{
      const existing=fileViews.get(fileName)
      if(existing)return existing
      const fileView={currentRow:{pageId,fileName,text:fileName==='script.js'?'':`text:${fileName}`},editingRow:null as DataRow|null,getPkKey:(row:DataRow)=>String(row['fileName']),getEditingRow:()=>fileView.editingRow,
        editRowById:async(_id:string,patch:DataRow)=>{fileView.editingRow={...fileView.currentRow,...patch}},
        dirtyTracking:{hasPendingChanges:()=>fileView.editingRow!==null},hasEditingChanges:()=>fileView.editingRow!==null,hasUnconfirmedSave:false,createSourceVersion:async(onAttempt?:(attempt:{version:number;fileName:string})=>void)=>{
        const result=await api.createSnapshot({pageId,customPath:`${state.projectId}/${pageId}`,fileName,
          text:fileView.currentRow['text'],onAttempt})
        return {state:'confirmed',version:result.version,fileName:result.fileName,message:null}
      },acknowledgeSourceHistoryAttempt:vi.fn()}
      fileViews.set(fileName,fileView)
      return fileView
    }),
    refreshBlueprintTreeProjection: vi.fn(),
    blueprintDraft: {nodeId:'node-A',kind:'page',capability,navigation:undefined,dataSpace:undefined,prototype:undefined},
    pageDataDirty: ref(false),
    persistedDataSpaceId: ref(''), sceneBindingPending: ref(false),
    hasAnyDirty: computed(() => {void accessRevision.value;return owner?.dirty ?? false}),
    blueprintNodeFieldAccess: (field:string) => {void accessRevision.value;return {read:owner?.canRead(field)??false,write:owner?.canWrite(field)??false}},
    blueprintNodeSectionWritable: () => false,
    markBlueprintDirty: vi.fn(() => { accessRevision.value++ }),
    autoSaveStatus: ref(autoSaveStatus),
    project: {},
  }
  const Host=defineComponent({setup(){useSparkComponent({type:'blueprint-workspace-test-host'}).sparkProvide(PAGE_RUNTIME,pageRuntime)
    return ()=>h(BlueprintWorkspace,{state:state as never})}})
  const wrapper = mount(Host, {
    global: {
      plugins: testRuntime ? [ElementPlus, Spark.createPlugin()] : [], directives: testRuntime ? {} : { loading: () => {} }, stubs: {
        RendererTabs: Slot, RendererTabPane: TabPane, DisplayEmpty: TestEmpty, ElAlert: TestAlert, PrototypePane: true,
        DisplayTag: AutoSaveTag,
        EstimatePane: true, DeliveryPane: Delivery, ReleasePane: true,
        NodeBasicInfo, NodeTargetConfig: true, NodeLayoutConfig: true, NodeStateConfig: defineComponent({template:'<div data-test-node-state-stub />'}),
        ElDivider: true, ElFormItem: TestFormItem, ElInput: TestInput, ElSelect: true, ElSwitch: true, ElOption: true, IconPicker: true,
        FieldSelect: StandardField, RendererButton: StandardRenderer, RendererDialog: StandardRenderer, RendererFilter: StandardRenderer, RendererTable: StandardRenderer,
        ...testRuntime?.stubs,
      },
    },
  })
  return { state, wrapper, dataSet:activeDataSet, workspaceOwner: () => owner, fileViews,
    replaceWorkspace(nextDataSet:DataSet,nextRuntime:PageRuntime){owner?.dispose();owner=undefined;activeDataSet=nextDataSet;blueprintWorkspaceDataView.value=undefined;state.blueprintPageRuntime.value=nextRuntime} }
}

describe('BlueprintWorkspace runtime mount lifecycle', () => {
  it.each([
    {status:'idle' as const,content:undefined,tagType:undefined,effect:undefined},
    {status:'pending' as const,content:'待保存…',tagType:'info',effect:'plain'},
    {status:'saving' as const,content:'保存中…',tagType:'info',effect:'dark'},
    {status:'saved' as const,content:'已自动保存',tagType:'success',effect:'plain'},
    {status:'error' as const,content:'保存失败',tagType:'danger',effect:'plain'},
  ])('maps autosave state $status to the shared DisplayTag presentation',async({status,content,tagType,effect})=>{
    const {wrapper,dataSet,workspaceOwner}=setup({},status)
    try{
      await flushPromises()
      const tag=wrapper.findComponent(AutoSaveTag)
      if(status==='idle')expect(tag.exists()).toBe(false)
      else{
        expect(tag.exists()).toBe(true)
        expect(tag.props('content')).toBe(content)
        expect(tag.props('tagType')).toBe(tagType)
        expect(tag.props('effect')).toBe(effect)
        expect(tag.props('size')).toBe('small')
      }
    }finally{wrapper.unmount();workspaceOwner()?.dispose();dataSet.destroy()}
  })

  it('waits for the target PAGE_RUNTIME to be provided before mounting the DataView form subtree',async()=>{
    const dataSet=createDataSet()
    const runtime=new PageRuntime({pageId:'blueprint-runtime-gate-test',scenarioIds:[scenarioId],loadScenario:async()=>dataSet})
    await runtime.load()
    const owner=new BlueprintWorkspaceDataView(dataSet,'APP-A',()=>{})
    let releaseOwner:(owner:BlueprintWorkspaceDataView)=>void=()=>{}
    const initialLoad=new Promise<BlueprintWorkspaceDataView>(resolve=>{releaseOwner=resolve})
    let releaseReload:()=>void=()=>{}
    const pendingReload=new Promise<BlueprintWorkspaceDataView>(resolve=>{releaseReload=()=>resolve(owner)})
    const state={selectedNode:ref<{nodeId:string}|null>({nodeId:'node-A'}),projectId:'APP-A',blueprintPageRuntime:shallowRef(runtime),
      loadBlueprintWorkspaceDataView:vi.fn().mockReturnValueOnce(initialLoad).mockReturnValueOnce(pendingReload),
      hasAnyDirty:ref(false),notifyExternalDataViewChanged:vi.fn(),addStatus:vi.fn(),activePageId:ref(''),
      blueprintDraft:{nodeId:'node-A'},refreshBlueprintTreeProjection:vi.fn()}
    const observedRuntimes:Array<PageRuntime|null>=[]
    const RuntimeProbe=defineComponent({name:'NodeBasicInfo',setup(){
      const {sparkConsume}=useSparkComponent({type:'blueprint-runtime-probe'})
      observedRuntimes.push(sparkConsume(PAGE_RUNTIME))
      return ()=>h('div',{'data-testid':'runtime-probe'})
    }})
    const EmptyProbe=defineComponent({props:{description:String},setup(props){
      const {sparkConsume}=useSparkComponent({type:'blueprint-runtime-empty-probe'})
      if(props.description==='在左侧 WBS 中选择节点')observedRuntimes.push(sparkConsume(PAGE_RUNTIME))
      return ()=>h('div',{'data-testid':'empty-runtime-probe'})
    }})
    const Host=defineComponent({setup(){useSparkComponent({type:'blueprint-runtime-gate-host'});return ()=>h(BlueprintWorkspace,{state:state as never})}})
    const wrapper=mount(Host,{global:{directives:{loading:()=>{}},stubs:{
      RendererTabs:Slot,RendererTabPane:TabPane,DisplayEmpty:EmptyProbe,PrototypePane:true,BlueprintReadonlyInfo:true,DataPlanningPane:true,
      NodeBasicInfo:RuntimeProbe,NodeTargetConfig:true,NodeLayoutConfig:true,NodeStateConfig:true,EstimatePane:true,DeliveryPane:true,ReleasePane:true,
    }}})
    try{
      await nextTick()
      expect(wrapper.find('[data-testid="runtime-probe"]').exists()).toBe(false)
      expect(observedRuntimes).toEqual([])

      releaseOwner(owner)
      await flushPromises()
      expect(owner.nodeId).toBe('node-A')
      expect(wrapper.find('[data-testid="runtime-probe"]').exists()).toBe(true)
      expect(observedRuntimes.length).toBeGreaterThanOrEqual(1)
      expect(observedRuntimes.every(observed => observed === runtime)).toBe(true)

      state.selectedNode.value={nodeId:'node-B'}
      await nextTick()
      expect(wrapper.find('[data-testid="runtime-probe"]').exists()).toBe(false)

      releaseReload()
      await flushPromises()
      expect(wrapper.find('[data-testid="runtime-probe"]').exists()).toBe(false)

      state.selectedNode.value=null
      await nextTick()
      expect(wrapper.find('[data-testid="empty-runtime-probe"]').exists()).toBe(true)
      expect(observedRuntimes.at(-1)).toBeNull()
    }finally{wrapper.unmount();owner.dispose();runtime.dispose();dataSet.destroy()}
  })

  it('removes PAGE_RUNTIME when the current node DataView load rejects',async()=>{
    const dataSet=createDataSet()
    const runtime=new PageRuntime({pageId:'blueprint-runtime-reject-test',scenarioIds:[scenarioId],loadScenario:async()=>dataSet})
    await runtime.load()
    const owner=new BlueprintWorkspaceDataView(dataSet,'APP-A',()=>{})
    owner.load=vi.fn().mockRejectedValue(new Error('node query failed'))
    const state={selectedNode:ref<{nodeId:string}|null>({nodeId:'node-A'}),projectId:'APP-A',blueprintPageRuntime:shallowRef(runtime),
      loadBlueprintWorkspaceDataView:vi.fn().mockResolvedValue(owner),hasAnyDirty:ref(false),notifyExternalDataViewChanged:vi.fn(),
      addStatus:vi.fn(),activePageId:ref(''),blueprintDraft:{nodeId:'node-A'},refreshBlueprintTreeProjection:vi.fn()}
    const removedValues: Array<PageRuntime|null> = []
    const originalUse=SparkComponent.useSparkComponent
    const useSpy=vi.spyOn(SparkComponent,'useSparkComponent').mockImplementation((...args:Parameters<typeof useSparkComponent>)=>{
      const component=originalUse(...args)
      if(args[0].type!=='dev-system-blueprint-workspace')return component
      return {...component,sparkRemove:((key:typeof PAGE_RUNTIME)=>{component.sparkRemove(key);if(key===PAGE_RUNTIME)removedValues.push(component.sparkConsume(PAGE_RUNTIME))}) as typeof component.sparkRemove}
    })
    const Host=defineComponent({setup(){useSparkComponent({type:'blueprint-runtime-reject-host'});return ()=>h(BlueprintWorkspace,{state:state as never})}})
    const wrapper=mount(Host,{global:{directives:{loading:()=>{}},stubs:{RendererTabs:Slot,RendererTabPane:TabPane,DisplayEmpty:TestEmpty,
      PrototypePane:true,BlueprintReadonlyInfo:true,DataPlanningPane:true,NodeBasicInfo:true,NodeTargetConfig:true,NodeLayoutConfig:true,
      NodeStateConfig:true,EstimatePane:true,DeliveryPane:true,ReleasePane:true}}})
    try{
      await flushPromises()
      expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('node query failed'),'error')
      expect(wrapper.find('[data-testid="runtime-probe"]').exists()).toBe(false)
      expect(removedValues).toEqual([null,null])
    }finally{useSpy.mockRestore();wrapper.unmount();owner.dispose();runtime.dispose();dataSet.destroy()}
  })
})

async function blueprintTestRuntime() {
  const dataSet=createDataSet()
  const runtime=new PageRuntime({pageId:'blueprint-node-basic-info-test',scenarioIds:[scenarioId],loadScenario:async()=>dataSet})
  await runtime.load()
  return runtime
}

describe('BlueprintWorkspace file delivery', () => {
  beforeEach(() => {
    api.readRequestScope.mockReset().mockReturnValue({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })
    runtime.load.mockReset()
    api.createSnapshot.mockReset().mockImplementation(async (input:{fileName:string;onAttempt?:(result:{version:number;fileName:string})=>void})=>{
      const result={version:8,fileName:`8__${input.fileName}`};input.onAttempt?.(result);return result
    })
  })

  it('opens the new node while the old query is pending and ignores its late completion',async()=>{
    const firstDataSet=createDataSet(),nextDataSet=createDataSet({nodeId:'node-B'})
    const firstRuntime=new PageRuntime({pageId:'pending-node-A',scenarioIds:[scenarioId],loadScenario:async()=>firstDataSet})
    const nextRuntime=new PageRuntime({pageId:'ready-node-B',scenarioIds:[scenarioId],loadScenario:async()=>nextDataSet})
    await firstRuntime.load();await nextRuntime.load()
    let release:()=>void=()=>{}
    const pending=new Promise<void>(resolve=>{release=resolve})
    const firstView=firstDataSet.getView('Base_NavigationInfo')!
    const refresh=firstView.refresh.bind(firstView)
    vi.spyOn(firstView,'refresh').mockImplementation(async()=>{await pending;return refresh()})
    const NodeProbe=defineComponent({setup(){
      const {sparkConsume}=useSparkConsume(),row=sparkConsume(DATA_ROW)
      return ()=>h('output',{'data-node-context':''},String(row?.['rowid']??'none'))
    }})
    const mounted=setup({},'saved',{dataSet:firstDataSet,runtime:firstRuntime,stubs:{
      RendererTabs:false,RendererTabPane:false,RendererButton:false,NodeBasicInfo:NodeProbe,DeliveryPane:true,
    }})
    try{
      await flushPromises()
      expect(firstView.refresh).toHaveBeenCalledOnce()
      expect(mounted.wrapper.find('[data-node-context]').exists()).toBe(false)
      mounted.replaceWorkspace(nextDataSet,nextRuntime)
      mounted.state.selectedNode.value={nodeId:'node-B'}
      await flushPromises()
      expect(mounted.wrapper.get('[data-node-context]').text()).toBe('node-B')
      const current=mounted.workspaceOwner()!
      expect(current.view).toBe(nextRuntime.resolveView(buildDataViewKey('Base_NavigationInfo','default',scenarioId)))
      release();await flushPromises()
      expect(mounted.wrapper.get('[data-node-context]').text()).toBe('node-B')
      expect(mounted.workspaceOwner()).toBe(current)
    }finally{release();mounted.wrapper.unmount();mounted.workspaceOwner()?.dispose();firstRuntime.dispose();nextRuntime.dispose()}
  })

  it('routes the node-stage field through the runtime-resolved formal node DataView and inherited row', async () => {
    const dataSet=createDataSet()
    const runtime=new PageRuntime({pageId:'blueprint-node-context-red',scenarioIds:[scenarioId],loadScenario:async()=>dataSet})
    await runtime.load()
    const observed:Array<{source:unknown;row:DataRow|undefined}> = []
    const NodeContextProbe=defineComponent({setup(){
      const {sparkConsume}=useSparkConsume()
      observed.push({source:sparkConsume(DATA_SOURCE),row:sparkConsume(DATA_ROW) as DataRow|undefined})
      return ()=>h('div',{class:'node-context-probe'},[h('output',String((sparkConsume(DATA_ROW) as DataRow|undefined)?.['rowid']??'no-row')),
        h(SparkComponent.RendererForm,{autoColumns:false,showDataViewMeta:false,contextDataMember:'currentRow'},{default:()=>
          h(FieldText,{dataMember:'currentRow',dataField:'memo',label:'节点备注','onUpdate:modelValue':()=>mounted.state.notifyExternalDataViewChanged()})})])
    }})
    const mounted=setup({},'saved',{dataSet,runtime,stubs:{
      RendererTabs:false,RendererTabPane:false,RendererButton:false,NodeBasicInfo:NodeContextProbe,
      DeliveryPane:true,
    }})
    let nextDataSet:DataSet|undefined
    let nextRuntime:PageRuntime|undefined
    try{
      await flushPromises()
      const owner=mounted.workspaceOwner()!
      const nodeKey=buildDataViewKey('Base_NavigationInfo','default',scenarioId)
      expect(runtime.resolveView(nodeKey)).toBe(owner.view)
      expect(observed.some(({source,row})=>source===owner.view&&row?.['rowid']==='node-A'&&row?.['SysId']==='APP-A'),mounted.wrapper.html()).toBe(true)
      const input=mounted.wrapper.get('.node-context-probe textarea')
      await input.setValue('stage edit through inherited node DataView')
      expect(owner.view.getEditingPatch('node-A')).toMatchObject({memo:'stage edit through inherited node DataView'})
      await mounted.wrapper.findAll('button').find(button=>button.text().includes('取消节点修改'))?.trigger('click')
      await flushPromises()
      expect(owner.view.getEditingPatch('node-A')).toBeUndefined()

      observed.splice(0)
      nextDataSet=createDataSet({nodeId:'node-B'})
      nextRuntime=new PageRuntime({pageId:'blueprint-node-context-next-runtime',scenarioIds:[scenarioId],loadScenario:async()=>nextDataSet!})
      await nextRuntime.load()
      mounted.replaceWorkspace(nextDataSet,nextRuntime)
      mounted.state.selectedNode.value={nodeId:'node-B'}
      await flushPromises()
      const nextOwner=mounted.workspaceOwner()!
      expect(nextOwner).not.toBe(owner)
      expect(nextOwner.view).not.toBe(owner.view)
      expect(nextRuntime.resolveView(nodeKey)).toBe(nextOwner.view)
      expect(nextOwner.view.currentRow?.['rowid']).toBe('node-B')
      expect(observed.some(({source,row})=>source===nextOwner.view&&row?.['rowid']==='node-B'&&row?.['SysId']==='APP-A')).toBe(true)
      const nextInput=mounted.wrapper.get('.node-context-probe textarea')
      await nextInput.setValue('node B edit in its new runtime')
      expect(nextOwner.view.getEditingPatch('node-B')).toMatchObject({memo:'node B edit in its new runtime'})
      expect(owner.view.getEditingPatch('node-A')).toBeUndefined()
    }finally{mounted.wrapper.unmount();mounted.workspaceOwner()?.dispose();dataSet.destroy();runtime.dispose();nextRuntime?.dispose();nextDataSet?.destroy()}
  })

  it('routes DeliveryPane tabs and its cross-file save command through the current node view context', async () => {
    const dataSet=createDataSet()
    const runtime=new PageRuntime({pageId:'blueprint-delivery-context-red',scenarioIds:[scenarioId],loadScenario:async()=>dataSet})
    await runtime.load()
    const observed:Array<{source:unknown;row:DataRow|undefined}> = []
    const FileContextProbe=defineComponent({setup(){
      const {sparkConsume}=useSparkConsume()
      observed.push({source:sparkConsume(DATA_SOURCE),row:sparkConsume(DATA_ROW) as DataRow|undefined})
      return ()=>h('output',{class:'delivery-file-context-probe'},String((sparkConsume(DATA_ROW) as DataRow|undefined)?.['rowid']??'no-row'))
    }})
    const mounted=setup({},'saved',{dataSet,runtime,stubs:{
      RendererTabs:false,RendererTabPane:false,RendererButton:false,DeliveryPane:false,
      DevFileEditor:FileContextProbe,DevPreviewTab:true,
    }})
    try{
      await flushPromises()
      const extension=mounted.wrapper.findAll('.el-tabs__item').find(item=>item.text().includes('本仓扩展'))
      expect(extension,mounted.wrapper.html()).toBeDefined()
      await extension!.trigger('click')
      await flushPromises()
      const delivery=mounted.wrapper.findAll('.el-tabs__item').find(item=>item.text().includes('开发交付'))
      expect(delivery).toBeDefined()
      await delivery!.trigger('click')
      await flushPromises()
      const owner=mounted.workspaceOwner()!
      expect(observed.some(({source,row})=>source===owner.view&&row?.['rowid']==='node-A'&&row?.['SysId']==='APP-A')).toBe(true)
      await mounted.wrapper.findAll('button').find(button=>button.text().includes('保存三个交付文件'))?.trigger('click')
      await flushPromises()
      expect(api.createSnapshot).toHaveBeenCalledTimes(3)
      expect(owner.value('VersionId')).toBe('rule=8;script=8;style=8')
      expect(mounted.state.addStatus).toHaveBeenCalledWith(expect.stringContaining('三个文件已独立上传、切换版本并读回'),'success')
    }finally{mounted.wrapper.unmount();mounted.workspaceOwner()?.dispose();dataSet.destroy();runtime.dispose()}
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
    wrapper.findAllComponents(StandardRenderer).find(button=>button.props('label')==='取消节点修改')!.vm.$emit('click')
    await flushPromises()
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

  it('publishes the newly created cfg:tool-A identity through the actual ProjectBlueprint projection', async () => {
    const {wrapper, state, dataSet} = setup({target: 'cfg:tool-A'}); await flushPromises()
    expect(state.activePageId.value).toBe('tool-A')
    expect(state.registerExternalDataViewSession.mock.calls[0]?.[0].isDirty()).toBe(false)
    expect(state.blueprintNodeFieldAccess('NavigationUrl')).toMatchObject({read: true, write: true})
    expect(state.blueprintNodeFieldAccess('VersionId')).toMatchObject({read: true, write: true})
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(true)
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(3)
    expect(api.createSnapshot.mock.calls.map(call => [call[0].pageId, call[0].customPath])).toEqual([
      ['tool-A', 'APP-A/tool-A'], ['tool-A', 'APP-A/tool-A'], ['tool-A', 'APP-A/tool-A'],
    ])
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('交付路径必须属于当前请求应用'), 'error')
    expect(dataSet.getView('Base_NavigationInfo')?.rows[0]?.['NavigationUrl']).toBe('cfg:tool-A')
    expect(dataSet.getView('Base_NavigationInfo')?.rows[0]?.['VersionId']).toBe('rule=8;script=8;style=8')
    wrapper.unmount()
  })

  it('publishes the VersionId when NavigationUrl is readable but not writable', async () => {
    const {wrapper, state, dataSet} = setup({target: 'cfg:tool-A', deniedWrite: 'NavigationUrl'}); await flushPromises()
    expect(state.activePageId.value).toBe('tool-A')
    expect(state.blueprintNodeFieldAccess('NavigationUrl')).toMatchObject({read: true, write: false})
    expect(state.blueprintNodeFieldAccess('VersionId')).toMatchObject({read: true, write: true})
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(true)
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(3)
    expect(dataSet.getView('Base_NavigationInfo')?.rows[0]?.['NavigationUrl']).toBe('cfg:tool-A')
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

  it.each(['cfg:APP-A/tool-A', 'cfg:APP-B/tool-A', 'cfg:APP-A/../APP-B/tool-A'])('rejects invalid tool identities before snapshot I/O: %s', async target => {
    const { wrapper, state } = setup({target}); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).not.toHaveBeenCalled()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('交付工具身份必须与当前项目及页面一致'), 'error')
    wrapper.unmount()
  })

  it('stops after a target switch without publishing the uploaded snapshot', async () => {
    let finish!: () => void
    api.createSnapshot.mockImplementationOnce(async (input:{onAttempt?:(result:{version:number;fileName:string})=>void})=>{input.onAttempt?.({version:8,fileName:'8__rule.json'});return await new Promise(resolve=>{finish=()=>resolve({version:8,fileName:'8__rule.json'})})})
    const { wrapper, state,fileViews } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    state.selectedNode.value = { nodeId: 'node-B' }; await flushPromises()
    finish(); await flushPromises()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('stops the old publication when the NavigationUrl DataView draft changes during snapshot upload', async () => {
    let finish!: (result: {version:number;fileName:string}) => void
    api.createSnapshot.mockImplementationOnce(async (input:{fileName:string;onAttempt?:(result:{version:number;fileName:string})=>void}) => {
      const result={version:8,fileName:`8__${input.fileName}`}
      input.onAttempt?.(result)
      return await new Promise(resolve=>{finish=()=>resolve(result)})
    })
    const {wrapper,state,dataSet}=setup(); await flushPromises()
    const save=vi.spyOn(dataSet,'saveChanges')
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(1)
    const view=dataSet.getView('Base_NavigationInfo')!
    view.updateEditingValue('node-A','NavigationUrl','cfg:tool-B')
    expect(state.activePageId.value).toBe('tool-A')
    expect(view.getEditingPatch('node-A')).toMatchObject({NavigationUrl:'cfg:tool-B'})
    finish({version:8,fileName:'8__rule.json'})
    await flushPromises()
    expect.soft(api.createSnapshot).toHaveBeenCalledTimes(1)
    expect.soft(save).not.toHaveBeenCalled()
    expect.soft(view.getEditingPatch('node-A')).toMatchObject({NavigationUrl:'cfg:tool-B'})
    expect.soft(view.rows[0]?.['NavigationUrl']).toBe('cfg:tool-A')
    wrapper.unmount()
  })

  it('preserves a Manhour DataView draft made through the estimate pane while snapshot upload is pending', async () => {
    let finish!: (result: {version:number;fileName:string}) => void
    api.createSnapshot.mockImplementationOnce(async (input:{fileName:string;onAttempt?:(result:{version:number;fileName:string})=>void}) => {
      const result={version:8,fileName:`8__${input.fileName}`}
      input.onAttempt?.(result)
      return await new Promise(resolve=>{finish=()=>resolve(result)})
    })
    const {wrapper,state,dataSet,workspaceOwner}=setup(); await flushPromises()
    const save=vi.spyOn(dataSet,'saveChanges')
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    expect(api.createSnapshot).toHaveBeenCalledTimes(1)
    const owner=workspaceOwner()!
    owner.update('Manhour',17)
    expect(owner.dirty).toBe(true)
    expect(state.activePageId.value).toBe('tool-A')
    finish({version:8,fileName:'8__rule.json'})
    await flushPromises()
    expect.soft(api.createSnapshot).toHaveBeenCalledTimes(1)
    expect.soft(save).not.toHaveBeenCalled()
    expect.soft(owner.view.getEditingPatch('node-A')).toMatchObject({Manhour:17})
    expect.soft(owner.row?.['Manhour']).toBe(2)
    expect.soft(owner.row?.['VersionId']).toBe('rule=1;script=1;style=1')
    wrapper.unmount()
  })

  it('preserves a confirmed snapshot but stops publishing edits made during upload', async () => {
    let finish!: () => void
    api.createSnapshot.mockImplementationOnce(async (input:{onAttempt?:(result:{version:number;fileName:string})=>void})=>{input.onAttempt?.({version:8,fileName:'8__rule.json'});return await new Promise(resolve=>{finish=()=>resolve({version:8,fileName:'8__rule.json'})})})
    const { wrapper, state,fileViews } = setup(); await flushPromises()
    await wrapper.findComponent(Delivery).find('button').trigger('click'); await flushPromises()
    await fileViews.get('rule.json')!.editRowById('rule.json',{text:'edited'})
    expect(fileViews.get('rule.json')!.hasEditingChanges()).toBe(true)
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

  it('refreshes delivery permission when the loaded DataView denies VersionId write access', async () => {
    const {wrapper} = setup({deniedWrite: 'VersionId'}); await flushPromises()
    expect(wrapper.findComponent(Delivery).props('canPublish')).toBe(false)
    wrapper.unmount()
  })

  it('reuses the DevState-owned DataView when selection clears and is restored', async () => {
    const {wrapper, state} = setup(); await flushPromises()
    state.selectedNode.value = null
    await nextTick(); await flushPromises()
    state.selectedNode.value = {nodeId: 'node-A'}
    await nextTick(); await flushPromises()
    expect(state.loadBlueprintWorkspaceDataView).toHaveBeenCalledTimes(2)
    expect(state.registerExternalDataViewSession).toHaveBeenCalledTimes(1)
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 未初始化'), 'error')
    expect(state.addStatus).not.toHaveBeenCalledWith(expect.stringContaining('DataView 加载失败'), 'error')
    await flushPromises()
    wrapper.unmount()
  })
})

describe('Blueprint editor owner-view field bindings', () => {
  it('binds filterable standard icon choices and only marks the selected field update',async()=>{
    const fixture=createBlueprintDataViewFixture()
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,'APP-1',()=>undefined)
    await owner.load('NODE-1')
    const markBlueprintDirty=vi.fn()
    const state={projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintPageRuntime:ref(undefined),blueprintWorkspaceDataView:shallowRef(owner),blueprintDraft:{kind:'page',capability:{name:'Node'},navigation:{title:'Node',icon:'Document',target:'cfg:tool-A'}},
      blueprintNodeFieldAccess:(field:string)=>({read:owner.canRead(field),write:owner.canWrite(field)}),blueprintNodeSectionWritable:()=>false,markBlueprintDirty}
    const FieldSelectProbe=defineComponent({props:['dataViewKey','dataMember','dataField','options','filterable','clearable'],emits:['update:modelValue','search'],
      template:'<div><input data-search @input="$emit(\'search\',$event.target.value)"><button data-select /></div>'})
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const runtime=await blueprintTestRuntime()
    const BoundHost=defineComponent({setup(){useSparkComponent({type:'blueprint-icon-search-host'}).sparkProvide(PAGE_RUNTIME,runtime);return()=>h(NodeBasicInfo,{state:state as never,sections:['navigation']})}})
    const wrapper=mount(BoundHost,{global:{stubs:{RendererForm:FormStub,RendererDivider:true,FieldText:true,FieldTextarea:true,FieldSelect:FieldSelectProbe,RendererButton:true,RendererDialog:true,RendererFilter:true,RendererTable:true}}})
    try{
      const icon=wrapper.findAllComponents(FieldSelectProbe).find(field=>field.props('dataField')==='NavigationImageWxz')!
      expect(icon.props()).toMatchObject({dataMember:'currentRow',filterable:true})
      expect(icon.props('dataViewKey')).toContain('@Base_NavigationInfo@default')
      expect(icon.props('options').map((item:{value:string})=>item.value)).toEqual(expect.arrayContaining(['Document','Folder','FolderOpened']))
      await wrapper.get('[data-search]').setValue('folder')
      expect(owner.value('NavigationImageWxz')).toBe('Document')
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined()
      expect(markBlueprintDirty).not.toHaveBeenCalled()
      icon.vm.$emit('update:modelValue','Folder')
      expect(markBlueprintDirty).toHaveBeenCalledTimes(1)
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{wrapper.unmount();owner.dispose();fixture.destroy();runtime.dispose()}
  })

  it('keeps target candidate search side-effect free and applies a custom URL from the current owner only on demand',async()=>{
    const fixture=createBlueprintDataViewFixture()
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,'APP-1',()=>undefined)
    await owner.load('NODE-1')
    const originalTarget=owner.value('NavigationUrl')
    const handlePathChange=vi.fn(),markBlueprintDirty=vi.fn()
    const state={projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintWorkspaceDataView:shallowRef(owner),blueprintDraft:{kind:'page',capability:{name:'Node'},navigation:{title:'Node',icon:'Document',target:'cfg:tool-A'}},
      blueprintNodeFieldAccess:(field:string)=>({read:owner.canRead(field),write:owner.canWrite(field)}),pageList:ref([{pageId:'tool-A',title:'Existing tool',designSurface:'config-files'}]),
      handlePathChange,markBlueprintDirty,createPageForSelectedNode:vi.fn(),linkProbeLoading:ref(false),linkProbeInfo:ref(null),probeLinkTarget:vi.fn(),addStatus:vi.fn()}
    const FieldSelectProbe=defineComponent({props:['dataViewKey','dataMember','dataField','options','filterable','clearable'],emits:['update:modelValue','search'],
      template:'<div><input data-search @input="$emit(\'search\',$event.target.value)"></div>'})
    const FieldTextProbe=defineComponent({props:['dataViewKey','dataMember','dataField','label'],emits:['update:modelValue'],template:'<label>{{label}}<input data-custom /></label>'})
    const ButtonProbe=defineComponent({props:['label','disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}</button>'})
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const runtime=await blueprintTestRuntime()
    const Host=defineComponent({setup(){useSparkComponent({type:'blueprint-target-search-host'}).sparkProvide(PAGE_RUNTIME,runtime);return()=>h(NodeTargetConfig,{state:state as never})}})
    const wrapper=mount(Host,{global:{stubs:{RendererForm:FormStub,RendererDivider:true,FieldText:FieldTextProbe,FieldSelect:FieldSelectProbe,RendererButton:ButtonProbe}}})
    try{
      const target=wrapper.findAllComponents(FieldSelectProbe).find(field=>field.props('dataField')==='NavigationUrl')!
      expect(target.props()).toMatchObject({dataMember:'currentRow',filterable:true})
      expect(target.props('options')).toContainEqual({value:'cfg:tool-A',label:'工具 · Existing tool'})
      await wrapper.get('[data-search]').setValue('Existing tool')
      expect(owner.value('NavigationUrl')).toBe(originalTarget)
      expect(owner.view.getEditingPatch('NODE-1')).toBeUndefined()
      expect(handlePathChange).not.toHaveBeenCalled()
      expect(fixture.save).not.toHaveBeenCalled()
      target.vm.$emit('update:modelValue','vue:/orders')
      expect(handlePathChange).toHaveBeenCalledTimes(1)
      const inputCustom=wrapper.findAllComponents(ButtonProbe).find(button=>button.props('label')==='输入自定义目标')!
      await inputCustom.trigger('click')
      expect(wrapper.findComponent(FieldTextProbe).exists()).toBe(true)
      owner.update('NavigationUrl','https://example.test/path')
      wrapper.findComponent(FieldTextProbe).vm.$emit('update:modelValue','https://example.test/path')
      expect(owner.value('NavigationUrl')).toBe('https://example.test/path')
      expect(handlePathChange).toHaveBeenCalledTimes(1)
      expect(markBlueprintDirty).toHaveBeenCalledTimes(1)
      const apply=wrapper.findAllComponents(ButtonProbe).find(button=>button.props('label')==='同步当前工具目标')!
      await apply.trigger('click')
      expect(handlePathChange).toHaveBeenLastCalledWith('https://example.test/path')
      expect(handlePathChange).toHaveBeenCalledTimes(2)
      expect(owner.view.getEditingPatch('NODE-1')).toEqual({NavigationUrl:'https://example.test/path'})
    }finally{wrapper.unmount();owner.dispose();fixture.destroy();runtime.dispose()}
  })

  it('binds capability and navigation fields to the builtin file owner even beside a conflicting DB view',async()=>{
    const application=getBuiltinApplicationDescriptor(),scenario=getBuiltinScenarioResource('projectBlueprint')
    const source=await readBuiltinSystemNavigation()
    const node=source.records.find(record=>record.conType==='Navitem'&&record.FunName.trim())!
    const dataSet=DataSet.fromJson({scenarioId:scenario.scenarioId,tables:{
      [BUILTIN_BLUEPRINT_NODE_TABLE_NAME]:{resourceType:'file',resourceId:BUILTIN_BLUEPRINT_NODE_RESOURCE_ID,
        columns:BUILTIN_BLUEPRINT_BUSINESS_FIELDS.map(name=>({name,type:['Manhour','Sum','Total','DifficultyFactor','Number','FunOrderValue'].includes(name)?'number':'string',isPrimaryKey:name==='rowid'})),
        views:{default:{}}},
      Base_NavigationInfo:{modelBinding:{modelId:`${scenario.scenarioId}p000`,modelName:'Base_NavigationInfo'},
        columns:BUILTIN_BLUEPRINT_BUSINESS_FIELDS.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),
        views:{default:{rows:[{...node,name:'DB-conflict-name',memo:'DB-conflict-memo',FunName:'DB-conflict-title'}]}}},
    }})
    const fileView=dataSet.getView(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,'default')!
    new BuiltinBlueprintNodeResource({applicationId:application.id,scenarioId:scenario.scenarioId,assertCurrent:()=>undefined}).bind(fileView)
    const dbView=dataSet.getView('Base_NavigationInfo','default')!
    const conflictRow:DataRow={...node,name:'DB-conflict-name',memo:'DB-conflict-memo',FunName:'DB-conflict-title'}
    dbView.bindQueryExecutor({queryColumns:current=>current.columns,executeQuery:async()=>({rows:[conflictRow],total:1,resultPrimaryKey:'rowid',
      rowKey:row=>row['rowid'],assertIdentity:()=>undefined,fieldAccess:()=>({read:'visible',write:'denied',component:'readonly',required:false,writeMode:'readonly'}),
      readFieldAccess:()=> 'visible',addActionState:()=> 'disabled',editActionState:()=> 'disabled',deleteActionState:()=> 'disabled',
      createChildActionState:()=> 'disabled',viewActionState:()=> 'enabled'})})
    await dbView.refresh()
    dbView.setCurrentRowById(node.rowid)
    const owner=new BlueprintWorkspaceDataView(dataSet,application.id,()=>undefined)
    const runtime=new PageRuntime({pageId:'builtin-owner-field-binding',scenarioIds:[scenario.scenarioId],loadScenario:async()=>dataSet})
    await runtime.load()
    await owner.loadProjectTree()
    await owner.load(node.rowid)
    const state={projectId:application.id,selectedNode:ref({nodeId:node.rowid}),blueprintPageRuntime:shallowRef(runtime),blueprintWorkspaceDataView:shallowRef(owner),
      blueprintDraft:{...owner.nodeData(),kind:'module',navigation:{title:node.FunName,target:'cfg:tool',icon:'Document'}},blueprintNodeFieldAccess:(field:string)=>({read:owner.canRead(field),write:owner.canWrite(field)}),
      blueprintNodeSectionWritable:()=>false,markBlueprintDirty:vi.fn(),notifyExternalDataViewChanged:vi.fn(),
      loadNavigationDictionaryOptions:vi.fn().mockResolvedValue(undefined),pageDataDirty:ref(false),pageList:ref([]),handlePathChange:vi.fn(),
      linkProbeInfo:ref(null),linkProbeLoading:ref(false),probeLinkTarget:vi.fn(),createPageForSelectedNode:vi.fn(),addStatus:vi.fn()}
    const FormProbe=defineComponent({name:'RendererForm',props:['dataViewKey','dataSource'],template:'<div><slot /></div>'})
    const FieldProbe=(name:string)=>defineComponent({name,props:['dataViewKey','dataMember','dataField'],template:'<span />'})
    const Host=defineComponent({setup(){useSparkComponent({type:'builtin-owner-field-binding-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h('div',[h(NodeBasicInfo,{state:state as never,sections:['capability']}),h(NodeStateConfig,{state:state as never}),
        h(NodeTargetConfig,{state:state as never}),h(NodeLayoutConfig,{state:state as never})])}})
    const wrapper=mount(Host,{global:{plugins:[Spark.createPlugin()],stubs:{
      RendererForm:FormProbe,FieldText:FieldProbe('FieldText'),FieldTextarea:FieldProbe('FieldTextarea'),FieldSelect:FieldProbe('FieldSelect'),
      FieldAutocomplete:FieldProbe('FieldAutocomplete'),FieldRadio:FieldProbe('FieldRadio'),FieldNumber:FieldProbe('FieldNumber'),FieldCheckbox:FieldProbe('FieldCheckbox'),
      RendererButton:true,RendererDialog:true,RendererFilter:true,RendererTable:true,ElDivider:true,ElFormItem:true,ElAlert:true,
      RendererDivider:true,ElInput:true,ElSelect:true,ElSwitch:true,ElOption:true,ElInputNumber:true,IconPicker:true,
    }}})
    try{
      expect(owner.view.tableName).toBe(BUILTIN_BLUEPRINT_NODE_TABLE_NAME)
      expect(owner.value('name')).toBe(node.name)
      expect(dataSet.getView('Base_NavigationInfo','default')?.currentRow?.['name']).toBe('DB-conflict-name')
      const builtinKey=buildDataViewKey(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,'default',scenario.scenarioId)
      expect(runtime.resolveView(builtinKey)).toBe(owner.view)
      expect(wrapper.getComponent(FormProbe).props('dataSource')).toBeUndefined()
      expect(wrapper.getComponent(FormProbe).props('dataViewKey')).toBe(builtinKey)
      expect(wrapper.findAllComponents({name:'FieldText'}).every(field=>field.props('dataMember')==='currentRow'&&field.props('dataViewKey')===builtinKey)).toBe(true)
      expect(wrapper.findAllComponents({name:'FieldTextarea'}).every(field=>field.props('dataMember')==='currentRow'&&field.props('dataViewKey')===builtinKey)).toBe(true)
      expect(wrapper.findAllComponents({name:'FieldSelect'}).every(field=>field.props('dataMember')==='currentRow'&&field.props('dataViewKey')===builtinKey)).toBe(true)
      const radioFields=wrapper.findAllComponents({name:'FieldRadio'})
      expect(radioFields.length).toBeGreaterThan(0)
      expect(radioFields.every(field=>field.props('dataMember')==='currentRow'&&field.props('dataViewKey')===builtinKey)).toBe(true)
      expect(wrapper.findAllComponents(FormProbe).length).toBeGreaterThanOrEqual(4)
      expect(wrapper.findAllComponents(FormProbe).every(form=>form.props('dataViewKey')===builtinKey&&form.props('dataSource')===undefined)).toBe(true)
      wrapper.unmount()
      const workspaceState={...state,hasAnyDirty:ref(false),activePageId:ref(''),
        loadBlueprintWorkspaceDataView:vi.fn().mockResolvedValue(owner),refreshBlueprintTreeProjection:vi.fn()}
      const ContextProbe=defineComponent({setup(){
        const {sparkConsume}=useSparkConsume(),view=sparkConsume(DATA_SOURCE),row=sparkConsume(DATA_ROW)
        return ()=>h('output',{'data-builtin-context':''},`${view?.tableName}:${String(row?.['rowid'])}:${String(row?.['name'])}`)
      }})
      const WorkspaceHost=defineComponent({setup(){
        useSparkComponent({type:'builtin-workspace-context-host'}).sparkProvide(PAGE_RUNTIME,runtime)
        return ()=>h(BlueprintWorkspace,{state:workspaceState as never})
      }})
      const workspace=mount(WorkspaceHost,{global:{plugins:[ElementPlus,Spark.createPlugin()],stubs:{
        NodeBasicInfo:ContextProbe,PrototypePane:true,DataPlanningPane:true,BlueprintReadonlyInfo:true,
        NodeTargetConfig:true,NodeLayoutConfig:true,NodeStateConfig:true,EstimatePane:true,DeliveryPane:true,ReleasePane:true,
      }}})
      try{
        await flushPromises()
        expect(workspace.get('[data-builtin-context]').text()).toBe(`${BUILTIN_BLUEPRINT_NODE_TABLE_NAME}:${node.rowid}:${node.name}`)
        expect(workspace.getComponent(SparkComponent.RendererTabs).props('dataViewKey')).toBe(builtinKey)
      }finally{workspace.unmount()}
    }finally{if(wrapper.exists())wrapper.unmount();owner.dispose();runtime.dispose();dataSet.destroy()}
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
  it('keeps DataView currentRow on the selected project row after loading project records',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Child',FunName:'Child'}
    const f=createBlueprintDataViewFixture({rows:[root,child]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await owner.loadProjectTree()
      await owner.load('NODE-2')
      expect(owner.canRead('memo')).toBe(true)
      expect(owner.view.currentRow?.['rowid']).toBe('NODE-2')
      expect(owner.row).toBe(owner.view.currentRow)

      await owner.loadProjectTree()
      expect(owner.row).toBe(owner.view.currentRow)
      expect(owner.row?.['rowid']).toBe('NODE-2')

      await owner.loadProjectRecords()

      expect(owner.view.currentRow?.['rowid']).toBe('NODE-2')
      expect(owner.row).toBe(owner.view.currentRow)
      owner.dispose()
    }finally{f.destroy()}
  })

  it('keeps DataView currentRow on the selected project row after save and readback',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const child={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Child',FunName:'Child'}
    const f=createBlueprintDataViewFixture({rows:[root,child]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{})
      await owner.loadProjectTree()
      await owner.load('NODE-2')
      owner.update('memo','after')

      await owner.saveSelectedNode()

      expect(owner.canRead('memo')).toBe(true)
      expect(owner.row?.['rowid']).toBe('NODE-2')
      expect(owner.row).toBe(owner.view.currentRow)
      expect(owner.view.currentRow?.['rowid']).toBe('NODE-2')
      owner.dispose()
    }finally{f.destroy()}
  })

  it('saves two existing leaf updates in one DataSet batch and reads back each formal memo',async()=>{
    const root={...blueprintRow(),rowid:'NODE-ROOT',prowid:'000000',name:'Root',FunName:'Root',conType:'Model'}
    const first={...blueprintRow(),rowid:'NODE-1',prowid:'NODE-ROOT',name:'Node one',FunName:'Node one',conType:'Navitem'}
    const second={...blueprintRow(),rowid:'NODE-2',prowid:'NODE-ROOT',name:'Node two',FunName:'Node two',conType:'Navitem'}
    const f=createBlueprintDataViewFixture({rows:[root,first,second]})
    try{
      const owner=new BlueprintWorkspaceDataView(f.dataSet,'APP-1',()=>{});await owner.loadProjectTree()
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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
      const editor=new ProjectWorkspace({projectId:'APP-1',blueprint:{}})
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

  it('hides unreadable and disables non-writable fields across all NodeBasicInfo panels',async()=>{
    const fixture=createBlueprintDataViewFixture()
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,'APP-1',()=>undefined)
    const access=vi.fn((field:string)=>({read:field!=='memo',write:false}))
    const state={blueprintDraft:{nodeId:'NODE-1',projectId:'APP-1',parentNodeId:'000000',kind:'module',capability:{name:'Node',description:'secret'},
      navigation:{title:'Node',icon:'Document',target:'cfg:tool',mobileTarget:'',openMode:'current',placement:'left',order:1,publishInMenu:true,showChildren:true,beginGroup:false},
      dataSpace:{scenarioId:'SCENE',models:[]},prototype:{htmlDescription:'prototype'}},
      projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintPageRuntime:ref(undefined),blueprintWorkspaceDataView:shallowRef(owner),pageDataDirty:ref(false),blueprintNodeFieldAccess:access,blueprintNodeFieldsWritable:vi.fn(()=>false),blueprintNodeSectionWritable:vi.fn(()=>false),
      markBlueprintDirty:vi.fn(),handlePathChange:vi.fn(),createPageForSelectedNode:vi.fn(),pageList:ref([]),activePageId:ref(''),
      linkProbeLoading:ref(false),linkProbeInfo:ref(null),probeLinkTarget:vi.fn(),addStatus:vi.fn()}
    const Control=defineComponent({name:'FieldControl',props:{disabled:Boolean,readonly:Boolean,modelValue:null,label:String},template:'<label>{{label}}<input :disabled="disabled" :readonly="readonly" /></label>'})
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const runtime=await blueprintTestRuntime()
    const Panels=defineComponent({setup(){useSparkComponent({type:'blueprint-panels-test'}).sparkProvide(PAGE_RUNTIME,runtime);
      return ()=>h('div',[h(NodeBasicInfo,{state:state as never}),h(NodeTargetConfig,{state:state as never}),h(NodeStateConfig,{state:state as never}),h(NodeLayoutConfig,{state:state as never})])}})
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      wrapper=mount(Panels,{global:{stubs:{RendererForm:FormStub,RendererDivider:true,FieldText:Control,FieldTextarea:Control,FieldSelect:Control,FieldRadio:Control,FieldNumber:Control,FieldSwitch:Control,RendererButton:StandardRenderer,RendererDialog:StandardRenderer,RendererFilter:StandardRenderer,RendererTable:StandardRenderer}}})
      expect(wrapper.text()).not.toContain('功能描述')
      expect(wrapper.findAllComponents(Control).length).toBeGreaterThan(0)
      expect(wrapper.findAllComponents(Control).every(control=>control.props('disabled')===true||control.props('readonly')===true)).toBe(true)
      expect(access).toHaveBeenCalledWith('name')
      expect(access).toHaveBeenCalledWith('FunName')
      expect(access).toHaveBeenCalledWith('MobileUrl')
      expect(access).toHaveBeenCalledWith('IsShowAtNav')
      expect(access).toHaveBeenCalledWith('ChildItemLocation')
    } finally {wrapper?.unmount();owner.dispose();fixture.destroy();runtime.dispose()}
  })

  it('filters NodeBasicInfo to capability fields while retaining the default full view',async()=>{
    const fixture=createBlueprintDataViewFixture()
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,'APP-1',()=>undefined)
    const state={blueprintDraft:{nodeId:'NODE-1',projectId:'APP-1',parentNodeId:'000000',kind:'module',capability:{name:'Node',description:'memo'},navigation:{title:'Node',icon:'Document',target:'cfg:tool',order:1,publishInMenu:true,showChildren:true,beginGroup:false},dataSpace:{scenarioId:'SCENE',models:[]},prototype:{htmlDescription:'prototype'}},projectId:'APP-1',selectedNode:ref({nodeId:'NODE-1'}),blueprintPageRuntime:ref(undefined),blueprintWorkspaceDataView:shallowRef(owner),pageDataDirty:ref(false),
      blueprintNodeFieldAccess:vi.fn(()=>({read:true,write:false})),blueprintNodeFieldsWritable:vi.fn(()=>false),blueprintNodeSectionWritable:vi.fn(()=>false),markBlueprintDirty:vi.fn(),handlePathChange:vi.fn(),createPageForSelectedNode:vi.fn(),pageList:ref([]),activePageId:ref(''),linkProbeLoading:ref(false),linkProbeInfo:ref(null),probeLinkTarget:vi.fn(),addStatus:vi.fn()}
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const runtime=await blueprintTestRuntime()
    const Basic=defineComponent({props:{state:Object,sections:Array},setup(props){useSparkComponent({type:'blueprint-basic-info-test'}).sparkProvide(PAGE_RUNTIME,runtime)
      return ()=>h(NodeBasicInfo,{state:props.state as never,sections:props.sections as never})}})
    const global={stubs:{RendererForm:FormStub,RendererDivider:true,FieldText:StandardField,FieldTextarea:StandardField,FieldSelect:StandardField,FieldRadio:StandardField,FieldNumber:StandardField,FieldSwitch:StandardField,RendererButton:StandardRenderer,RendererDialog:StandardRenderer,RendererFilter:StandardRenderer,RendererTable:StandardRenderer}}
    let mounted: ReturnType<typeof mount>[] = []
    try {
      const filtered=mount(Basic,{props:{state,sections:['capability']},global}); mounted.push(filtered)
      expect(filtered.text()).toContain('能力名称')
      expect(filtered.text()).not.toContain('提供导航')
      expect(filtered.text()).not.toContain('绑定数据空间')
      expect(filtered.text()).not.toContain('提供原型')
      filtered.unmount(); mounted=mounted.filter(item=>item!==filtered)
      const compatible=mount(Basic,{props:{state},global}); mounted.push(compatible)
      expect(compatible.text()).toContain('移除导航配置')
      expect(compatible.text()).toContain('绑定场景')
      expect(compatible.text()).toContain('移除原型描述')
      compatible.unmount(); mounted=mounted.filter(item=>item!==compatible)
      const navigation=mount(Basic,{props:{state,sections:['navigation']},global}); mounted.push(navigation)
      expect(navigation.text()).toContain('菜单标题')
      expect(navigation.text()).toContain('图标')
      expect(navigation.text()).not.toContain('工具或页面目标')
    } finally {mounted.forEach(item=>item.unmount());owner.dispose();fixture.destroy();runtime.dispose()}
  })
})
