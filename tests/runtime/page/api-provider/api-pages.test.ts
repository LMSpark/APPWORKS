import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h, type Component} from 'vue'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import ElementPlus, {ElSelect} from 'element-plus'
import VXETable from 'vxe-table'
import {Spark, registerAllRenderers, RendererForm, RendererButton, RendererTable, FieldSelect, PAGE_SERVICE, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createApiService, seed, NAV, API, CONFIG, META, pagedata} from './api-provider.fixture'

const api = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof import('./api-provider.fixture')['createApiService']>}))
const confirmBox = vi.hoisted(() => vi.fn<(message: string, title: string, _options?: unknown) => Promise<string>>())
vi.mock('element-plus', async importOriginal => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {...original, ElMessageBox: {...original.ElMessageBox, confirm: confirmBox}}
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.current.state.http},
  lowcodeApi: {readRequestScope: (...args: unknown[]) => api.current.service.readRequestScope(...args),
    dataSpace: {get design() {return api.current.service}, get runtime() {return api.current.state.runtime}}},
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('API provider page fixture must not upload scenario files')},
    uploadTextVersion: async () => {throw new Error('API provider page fixture must not upload scenario versions')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {readScope: () => 'scope', readText: async (id: string) => pagedata[id] ?? null,
    writeText: async () => {throw new Error('pages must not write scenario files')}}}),
}))
const {default: ManagementPage} = await import('@/views/features/integration/api-management/ui/api-management-page.vue')
const {default: InterfacePage} = await import('@/views/features/integration/api-management/ui/api-interface-list-page.vue')

api.current = createApiService()
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  api.current.reset(seed)
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})

async function mountAt(component: Component, props: Record<string, unknown> = {}) {
  const page = defineComponent({setup: () => () => h(component, props)})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: page, componentMap: {'/providers': page}, applicationPathPrefix: '/apps/:projectId',
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: NAV, title: '外部服务管理', path: '/providers', itemKind: 'system-page', blueprintScenarioId: NAV}]})})
  await dynamic.registerRoutes(); await router.push('/apps/APP/providers'); await router.isReady()
  const wrapper = mount(defineComponent({
    setup() {
      const {sparkProvide} = useSparkComponent({type: 'api-page-test-host'})
      const service: PageServiceCapability = {
        copyText: async () => {},
        showMessage: () => {},
        showConfirm: async (message, title, options) => confirmBox(message, title ?? '确认', options).then(() => true, () => false),
        showPrompt: async () => null,
        showAlert: async () => {},
        showDialog: async () => 'cancel',
        selectEntities: async () => [],
        browseFiles: async () => [],
        uploadFiles: async () => { throw new Error('API provider page fixture must not upload files') },
        showLoading: () => {},
        navigate: () => {},
      }
      sparkProvide(PAGE_SERVICE, service)
      return () => h(RouterView)
    },
  }), {attachTo: document.body, global: {plugins: [router, ElementPlus, VXETable, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).not.toContain('正在读取')})
  await flushPromises()
  return wrapper
}
const button = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(item => item.text() === label)
const records = (table: string) => api.current.state.http.records[table]!
async function bindingFixture(parameterPatch:Record<string,unknown>={}){
  records('Base_Interface_PublicParam').push({rowid:'Q3',providerId:'P1',paramName:'second_token',desc:'保留说明',interfaceId:'I2',outputfield:'data',interfaceName:'查询',accessPath:'/query',...parameterPatch})
  const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
  const wrapper=await mountAt(InterfacePage,{providerId:'P1'}),runtime=[...observed].find(p=>p.getDataSet(API))!,ds=runtime.getDataSet(API)!,parent=ds.getView('Base_DataServiceInterface')!
  parent.setCurrentRowById('I1');parent.setSelectedRows([parent.currentRow!]);await flushPromises()
  await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出内容')!.trigger('click');await flushPromises()
  const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1))
  await vi.waitFor(()=>expect(button(wrapper,'设置公共参数')).toBeDefined());await button(wrapper,'设置公共参数')!.trigger('click');await flushPromises()
  const parameters=ds.getView('Base_Interface_PublicParam','outputBinding')!;await vi.waitFor(()=>expect(parameters.rows).toHaveLength(2))
  const selector=wrapper.findAllComponents(FieldSelect).find(item=>item.props('dataMember')==='value'&&!item.props('field'))!
  expect(selector).toBeDefined();selector.getComponent(ElSelect).vm.$emit('update:modelValue','Q3');await flushPromises()
  expect(parameters.getSelectedValues()).toEqual(['Q3'])
  const click=async(label:string)=>{const action=wrapper.findAllComponents(RendererButton).find(item=>item.props('label')===label);expect(action).toBeDefined();action!.vm.$emit('click');await flushPromises()}
  await click('编辑选中参数绑定')
  return{wrapper,runtime,ds,parent,outputs,parameters,selector,click,http:api.current.state.http}
}
async function interfaceFixture(){
  const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
  const wrapper=await mountAt(InterfacePage,{providerId:'P1',providerName:'服务甲'}),ds=[...observed].find(p=>p.getDataSet(API))!.getDataSet(API)!
  const interfaces=ds.getView('Base_DataServiceInterface')!
  const select=(id:string)=>{interfaces.setCurrentRowById(id);interfaces.setSelectedRows([interfaces.currentRow!])}
  const tab=async(label:string)=>{await vi.waitFor(()=>expect(wrapper.findAll('.el-tabs__item').some(item=>item.text()===label)).toBe(true));await wrapper.findAll('.el-tabs__item').find(item=>item.text()===label)!.trigger('click');await flushPromises()}
  return{wrapper,ds,interfaces,select,tab,http:api.current.state.http}
}

