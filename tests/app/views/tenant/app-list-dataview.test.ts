import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import AppList from '@/views/tenant/AppList.vue'
import LoginView from '@/views/platform/LoginView.vue'

const state = vi.hoisted(() => ({
  rows: [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}] as Array<{rowid: string; AppName: string; AppDesc: string; IsSys?: number}>,
  dataViewLoad: vi.fn(async () => ({success: true})),
  applicationCatalogLoad: vi.fn(async () => ({scenarioId: '7AB874097A1E8711A42FD845939A6E05'})),
  listApplications: vi.fn(async () => [{id: 'legacy', name: 'Legacy', description: 'legacy'}]),
  listEnterprises: vi.fn(async () => [{id: 'E1', name: '领码科技', shortName: 'Lingma'}]),
  login: vi.fn(async () => ({enterprise: {shortName: 'Lingma'}})),
  disposed: 0,
  allPages: true,
  distinct: true as boolean | undefined,
  projectId: 'APP',
  loadedScenarioIds: [] as string[],
}))

vi.mock('@spark-appworks/spark-project-model', () => ({
  PageRuntime: class {
    destroyed = false
    constructor(readonly options: {scenarioIds: string[]; loadScenario: (id: string) => Promise<unknown>}) {}
    async load() { for (const id of this.options.scenarioIds) { state.loadedScenarioIds.push(id); await this.options.loadScenario(id) } }
    getDataSet() {
      return {
        getView: () => ({primaryKey: 'rowid', queryConfig: {allPages: state.allPages, distinct: state.distinct}, dataTable: {modelBinding: {modelName: 'Base_AppSystemList'}},
          get rows() { return state.rows }, fieldAccess: () => ({read: 'visible'}), requestRefresh: state.dataViewLoad}),
        onAnyViewChange: () => () => undefined,
      }
    }
    dispose() { this.destroyed = true; state.disposed++ }
  },
}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({
  loadLowcodeRuntimeScenario: vi.fn(async () => ({scenarioId: '0C70F74793F9E858B71E0DBDEC784D57'})),
}))
vi.mock('@/lowcode/lowcode-application-catalog', () => ({
  loadLowcodeApplicationCatalog: state.applicationCatalogLoad,
}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {application: {get: () => ({application: {id: 'APP'}})}, platform: {listApplications: state.listApplications, listEnterprises: state.listEnterprises, login: state.login}},
  readLowcodePrincipal: () => ({enterpriseName: 'acme'}),
}))
vi.mock('@/services/tenant-scope', () => ({
  parseTenantScope: () => ({tenantId: 'acme', projectId: state.projectId}),
  buildTenantPath: () => '/target', APPLICATION_CATALOG_PROJECT_ID: 'homepage',
}))

const EmptyPage = defineComponent({setup: () => () => h('div')})
const RendererListStub = defineComponent({
  name: 'RendererList',
  props: {dataViewKey: {type: String, default: ''}, children: {type: Array, default: () => []}},
  setup(props) {
    return () => {
      const row = state.rows[0]
      const dataSource = {fieldAccess: () => ({read: 'visible'})}
      const visible = (props.children as Array<{id: string; props?: Record<string, unknown>}>).filter(child => {
        const condition = child.props?.['onBeforeRender']
        return typeof condition !== 'function' || condition({row, dataSource})
      }).map(child => child.id).join(',')
      return h('div', {'data-testid': 'scenario-list', 'data-view-key': props.dataViewKey, 'data-visible-children': visible}, state.rows.map(item => item.AppDesc).join(' '))
    }
  },
})
const mounted: Array<{unmount: () => void}> = []
afterEach(() => { mounted.splice(0).forEach(item => item.unmount()); state.allPages = true; state.distinct = true; state.projectId = 'APP'; state.loadedScenarioIds = []; state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}]; vi.clearAllMocks() })

async function mountAt(path: string, blueprintScenarioId?: string) {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/app-list', component: AppList},
    {path: '/application-manager', component: AppList, meta: blueprintScenarioId ? {blueprintScenarioId} : {}},
    {path: '/application-manager-next', component: AppList, meta: {blueprintScenarioId: 'SCENE-NEXT'}},
    {path: '/target', component: EmptyPage},
  ]})
  await router.push(path)
  const wrapper = mount(AppList, {global: {plugins: [router], stubs: {AppProjectSettingsDialog: true, RendererList: RendererListStub}}})
  mounted.push(wrapper)
  await flushPromises()
  return {wrapper, router}
}

