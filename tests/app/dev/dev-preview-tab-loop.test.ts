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
    wrapper.unmount()
  })
})
