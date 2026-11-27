import {beforeEach, describe, expect, it, vi} from 'vitest'
import {APPLICATION_CATALOG_PROJECT_ID, buildApplicationPath} from '@/services/application-scope'
import {EnterpriseDefaultApplication, enterEnterpriseLanding} from '@/services/project/enterprise-landing'
import {createMemoryHistory, createRouter} from 'vue-router'
import {defineComponent} from 'vue'

type EnterpriseRow = Record<string, unknown>
type LandingState = {
  currentProjectId: string | null
  config: Record<string, unknown>
  rows: EnterpriseRow[]
  applications: Array<{id: string}>
  write: string
  refresh: {success: boolean; message?: string; refreshStatus?: 'read' | 'failed'}
  saveError: Error | null
  unconfirmed: boolean
  destroyed: number
  messages: string[]
  pending: {key: string; value: unknown} | null
}

const state = vi.hoisted((): LandingState => ({
  currentProjectId: null, config: {}, rows: [], applications: [], write: 'allowed', refresh: {success: true, refreshStatus: 'read'},
  saveError: null, unconfirmed: false, destroyed: 0, messages: [], pending: null,
}))

const view = vi.hoisted(() => ({
  tableName: 'Base_Enterprise_Info',
  viewId: 'tenantEnterprise',
  queryContext: {},
  get rows() { return state.rows },
  getPkKey: (row: EnterpriseRow) => row['rowid'],
  requestRefresh: vi.fn(async () => state.refresh),
  fieldAccess: () => ({read: 'visible', write: state.write}),
  readFieldMember: (_row: EnterpriseRow, member: {path: readonly string[]}) => state.config[member.path[0]!],
  hasEditingChanges: () => false,
  hasUnconfirmedSave: false,
  hasUnconfirmedSaveFor: () => state.unconfirmed,
  updateEditingMember: vi.fn((_id: string, edit: {path: readonly string[]; value: unknown}) => {
    state.pending = {key: edit.path[0]!, value: edit.value}
  }),
  discardPendingChanges: vi.fn(() => { state.pending = null }),
}))

const dataSet = vi.hoisted(() => ({
  saveRecord: vi.fn(async () => {
    if (state.saveError) throw state.saveError
    const pending = state.pending
    if (pending) {
      if (pending.value === undefined) delete state.config[pending.key]
      else state.config[pending.key] = pending.value
    }
  }),
  destroy: vi.fn(() => { state.destroyed++ }),
}))

const ui = vi.hoisted(() => ({
  showMessage: (message: string, type: 'info' | 'warning' = 'info') => state.messages.push(`${type}:${message}`),
}))
vi.mock('@spark-appworks/spark-app', () => ({
  getDynamicRouter: () => ({getApplicationNavTree: () => ({projectId: state.currentProjectId})}),
}))
vi.mock('@/platform-adapters/lowcode-runtime', () => ({
  lowcodeApi: {session: {get: () => ({enterprise: {shortName: 'acme'}})}, platform: {captureAuthenticationScope: () => () => true}},
  readLowcodePrincipal: () => ({applicationId: state.currentProjectId}),
}))
vi.mock('@/platform-adapters/lowcode-application-catalog', () => ({
  loadLowcodeEnterpriseCatalog: vi.fn(async () => dataSet),
  getFormalModelView: vi.fn(() => view),
  readLowcodeApplications: vi.fn(async () => state.applications),
}))

function routerProbe() {
  const component = defineComponent({render: () => null})
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/login', component},
    {path: '/other', component},
    {path: '/apps/:projectId', redirect: to => ({path: `${to.path}/home`})},
    {path: '/apps/:projectId/home', component},
    {path: '/apps/:projectId/app-list', component},
  ]})
  router.afterEach((to, _from, failure) => {
    const projectId = to.params['projectId']
    if (failure === undefined) state.currentProjectId = typeof projectId === 'string' ? projectId : null
  })
  return Object.assign(router, {replace: vi.spyOn(router, 'replace')})
}