describe('AppList DataView routing', () => {
  it('loads the formal application-manager scenario through its own DataView', async () => {
    state.distinct = undefined
    const {wrapper} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    expect(state.dataViewLoad).toHaveBeenCalledOnce()
    expect(state.listApplications).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="scenario-list"]').attributes('data-view-key')).toBe('0C70F74793F9E858B71E0DBDEC784D57@Base_AppSystemList@default')
    expect(wrapper.text()).toContain('Alpha')
  })

  it('loads the default catalog through its formal DataView without requiring an app selection', async () => {
    state.projectId = ''
    state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha'}]
    const {wrapper} = await mountAt('/app-list')
    expect(state.applicationCatalogLoad).toHaveBeenCalledOnce()
    expect(state.loadedScenarioIds).toEqual(['7AB874097A1E8711A42FD845939A6E05'])
    expect(state.dataViewLoad).toHaveBeenCalledOnce()
    expect(state.listApplications).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="scenario-list"]').attributes('data-view-key')).toBe('7AB874097A1E8711A42FD845939A6E05@Base_AppSystemList@default')
    expect(wrapper.text()).toContain('Alpha')
    const visible = wrapper.get('[data-testid="scenario-list"]').attributes('data-visible-children')
    expect(visible).not.toContain('app-home-tag')
    expect(visible).not.toContain('app-standard-tag')
    expect(visible).not.toContain('app-delete')
  })

  it('fails closed when the formal view does not request the full directory', async () => {
    state.allPages = false
    const {wrapper} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    expect(state.dataViewLoad).not.toHaveBeenCalled()
    expect(state.listApplications).not.toHaveBeenCalled()
    expect(state.applicationCatalogLoad).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('allPages')
  })

  it('ignores a late read after the route switches to another scenario', async () => {
    let finishOld: (value: {success: boolean}) => void = () => undefined
    state.dataViewLoad.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const {wrapper, router} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    await flushPromises()
    expect(state.dataViewLoad).toHaveBeenCalledOnce()
    state.rows = [{rowid: 'APP-2', AppName: 'beta', AppDesc: 'Beta', IsSys: 0}]
    await router.push('/application-manager-next')
    await flushPromises()
    expect(wrapper.get('[data-testid="scenario-list"]').attributes('data-view-key')).toBe('SCENE-NEXT@Base_AppSystemList@default')
    expect(wrapper.text()).toContain('Beta')
    finishOld({success: true})
    await flushPromises()
    expect(wrapper.text()).toContain('Beta')
    expect(wrapper.text()).not.toContain('Alpha')
  })

  it('clears rows immediately on scenario switch and does not restore them on query failure', async () => {
    let failNext: (reason: Error) => void = () => undefined
    state.dataViewLoad.mockImplementationOnce(async () => ({success: true}))
      .mockImplementationOnce(() => new Promise((_, reject) => { failNext = reject }))
    const {wrapper, router} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    await flushPromises()
    expect(wrapper.text()).toContain('Alpha')
    await router.push('/application-manager-next')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Alpha')
    failNext(new Error('new scenario query failed'))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Alpha')
    expect(wrapper.get('[role="alert"]').text()).toContain('new scenario query failed')
  })
})

describe('LoginView enterprise selection', () => {
  it('submits the catalog shortName when the preferred display label matches one enterprise', async () => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: EmptyPage}]})
    const formStub = defineComponent({
      setup(_, {slots, expose}) {
        expose({validate: async () => true})
        return () => h('form', slots['default']?.())
      },
    })
    const buttonStub = defineComponent({
      setup(_, {slots, attrs}) {
        return () => h('button', attrs, slots['default']?.())
      },
    })
    const wrapper = mount(LoginView, {global: {plugins: [router], stubs: {
      'el-form': formStub,
      'el-form-item': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-select': true, 'el-option': true,
      'el-input': true, 'el-button': buttonStub,
      'el-tabs': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-tab-pane': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-icon': true,
    }}})
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.get('.login-btn').trigger('click')
    await flushPromises()
    expect(state.login).toHaveBeenCalledWith(expect.objectContaining({enterpriseName: 'Lingma'}))
  })

  it('leaves enterprise empty when the display label is ambiguous', async () => {
    state.listEnterprises.mockResolvedValueOnce([
      {id: 'E1', name: '领码科技', shortName: 'Lingma'},
      {id: 'E2', name: '领码科技', shortName: 'Lingma-2'},
    ])
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: EmptyPage}]})
    const formStub = defineComponent({setup(_, {slots, expose}) { expose({validate: async () => true}); return () => h('form', slots['default']?.()) }})
    const buttonStub = defineComponent({setup(_, {slots, attrs}) { return () => h('button', attrs, slots['default']?.()) }})
    const wrapper = mount(LoginView, {global: {plugins: [router], stubs: {
      'el-form': formStub,
      'el-form-item': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-select': true, 'el-option': true, 'el-input': true, 'el-button': buttonStub,
      'el-tabs': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-tab-pane': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-icon': true,
    }}})
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.get('.login-btn').trigger('click')
    await flushPromises()
    expect(state.login).toHaveBeenCalledWith(expect.objectContaining({enterpriseName: ''}))
  })

  it('preserves an enterprise entered while the catalog request is pending', async () => {
    let resolveCatalog: (items: Array<{id: string; name: string; shortName: string}>) => void = () => undefined
    state.listEnterprises.mockImplementationOnce(() => new Promise(resolve => { resolveCatalog = resolve }))
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: EmptyPage}]})
    const formStub = defineComponent({setup(_, {slots, expose}) { expose({validate: async () => true}); return () => h('form', slots['default']?.()) }})
    const buttonStub = defineComponent({setup(_, {slots, attrs}) { return () => h('button', attrs, slots['default']?.()) }})
    const selectStub = defineComponent({
      props: {modelValue: {type: String, default: ''}},
      emits: ['update:modelValue'],
      setup(props, {emit}) { return () => h('input', {value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)}) },
    })
    const wrapper = mount(LoginView, {global: {plugins: [router], stubs: {
      'el-form': formStub,
      'el-form-item': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-select': selectStub, 'el-option': true, 'el-input': true, 'el-button': buttonStub,
      'el-tabs': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-tab-pane': defineComponent({setup: (_, {slots}) => () => h('div', slots['default']?.())}),
      'el-icon': true,
    }}})
    mounted.push(wrapper)
    await wrapper.get('[aria-label="企业"]').setValue('manual-tenant')
    resolveCatalog([{id: 'E1', name: '领码科技', shortName: 'Lingma'}])
    await flushPromises()
    await wrapper.get('.login-btn').trigger('click')
    await flushPromises()
    expect(state.login).toHaveBeenCalledWith(expect.objectContaining({enterpriseName: 'manual-tenant'}))
  })
})
