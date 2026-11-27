import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h, type Component} from 'vue'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import ElementPlus, {ElSelect} from 'element-plus'
import VXETable from 'vxe-table'
import {Spark, registerAllRenderers, RendererForm, RendererButton, RendererTable, FieldSelect, PAGE_SERVICE, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {FieldJson, RendererDialog, RendererTabs} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createApiService, seed, NAV, API, CONFIG, META, pagedata} from './api-provider.fixture'

const api = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof import('./api-provider.fixture')['createApiService']>}))
const confirmBox = vi.hoisted(() => vi.fn<(message: string, title: string, _options?: unknown) => Promise<string>>())
// Vitest strips CSS imports by default. Use the actual tool stylesheet.
vi.mock('@/views/features/integration/api-management/ui/interface-list/style.css?raw', async () => {
  const {readFileSync} = await import('node:fs')
  return {default: readFileSync('src/views/features/integration/api-management/ui/interface-list/style.css', 'utf8')}
})
vi.mock('@/views/features/integration/api-management/ui/provider-tool/style.css?raw', async () => {
  const {readFileSync} = await import('node:fs')
  return {default: readFileSync('src/views/features/integration/api-management/ui/provider-tool/style.css', 'utf8')}
})
vi.mock('element-plus', async importOriginal => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {...original, ElMessageBox: {...original.ElMessageBox, confirm: confirmBox}}
})
vi.mock('@/platform-adapters/lowcode-runtime', () => ({
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
const messages = vi.fn<PageServiceCapability['showMessage']>()
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  api.current.reset(seed)
  messages.mockClear()
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
        showMessage: messages,
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
  it.each(['not-submitted', 'rejected', 'unknown', 'follow-up-failed', 'readback-blocked', 'confirmed'] as const)(
    'reports the shared table save result (%s)', async mode => {
      const {runFeatureTableAction} = await import('@/views/features/shared/table/feature-table-actions')
      const f = await interfaceFixture()
      f.select('I1')
      await flushPromises()
      const view = f.ds.getView('_Base_ParamList')!
      await vi.waitFor(() => expect(view.rows.some(row => view.getPkKey(row) === 'A1')).toBe(true))
      view.updateEditingValue('A1', 'pardesc', '更新描述')
      const showMessage = vi.fn()
      const readback = vi.fn(() => view)
      const submit = () => runFeatureTableAction(view, 'save', {ui: {showMessage}, readback})

      if (mode === 'not-submitted') {
        const save = f.ds.saveChanges.bind(f.ds)
        vi.spyOn(f.ds, 'saveChanges').mockImplementationOnce(options => {
          view.discardPendingChanges(['A1'])
          return save(options)
        })
      }
      if (mode === 'rejected') f.http.rejectNextSave = true
      if (mode === 'unknown') f.http.failAfterWrite = true
      if (mode === 'follow-up-failed') {
        f.ds.setSaveCompletionHandler(() => {throw Error('后续操作故障')})
      }
      if (mode === 'readback-blocked') {
        f.ds.setSaveCompletionHandler(() => {view.updateEditingValue('A1', 'pardesc', '后来草稿')})
      }

      if (mode === 'rejected') await expect(submit()).rejects.toThrow('Rejected before write')
      else if (mode === 'unknown') {
        await expect(submit()).rejects.toThrow('保存结果未知，请核验原提交')
        await expect(submit()).rejects.toThrow('保存结果未知，请核验原提交')
        expect(view.hasUnconfirmedSave).toBe(true)
      } else await submit()

      expect(f.http.saves).toHaveLength(mode === 'not-submitted' || mode === 'rejected' ? 0 : 1)
      expect(readback).toHaveBeenCalledTimes(mode === 'confirmed' || mode === 'readback-blocked' ? 1 : 0)
      if (mode === 'confirmed') expect(showMessage).toHaveBeenCalledExactlyOnceWith('保存成功', 'success')
      else if (mode === 'not-submitted') expect(showMessage).toHaveBeenCalledExactlyOnceWith('本次未提交变更', 'info')
      else if (mode === 'follow-up-failed') expect(showMessage).toHaveBeenCalledExactlyOnceWith('保存已确认，后续操作失败：后续操作故障', 'warning')
      else if (mode === 'readback-blocked') {
        expect(showMessage).toHaveBeenCalledExactlyOnceWith('保存已确认，关联数据回读失败', 'warning')
        expect(view.refreshPending).toBe(false)
        expect(view.getEditingRow('A1')?.['pardesc']).toBe('后来草稿')
      } else expect(showMessage).not.toHaveBeenCalled()
    },
  )

  it('selects the original interface from the configured sidebar',async()=>{
    const f=await interfaceFixture()
    const sidebar=f.wrapper.find('.interface-list__sidebar')
    await vi.waitFor(()=>expect(sidebar.text()).toContain('查询'))
    const item=sidebar.findAll('.renderer-list-item-shell').find(node=>node.text()==='查询')!
    await item.trigger('click')
    await vi.waitFor(()=>expect(f.interfaces.currentRow?.['rowid']).toBe('I2'))
    expect(f.interfaces.selectedRows.map(row=>row['rowid'])).toEqual(['I2'])
    expect(f.http.saves).toEqual([])
  })
  it('ignores a request header action captured before the selected interface changed', async () => {
    const f = await interfaceFixture()
    const headers = f.ds.getView('Base_InterfaceApi_Headers')!
    f.select('I1')
    await f.tab('Header')
    const headerTable = () => f.wrapper.findAllComponents(RendererTable).find(table =>
      table.props('dataViewKey') === `${API}@Base_InterfaceApi_Headers@default`)
    await vi.waitFor(() => expect(headerTable()?.props('toolbar')).toBeDefined())
    const add = headerTable()?.props('toolbar')?.children?.find(node =>
      isRecord(node) && isRecord(node['props']) && node['props']['label'] === '新增')
    const oldAdd = isRecord(add) && isRecord(add['props']) ? add['props']['onClick'] : undefined
    if (typeof oldAdd !== 'function') throw Error('原接口请求头工具栏缺少新增动作')
    const sidebar = f.wrapper.get('.interface-list__sidebar')
    await sidebar.findAll('.renderer-list-item-shell').find(node => node.text() === '查询')!.trigger('click')
    await vi.waitFor(() => expect(headers.rows.map(row => row['rowid'])).toEqual(['X1']))
    await oldAdd()
    expect(headers.rows.map(row => row['rowid'])).toEqual(['X1'])
    expect(headers.dirtyTracking.hasPendingChanges()).toBe(false)
    await f.tab('Header')
    await vi.waitFor(() => expect(headerTable()?.findAll('button').some(item => item.text() === '新增')).toBe(true))
    await headerTable()!.findAll('button').find(item => item.text() === '新增')!.trigger('click')
    await vi.waitFor(() => expect(headers.rows).toHaveLength(2))
    expect(headers.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(f.http.saves).toEqual([])
  })
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
    const {loadLowcodeRuntimeScenario}=await import('@/platform-adapters/data-space/lowcode-data-space-runtime')
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
  it('keeps an unknown binding pending without replaying its change',async()=>{
    const f=await bindingFixture();f.http.failAfterWrite=true;await f.click('确认替换原绑定')
    await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(true));await f.click('核验原参数重绑')
    await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(false))
    expect(document.body.textContent).not.toContain('SPARK_SAVE_UNVERIFIABLE')
    expect(f.http.saves).toHaveLength(1)
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
  it('keeps the dispatched binding pending after a late source change without replaying it',async()=>{
    const f=await bindingFixture();let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
    f.http.beforeSave=async()=>{entered=true;await gate}
    try{
      await f.click('确认替换原绑定');await vi.waitFor(()=>expect(entered).toBe(true))
      f.parent.setCurrentRowById('I2');f.parent.setSelectedRows([f.parent.currentRow!]);f.http.failAfterWrite=true;release();await flushPromises()
      await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(true));await f.click('核验原参数重绑')
      await vi.waitFor(()=>expect(f.parameters.hasUnconfirmedSave).toBe(false))
      expect(document.body.textContent).not.toContain('SPARK_SAVE_UNVERIFIABLE')
      expect(f.http.saves).toHaveLength(1)
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
  it('switches configured request tabs and opens JSON import for the selected request type',async()=>{
    const f=await interfaceFixture()
    f.select('I1')
    await f.tab('Body/Json')
    const activeTab=()=>f.wrapper.find('.interface-edit__request .el-tabs__item.is-active').text()
    expect(activeTab()).toBe('Body/Json')
    f.interfaces.updateEditingValue('I1','RequestType','FormData')
    await vi.waitFor(()=>expect(f.wrapper.text()).toContain('参数类型选择 Body/Json 后维护 JSON 请求体'))
    await f.tab('Body/FormData')
    expect(activeTab()).toBe('Body/FormData')
    await button(f.wrapper,'导入JSON')!.trigger('click')
    await vi.waitFor(()=>expect(document.body.textContent).toContain('JSON输入'))
    const dialog=f.wrapper.findAllComponents(RendererDialog).find(node=>node.props('title')==='JSON输入')!
    const editor=dialog.getComponent(FieldJson)
    const original=f.interfaces.getEditingRow('I1')?.['BodyParamJsonStr']
    const confirm=dialog.findAllComponents(RendererButton).find(node=>node.props('label')==='保存')!
    editor.vm.$emit('update:modelValue','{}')
    await confirm.trigger('click')
    await vi.waitFor(()=>expect(document.body.textContent).toContain('Body/FormData 须输入 JSON 数组'))
    expect(f.interfaces.getEditingRow('I1')?.['BodyParamJsonStr']).toBe(original)
    editor.vm.$emit('update:modelValue','[{"name":"code","value":1}]')
    await confirm.trigger('click')
    const normalized='[{"fieldName":"code","fieldType":"string","defaultValue":"1","valueFun":""}]'
    await vi.waitFor(()=>expect(f.interfaces.getEditingRow('I1')?.['BodyParamJsonStr']).toBe(normalized))
    expect(f.http.saves).toHaveLength(0)
    await button(f.wrapper,'保存')!.trigger('click')
    await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
    expect(f.http.saves[0]).toMatchObject({table:'Base_DataServiceInterface',changed:[expect.objectContaining({rowid:'I1',RequestType:'FormData',BodyParamJsonStr:normalized})]})
    await vi.waitFor(()=>expect(f.interfaces.dirtyTracking.hasPendingChanges()).toBe(false))
    f.select('I2')
    await vi.waitFor(()=>expect(activeTab()).toBe('Params'))
    expect(document.body.textContent).not.toContain('JSON输入')
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

  it('reports that a command draft removed before dispatch has no interface receipt',async()=>{
    const f=await interfaceFixture()
    f.select('I1');await flushPromises()
    await f.tab('调用输出')
    const calls=f.ds.getView('InterfaceCallRequest')!
    const removeStagedCommand=()=>{
      if(!calls.currentRow)return
      calls.events.off('currentRowChanged',removeStagedCommand)
      calls.discardPendingChanges()
    }
    calls.events.on('currentRowChanged',removeStagedCommand)
    try{
      await button(f.wrapper,'调用')!.trigger('click')
      await flushPromises()
      expect(f.http.invocations).toEqual([])
      expect(calls.rows).toEqual([])
      expect(calls.hasUnconfirmedSave).toBe(false)
      expect(f.wrapper.text()).toContain('原记录没有已确认的保存回执')
    }finally{calls.events.off('currentRowChanged',removeStagedCommand)}
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
  it.each([{tab: '调用输出', action: '调用'}, {tab: '输出内容', action: '重新设置输出'}])(
    'blocks $action before dispatch when the original parameter query is no longer loaded',
    async ({tab, action}) => {
      const f = await interfaceFixture()
      f.select('I1')
      const inputs = f.ds.getView('_Base_ParamList')!
      const outputs = f.ds.getView('Base_TblField')!
      await vi.waitFor(() => expect(inputs.rows).toHaveLength(1))
      await f.tab(tab)
      inputs.resetState()
      await button(f.wrapper, action)!.trigger('click')
      await vi.waitFor(() => expect(f.wrapper.text()).toContain('请先完整读取当前接口的输入参数'))
      expect(f.http.invocations).toEqual([])
      expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.http.saves).toEqual([])
    },
  )
  it('lets the user abandon an unknown external call without clearing the input draft or resending it',async()=>{
    const f=await interfaceFixture()
    f.select('I1');await flushPromises()
    await f.tab('调用输出')
    const inputs=f.ds.getView('_Base_ParamList')!,calls=f.ds.getView('InterfaceCallRequest')!
    inputs.updateEditingValue('A1','pardesc','input before external call')
    f.http.invocationResult=new Error('response lost after dispatch')
    await button(f.wrapper,'调用')!.trigger('click')
    await vi.waitFor(()=>expect(calls.hasUnconfirmedSave).toBe(true))
    const abandon=button(f.wrapper,'放弃未知结果')!
    expect(abandon.attributes('disabled')).toBeUndefined()
    await abandon.trigger('click')
    await vi.waitFor(()=>expect(calls.hasUnconfirmedSave).toBe(false))
    expect(f.http.invocations).toHaveLength(1)
    expect(inputs.getEditingRow('A1')?.['pardesc']).toBe('input before external call')

    f.http.invocationResult={token:'second'}
    await button(f.wrapper,'调用')!.trigger('click')
    await vi.waitFor(()=>expect(f.http.invocations).toHaveLength(2))
    await vi.waitFor(()=>expect(calls.currentRow?.['result']).toContain('second'))
    expect(calls.hasUnconfirmedSave).toBe(false)

    expect(f.http.saves).toEqual([])
  })
  it('releases only the staged command when parameter proof changes before actual dispatch', async () => {
    const f = await interfaceFixture()
    f.select('I1')
    const inputs = f.ds.getView('_Base_ParamList')!
    const calls = f.ds.getView('InterfaceCallRequest')!
    await vi.waitFor(() => expect(inputs.rows).toHaveLength(1))
    await f.tab('调用输出')
    const replaceInput = () => {
      if (!calls.rows.length) return
      calls.events.off('rowsChanged', replaceInput)
      inputs.queryContext = {...inputs.queryContext, fixtureRevision: 'replacement'}
    }
    calls.events.on('rowsChanged', replaceInput)
    try {
      await button(f.wrapper, '调用')!.trigger('click')
      await vi.waitFor(() => expect(f.wrapper.text()).toContain('DATA_VIEW_READ_RESULT'))
      expect(calls.rows).toEqual([])
      expect(calls.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.http.invocations).toEqual([])
    } finally {
      calls.events.off('rowsChanged', replaceInput)
    }
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
  it.each(['not loaded', 'unreadable'] as const)('blocks output reset with a %s baseline before sampling', async state => {
    const f = await interfaceFixture()
    if (state === 'unreadable') f.http.hiddenFields['Base_TblField'] = ['enname']
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.rows).toHaveLength(1))
    if (state === 'not loaded') outputs.resetState()
    await button(f.wrapper, '重新设置输出')!.trigger('click')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain(state === 'not loaded' ? '请先完整读取当前接口的输出定义' : '输出定义字段不可读'))
    expect(f.http.invocations).toEqual([])
    expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.http.saves).toEqual([])
  })
  it('keeps the output when the original public parameter reference is unreadable', async () => {
    const f = await interfaceFixture()
    f.http.invocationResult = {replacement: true}
    f.http.hiddenFields['Base_Interface_PublicParam'] = ['outputfield']
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.rows).toHaveLength(1))
    await button(f.wrapper, '重新设置输出')!.trigger('click')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('Base_Interface_PublicParam.outputfield不可读'))
    expect(outputs.rows.map(row => row['rowid'])).toEqual(['F1'])
    expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.http.invocations).toHaveLength(1)
    expect(f.http.saves).toEqual([])
  })
  it('keeps the existing type when its public parameter still references the output', async () => {
    const f = await interfaceFixture()
    f.http.invocationResult = {token: 1}
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.rows).toHaveLength(1))
    await button(f.wrapper, '重新设置输出')!.trigger('click')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('输出字段 token 已设置公共参数'))
    expect(outputs.getEditingPatch('F1')).toBeUndefined()
    expect(f.http.invocations).toHaveLength(1)
    expect(f.http.saves).toEqual([])
  })
  it('stages new outputs when the full query confirms an empty original definition', async () => {
    const f = await interfaceFixture()
    records('Base_TblField').splice(0)
    records('Base_Interface_PublicParam').splice(0)
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.countReported).toBe(true))
    expect(outputs.rows).toEqual([])
    await button(f.wrapper, '重新设置输出')!.trigger('click')
    await vi.waitFor(() => expect(outputs.rows.map(row => row['enname'])).toEqual(['token', 'expires', 'ratio']))
    expect(outputs.rows.every(row => row['tblid'] === 'I1')).toBe(true)
    expect(f.http.invocations).toHaveLength(1)
    expect(f.http.saves).toEqual([])
  })
  it('drops a confirmed sample when its interface changes during reference readback', async () => {
    const f = await interfaceFixture()
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.rows).toHaveLength(1))
    records('Base_Interface_PublicParam').splice(0)
    f.http.invocationResult = {replacement: true}
    let entered = false, release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    f.http.beforeDefinitionRead = async table => {
      if (table === 'Base_Interface_PublicParam') {entered = true; await gate}
    }
    try {
      await button(f.wrapper, '重新设置输出')!.trigger('click')
      await vi.waitFor(() => expect(entered).toBe(true))
      f.select('I2')
      await vi.waitFor(() => expect(outputs.rows.map(row => row['rowid'])).toEqual(['F2']))
      release()
      await vi.waitFor(() => expect(f.wrapper.text()).toContain('当前接口已切换，未重新设置输出'))
      expect(outputs.rows.map(row => row['rowid'])).toEqual(['F2'])
      expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.ds.getView('InterfaceCallRequest')!.rows[0]).toMatchObject({interfaceId: 'I1', result: expect.stringContaining('replacement')})
      expect(f.http.invocations).toHaveLength(1)
      expect(f.http.saves).toEqual([])
    } finally {release()}
  })
  it('keeps all output fields untouched when one operation cannot be staged', async () => {
    const f = await interfaceFixture()
    f.http.denyAdd.add('Base_TblField')
    f.http.invocationResult = {token: 1, replacement: true}
    f.select('I1')
    await f.tab('输出内容')
    const outputs = f.ds.getView('Base_TblField')!
    await vi.waitFor(() => expect(outputs.rows).toHaveLength(1))
    await button(f.wrapper, '重新设置输出')!.trigger('click')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('当前查询不允许新增输出字段'))
    expect(outputs.getEditingPatch('F1')).toBeUndefined()
    expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.http.invocations).toHaveLength(1)
    expect(f.http.saves).toEqual([])
  })
  it('verifies the original output save without submitting the input draft',async()=>{
    const f=await interfaceFixture()
    f.select('I1');await flushPromises()
    await f.tab('输出内容')
    const outputs=f.ds.getView('Base_TblField')!,inputs=f.ds.getView('_Base_ParamList')!
    await vi.waitFor(()=>expect(outputs.rows).toHaveLength(1))
    inputs.updateEditingValue('A1','pardesc','keep original input draft')
    await button(f.wrapper,'重新设置输出')!.trigger('click')
    await vi.waitFor(()=>expect(outputs.rows).toHaveLength(3))
    f.http.failAfterWrite=true
    await f.wrapper.find('.interface-output').findAll('button').find(item=>item.text()==='保存')!.trigger('click')
    await vi.waitFor(()=>expect(outputs.hasUnconfirmedSave).toBe(true))
    const batchId = f.ds.saveJournal.batchId
    expect(batchId).toEqual(expect.any(String))
    expect(f.ds.saveJournal.views).toMatchObject([{tableName:'Base_TblField', viewId:'default', state:'unknown'}])
    expect(f.ds.saveJournal.completed).toBe(false)
    const beforeReadback = f.http.reads.length
    await button(f.wrapper,'核验原保存结果')!.trigger('click')
    await vi.waitFor(()=>expect(outputs.hasUnconfirmedSave).toBe(false))
    expect(f.http.saves.map(item=>item.table)).toEqual(['Base_TblField'])
    expect(f.http.reads.slice(beforeReadback).some(read=>read.table==='Base_TblField')).toBe(true)
    const savedOutputs = f.http.saves[0]!.added
    expect(savedOutputs.length).toBeGreaterThan(0)
    for (const saved of savedOutputs) {
      const recovered = outputs.rows.find(row => Object.is(row['rowid'], saved['rowid']))
      expect(recovered?.['enname']).toBe(saved['enname'])
    }
    expect(inputs.getEditingRow('A1')?.['pardesc']).toBe('keep original input draft')
    expect(inputs.hasEditingChanges('A1')).toBe(true)
    expect(f.ds.saveJournal.batchId).toBe(batchId)
    expect(f.ds.saveJournal.views).toMatchObject([{tableName:'Base_TblField', viewId:'default', state:'applied'}])
    expect(f.ds.saveJournal.completed).toBe(true)
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
    const rowActions = wrapper.findAllComponents(RendererButton).filter(item => ['编辑', '删除', '接口列表', '基础配置'].includes(item.props('label') ?? ''))
    expect(rowActions).toHaveLength(8)
    for (const action of rowActions) expect(action.props('dataViewKey')).toBe(`${NAV}@Base_InterfaceProvider@default`)
    await button(wrapper, '新建')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(document.body.textContent).toContain('新增外部服务提供商')})
    const form = wrapper.findAllComponents(RendererForm).at(-1)!
    const inputs = form.findAll('input')
    await inputs[0]!.setValue('新服务'); await inputs[1]!.setValue('https://new.test')
    wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '确定')!.vm.$emit('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider').some(row => row['Name'] === '新服务')).toBe(true)})
    expect(api.current.state.http.saves.at(-1)).toMatchObject({table: 'Base_InterfaceProvider', changed: [], deleted: []})
  })


  it.each(['reads', 'unmounts'] as const)('retries the failed provider page from the standard table without writing and %s', async mode => {
    const table = 'Base_InterfaceProvider'
    const original = records(table)[0]
    if (!original) throw new Error('Missing provider seed')
    const added = Array.from({length: 10}, (_, index) => ({...original,
      rowid: `PROBE-${index + 1}`, Name: `隔离目录-${index + 1}`}))
    records(table).push(...added)
    api.current.state.http.paginatedTables.add(table)
    const observed = new Set<PageRuntime>(), load = PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {
      observed.add(this)
      return load.call(this)
    })
    const wrapper = await mountAt(ManagementPage)
    const view = [...observed].find(runtime => runtime.getDataSet(NAV))?.getDataSet(NAV)?.getView(table)
    if (!view) throw new Error('Missing original provider view')
    const http = api.current.state.http
    expect(wrapper.text()).toContain('隔离目录-8')
    expect(wrapper.text()).not.toContain('隔离目录-9')
    const requestedIndices = () => http.reads.filter(item => item.table === table).map(({data}) => {
      const page = isRecord(data) ? data['PageParam'] : undefined
      return isRecord(page) ? page['index'] : undefined
    })
    let failing = true
    let started = false
    let release!: () => void
    const held = new Promise<void>(resolve => {release = resolve})
    http.beforeDefinitionRead = async name => {
      if (name !== table || requestedIndices().at(-1) !== 2) return
      if (failing) throw new Error('隔离目录第2页暂不可用')
      if (mode === 'unmounts') {
        started = true
        await held
      }
    }
    try {
      await wrapper.get('.api-provider-catalog button.btn-next').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('隔离目录第2页暂不可用'))
      expect(requestedIndices()).toEqual([1, 2])
      expect(wrapper.findAll('.api-provider-catalog button')
        .filter(item => item.text() === '编辑' && item.attributes('disabled') === undefined)).toHaveLength(0)
      expect(wrapper.text()).toContain('隔离目录-8')
      failing = false
      const retry = wrapper.findAll('button').find(item => item.text() === '重试读取')
      expect(retry?.exists()).toBe(true)
      await retry!.trigger('click')
      if (mode === 'unmounts') {
        await vi.waitFor(() => expect(started).toBe(true))
        const index = wrappers.indexOf(wrapper)
        if (index < 0) throw new Error('Missing original provider wrapper')
        wrappers.splice(index, 1)
        wrapper.unmount()
        expect(view.destroyed).toBe(true)
        release()
        await flushPromises()
        expect(view.rows).toEqual([])
        expect(document.body.textContent).not.toContain('隔离目录-10')
        expect(requestedIndices()).toEqual([1, 2, 2])
        expect(http.saves).toHaveLength(0)
        return
      }
      await vi.waitFor(() => expect(wrapper.text()).toContain('隔离目录-10'))
      expect(wrapper.text()).not.toContain('隔离目录第2页暂不可用')
      expect(wrapper.text()).not.toContain('隔离目录-8')
      expect(requestedIndices()).toEqual([1, 2, 2])
      expect(http.saves).toHaveLength(0)
    } finally {release(); delete http.beforeDefinitionRead}
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
    confirmBox.mockClear().mockRejectedValueOnce('cancel')
    await button(wrapper, '关闭')!.trigger('click')
    await flushPromises()
    expect(confirmBox).toHaveBeenCalledWith(expect.stringContaining('存在未保存的修改'), '关闭确认', expect.objectContaining({type: 'warning'}))
    expect(wrapper.text()).toContain('配置信息设置')
    expect(auth.getEditingRow('P1')?.['TokenPrefix']).toBe(' Token ')
    expect(api.current.state.http.saves).toHaveLength(0)
    await button(wrapper, '保存')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider')[0]).toMatchObject({TokenPrefix: ' Token ', loginApiName: 'I1'})})
    expect(api.current.state.http.saves).toHaveLength(1)
  })

  it('verifies only the original configuration save and preserves an unrelated header draft',async()=>{
    const observed=new Set<PageRuntime>(),original=PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype,'load').mockImplementation(function(this:PageRuntime){observed.add(this);return original.call(this)})
    const wrapper=await mountAt(ManagementPage)
    await button(wrapper,'基础配置')!.trigger('click')
    await vi.waitFor(()=>expect(document.body.textContent).toContain('配置信息设置'))
    const tab=(label:string)=>wrapper.findAll('.el-tabs__item').find(item=>item.text()===label)!
    await vi.waitFor(()=>expect(tab('请求头部信息')).toBeDefined())
    await tab('请求头部信息').trigger('click')
    const ds=[...observed].find(page=>page.getDataSet(CONFIG))!.getDataSet(CONFIG)!
    const auth=ds.getView('Base_InterfaceProvider','authentication')!,headers=ds.getView('Base_InterfaceProvider_Headers')!
    await vi.waitFor(()=>expect(headers.rows).toHaveLength(1))
    const id=headers.getPkKey(headers.rows[0]!)!
    headers.updateEditingValue(id,'paramName','unsaved-header')
    await tab('JWT设置').trigger('click')
    auth.updateEditingValue('P1','TokenPrefix','Updated prefix ')
    api.current.state.http.failAfterWrite=true
    const save=wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='保存'&&item.props('dataViewKey')?.endsWith('@authentication'))
    expect(save).toBeDefined()
    save!.vm.$emit('click')
    await vi.waitFor(()=>expect(auth.hasUnconfirmedSave,wrapper.text()).toBe(true))
    const batchId = ds.saveJournal.batchId
    expect(batchId).toEqual(expect.any(String))
    expect(ds.saveJournal.views).toMatchObject([{tableName:'Base_InterfaceProvider', viewId:'authentication', state:'unknown'}])
    expect(ds.saveJournal.completed).toBe(false)
    const beforeReadback = api.current.state.http.reads.length
    await button(wrapper,'核验原保存结果')!.trigger('click')
    await vi.waitFor(()=>expect(auth.hasUnconfirmedSave).toBe(false))
    expect(api.current.state.http.saves).toHaveLength(1)
    expect(api.current.state.http.reads.slice(beforeReadback).some(read=>read.table==='Base_InterfaceProvider')).toBe(true)
    expect(auth.rows.find(row => row['rowid'] === 'P1')?.['TokenPrefix']).toBe('Updated prefix ')
    expect(headers.getEditingRow(id)?.['paramName']).toBe('unsaved-header')
    expect(headers.hasEditingChanges()).toBe(true)
    expect(ds.saveJournal.batchId).toBe(batchId)
    expect(ds.saveJournal.views).toMatchObject([{tableName:'Base_InterfaceProvider', viewId:'authentication', state:'applied'}])
    expect(ds.saveJournal.completed).toBe(true)
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

  it('retries only the failed provider configuration tab', async () => {
    config.global.stubs = {...config.global.stubs, transition: false}
    const wrapper = await mountAt(ManagementPage)
    await button(wrapper, '基础配置')!.trigger('click')
    const http = api.current.state.http
    const accountTable = 'Base_InterfaceProvider_Account'
    let attempts = 0
    http.beforeDefinitionRead = async table => {
      if (table === accountTable && ++attempts === 1) throw new Error('认证账号读取暂不可用')
    }
    await vi.waitFor(() => expect(wrapper.findAll('.el-tabs__item').some(item => item.text() === '认证账号')).toBe(true))
    await wrapper.findAll('.el-tabs__item').find(item => item.text() === '认证账号')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('认证账号读取暂不可用'))
    const previousReadCount = http.reads.length
    await button(wrapper, '重试')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('用户名'))
    expect(http.reads.slice(previousReadCount).map(read => read.table)).toEqual([accountTable])
    expect(http.saves).toHaveLength(0)
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('width') === 1180)!
    await dialog.get('.el-dialog__headerbtn').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('配置信息设置'))
  })

  it('reopens the configured tab group for a different provider without reusing the previous tab results', async () => {
    const observed = new Set<PageRuntime>(), original = PageRuntime.prototype.load
    vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {observed.add(this); return original.call(this)})
    const wrapper = await mountAt(ManagementPage)
    const configButton = (index: number) => wrapper.findAll('button').filter(item => item.text() === '基础配置')[index]!
    const headersTab = () => wrapper.findAll('.el-tabs__item').find(item => item.text() === '请求头部信息')!
    await configButton(0).trigger('click')
    await vi.waitFor(() => expect(headersTab()?.exists()).toBe(true))
    expect(wrapper.getComponent(RendererTabs).props('id')).toBe('api-provider-config-tabs')
    const page = wrapper.get('.spark-page-container')
    expect(wrapper.get('style').element.textContent).toContain(`[data-page="${page.attributes('data-page')}"].spark-page-container .api-config-page`)
    await headersTab().trigger('click')
    const dataSet = [...observed].find(runtime => runtime.getDataSet(CONFIG))!.getDataSet(CONFIG)!
    const headers = dataSet.getView('Base_InterfaceProvider_Headers')!
    await vi.waitFor(() => expect(headers.rows.map(row => row['rowid'])).toEqual(['H1']))
    const oldToolbar = wrapper.findAllComponents(RendererTable).find(table =>
      table.props('dataViewKey') === `${CONFIG}@Base_InterfaceProvider_Headers@default`)?.props('toolbar')
    const oldAddNode = oldToolbar?.children?.find(node => isRecord(node) && isRecord(node['props']) && node['props']['label'] === '新增')
    const oldAdd = isRecord(oldAddNode) && isRecord(oldAddNode['props']) ? oldAddNode['props']['onClick'] : undefined
    if (typeof oldAdd !== 'function') throw Error('原请求头工具栏缺少新增动作')
    await button(wrapper, '关闭')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTabs).exists()).toBe(false))
    const http = api.current.state.http
    const reads = http.reads.length
    await configButton(1).trigger('click')
    await vi.waitFor(() => expect(headersTab()?.exists()).toBe(true))
    expect(dataSet.getView('Base_InterfaceProvider', 'authentication')!.rows.map(row => row['rowid'])).toEqual(['P2'])
    expect(wrapper.getComponent(RendererTabs).props('modelValue')).toBe('jwt')
    expect(http.reads.slice(reads).map(read => read.table)).not.toContain('Base_InterfaceProvider_Headers')
    await headersTab().trigger('click')
    await vi.waitFor(() => expect(headers.rows.map(row => row['rowid'])).toEqual(['H2']))
    await oldAdd()
    expect(headers.rows.map(row => row['rowid'])).toEqual(['H2'])
    expect(headers.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(http.saves).toHaveLength(0)
    expect(observed.size).toBe(1)
  })

  it('opens the configured interface scheme from the provider directory and loads the work area after selection', async () => {
    const wrapper = await mountAt(ManagementPage)
    await wrapper.findAll('button').find(item => item.text() === '接口列表')!.trigger('click')
    const workbench = () => wrapper.getComponent(InterfacePage)
    await vi.waitFor(() => expect(workbench().text()).toContain('请选择左侧接口，或先新建接口'))
    const dialog = workbench().getComponent(RendererDialog)
    expect(dialog.props('dataViewKey')).toBe(`${API}@Base_DataServiceInterface@default`)
    expect(dialog.props('width')).toBe(1480)
    const page = workbench().get('.spark-page-container')
    const scope = `[data-page="${page.attributes('data-page')}"].spark-page-container`
    expect(page.find('.interface-list').exists()).toBe(true)
    expect(workbench().get('style').element.textContent).toContain(`${scope} .interface-list {`)
    expect(dialog.text()).toContain('取令牌')
    expect(dialog.text()).not.toContain('其他')
    expect(api.current.state.http.reads.some(read => read.table === '_Base_ParamList')).toBe(false)
    const sidebar = dialog.get('.interface-list__sidebar')
    await sidebar.findAll('.renderer-list-item-shell').find(node => node.text() === '取令牌')!.trigger('click')
    await vi.waitFor(() => {
      const tabs = workbench().findAllComponents(RendererTabs).find(item => item.props('id') === 'api-interface-tabs')
      expect(tabs?.findAll('.el-tabs__item').map(item => item.text())).toEqual(
        expect.arrayContaining(['接口编辑', '调用输出', '输出内容']),
      )
      expect(dialog.text()).toContain('服务甲 / 取令牌')
    })
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findComponent(InterfacePage).exists()).toBe(false)
  })

  it('keeps a single interface close confirmation and preserves the draft when canceled', async () => {
    const f = await interfaceFixture()
    f.select('I1')
    f.interfaces.updateEditingValue('I1', 'Name', '保留接口草稿')
    await flushPromises()
    let cancel!: () => void
    confirmBox.mockClear().mockReturnValueOnce(new Promise<string>((_, reject) => {cancel = () => reject('cancel')}))
    const dialog = f.wrapper.getComponent(RendererDialog)
    dialog.vm.$emit('update:modelValue', false)
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(confirmBox).toHaveBeenCalledTimes(1)
    cancel()
    await flushPromises()
    expect(f.interfaces.getEditingRow('I1')?.['Name']).toBe('保留接口草稿')
    expect(f.wrapper.getComponent(InterfacePage).emitted('close')).toBeUndefined()
  })
})