describe('external API pages assembled through the standard scenario entry', () => {
  it('hosts the API interface catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/integration/api-management/ui/api-interface-list-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).toContain('deferredScenarioIds: [DATA_SPACE_DESIGN_FORM_KEY]')
    expect(source).toContain('scenarioInputs: {[scenarioId]: {providerId}}')
    expect(source).not.toContain('new PageRuntime')
  })
  it('configures providers inside the catalog runtime instead of a second session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/integration/api-management/ui/api-config-page.vue'), 'utf8')
    expect(source).toContain('sparkConsume(PAGE_RUNTIME)')
    expect(source).not.toContain('NativePageRuntimeSession')
    expect(source).not.toContain('new PageRuntime')
  })
  it('assembles the external API catalog through the shared feature runtime with the config space as peer', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/integration/api-management/ui/api-management-page.vue'), 'utf8')
    expect(source).toContain('useFeaturePageRuntime({')
    expect(source).toContain('peerScenarioIds: [configScenarioId]')
    expect(source).not.toContain('NativePageRuntimeSession')
    expect(source).not.toContain('new PageRuntime')
  })
  it('cancels cross-interface parameter rebinding without writing or changing the original row',async()=>{
    const f=await bindingFixture();expect(f.wrapper.findAllComponents(RendererForm).some(form=>form.props('contextRowId')==='Q3')).toBe(true)
    await f.click('取消参数重绑')
    expect(api.current.state.http.saves).toHaveLength(0);expect(f.parameters.hasEditingChanges()).toBe(false)
    expect(records('Base_Interface_PublicParam').find(row=>row['rowid']==='Q3')).toMatchObject({interfaceId:'I2',outputfield:'data',paramName:'second_token',desc:'保留说明'})
  })
  it('updates only the selected parameter rowid and permits two names to use the same saved output',async()=>{
    const f=await bindingFixture();await f.click('确认替换原绑定')
    await vi.waitFor(()=>expect(api.current.state.http.saves).toHaveLength(1))
    expect(api.current.state.http.saves[0]).toMatchObject({table:'Base_Interface_PublicParam',added:[],deleted:[],changed:[{rowid:'Q3',interfaceId:'I1',outputfield:'token',interfaceName:'取令牌',accessPath:'/token'}]})
    expect(records('Base_Interface_PublicParam').find(row=>row['rowid']==='Q3')).toMatchObject({providerId:'P1',paramName:'second_token',desc:'保留说明',interfaceId:'I1',outputfield:'token'})
    expect(records('Base_Interface_PublicParam').filter(row=>row['interfaceId']==='I1'&&row['outputfield']==='token')).toHaveLength(2)
    const {loadLowcodeRuntimeScenario}=await import('@/lowcode/data-space/lowcode-data-space-runtime')
    const reopened:PageRuntime=new PageRuntime({pageId:'parameter-binding-reopen',scenarioIds:[API,META],deferredScenarioIds:[META],scenarioInputs:{[API]:{providerId:'P1'}},loadScenario:id=>loadLowcodeRuntimeScenario({projectId:'APP',scenarioId:id,getPage:()=>reopened})})
    try{await reopened.load();const parameters=reopened.getDataSet(API)!.getView('Base_Interface_PublicParam','outputBinding')!;await parameters.refresh()
      expect(parameters.rows.find(row=>row['rowid']==='Q3')).toMatchObject({interfaceId:'I1',outputfield:'token',paramName:'second_token'})
    }finally{reopened.dispose()}
  })
  it('refuses confirmation when another parameter field acquired an editing patch',async()=>{
    const f=await bindingFixture();f.parameters.updateEditingValue('Q3','desc','later unrelated draft')
    await f.click('确认替换原绑定')
    expect(api.current.state.http.saves).toHaveLength(0);expect(f.parameters.getEditingRow('Q3')?.['desc']).toBe('later unrelated draft')
  })
  it.each(['hidden','masked'] as const)('does not disclose or bind a %s interface title despite write permission',async mode=>{
    const secret='private-interface-title';records('Base_DataServiceInterface')[0]!['Name']=secret
    const permissions=mode==='hidden'?api.current.state.http.hiddenFields:api.current.state.http.maskedFields
    permissions['Base_DataServiceInterface']=['Name']
    const f=await bindingFixture();expect(f.parent.fieldAccess(f.parent.currentRow!,'Name').read).toBe(mode==='hidden'?'invisible':'masked')
    expect(document.body.textContent).not.toContain(secret)
    await f.click('确认替换原绑定');expect(f.http.saves).toHaveLength(0)
  })
  it.each(['hidden','masked'] as const)('does not disclose or replace a %s original binding title',async mode=>{
    const secret='private-original-binding-title',permissions=mode==='hidden'?api.current.state.http.hiddenFields:api.current.state.http.maskedFields
    permissions['Base_Interface_PublicParam']=['interfaceName']
    const f=await bindingFixture({interfaceName:secret})
    expect(document.body.textContent).not.toContain(secret);await f.click('确认替换原绑定');expect(f.http.saves).toHaveLength(0)
  })
  it.each(['hidden','masked'] as const)('does not disclose or bind a %s output name',async mode=>{
    const secret='private-output-name',permissions=mode==='hidden'?api.current.state.http.hiddenFields:api.current.state.http.maskedFields
    records('Base_TblField')[0]!['enname']=secret;permissions['Base_TblField']=['enname']
    const f=await bindingFixture();expect(document.body.textContent).not.toContain(secret)
    await f.click('确认替换原绑定');expect(f.http.saves).toHaveLength(0)
  })
  it('keeps the captured parameter identity when external selection changes',async()=>{
    const f=await bindingFixture();f.parameters.setSelectedRows([f.parameters.rows.find(row=>row['rowid']==='Q1')!])
    await f.click('确认替换原绑定');await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
    expect(f.http.saves[0]?.changed.map(row=>row['rowid'])).toEqual(['Q3'])
  })
  it('does not submit after the original output query replaced its source row',async()=>{
    const f=await bindingFixture();await f.outputs.refresh();await f.click('确认替换原绑定')
    expect(f.http.saves).toHaveLength(0);expect(f.parameters.hasEditingChanges()).toBe(false)
  })
  it('verifies an unknown binding once without replaying its change',async()=>{
    const f=await bindingFixture();f.http.failAfterWrite=true;await f.click('确认替换原绑定')
    await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(true));await f.click('核验原参数重绑')
    await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(false));expect(f.http.saves).toHaveLength(1)
  })
  it('does not write when source selection changes during the original formal reference query',async()=>{
    const f=await bindingFixture();let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
    f.http.beforeDefinitionRead=async table=>{if(table==='Base_Interface_PublicParam'&&!entered){entered=true;await gate}}
    try{
      await f.click('确认替换原绑定');await vi.waitFor(()=>expect(entered).toBe(true))
      f.parent.setCurrentRowById('I2');f.parent.setSelectedRows([f.parent.currentRow!]);await flushPromises();release();await flushPromises()
      await vi.waitFor(()=>expect(f.parameters.mutating).toBe(false));expect(f.http.saves).toHaveLength(0)
    }finally{release()}
  })
  it('lets the shared save proof reject a later unrelated patch during reference validation',async()=>{
    const f=await bindingFixture();let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
    f.http.beforeDefinitionRead=async table=>{if(table==='Base_Interface_PublicParam'&&!entered){entered=true;await gate}}
    try{
      await f.click('确认替换原绑定');await vi.waitFor(()=>expect(entered).toBe(true))
      f.parameters.updateEditingValue('Q3','desc','late draft');release();await flushPromises()
      await vi.waitFor(()=>expect(f.parameters.mutating).toBe(false));expect(f.http.saves).toHaveLength(0)
      expect(f.parameters.getEditingRow('Q3')?.['desc']).toBe('late draft')
    }finally{release()}
  })
  it('verifies the already dispatched binding after a late source change without replaying it',async()=>{
    const f=await bindingFixture();let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
    f.http.beforeSave=async()=>{entered=true;await gate}
    try{
      await f.click('确认替换原绑定');await vi.waitFor(()=>expect(entered).toBe(true))
      f.parent.setCurrentRowById('I2');f.parent.setSelectedRows([f.parent.currentRow!]);f.http.failAfterWrite=true;release();await flushPromises()
      await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(true));await f.click('核验原参数重绑')
      await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(false));expect(f.http.saves).toHaveLength(1)
      expect(records('Base_Interface_PublicParam').find(row=>row['rowid']==='Q3')?.['interfaceId']).toBe('I1')
    }finally{release()}
  })
  it('handles a known failed binding from an explicit original pending interaction',async()=>{
    const f=await bindingFixture();f.http.rejectNextSave=true;await f.click('确认替换原绑定')
    await vi.waitFor(()=>expect(f.parameters.dirtyTracking.hasPendingChanges('Q3')).toBe(true));expect(f.parameters.hasUnconfirmedSave).toBe(false)
    await f.click('关闭并保留参数修改');await f.click('编辑选中参数绑定');await f.click('继续保存原参数修改')
    await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1));expect(f.http.saves[0]?.changed.map(row=>row['rowid'])).toEqual(['Q3'])
  })
  it('keeps a confirmed binding saved when the separate function catalog refresh fails',async()=>{
    const f=await bindingFixture();f.http.interceptors.request.use({onRequest:request=>{
      const body=request.data,table=isRecord(body)&&Array.isArray(body['Table'])?body['Table'][0]:undefined
      if(request.url==='/api/DataOperation/GetData'&&isRecord(table)&&table['Name']==='Base_Interface_PublicParam'&&Array.isArray(table['Fields'])&&table['Fields'].length===4)throw Error('Function catalog refresh failed')
      return request
    }})
    await f.click('确认替换原绑定');await vi.waitFor(()=>expect(f.wrapper.text()).toContain('绑定已保存'))
    expect(f.http.saves).toHaveLength(1);expect(f.wrapper.findAllComponents(RendererButton).some(item=>item.props('label')==='确认替换原绑定')).toBe(false)
    expect(records('Base_Interface_PublicParam').find(row=>row['rowid']==='Q3')?.['interfaceId']).toBe('I1')
  })
  it('creates an interface staged under the provider and requires the parameter type before saving',async()=>{
    const f=await interfaceFixture()
    await button(f.wrapper,'新建')!.trigger('click');await flushPromises()
    const id=f.interfaces.getPkKey(f.interfaces.currentRow!)!
    expect(f.interfaces.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(f.interfaces.getEditingRow(id)).toMatchObject({ProviderID:'P1',Name:'新建接口'})
    await vi.waitFor(()=>expect(f.wrapper.text()).toContain('服务甲 / 新建接口'))
    await button(f.wrapper,'保存')!.trigger('click');await flushPromises()
    expect(f.http.saves).toHaveLength(0)
    f.interfaces.updateEditingValue(id,'RequestType','Body');f.interfaces.updateEditingValue(id,'LinkUrl','/new/{code}');f.interfaces.updateEditingValue(id,'request','POST');await flushPromises()
    await button(f.wrapper,'保存')!.trigger('click')
    await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
    expect(f.http.saves[0]).toMatchObject({table:'Base_DataServiceInterface',changed:[],deleted:[],
      added:[expect.objectContaining({ProviderID:'P1',Name:'新建接口',RequestType:'Body',LinkUrl:'/new/{code}',PathStr:'{"code":""}'})]})
  })
  it('syncs path parameters from the request address and clears an incompatible body on parameter type switch',async()=>{
    const f=await interfaceFixture();f.select('I1');await flushPromises()
    const keep=JSON.stringify({Type:'GetInputParam',ParamName:'user'})
    f.interfaces.updateEditingValue('I1','PathStr',JSON.stringify({id:keep}))
    f.interfaces.updateEditingValue('I1','LinkUrl','/u/{id}/{name}');await flushPromises()
    expect(JSON.parse(String(f.interfaces.getEditingRow('I1')?.['PathStr']))).toEqual({id:keep,name:''})
    f.interfaces.updateEditingValue('I1','LinkUrl','/u');await flushPromises()
    expect(f.interfaces.getEditingRow('I1')?.['PathStr']).toBe('')
    f.interfaces.updateEditingValue('I1','BodyParamJsonStr','{"a":1}')
    f.interfaces.updateEditingValue('I1','RequestType','FormData');await flushPromises()
    expect(f.interfaces.getEditingRow('I1')?.['BodyParamJsonStr']).toBe('')
    expect(f.http.saves).toHaveLength(0)
  })
  it('refuses to delete an interface that still owns parameters, outputs or public parameters',async()=>{
    confirmBox.mockReset().mockResolvedValue('confirm')
    const f=await interfaceFixture();f.select('I1');await flushPromises()
    await button(f.wrapper,'删除')!.trigger('click')
    await vi.waitFor(async()=>{await flushPromises();expect(f.wrapper.text()).toContain('接口“取令牌”仍有输入参数 1 个、输出字段 1 个、公共参数 1 个')})
    expect(confirmBox).not.toHaveBeenCalled();expect(f.http.saves).toHaveLength(0)
  })
  it('deletes a childless interface by its original identity after confirmation',async()=>{
    records('Base_DataServiceInterface').push({rowid:'I4',ProviderID:'P1',Name:'空接口',LinkUrl:'/empty',request:'GET',requiresAuth:0,RequestType:'Body'})
    confirmBox.mockReset().mockResolvedValue('confirm')
    const f=await interfaceFixture();f.select('I4');await flushPromises()
    await button(f.wrapper,'删除')!.trigger('click')
    await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
    expect(confirmBox).toHaveBeenCalledWith('确定要删除接口“空接口”吗？','删除确认',expect.anything())
    expect(f.http.saves[0]).toMatchObject({table:'Base_DataServiceInterface',added:[],changed:[],deleted:[expect.objectContaining({rowid:'I4'})]})
  })
  it('invokes the selected interface once through the call command and shows the result',async()=>{
    const f=await interfaceFixture();f.select('I1');await flushPromises()
    await f.tab('调用输出')
    await button(f.wrapper,'调用')!.trigger('click')
    await vi.waitFor(()=>expect(f.http.invocations).toHaveLength(1))
    expect(f.http.invocations[0]).toMatchObject({url:'/api/dataInterface/callApi/Body',params:{qy_provider:'P1',qy_api:'取令牌'},data:{qy_is_filter:'$'}})
    await vi.waitFor(()=>expect(f.ds.getView('InterfaceCallRequest')!.currentRow?.['result']).toContain('"token": "abc"'))
    expect(f.http.saves).toHaveLength(0)
  })
  it('resets outputs from the call result keeping same-name rows and saves only the output view',async()=>{
    const f=await interfaceFixture();f.select('I1');await flushPromises()
    await f.tab('输出内容')
    const outputs=f.ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1))
    f.ds.getView('_Base_ParamList')!.updateEditingValue('A1','pardesc','keep input draft')
    await button(f.wrapper,'重新设置输出')!.trigger('click')
    await vi.waitFor(()=>expect(outputs.rows).toHaveLength(3))
    const panel=f.wrapper.find('.interface-output'),save=panel.findAll('button').find(item=>item.text()==='保存')!
    await save.trigger('click')
    await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
    expect(f.http.saves[0]).toMatchObject({table:'Base_TblField',changed:[],deleted:[],added:[
      expect.objectContaining({tblid:'I1',tblname:'api_output_info',enname:'expires',DataType:'int'}),
      expect.objectContaining({tblid:'I1',tblname:'api_output_info',enname:'ratio',DataType:'double'})]})
    expect(records('Base_TblField').find(row=>row['rowid']==='F1')).toMatchObject({enname:'token',DataType:'string'})
    expect(f.ds.getView('_Base_ParamList')!.hasEditingChanges('A1')).toBe(true)
  })
  it('refuses to reset outputs that would remove a field bound to a public parameter',async()=>{
    const f=await interfaceFixture();f.http.invocationResult={other:1};f.select('I1');await flushPromises()
    await f.tab('输出内容')
    const outputs=f.ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1))
    await button(f.wrapper,'重新设置输出')!.trigger('click')
    await vi.waitFor(async()=>{await flushPromises();expect(f.wrapper.text()).toContain('输出字段 token 已设置公共参数')})
    expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false);expect(f.http.saves).toHaveLength(0)
  })
  it.each([{component:InterfacePage,scenario:API}])('provides its original deferred metadata host for $scenario',async({component,scenario})=>{
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    await mountAt(component,{providerId:'P1'})
    const runtime=[...observed].find(p=>p.getDataSet(scenario))!
    expect(runtime).toBeDefined();expect(runtime.getDataSet(META)).toBeUndefined()
    const ds=runtime.getDataSet(scenario)!,v=ds.getView('Base_TblField')!.createQueryView('host-proof')
    v.commitMode='staged';v.queryConfig={fields:['rowid','tblid','enname','DataType','IsPKey'],allPages:true};v.filterExpression={field:'tblid',operator:'eq',value:'I1'};await v.refresh()
    api.current.state.http.records['Base_Interface_PublicParam']=[]
    v.updateEditingValue('F1','enname','host_verified')
    expect((await ds.saveChanges({views:[{tableName:v.tableName,viewId:v.viewId}]})).success).toBe(true)
    expect(runtime.getDataSet(META)).toBeDefined()
  })
  it('keeps the original business path', () => {
    const path = '/features/integration/api-management/ui/api-management-page'
    expect(getVuePageEntry(path)).toMatchObject({source: `src/views${path}.vue`, scope: 'enterprise'})
  })

  it('lists providers with the reference columns and creates one through the shared record dialog', async () => {
    const wrapper = await mountAt(ManagementPage)
    for (const text of ['外部服务管理', '服务提供商名称', 'API 基础 URL', '修改人', '修改时间', '提供商操作', '服务甲', '服务乙', '修改人甲']) expect(wrapper.text()).toContain(text)
    await button(wrapper, '新建')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(document.body.textContent).toContain('新增外部服务提供商')})
    const form = wrapper.findAllComponents(RendererForm).at(-1)!
    const inputs = form.findAll('input')
    await inputs[0]!.setValue('新服务'); await inputs[1]!.setValue('https://new.test')
    wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '确定')!.vm.$emit('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider').some(row => row['Name'] === '新服务')).toBe(true)})
    expect(api.current.state.http.saves.at(-1)).toMatchObject({table: 'Base_InterfaceProvider', changed: [], deleted: []})
  })

  it('refuses to delete a provider that still owns interfaces or request settings', async () => {
    confirmBox.mockReset().mockResolvedValue('confirm')
    const wrapper = await mountAt(ManagementPage)
    await wrapper.findAll('button').filter(item => item.text() === '删除')[0]!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).toContain('该服务提供商下仍有接口、请求头、公共参数、认证账号，不能删除')})
    expect(api.current.state.http.saves).toHaveLength(0)
    expect(records('Base_InterfaceProvider').map(row => row['rowid'])).toEqual(['P1', 'P2'])
  })

  it('deletes a provider without child records by its original identity only', async () => {
    records('Base_InterfaceProvider').push({rowid: 'P3', Name: '服务丙', BaseURL: 'https://c.test'})
    confirmBox.mockReset().mockResolvedValue('confirm')
    const wrapper = await mountAt(ManagementPage)
    expect(wrapper.text()).toContain('服务丙')
    await wrapper.findAll('button').filter(item => item.text() === '删除')[2]!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider').map(row => row['rowid'])).toEqual(['P1', 'P2'])})
    expect(api.current.state.http.saves).toEqual([{table: 'Base_InterfaceProvider', added: [], changed: [], deleted: [expect.objectContaining({rowid: 'P3'})]}])
  })

  it('opens the provider configuration in four tabs and saves the JWT settings verbatim', async () => {
    const observed = new Set<PageRuntime>(), original = PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {observed.add(this); return original.call(this)})
    const wrapper = await mountAt(ManagementPage)
    await wrapper.findAll('button').filter(item => item.text() === '基础配置')[0]!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(document.body.textContent).toContain('配置信息设置')})
    for (const text of ['JWT设置', '请求头部信息', '公共参数', '认证账号', '认证设置', '令牌过期刷新', '认证接口', '从响应中提取的令牌字段名', 'Header提取令牌属性'])
      expect(document.body.textContent).toContain(text)
    const ds = [...observed].find(page => page.getDataSet(CONFIG))!.getDataSet(CONFIG)!
    const auth = ds.getView('Base_InterfaceProvider', 'authentication')!
    expect(auth.rows.map(row => row['rowid'])).toEqual(['P1'])
    expect(api.current.state.http.reads.some(read => read.table === 'Base_InterfaceProvider_Headers')).toBe(false)
    auth.updateEditingValue('P1', 'loginApiName', 'I1')
    await vi.waitFor(() => expect(ds.getFieldCascadeState({tableName: 'Base_InterfaceProvider', viewId: 'authentication', field: 'TokenField'})
      .options.map(row => row['enname'])).toEqual(['token']))
    auth.updateEditingValue('P1', 'TokenPrefix', ' Token ')
    await button(wrapper, '保存')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider')[0]).toMatchObject({TokenPrefix: ' Token ', loginApiName: 'I1'})})
    expect(api.current.state.http.saves).toHaveLength(1)
  })

  it('loads each configuration tab on demand and adds an account owned by the provider', async () => {
    const observed = new Set<PageRuntime>(), original = PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {observed.add(this); return original.call(this)})
    const wrapper = await mountAt(ManagementPage)
    await wrapper.findAll('button').filter(item => item.text() === '基础配置')[0]!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(document.body.textContent).toContain('配置信息设置')})
    const tabItem = (label: string) => wrapper.findAll('.el-tabs__item').find(item => item.text() === label)!
    await tabItem('请求头部信息').trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.findAllComponents(RendererTable).some(table => table.text().includes('使用场景'))).toBe(true)})
    const ds = [...observed].find(page => page.getDataSet(CONFIG))!.getDataSet(CONFIG)!
    expect(ds.getView('Base_InterfaceProvider_Headers')!.rows.map(row => row['rowid'])).toEqual(['H1'])
    await tabItem('认证账号').trigger('click')
    const accounts = ds.getView('Base_InterfaceProvider_Account')!
    await vi.waitFor(async () => {await flushPromises(); expect(accounts.rows.map(row => row['rowid'])).toEqual(['C1'])})
    await wrapper.findAll('button').filter(item => item.text() === '新增').at(-1)!.trigger('click')
    await flushPromises()
    const created = accounts.rows.find(row => accounts.dirtyTracking.isPendingCreate(accounts.getPkKey(row)!))!
    expect(created['ProviderID']).toBe('P1')
    accounts.updateEditingValue(accounts.getPkKey(created)!, 'UserName', 'second')
    await wrapper.findAll('button').filter(item => item.text() === '保存').at(-1)!.trigger('click')
    await vi.waitFor(() => expect(api.current.state.http.saves).toHaveLength(1))
    expect(api.current.state.http.saves[0]).toMatchObject({table: 'Base_InterfaceProvider_Account', added: [expect.objectContaining({ProviderID: 'P1', UserName: 'second'})]})
  })

  it('opens the interface scheme for one provider with no child definition loaded before a selection', async () => {
    const wrapper = await mountAt(InterfacePage, {providerId: 'P1'})
    expect(wrapper.text()).toContain('取令牌')
    expect(wrapper.text()).not.toContain('其他')
    expect(wrapper.text()).toContain('请选择左侧接口，或先新建接口')
    expect(api.current.state.http.reads.some(read => read.table === '_Base_ParamList')).toBe(false)
  })
})