async function land(router = routerProbe()) {
  await router.push('/login')
  await enterEnterpriseLanding({router, ui})
  return {router}
}

const catalogPath = buildApplicationPath({projectId: APPLICATION_CATALOG_PROJECT_ID}, '/app-list')

beforeEach(() => {
  Object.assign(state, {currentProjectId: null, config: {}, rows: [{rowid: 'ENT-1', entShortName: 'acme'}], applications: [{id: 'APP-A'}],
    write: 'allowed', refresh: {success: true, refreshStatus: 'read'}, saveError: null, unconfirmed: false, destroyed: 0, messages: [], pending: null})
  view.queryContext = {}
  vi.clearAllMocks()
})

describe('enterprise landing', () => {
  it('enters the formal application home through the router', async () => {
    state.config['defaultApplicationId'] = 'APP-A'
    const {router} = await land()

    expect(view.queryContext).toEqual({entShortName: 'acme'})
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/apps/APP-A')
    expect(router.currentRoute.value.path).toBe('/apps/APP-A/home')
    expect(state.messages).toEqual([])
    expect(state.destroyed).toBe(1)
  })

  it('falls back to the application list with an info message when no default is set', async () => {
    const {router} = await land()

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['info:企业未设置默认应用，已进入应用列表'])
  })

  it('falls back with a warning when the default application is not visible', async () => {
    state.config['defaultApplicationId'] = 'APP-HIDDEN'
    const {router} = await land()

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用不在当前可见应用中，已进入应用列表'])
  })

  it('reports a read failure instead of silently landing on an empty default', async () => {
    state.rows = []
    const {router} = await land()

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用读取失败：未读取到唯一的本企业配置记录，已进入应用列表'])
    expect(state.destroyed).toBe(1)
  })

  it('falls back when switching into the default application fails', async () => {
    state.config['defaultApplicationId'] = 'APP-A'
    const router = routerProbe()
    router.replace.mockRejectedValueOnce(new Error('dirty page'))
    await land(router)

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用进入失败：dirty page，正在进入应用列表'])
  })
})

describe('EnterpriseDefaultApplication', () => {
  it('saves only the enterprise row config member and verifies the reread', async () => {
    const config = await EnterpriseDefaultApplication.load(() => undefined)
    await config.save('APP-A')

    expect(view.updateEditingMember).toHaveBeenCalledWith('ENT-1', {field: 'ent_config', path: ['defaultApplicationId'], value: 'APP-A'})
    expect(dataSet.saveRecord).toHaveBeenCalledWith(view, 'ENT-1')
    expect(config.applicationId).toBe('APP-A')

    await config.save(null)
    expect(view.updateEditingMember).toHaveBeenLastCalledWith('ENT-1', {field: 'ent_config', path: ['defaultApplicationId'], value: undefined})
    expect(config.applicationId).toBe('')
    config.destroy()
  })

  it('discards the local edit after a definite failure but keeps it when the result is unknown', async () => {
    const config = await EnterpriseDefaultApplication.load(() => undefined)
    state.saveError = new Error('rejected')
    await expect(config.save('APP-A')).rejects.toThrow('rejected')
    expect(view.discardPendingChanges).toHaveBeenCalledWith(['ENT-1'])

    view.discardPendingChanges.mockClear()
    state.unconfirmed = true
    await expect(config.save('APP-A')).rejects.toThrow('rejected')
    expect(view.discardPendingChanges).not.toHaveBeenCalled()
    config.destroy()
  })

  it('refuses to save without config write access', async () => {
    state.write = 'denied'
    const config = await EnterpriseDefaultApplication.load(() => undefined)

    expect(config.writable).toBe(false)
    await expect(config.save('APP-A')).rejects.toThrow('无权修改企业配置')
    expect(view.updateEditingMember).not.toHaveBeenCalled()
    config.destroy()
  })
})

