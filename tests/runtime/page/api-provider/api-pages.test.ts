import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h, reactive, type Component} from 'vue'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import ElementPlus, {ElSelect} from 'element-plus'
import VXETable from 'vxe-table'
import {Spark, registerAllRenderers, RendererForm, RendererButton, RendererTable, FieldSelect} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createApiService, seed, NAV, API, CONFIG, META, pagedata} from './api-provider.fixture'

const api = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof import('./api-provider.fixture')['createApiService']>}))
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
const {default: ConfigPage} = await import('@/views/features/integration/api-management/ui/api-config-page.vue')
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
      {id: 'providers', title: '外部服务管理', path: '/providers', itemKind: 'system-page', blueprintScenarioId: NAV}]})})
  await dynamic.registerRoutes(); await router.push('/apps/APP/providers'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, VXETable, Spark.createPlugin()]}})
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
  await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出定义')!.trigger('click');await flushPromises()
  const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1));outputs.setCurrentRowById('F1');await flushPromises()
  const open=button(wrapper,'设置公共参数');expect(open).toBeDefined();await open!.trigger('click');await flushPromises()
  const parameters=ds.getView('Base_Interface_PublicParam','outputBinding')!;await vi.waitFor(()=>expect(parameters.rows).toHaveLength(2))
  const selector=wrapper.findAllComponents(FieldSelect).find(item=>item.props('dataMember')==='value'&&!item.props('field'))!
  expect(selector).toBeDefined();selector.getComponent(ElSelect).vm.$emit('update:modelValue','Q3');await flushPromises()
  expect(parameters.getSelectedValues()).toEqual(['Q3'])
  const click=async(label:string)=>{const action=wrapper.findAllComponents(RendererButton).find(item=>item.props('label')===label);expect(action).toBeDefined();action!.vm.$emit('click');await flushPromises()}
  await click('编辑选中参数绑定')
  return{wrapper,runtime,ds,parent,outputs,parameters,selector,click,http:api.current.state.http}
}

