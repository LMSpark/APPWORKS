import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import AppList from '@/views/tenant/AppList.vue'

const state = vi.hoisted(() => ({
  rows: [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}],
  dataViewLoad: vi.fn(async () => ({success: true})),
  listApplications: vi.fn(async () => [{id: 'legacy', name: 'Legacy', description: 'legacy'}]),
  disposed: 0,
  allPages: true,
}))

vi.mock('@spark-appworks/spark-project-model', () => ({
  PageRuntime: class {
    destroyed = false
    constructor(readonly options: {scenarioIds: string[]}) {}
    async load() {}
    getDataSet() {
      return {
        getView: () => ({primaryKey: 'rowid', queryConfig: {allPages: state.allPages}, dataTable: {modelBinding: {modelName: 'Base_AppSystemList'}},
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
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {application: {get: () => ({application: {id: 'APP'}})}, platform: {listApplications: state.listApplications}},
  readLowcodePrincipal: () => ({enterpriseName: 'acme'}),
}))
vi.mock('@/services/tenant-scope', () => ({
  parseTenantScope: () => ({tenantId: 'acme', projectId: 'APP'}),
  buildTenantPath: () => '/target', APPLICATION_CATALOG_PROJECT_ID: 'homepage',
}))

const EmptyPage = defineComponent({setup: () => () => h('div')})
const mounted: Array<{unmount: () => void}> = []
afterEach(() => { mounted.splice(0).forEach(item => item.unmount()); state.allPages = true; state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}]; vi.clearAllMocks() })

async function mountAt(path: string, blueprintScenarioId?: string) {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/app-list', component: AppList},
    {path: '/application-manager', component: AppList, meta: blueprintScenarioId ? {blueprintScenarioId} : {}},
    {path: '/application-manager-next', component: AppList, meta: {blueprintScenarioId: 'SCENE-NEXT'}},
    {path: '/target', component: EmptyPage},
  ]})
  await router.push(path)
  const wrapper = mount(AppList, {global: {plugins: [router], stubs: {AppProjectSettingsDialog: true}}})
  mounted.push(wrapper)
  await flushPromises()
  return {wrapper, router}
}

describe('AppList DataView routing', () => {
  it('loads the formal application-manager scenario through its own DataView', async () => {
    const {wrapper} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    expect(state.dataViewLoad).toHaveBeenCalledOnce()
    expect(state.listApplications).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Alpha')
  })

  it('keeps the homepage route on the existing list path when it has no formal scenario identity', async () => {
    const {wrapper} = await mountAt('/app-list')
    expect(state.listApplications).toHaveBeenCalledOnce()
    expect(state.dataViewLoad).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Legacy')
  })

  it('fails closed when the formal view does not request the full directory', async () => {
    state.allPages = false
    const {wrapper} = await mountAt('/application-manager', '0C70F74793F9E858B71E0DBDEC784D57')
    expect(state.dataViewLoad).not.toHaveBeenCalled()
    expect(state.listApplications).not.toHaveBeenCalled()
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