it('ignores a late enterprise default application after the user leaves the login route', async () => {
  state.config['defaultApplicationId'] = 'APP-A'
  const router = routerProbe()
  await router.push('/login')
  let settle: ((result: LandingState['refresh']) => void) | undefined
  view.requestRefresh.mockImplementationOnce(() => new Promise(resolve => {settle = resolve}))
  const pending = enterEnterpriseLanding({router, ui})
  await vi.waitFor(() => expect(settle).toBeDefined())
  await router.push('/other')
  settle?.({success: true})
  await pending
  expect(router.currentRoute.value.path).toBe('/other')
  expect(router.replace).not.toHaveBeenCalled()
  expect(state.messages).toEqual([])
  expect(state.destroyed).toBe(1)
})


it.each(['zero-write','deferred-reload'] as const)('keeps actual enterprise default receipts distinct (%s)', async mode => {
  const {DataSet,DataSpaceRuntimeApi}=await import('@spark-appworks/spark-data')
  const {ApiBackend}=await import('../../../runtime/page/api-provider/api-provider.fixture')
  const {loadLowcodeEnterpriseCatalog,getFormalModelView}=await import('@/platform-adapters/lowcode-application-catalog')
  const backend=new ApiBackend()
  const model='Base_Enterprise_Info', id='ENT-1'
  backend.records[model]=[{rowid:id,ent_config:'{}'}]
  const ds=DataSet.fromJson({scenarioId:'ENT-SCENE',tables:{enterpriseRows:{
    modelBinding:{modelId:'ENT-MODEL',modelName:model},
    columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'ent_config',type:'string'}],
    views:{default:{autoLoad:false},tenantEnterprise:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}},
  }}})
  const formal=ds.getView('enterpriseRows','tenantEnterprise')
  if(!formal)throw Error('Missing formal enterprise fixture view')
  const runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'CATALOG',headers:{}})})
  runtime.bindModelView(formal,{id:'ENT-MODEL',name:model,metaName:model,sourceName:model,
    sourceId:'DATABASE',sourceType:'table',primaryKey:'rowid',businessMain:false,raw:{},
    fields:['rowid','ent_config'].map(name=>({id:name,modelId:'ENT-MODEL',name,canonicalName:name,
      type:'varchar',description:name,primaryKey:name==='rowid',output:true,computed:false,order:0,orderType:'',raw:{}})),
  })
  vi.mocked(loadLowcodeEnterpriseCatalog).mockResolvedValueOnce(ds)
  vi.mocked(getFormalModelView).mockReturnValueOnce(formal)
  const config=await EnterpriseDefaultApplication.load(()=>undefined)
  try{
    if(mode==='zero-write'){
      const original=ds.saveChanges.bind(ds)
      vi.spyOn(ds,'saveChanges').mockImplementationOnce(options=>{
        formal.discardPendingChanges([id])
        backend.records[model]=[{rowid:id,ent_config:'{"defaultApplicationId":"APP-A"}'}]
        return original(options)
      })
      const outcome=await config.save('APP-A').then(()=> 'fulfilled',reason=>reason)
      expect(backend.saves).toEqual([])
      expect(outcome).toMatchObject({message:'原记录没有已确认的保存回执'})
      expect(backend.reads).toHaveLength(1)
    }else{
      const stop=ds.setSaveCompletionHandler(()=>{
        formal.updateEditingMember(id,{field:'ent_config',path:['note'],value:'later draft'})
      })
      const outcome=await config.save('APP-A').then(()=> 'fulfilled',reason=>reason)
      stop()
      expect(backend.saves).toHaveLength(1)
      expect(outcome).toMatchObject({message:'默认应用已提交，但回读失败，请刷新核对'})
      expect(formal.refreshPending).toBe(false)
      expect(formal.hasEditingChanges(id)).toBe(true)
      expect(backend.reads).toHaveLength(1)
    }
  }finally{config.destroy()}
})