describe('external API pages assembled through the standard scenario entry', () => {
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
  it('displays the actual output type option after cancel and save despite a stale display column',async()=>{
    records('Base_TblField')[1]!['DataTypeName']='过时类型标签'
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    const wrapper=await mountAt(InterfacePage,{providerId:'P1'}),ds=[...observed].find(p=>p.getDataSet(API))!.getDataSet(API)!,parent=ds.getView('Base_DataServiceInterface')!
    parent.setCurrentRowById('I2');parent.setSelectedRows([parent.currentRow!]);await flushPromises()
    await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出定义')!.trigger('click');await flushPromises()
    const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1));outputs.setCurrentRowById('F2');await flushPromises()
    const table=wrapper.findAllComponents(RendererTable).find(item=>item.props('dataViewKey')?.includes('@Base_TblField@'))!
    await vi.waitFor(()=>expect(table.text()).toContain('文本'));expect(table.text()).not.toContain('过时类型标签')
    await button(wrapper,'编辑当前输出')!.trigger('click');await flushPromises();outputs.updateEditingValue('F2','DataType','int')
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='取消输出编辑')!.vm.$emit('click');await flushPromises()
    expect(table.text()).toContain('文本');expect(api.current.state.http.saves).toHaveLength(0)
    await button(wrapper,'编辑当前输出')!.trigger('click');await flushPromises();outputs.updateEditingValue('F2','DataType','int')
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='保存输出定义')!.vm.$emit('click')
    await vi.waitFor(()=>expect(records('Base_TblField')[1]?.['DataType']).toBe('int'))
    await vi.waitFor(()=>expect(table.text()).toContain('整数'));expect(table.text()).not.toContain('过时类型标签')
  })
  it('confirms an unreferenced output deletion through the original ID without replaying an unknown result',async()=>{
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    const props=reactive({providerId:'P1'}),wrapper=await mountAt(InterfacePage,props),runtime=[...observed].find(p=>p.getDataSet(API))!,ds=runtime.getDataSet(API)!,parent=ds.getView('Base_DataServiceInterface')!
    parent.setCurrentRowById('I2');parent.setSelectedRows([parent.currentRow!]);await flushPromises()
    await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出定义')!.trigger('click');await flushPromises()
    const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1));outputs.setCurrentRowById('F2');await flushPromises()
    const remove=button(wrapper,'删除当前输出');expect(remove).toBeDefined();await remove!.trigger('click');await flushPromises()
    const click=async(label:string)=>{wrapper.findAllComponents(RendererButton).find(item=>item.props('label')===label)!.vm.$emit('click');await flushPromises()}
    await click('取消删除输出');expect(api.current.state.http.saves).toHaveLength(0);expect(outputs.rows).toHaveLength(1)
    await button(wrapper,'删除当前输出')!.trigger('click');await flushPromises();api.current.state.http.failAfterWrite=true
    await click('确认删除输出');await vi.waitFor(()=>expect(outputs.hasUnconfirmedSave).toBe(true))
    props.providerId='P2';await flushPromises()
    expect(ds.destroyed).toBe(false);expect(outputs.hasUnconfirmedSave).toBe(true);expect(runtime.getDataSet(API)).toBe(ds)
    await click('核验原输出提交');await vi.waitFor(()=>expect(outputs.hasUnconfirmedSave).toBe(false))
    expect(api.current.state.http.saves).toHaveLength(1);expect(api.current.state.http.saves[0]?.deleted[0]?.['rowid']).toBe('F2')
    expect(records('Base_TblField').map(row=>row['rowid'])).toEqual(['F1'])
    await flushPromises();await button(wrapper,'切换到所选服务商')!.trigger('click')
    await vi.waitFor(()=>expect(wrapper.text()).toContain('其他'));expect(ds.destroyed).toBe(true)
  })
  it('cancels a new output without writing or inventing its parent display name',async()=>{
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    const wrapper=await mountAt(InterfacePage,{providerId:'P1'}),ds=[...observed].find(p=>p.getDataSet(API))!.getDataSet(API)!,parent=ds.getView('Base_DataServiceInterface')!
    parent.setCurrentRowById('I1');parent.setSelectedRows([parent.currentRow!]);await flushPromises()
    await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出定义')!.trigger('click');await flushPromises()
    const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1))
    const add=button(wrapper,'新增输出');expect(add).toBeDefined();await add!.trigger('click');await flushPromises()
    const created=outputs.rows.find(row=>outputs.dirtyTracking.isPendingCreate(outputs.getPkKey(row)!))!
    expect(created).toBeDefined();expect(created['tblid']).toBe('I1');expect(created['tblname']??'').toBe('')
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='取消输出编辑')!.vm.$emit('click');await flushPromises()
    expect(outputs.rows).toHaveLength(1);expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false);expect(api.current.state.http.saves).toHaveLength(0)
    await button(wrapper,'新增输出')!.trigger('click');await flushPromises()
    const next=outputs.rows.find(row=>outputs.dirtyTracking.isPendingCreate(outputs.getPkKey(row)!))!,id=outputs.getPkKey(next)!
    for(const [field,value]of Object.entries({enname:'new_field',cnname:'新字段',DataType:'string',IsPKey:0}))outputs.updateEditingValue(id,field,value)
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='保存输出定义')!.vm.$emit('click')
    await vi.waitFor(()=>expect(api.current.state.http.saves).toHaveLength(1))
    expect(api.current.state.http.saves[0]?.added[0]).toMatchObject({rowid:id,tblid:'I1',enname:'new_field',IsPKey:0})
    expect(api.current.state.http.saves[0]?.added[0]?.['tblname']??'').toBe('')
    await vi.waitFor(()=>expect(outputs.hasPendingSavedRowPermissions).toBe(false))
  })
  it('edits an original output through a fixed-row standard form and cancels without writing',async()=>{
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    const wrapper=await mountAt(InterfacePage,{providerId:'P1'})
    const ds=[...observed].find(p=>p.getDataSet(API))!.getDataSet(API)!,interfaces=ds.getView('Base_DataServiceInterface')!
    interfaces.setCurrentRowById('I1');interfaces.setSelectedRows([interfaces.currentRow!]);await flushPromises()
    await wrapper.findAll('.el-tabs__item').find(item=>item.text()==='输出定义')!.trigger('click');await flushPromises()
    const outputs=ds.getView('Base_TblField')!;await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1));outputs.setCurrentRowById('F1');await flushPromises()
    const edit=button(wrapper,'编辑当前输出');expect(edit).toBeDefined();await edit!.trigger('click');await flushPromises()
    const form=wrapper.findAllComponents(RendererForm).find(item=>item.props('contextRowId')==='F1');expect(form).toBeDefined()
    outputs.updateEditingValue('F1','cnname','cancelled title')
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='取消输出编辑')!.vm.$emit('click');await flushPromises()
    expect(outputs.getEditingRow('F1')?.['cnname']).toBe('令牌');expect(api.current.state.http.saves).toHaveLength(0)
    await button(wrapper,'编辑当前输出')!.trigger('click');await flushPromises()
    outputs.updateEditingValue('F1','cnname','saved title')
    const inputs=ds.getView('_Base_ParamList')!;inputs.updateEditingValue('A1','pardesc','keep input draft')
    wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='保存输出定义')!.vm.$emit('click')
    await vi.waitFor(()=>expect(records('Base_TblField')[0]?.['cnname']).toBe('saved title'))
    expect(api.current.state.http.saves).toHaveLength(1);expect(api.current.state.http.saves[0]?.changed).toMatchObject([{rowid:'F1',cnname:'saved title'}])
    expect(inputs.hasEditingChanges('A1')).toBe(true)
    await mountAt(InterfacePage,{providerId:'P1'})
    const reopened=[...observed].filter(p=>p.getDataSet(API)).at(-1)!.getDataSet(API)!,parent=reopened.getView('Base_DataServiceInterface')!
    parent.setCurrentRowById('I1');parent.setSelectedRows([parent.currentRow!])
    await vi.waitFor(()=>expect(reopened.getView('Base_TblField')!.rows[0]?.['cnname']).toBe('saved title'))
  })
  it.each([{component:InterfacePage,scenario:API},{component:ConfigPage,scenario:CONFIG}])('provides its original deferred metadata host for $scenario',async({component,scenario})=>{
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
    expect(getVuePageEntry(path)).toMatchObject({source: `src/views${path}.vue`, scope: 'app', shellTool: false})
  })

  it('lists providers and creates one through the create view with page events only', async () => {
    const wrapper = await mountAt(ManagementPage)
    expect(wrapper.text()).toContain('服务甲')
    expect(wrapper.text()).toContain('服务乙')
    await button(wrapper, '新增服务商')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.findComponent(RendererForm).exists()).toBe(true)})
    const inputs = wrapper.findComponent(RendererForm).findAll('input')
    await inputs[0]!.setValue('新服务'); await inputs[1]!.setValue('https://new.test')
    await button(wrapper, '保存基础信息')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider').some(row => row['Name'] === '新服务')).toBe(true)})
    expect(api.current.state.http.saves.at(-1)).toMatchObject({table: 'Base_InterfaceProvider', changed: [], deleted: []})
  })

  it('opens the request settings for one provider and saves the prefix verbatim', async () => {
    const wrapper = await mountAt(ConfigPage, {providerId: 'P1'})
    expect(wrapper.text()).toContain('access_token')
    expect(wrapper.text()).not.toContain('other')
    await wrapper.findAll('.el-tabs__item').find(item => item.text() === '公共请求头')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).toContain('令牌前缀')})
    const prefix = wrapper.findAllComponents(RendererForm).find(form => form.text().includes('令牌前缀'))
    expect(prefix).toBeDefined()
    await prefix!.get('input').setValue(' Token ')
    await button(wrapper, '保存令牌前缀')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider')[0]!['TokenPrefix']).toBe(' Token ')})
  })

  it('opens the interface scheme for one provider with no child definition loaded before a selection', async () => {
    const wrapper = await mountAt(InterfacePage, {providerId: 'P1'})
    expect(wrapper.text()).toContain('取令牌')
    expect(wrapper.text()).not.toContain('其他')
    expect(wrapper.text()).toContain('从左侧选择接口')
    expect(api.current.state.http.reads.some(read => read.table === '_Base_ParamList')).toBe(false)
  })
})
