import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevPreviewTab from '@/views/app/dev-system/DevPreviewTab.vue'
import { createDevStateWithConfigPages, isolateAppProjectWorkspaceForTest } from './dev-state-test-fixture'
import { DataSet, type DataRow } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY as SCENARIO } from '@spark-appworks/spark-lowcode-api'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

const SwitchStub = defineComponent({
  name: 'ElSwitch',
  props: {
    modelValue: Boolean,
  },
  emits: ['update:modelValue'],
  setup() {
    return () => h('span', { class: 'el-switch-stub' })
  },
})

const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, slots['default']?.())
  },
})

const RendererStub = defineComponent({
  name: 'SparkPageRenderer',
  props: {
    pageRuntime: Object,
    routeSnapshot: Object,
  },
  setup(props) {
    return () => h('div', { class: 'renderer-stub', 'data-page-id': props.pageRuntime?.['pageId'] })
  },
})

const editingRuntimes:PageRuntime[]=[]
async function createPreviewState() {
  isolateAppProjectWorkspaceForTest()
  const state = createDevStateWithConfigPages([{pageId:'cascade-demo',nodeId:'cascade-node',title:'Cascade'}], 'cascade-demo')
  state.project.getActivePage()?.markLoaded()
  const getActivePage = vi.spyOn(state.project,'getActivePage')
  const navigation={rowid:'cascade-node',SysId:'homepage',prowid:'000000',name:'Cascade',FunName:'Cascade',conType:'Navitem',NavigationUrl:'cfg:cascade-demo'}
  const dataSet=DataSet.fromJson({scenarioId:SCENARIO,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${SCENARIO}p000`,modelName:'Base_NavigationInfo'},
    columns:Object.keys(navigation).map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{}},
  },Files:{resourceType:'static-data',columns:[{name:'fileName',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'text',type:'string'}],
    views:{default:{},...Object.fromEntries(state.pageFileNames.map(fileName=>[fileName,{rows:[{fileName,pageId:'cascade-demo',text:fileName==='rule.json'?'[]':''}]}]))},
  }}})
  dataSet.getView('Base_NavigationInfo')!.bindQueryExecutor({queryColumns:view=>view.columns,executeQuery:async()=>({
    rows:[navigation],total:1,rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string})=>{if(identity.scenarioId!==SCENARIO||identity.metaName!=='Base_NavigationInfo')throw new Error('wrong navigation identity')},
    fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),
    readFieldAccess:()=> 'visible' as const,addActionState:()=> 'disabled' as const,editActionState:()=> 'disabled' as const,
    deleteActionState:()=> 'disabled' as const,createChildActionState:()=> 'disabled' as const,viewActionState:()=> 'enabled' as const,
  })})
  const owner=new BlueprintWorkspaceDataView(dataSet,'homepage',()=>{})
  await owner.load('cascade-node')
  state.project.selectNode('cascade-node')
  const runtime=new PageRuntime({pageId:'dev-system',scenarioIds:[SCENARIO],mainScenarioId:SCENARIO,loadScenario:async()=>dataSet})
  await runtime.load();editingRuntimes.push(runtime)
  state.blueprintWorkspaceDataView.value=owner;state.blueprintPageRuntime.value=runtime
  const rows=new Map<string,DataRow>()
  for(const fileName of state.pageFileNames){const view=dataSet.getView('Files',fileName)!;view.setCurrentRowById(fileName);rows.set(fileName,view.currentRow!)}
  vi.spyOn(state,'loadPageToolFileDataView').mockImplementation(async({pageId,fileName})=>{
    const row=rows.get(fileName)!
    if(pageId!==row['pageId'])throw new Error('wrong file identity')
    return dataSet.getView('Files',fileName)!
  })
  return {state,projectRevision:state.projectRevision,getActivePage,rows}
}

const priorSession=lowcodeApi.session.get()
const priorApplication=lowcodeApi.application.get()
function restoreLowcodeContext(){
  lowcodeApi.session.clear();if(priorSession)lowcodeApi.session.save(priorSession)
  lowcodeApi.application.clear();if(priorApplication)lowcodeApi.application.save(priorApplication)
}

describe('DevPreviewTab live refresh', () => {
  it('hosts the preview runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/app/dev-system/DevPreviewTab.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('previewSession.isCurrent(runtime)')
    expect(source).not.toContain('new PageRuntime')
  })
  beforeEach(() => {
    vi.useFakeTimers()
    lowcodeApi.session.save({accessToken:'preview-test-access',refreshToken:'preview-test-refresh',accessExpiresAt:Date.now()+60_000,
      refreshExpiresAt:Date.now()+120_000,identity:{userId:'PREVIEW-USER',account:'preview',displayName:'Preview',enterpriseId:'ENT',enterpriseShortName:'Enterprise',role:null,raw:{}},
      enterprise:{id:'ENT',name:'Enterprise',code:'ENT',shortName:'Enterprise',shortCode:'ENT',raw:{}}})
    lowcodeApi.application.save({application:{id:'homepage',code:'homepage',name:'Homepage',description:'',enterpriseId:'ENT',enterpriseShortName:'Enterprise',isDefault:false},navigationRootId:'root'})
  })

  afterEach(() => {
    editingRuntimes.splice(0).forEach(runtime=>runtime.dispose())
    vi.useRealTimers()
    restoreLowcodeContext()
  })

  it('does not rebuild preview when editor revision changes but in-memory page files are unchanged', async () => {
    const { state, projectRevision,rows } = await createPreviewState()

    const wrapper = mount(DevPreviewTab, {
      props: {
        state,
        refreshToken: 0,
      },
      global: {
        stubs: {
          ElAlert: true,
          ElButton: ButtonStub,
          ElEmpty: true,
          ElIcon: true,
          ElSwitch: SwitchStub,
          Loading: true,
          NavIcon: true,
          SparkPageRenderer: RendererStub,
        },
      },
    })

    await flushPromises()
    const instance = wrapper.findComponent(RendererStub).props('pageRuntime')

    projectRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    await flushPromises()
    expect(wrapper.findComponent(RendererStub).props('pageRuntime')).toBe(instance)

    rows.get('script.js')!['text']='console.log("changed")'
    state.externalDataViewRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    await flushPromises()
    const replacement = wrapper.findComponent(RendererStub).props('pageRuntime')
    expect(replacement).not.toBe(instance)
    expect(instance?.['destroyed']).toBe(true)
    wrapper.unmount()
    expect(replacement?.['destroyed']).toBe(true)
  })

  it('loads all three files through their DataViews without invoking the PageTool owner loader', async () => {
    const { state } = await createPreviewState()
    const fileViewLoad = vi.spyOn(state, 'loadPageToolFileDataView')
    const wrapper = mount(DevPreviewTab, {
      props: { state, refreshToken: 0 },
      global: { stubs: { ElAlert: true, ElButton: ButtonStub, ElEmpty: true, ElIcon: true, ElSwitch: SwitchStub, Loading: true, NavIcon: true, SparkPageRenderer: RendererStub } },
    })
    await flushPromises()
    expect(Reflect.has(state.editor, 'ensureActivePageFilesLoaded')).toBe(false)
    expect(fileViewLoad.mock.calls.map(([input]) => input.fileName).sort()).toEqual(['rule.json', 'script.js', 'style.css'])
    expect(fileViewLoad.mock.calls.every(([input]) => input.pageId === 'cascade-demo')).toBe(true)
    expect(wrapper.findComponent(RendererStub).props('routeSnapshot')).toMatchObject({
      path:'/apps/homepage/__page/cascade-node',
      fullPath:'/apps/homepage/__page/cascade-node',
      params:{projectId:'homepage'},
      query:{},
    })
    wrapper.unmount()
  })

  it('only refreshes on tab requests when the DataView auto-refresh switch is enabled',async()=>{
    const {state}=await createPreviewState()
    const wrapper=mount(DevPreviewTab,{
      props:{state,refreshToken:0},
      global:{stubs:{ElAlert:true,ElButton:ButtonStub,ElEmpty:true,ElIcon:true,ElSwitch:SwitchStub,Loading:true,NavIcon:true,SparkPageRenderer:RendererStub}},
    })
    try{
      await flushPromises()
      const original=wrapper.findComponent(RendererStub).props('pageRuntime')
      const switches=wrapper.findAllComponents(SwitchStub)
      expect(switches).toHaveLength(2)
      switches[1]!.vm.$emit('update:modelValue',false);await flushPromises()
      await wrapper.setProps({refreshToken:1});await flushPromises()
      expect(wrapper.findComponent(RendererStub).props('pageRuntime')).toBe(original)
      switches[1]!.vm.$emit('update:modelValue',true);await flushPromises()
      await wrapper.setProps({refreshToken:2});await flushPromises()
      expect(wrapper.findComponent(RendererStub).props('pageRuntime')).not.toBe(original)
      expect(original?.['destroyed']).toBe(true)
    }finally{wrapper.unmount()}
  })

  it('retains the preview owner and blocks node changes while preview work is pending', async () => {
    const {state}=await createPreviewState()
    let pending: (() => boolean) | undefined
    const registerPreviewGuard=(check:()=>boolean)=>{
      pending=check
      return ()=>{pending=undefined}
    }
    const wrapper=mount(DevPreviewTab,{
      props:{state,refreshToken:0,registerPreviewGuard},
      global:{stubs:{ElAlert:true,ElButton:ButtonStub,ElEmpty:true,ElIcon:true,ElSwitch:SwitchStub,Loading:true,NavIcon:true,SparkPageRenderer:RendererStub}},
    })
    try{
      await flushPromises()
      const runtime=wrapper.findComponent(RendererStub).props('pageRuntime')
      if(!(runtime instanceof PageRuntime))throw new Error('preview runtime missing')
      const content=runtime.getContent('preview-draft')
      expect(content.acceptRead('saved')).toBe(true)
      content.setDraft('unsaved')
      expect(pending?.()).toBe(true)
      expect(state.hasAnyDirty.value).toBe(true)
      const selected=state.selectedNode.value
      if(!selected)throw new Error('selected node missing')
      await state.selectNode({...selected,nodeId:'different-node'})
      expect(state.selectedNode.value?.nodeId).toBe(selected.nodeId)
      expect(state.statusMessages.value[0]?.text).toContain('未保存')
      expect(await state.openEditingProject({projectId:'different-project'},{force:true})).toBe(false)
      state.removeNodeFromTree(selected)
      expect(runtime.destroyed).toBe(false)
      const saveDefinitions=vi.spyOn(state.editor,'saveDirtyScenarioDefinitions')
      await state.saveAll()
      expect(saveDefinitions).not.toHaveBeenCalled()
      expect(state.statusMessages.value[0]?.text).toContain('预览业务修改')
      await wrapper.setProps({refreshToken:1});await flushPromises()
      expect(runtime.destroyed).toBe(false)
      expect(content.draft).toBe('unsaved')
      content.discardDraft()
      expect(pending?.()).toBe(false)
      await expect(content.startWrite({kind:'save',submitted:'write',expectedContent:'saved',run:async()=>{throw new Error('unknown receipt')}})).rejects.toThrow('unknown receipt')
      expect(content.status).toBe('unknown')
      expect(pending?.()).toBe(true)
      await wrapper.setProps({refreshToken:2});await flushPromises()
      expect(runtime.destroyed).toBe(false)
      const read=content.offerRemote('saved',content.revision)
      content.adoptRemote(read,content.revision)
      expect(pending?.()).toBe(false)
    }finally{wrapper.unmount()}
    expect(pending).toBeUndefined()
  })

  it('retires a clean preview synchronously before an asynchronous node switch',async()=>{
    const {state}=await createPreviewState()
    const owner=state.blueprintWorkspaceDataView.value
    const selected=state.selectedNode.value
    if(!owner||!selected)throw new Error('preview owner missing')
    let release:(value:BlueprintWorkspaceDataView)=>void=()=>{}
    const pendingOwner=new Promise<BlueprintWorkspaceDataView>(resolve=>{release=resolve})
    vi.spyOn(state,'loadBlueprintWorkspaceDataView').mockReturnValueOnce(pendingOwner)
    vi.spyOn(owner,'load').mockRejectedValueOnce(new Error('target unavailable'))
    const wrapper=mount(DevPreviewTab,{
      props:{state,refreshToken:0},
      global:{stubs:{ElAlert:true,ElButton:ButtonStub,ElEmpty:true,ElIcon:true,ElSwitch:SwitchStub,Loading:true,NavIcon:true,SparkPageRenderer:RendererStub}},
    })
    try{
      await flushPromises()
      const runtime=wrapper.findComponent(RendererStub).props('pageRuntime')
      if(!(runtime instanceof PageRuntime))throw new Error('preview runtime missing')
      const content=runtime.getContent('race')
      expect(content.acceptRead('saved')).toBe(true)
      const switching=state.selectNode({...selected,nodeId:'different-node'})
      const rejected=expect(switching).rejects.toThrow('target unavailable')
      expect(runtime.destroyed).toBe(true)
      expect(()=>content.setDraft('late change')).toThrow('PAGE_CONTENT_DISPOSED')
      await wrapper.setProps({refreshToken:1});await flushPromises()
      expect(wrapper.findComponent(RendererStub).exists()).toBe(false)
      release(owner)
      await rejected
      await vi.advanceTimersByTimeAsync(600);await flushPromises()
      expect(wrapper.findComponent(RendererStub).exists()).toBe(true)
      expect(state.selectedNode.value?.nodeId).toBe(selected.nodeId)
    }finally{release(owner);wrapper.unmount()}
  })

  it('resumes preview after a config-page deletion is rejected',async()=>{
    const {state}=await createPreviewState()
    const selected=state.selectedNode.value
    if(!selected)throw new Error('selected node missing')
    const wrapper=mount(DevPreviewTab,{
      props:{state,refreshToken:0},
      global:{stubs:{ElAlert:true,ElButton:ButtonStub,ElEmpty:true,ElIcon:true,ElSwitch:SwitchStub,Loading:true,NavIcon:true,SparkPageRenderer:RendererStub}},
    })
    try{
      await flushPromises()
      expect(wrapper.findComponent(RendererStub).exists()).toBe(true)
      state.removeNodeFromTree({...selected,projectId:'different-project'})
      await flushPromises()
      expect(state.statusMessages.value[0]?.text).toContain('删除目标项目身份不匹配')
      await vi.advanceTimersByTimeAsync(600);await flushPromises()
      expect(wrapper.findComponent(RendererStub).exists()).toBe(true)
    }finally{wrapper.unmount()}
  })
})