it('keeps the original write unknown if the view is released before the receipt', async()=>{
 const f=await interfaceFixture()
 f.select('I1')
 await flushPromises()
 const view=f.ds.getView('_Base_ParamList')!
 await vi.waitFor(()=>expect(view.rows.some(row=>view.getPkKey(row)==='A1')).toBe(true))
 view.updateEditingValue('A1','pardesc','写入后丢回执')
 f.http.beforeSave=async()=>{view.destroy()}
 f.http.failAfterWrite=true
 const outcome=await f.ds.saveView(view)
 expect(f.http.saves).toHaveLength(1)
 expect(view.destroyed).toBe(true)
 expect(f.ds.saveJournal.views).toMatchObject([{tableName:'_Base_ParamList',state:'unknown'}])
 expect(outcome.state).toBe('unknown')
})

function clearOriginalDraftBeforeSaving(view: DataView, id: string | number) {
  const dataSet = view.dataSet!
  const save = dataSet.saveChanges.bind(dataSet)
  return vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(options => {
    expect(view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id)).toBe(true)
    view.discardPendingChanges([id])
    return save(options)
  })
}

it('requires a formal receipt before reporting interface definition saved', async () => {
  const f = await interfaceFixture()
  f.select('I1')
  await flushPromises()
  const originalName = records('Base_DataServiceInterface').find(row => row['rowid'] === 'I1')?.['Name']
  f.interfaces.updateEditingValue('I1', 'Name', '未派发的定义修改')
  const save = clearOriginalDraftBeforeSaving(f.interfaces, 'I1')
  const submit = button(f.wrapper, '保存')!
  await vi.waitFor(() => expect(submit.attributes('disabled')).toBeUndefined())
  await submit.trigger('click')
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
  await flushPromises()
  expect(f.http.saves).toHaveLength(0)
  expect(records('Base_DataServiceInterface').find(row => row['rowid'] === 'I1')?.['Name']).toBe(originalName)
  expect(messages).not.toHaveBeenCalledWith('保存成功', 'success')
  expect(messages).toHaveBeenCalledWith('本次未提交变更', 'info')
})

