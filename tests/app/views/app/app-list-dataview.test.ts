import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import {PAGE_SERVICE, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import AppList from '@/views/app/AppList.vue'

const state = vi.hoisted(() => ({
  rows: [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}] as Array<{rowid: string; AppName: string; AppDesc: string; IsSys?: number}>,
  dataViewLoad: vi.fn(async () => ({success: true})),
  applicationCatalogLoad: vi.fn(async () => ({scenarioId: '7AB874097A1E8711A42FD845939A6E05'})),
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
vi.mock('@/lowcode/lowcode-application-catalog', () => ({
  loadLowcodeApplicationCatalog: state.applicationCatalogLoad,
  getFormalModelView: (dataSet: {getView: () => unknown}) => dataSet.getView(),
}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {application: {get: () => ({application: {id: 'APP'}})}},
  readLowcodePrincipal: () => ({enterpriseName: 'acme'}),
}))
vi.mock('@/services/application-scope', () => ({
  parseApplicationPathScope: () => ({projectId: state.projectId}),
  buildApplicationPath: () => '/target', APPLICATION_CATALOG_PROJECT_ID: 'homepage',
}))

const EmptyPage = defineComponent({setup: () => () => h('div')})
const RendererListStub = defineComponent({
  name: 'RendererList',
  props: {
    dataViewKey: {type: String, default: ''},
    gridGap: {type: [Number, String], default: undefined},
    itemGridGap: {type: [Number, String], default: undefined},
    columns: {type: Number, default: undefined},
    children: {type: Array, default: () => []},
  },
  setup(props) {
    return () => {
      const row = state.rows[0]
      const dataSource = {fieldAccess: () => ({read: 'visible'})}
      const children = props.children as Array<{id: string; type: string; props?: Record<string, unknown>; children?: Array<{id: string; props?: Record<string, unknown>}>}>
      const toolbar = children.find(child => child.type === 'r-toolbar')
      const switchAction = toolbar?.children?.find(child => child.id === 'app-switch')
      const visible = children.flatMap(child => child.type === 'r-toolbar' ? child.children ?? [] : [child]).filter(child => {
        const condition = child.props?.['onBeforeRender']
        return typeof condition !== 'function' || condition({row, dataSource})
      }).map(child => child.id).join(',')
      return h('div', {
        'data-testid': 'scenario-list',
        'data-view-key': props.dataViewKey,
        'data-grid-gap': String(props.gridGap ?? ''),
        'data-item-grid-gap': String(props.itemGridGap ?? ''),
        'data-columns': String(props.columns ?? ''),
        'data-visible-children': visible,
        'data-toolbar-id': toolbar?.id ?? '',
        'data-toolbar-wrap': String(toolbar?.props?.['wrap'] ?? ''),
        'data-toolbar-span': String(toolbar?.props?.['gridColSpan'] ?? ''),
        'data-toolbar-has-explicit-binding': String(['dataSource', 'dataViewKey', 'dataMember', 'dataField']
          .some(key => Object.hasOwn(toolbar?.props ?? {}, key))),
        'data-toolbar-children': toolbar?.children?.map(child => child.id).join(',') ?? '',
        'data-switch-has-handler': String(typeof switchAction?.props?.['onClick'] === 'function'),
        'data-switch-view-key': String(switchAction?.props?.['dataViewKey'] ?? ''),
        'data-description-field': String(children.find(child => child.id === 'app-description')?.props?.['dataField'] ?? ''),
      }, state.rows.map(item => item.AppDesc).join(' '))
    }
  },
})
const RendererPageHeaderStub = defineComponent({
  props: {dataViewKey: {type: String, default: ''}, title: {type: String, default: ''}},
  setup(props) { return () => h('header', {'data-testid': 'standard-page-header', 'data-view-key': props.dataViewKey}, props.title) },
})
const mounted: Array<{unmount: () => void}> = []
afterEach(() => { mounted.splice(0).forEach(item => item.unmount()); state.allPages = true; state.distinct = true; state.projectId = 'APP'; state.loadedScenarioIds = []; state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha', IsSys: 0}]; vi.clearAllMocks() })

async function mountAt(path: string) {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/app-list', component: AppList},
    {path: '/target', component: EmptyPage},
  ]})
  await router.push(path)
  const pageService: PageServiceCapability = {
    copyText: async () => {}, showMessage: vi.fn(), showConfirm: async () => true, showPrompt: async () => null,
    showAlert: async () => {}, showDialog: async () => 'cancel', selectEntities: async () => [], browseFiles: async () => [],
    uploadFiles: async () => { throw new Error('app list fixture must not upload') }, showLoading: () => {}, navigate: () => {},
  }
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'app-list-test-host'}).sparkProvide(PAGE_SERVICE, pageService)
    return () => h(AppList)
  }})
  const wrapper = mount(Host, {global: {plugins: [router], stubs: {RendererList: RendererListStub, RendererPageHeader: RendererPageHeaderStub}}})
  mounted.push(wrapper)
  await flushPromises()
  return {wrapper, router}
}

