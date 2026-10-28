import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import PlatformApps from '@/views/platform/PlatformApps.vue'

const state = vi.hoisted(() => ({
  rows: [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha'}] as Array<{rowid: string; AppName?: string; AppDesc?: string; IsSys?: number}>,
  refresh: vi.fn<() => Promise<{success: boolean; message?: string}>>(async () => ({success: true})),
  dataSet: {} as {getView: () => unknown; onAnyViewChange: () => () => void; destroy: () => void},
  loadCatalog: vi.fn(async () => state.dataSet),
  dispose: vi.fn(),
  projectSwitchKey: Symbol('PROJECT_SWITCH_KEY'),
  staleReceipt: false,
  assertCurrent: vi.fn(() => {if (state.staleReceipt) throw new Error('selection was superseded')}),
  switchAndReload: vi.fn(async () => ({assertCurrent: state.assertCurrent})),
  includeIsSys: false,
  isSysReadable: false,
  children: [] as Array<{type: string; props?: Record<string, unknown>}>,
  actions: [] as Array<{type: string; props?: Record<string, unknown>}>,
  viewKey: '',
}))
vi.mock('@spark-appworks/spark-project-model', () => ({PageRuntime: class {
  destroyed = false
  async load() {}
  getDataSet() {return state.dataSet}
  dispose() {this.destroyed = true; state.dispose()}
}}))
vi.mock('@spark-appworks/spark-data', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-data')>()
  return {...actual, buildDataViewKey: (model: string, view: string, space: string) => `${space}@${model}@${view}`}
})
vi.mock('@/lowcode/lowcode-application-catalog', () => ({loadLowcodeApplicationCatalog: state.loadCatalog}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {session: {get: () => ({enterprise: {shortName: 'acme', chineseName: 'Acme'}})}},
  lowcodeEnterpriseDisplayName: () => 'Acme',
  readLowcodePrincipal: () => ({enterpriseName: 'acme'}),
}))
vi.mock('@spark-appworks/spark-component', () => ({
  PAGE_RUNTIME: Symbol('PAGE_RUNTIME'),
  useSparkComponent: () => ({sparkProvide: vi.fn(), sparkRemove: vi.fn()}),
  RendererButton: defineComponent({props: ['label'], setup(props, {attrs}) {return () => h('button', attrs, props.label)}}),
  RendererTable: defineComponent({name: 'RendererTable', props: ['dataViewKey', 'children', 'actions', 'toolbar', 'showDataViewMeta'], setup(props) {
    return () => {
      state.viewKey = String(props.dataViewKey)
      state.children = props.children as typeof state.children
      state.actions = (props.actions as {children: typeof state.actions})?.children ?? []
      return h('div', [h('button', {onClick: () => void state.refresh()}, '刷新'), ...state.actions.map(action => {
        const fn = action.props?.['onClick']
        return h('button', {onClick: () => typeof fn === 'function' && fn(state.rows[0])}, String(action.props?.['label']))
      })])
    }
  }}),
}))
vi.mock('@spark-appworks/spark-app', () => ({getNavHomePath: () => '/home'}))
vi.mock('@/services/tenant-scope', () => ({buildTenantPath: ({tenantId, projectId}: {tenantId: string; projectId: string}) => `/t/${tenantId}/${projectId}/home`}))
vi.mock('@/services/project/project-shell', () => ({PROJECT_SWITCH_KEY: state.projectSwitchKey}))

const wrappers: Array<{exists: () => boolean; unmount: () => void}> = []
beforeEach(() => {
  state.dataSet = {getView: () => ({queryConfig: {allPages: true, distinct: true}, rows: state.rows,
    get queryColumns() {return state.includeIsSys ? [{name: 'IsSys'}] : []},
    fieldAccess: (_row: unknown, field: string) => ({read: field === 'IsSys' && !state.isSysReadable ? 'hidden' : 'visible'}), requestRefresh: state.refresh}),
    onAnyViewChange: () => () => undefined, destroy: vi.fn()}
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha'}]
  state.dataSet = {getView: () => ({queryConfig: {allPages: true, distinct: true}, rows: state.rows,
    get queryColumns() {return state.includeIsSys ? [{name: 'IsSys'}] : []},
    fieldAccess: (_row: unknown, field: string) => ({read: field === 'IsSys' ? 'hidden' : 'visible'}), requestRefresh: state.refresh}),
    onAnyViewChange: () => () => undefined, destroy: vi.fn()}
  state.refresh.mockReset().mockResolvedValue({success: true})
  state.loadCatalog.mockReset().mockResolvedValue(state.dataSet)
  state.dispose.mockReset()
  state.children = []; state.actions = []; state.viewKey = ''
  state.includeIsSys = false; state.isSysReadable = false
  state.staleReceipt = false; state.assertCurrent.mockReset().mockImplementation(() => {if (state.staleReceipt) throw new Error('selection was superseded')})
  state.switchAndReload.mockReset().mockImplementation(async () => ({assertCurrent: state.assertCurrent}))
  vi.restoreAllMocks()
})