it('requires a formal receipt before reporting a childless interface deleted', async () => {
  records('Base_DataServiceInterface').push({rowid:'I4',ProviderID:'P1',Name:'空接口',LinkUrl:'/empty',request:'GET',requiresAuth:0,RequestType:'Body'})
  confirmBox.mockReset().mockResolvedValue('confirm')
  const f = await interfaceFixture()
  f.select('I4')
  await flushPromises()
  const save = clearOriginalDraftBeforeSaving(f.interfaces, 'I4')
  await button(f.wrapper, '删除')!.trigger('click')
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
  await flushPromises()
  expect(confirmBox).toHaveBeenCalledWith('确定要删除接口“空接口”吗？', '删除确认', expect.anything())
  expect(f.http.saves).toHaveLength(0)
  expect(records('Base_DataServiceInterface').some(row => row['rowid'] === 'I4')).toBe(true)
  expect(messages).not.toHaveBeenCalledWith('删除成功', 'success')
  expect(f.wrapper.text()).toContain('原记录没有已确认的保存回执')
})

it('requires a formal receipt before reporting a childless provider deleted', async () => {
  records('Base_InterfaceProvider').push({rowid:'P3',Name:'服务丙',BaseURL:'https://c.test'})
  confirmBox.mockReset().mockResolvedValue('confirm')
  const observed = new Set<PageRuntime>(), original = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {observed.add(this); return original.call(this)})
  const wrapper = await mountAt(ManagementPage)
  const provider = [...observed].find(page => page.getDataSet(NAV))!.getDataSet(NAV)!.getView('Base_InterfaceProvider')!
  const save = clearOriginalDraftBeforeSaving(provider, 'P3')
  expect(wrapper.text()).toContain('服务丙')
  await wrapper.findAll('button').filter(item => item.text() === '删除')[2]!.trigger('click')
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
  await flushPromises()
  expect(confirmBox).toHaveBeenCalledWith('确定要删除服务提供商“服务丙”吗？', '删除确认', expect.anything())
  expect(api.current.state.http.saves).toHaveLength(0)
  expect(records('Base_InterfaceProvider').some(row => row['rowid'] === 'P3')).toBe(true)
  expect(messages).not.toHaveBeenCalledWith('删除成功', 'success')
  expect(wrapper.text()).toContain('原记录没有已确认的保存回执')
})
it('separates confirmed provider deletion from failed catalog readback', async () => {
  const http = api.current.state.http
  records('Base_InterfaceProvider').push({rowid:'P3',Name:'服务丙',BaseURL:'https://c.test'})
  confirmBox.mockReset().mockResolvedValue('confirm')
  const observed = new Set<PageRuntime>(), original = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function (this: PageRuntime) {observed.add(this); return original.call(this)})
  const wrapper = await mountAt(ManagementPage)
  const dataSet = [...observed].find(page => page.getDataSet(NAV))!.getDataSet(NAV)!
  const provider = dataSet.getView('Base_InterfaceProvider')!
  let failedReadbacks = 0
  http.beforeDefinitionRead = async table => {
    if (table === 'Base_InterfaceProvider' && http.saves.length === 1) {
      failedReadbacks++
      throw Error('隔离目录回读故障')
    }
  }
  await wrapper.findAll('button').filter(item => item.text() === '删除')[2]!.trigger('click')
  await vi.waitFor(() => expect(provider.loadingError?.message).toContain('隔离目录回读故障'))
  await flushPromises()
  expect(failedReadbacks).toBe(1)
  expect(http.saves).toEqual([{table:'Base_InterfaceProvider', added:[], changed:[], deleted:[expect.objectContaining({rowid:'P3'})]}])
  expect(records('Base_InterfaceProvider').some(row => row['rowid'] === 'P3')).toBe(false)
  expect(provider.refreshPending).toBe(false)
  expect(dataSet.saveJournal.completed).toBe(true)
  expect(dataSet.saveJournal.views).toMatchObject([{tableName:'Base_InterfaceProvider', state:'applied'}])
  expect(wrapper.text()).not.toContain('删除服务提供商失败')
  expect(messages).toHaveBeenCalledWith('删除已确认，外部服务目录回读失败：隔离目录回读故障', 'warning')
  expect(messages).not.toHaveBeenCalledWith('删除成功', 'success')

  const batchId = dataSet.saveJournal.batchId
  delete http.beforeDefinitionRead
  await button(wrapper, '重试读取')!.trigger('click')
  await vi.waitFor(() => expect(() => provider.captureReadResult()()).not.toThrow())
  expect(provider.rows.some(row => row['rowid'] === 'P3')).toBe(false)
  expect(dataSet.saveJournal.batchId).toBe(batchId)
  expect(http.saves).toHaveLength(1)
})