describe('AppList DataView routing', () => {
  it('loads the default catalog through its formal DataView without requiring an app selection', async () => {
    state.projectId = ''
    state.rows = [{rowid: 'APP-1', AppName: 'alpha', AppDesc: 'Alpha'}]
    const {wrapper} = await mountAt('/app-list')
    expect(state.applicationCatalogLoad).toHaveBeenCalledOnce()
    expect(state.loadedScenarioIds).toEqual(['7AB874097A1E8711A42FD845939A6E05'])
    expect(state.dataViewLoad).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="scenario-list"]').attributes('data-view-key')).toBe('7AB874097A1E8711A42FD845939A6E05@Base_AppSystemList@catalogApps')
    expect(wrapper.text()).toContain('Alpha')
    const visible = wrapper.get('[data-testid="scenario-list"]').attributes('data-visible-children')
    expect(visible).not.toContain('app-home-tag')
    expect(visible).not.toContain('app-standard-tag')
    expect(visible).not.toContain('app-delete')
    const list = wrapper.get('[data-testid="scenario-list"]')
    expect(wrapper.get('[data-testid="standard-page-header"]').attributes('data-view-key'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@Base_AppSystemList@catalogApps')
    expect(list.attributes('data-grid-gap')).toBe('20')
    expect(list.attributes('data-item-grid-gap')).toBe('0')
    expect(list.attributes('data-columns')).toBe('4')
    expect(list.attributes('data-toolbar-id')).toBe('app-actions')
    expect(list.attributes('data-toolbar-wrap')).toBe('true')
    expect(list.attributes('data-toolbar-span')).toBe('24')
    expect(list.attributes('data-toolbar-has-explicit-binding')).toBe('false')
    expect(list.attributes('data-toolbar-children')).toBe('app-home-tag,app-standard-tag,app-switch,app-current-tag')
    expect(wrapper.text()).not.toContain('创建应用')
    expect(list.attributes('data-visible-children')).not.toContain('app-settings')
    expect(list.attributes('data-visible-children')).not.toContain('app-delete')
    expect(list.attributes('data-switch-has-handler')).toBe('true')
    expect(list.attributes('data-switch-view-key')).toBe('7AB874097A1E8711A42FD845939A6E05@Base_AppSystemList@catalogApps')
    expect(list.attributes('data-description-field')).toBe('Memo')
  })

  it('fails closed when the formal view does not request the full directory', async () => {
    state.allPages = false
    const {wrapper} = await mountAt('/app-list')
    expect(state.dataViewLoad).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('allPages')
  })

  it('shows the query failure instead of an empty directory', async () => {
    state.dataViewLoad.mockImplementationOnce(async () => { throw new Error('catalog query failed') })
    const {wrapper} = await mountAt('/app-list')
    expect(wrapper.find('[data-testid="scenario-list"]').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('catalog query failed')
  })
})