async function mountPage() {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/:pathMatch(.*)*', component: defineComponent({setup: () => () => h('div')})}]})
  await router.push('/platform')
  const wrapper = mount(PlatformApps, {global: {plugins: [router], provide: {[state.projectSwitchKey]: {switchAndReload: state.switchAndReload}}}})
  wrappers.push(wrapper)
  await flushPromises()
  return {router, wrapper}
}

describe('PlatformApps formal application catalog', () => {
  it('binds the standard table to the formal view and refreshes that DataView', async () => {
    const {wrapper} = await mountPage()
    expect(state.loadCatalog).toHaveBeenCalledOnce()
    expect(state.viewKey).toBe('7AB874097A1E8711A42FD845939A6E05@Base_AppSystemList@default')
    expect(wrapper.findComponent({name: 'RendererTable'}).props('showDataViewMeta')).toBe(true)
    expect(state.children.map(child => child.props?.['field'])).toEqual(['rowid', 'AppDesc', 'Memo'])
    expect(state.refresh).toHaveBeenCalledOnce()
    await wrapper.get('button').trigger('click')
    expect(state.refresh).toHaveBeenCalledTimes(2)
  })

  it('hides the delete action when IsSys is absent or unreadable', async () => {
    await mountPage()
    const deleteAction = state.actions.find(action => action.props?.['label'] === '删除')
    const visible = deleteAction?.props?.['onBeforeRender'] as ((scope: {row: object; dataSource: {fieldAccess: () => {read: string}}}) => boolean)
    expect(visible({row: state.rows[0]!, dataSource: {fieldAccess: () => ({read: 'hidden'})}})).toBe(false)
    expect(visible({row: {rowid: 'APP-2'}, dataSource: {fieldAccess: () => ({read: 'visible'})}})).toBe(false)
    expect(visible({row: {rowid: 'APP-3', IsSys: null}, dataSource: {fieldAccess: () => ({read: 'visible'})}})).toBe(false)
  })

  it('renders the type field only when formally projected and formats known values', async () => {
    state.includeIsSys = true
    state.isSysReadable = true
    await mountPage()
    const type = state.children.find(child => child.props?.['field'] === 'IsSys')
    expect(type).toBeDefined()
    const format = type?.props?.['displayFormatter'] as (value: unknown) => string
    expect(format(1)).toBe('应用工场')
    expect(format('0')).toBe('应用')
    expect(format(undefined)).toBe('')
  })

  it('enters the row identity using the logged-in enterprise in the tenant route', async () => {
    const {router, wrapper} = await mountPage()
    await wrapper.findAll('button').find(button => button.text() === '进入')!.trigger('click')
    await flushPromises()
    expect(state.switchAndReload).toHaveBeenCalledWith('APP-1')
    expect(state.assertCurrent).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/t/acme/APP-1/home')
  })

  it('does not navigate when the project switch receipt is stale', async () => {
    state.staleReceipt = true
    const {router, wrapper} = await mountPage()
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')
    await wrapper.findAll('button').find(button => button.text() === '进入')!.trigger('click')
    await flushPromises()
    expect(state.assertCurrent).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('进入应用失败: selection was superseded')
  })

  it('disposes the runtime and ignores a late catalog read after unmount', async () => {
    let finish: (value: {success: boolean; message?: string}) => void = () => undefined
    state.refresh.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/platform', component: PlatformApps}]})
    await router.push('/platform')
    const wrapper = mount(PlatformApps, {global: {plugins: [router], provide: {[state.projectSwitchKey]: {switchAndReload: vi.fn()}}}})
    wrappers.push(wrapper)
    await flushPromises()
    wrapper.unmount()
    finish({success: true})
    await flushPromises()
    expect(state.dispose).toHaveBeenCalledOnce()
  })

  it('shows an initial DataView query failure instead of rendering stale rows', async () => {
    state.refresh.mockResolvedValueOnce({success: false, message: 'catalog query denied'})
    const {wrapper} = await mountPage()
    expect(wrapper.get('[role="alert"]').text()).toContain('catalog query denied')
    expect(wrapper.findComponent({name: 'RendererTable'}).exists()).toBe(false)
  })
})
