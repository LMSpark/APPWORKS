import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererFilter, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {getSystemScenarioResource, resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {api, ORGANIZATION_PATH, ORGANIZATION_SCENARIO, resetOrganizationFixture} from './organization.fixture'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('机构页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('机构页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => id === ORGANIZATION_SCENARIO
      ? (await import('../../../../config/pages/organization/organization-structure/pagedata.json?raw')).default : null,
    writeText: async () => {throw new Error('机构页不写场景文件')},
  }}),
}))

const {default: OrganizationPage} = await import('@/views/features/organization/organization-structure/ui/organization-structure-page.vue')
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
let http: ReturnType<typeof resetOrganizationFixture>
beforeEach(() => {
  http = resetOrganizationFixture()
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(wait = true) {
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return load.call(this)
  })
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: `/apps/:projectId${ORGANIZATION_PATH}`, component: OrganizationPage,
    meta: {blueprintScenarioId: ORGANIZATION_SCENARIO, nodeId: ORGANIZATION_SCENARIO, systemPageIdentityState: 'resolved'},
  }]})
  await router.push(`/apps/APP${ORGANIZATION_PATH}`)
  await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  if (wait) await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).not.toContain('正在读取机构')}, {timeout: 10000})
  await flushPromises()
  return {wrapper, router, observed}
}

function getButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  if (!button) throw new Error(`按钮不存在: ${label}`)
  return button
}

function currentView(observed: Set<PageRuntime>) {
  const current = [...observed].find(item => !item.destroyed && item.getDataSet(ORGANIZATION_SCENARIO))
  const view = current?.getDataSet(ORGANIZATION_SCENARIO)?.getView('Base_DepartInfo', 'default')
  if (!view) throw new Error('机构正式视图未装配')
  return view
}

describe('reference organization page through SPARK data', () => {
  it('registers the official scenario and displays the first ten rows without hiding missing IDs', async () => {
    const resource = getSystemScenarioResource('organizationStructure')
    expect(resolveSystemScenarioResource(ORGANIZATION_SCENARIO)).toEqual(resource)
    const {wrapper, observed} = await open()
    const table = wrapper.getComponent(RendererTable)
    expect(wrapper.text()).toContain('当前租户')
    expect(wrapper.text()).toContain('本页只读取当前登录租户的正式组织投影')
    expect(table.props('dataViewKey')).toBe(`${ORGANIZATION_SCENARIO}@Base_DepartInfo@default`)
    expect(table.findAll('.el-table__header-wrapper th').map(header => header.text()))
      .toEqual(['#', '机构名称', '机构 ID', '上级机构 ID', '机构层级', '层级路径'])
    expect(table.findAll('th.is-sortable')).toHaveLength(0)
    const rows = table.findAll('.el-table__body-wrapper tbody tr')
    expect(rows).toHaveLength(10)
    expect(rows[0]?.find('td').text()).toBe('1')
    expect(rows[1]?.text()).toContain('未提供')
    expect(currentView(observed).total).toBe(23)
    expect(currentView(observed).pageSize).toBe(10)
    expect(http.reads).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })

  it('searches trimmed names, pages and resets with one query per action', async () => {
    const {wrapper, observed} = await open()
    const view = currentView(observed)
    const filter = wrapper.getComponent(RendererFilter)
    await filter.get('input').setValue('  机构1  ')
    expect(http.reads).toHaveLength(1)
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(view.filterExpression).toEqual({field: 'DepName', operator: 'contains', value: '机构1'})
    expect(view.total).toBe(11)
    expect(http.reads).toHaveLength(2)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    expect(view.rows).toHaveLength(1)
    expect(wrapper.getComponent(RendererTable).get('.el-table__body-wrapper tbody tr td').text()).toBe('1')
    expect(http.reads).toHaveLength(3)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    expect(view.filterExpression).toEqual({field: 'DepName', operator: 'contains', value: '机构1'})
    expect(view.rows).toHaveLength(1)
    expect(http.reads).toHaveLength(4)
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(view.page).toBe(1)
    expect(http.reads).toHaveLength(5)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    await getButton(wrapper, '重置').trigger('click'); await flushPromises()
    expect(view.page).toBe(1)
    expect(view.filterExpression).toBeUndefined()
    expect(view.total).toBe(23)
    expect(http.reads).toHaveLength(7)
    expect(filter.get('input').element.value).toBe('')
    expect(http.saves).toHaveLength(0)
  })

  it('refreshes the current page and reports failures without disguising an empty result', async () => {
    const {wrapper, observed} = await open()
    const view = currentView(observed)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    http.failNextRead = true
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('机构查询失败')
    expect(view.loadingError).not.toBeNull()
    expect(view.page).toBe(2)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(view.loadingError).toBeNull()
    expect(view.page).toBe(2)
    expect(view.rows).toHaveLength(10)
    expect(http.reads).toHaveLength(4)
  })

  it('respects field read permissions even for the empty-value presentation', async () => {
    http.hiddenFields['Base_DepartInfo'] = ['DepID', 'CSR']
    const {wrapper} = await open()
    const body = wrapper.getComponent(RendererTable).find('.el-table__body-wrapper').text()
    expect(body).not.toContain('D1')
    expect(body).not.toContain('path-1')
    expect(body).not.toContain('未提供')
    expect(body).toContain('机构1')
  })

  it('keeps every displayed field read-only on double click', async () => {
    const {wrapper, observed} = await open()
    const table = wrapper.getComponent(RendererTable)
    const fields = table.props('children') ?? []
    expect(fields).toHaveLength(5)
    expect(fields.every(field => typeof field === 'object' && field !== null && field.props?.['readonly'] === true)).toBe(true)
    for (const cell of table.findAll('.el-table__body-wrapper tbody tr:first-child td')) await cell.trigger('dblclick')
    expect(table.findAll('.el-table__body-wrapper input')).toHaveLength(0)
    expect(currentView(observed).hasEditingChanges()).toBe(false)
    expect(currentView(observed).dirtyTracking.hasPendingChanges()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('rejects a stale application scope and releases the previous runtime', async () => {
    const {wrapper, router, observed} = await open()
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${ORGANIZATION_PATH}`); await flushPromises()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.text()).toContain('SPARK_EXECUTION_SCOPE_STALE')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(http.reads).toHaveLength(1)
  })

  it('does not publish a late query result after the application identity changes', async () => {
    let release = () => {}
    const pending = new Promise<void>(resolve => {release = resolve})
    http.beforeDefinitionRead = () => pending
    const {wrapper, router, observed} = await open(false)
    await vi.waitFor(() => expect(http.reads).toHaveLength(1))
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${ORGANIZATION_PATH}`); await flushPromises()
    release()
    await flushPromises()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.text()).toContain('SPARK_EXECUTION_SCOPE_STALE')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
  })

  it('offers retry after an initial query failure', async () => {
    http.failNextRead = true
    const {wrapper} = await open()
    expect(wrapper.get('.renderer-section-error').text()).toContain('机构查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(wrapper.find('.renderer-section-error').exists()).toBe(false)
    expect(wrapper.getComponent(RendererTable).findAll('.el-table__body-wrapper tbody tr')).toHaveLength(10)
    expect(http.reads).toHaveLength(2)
  })
})
