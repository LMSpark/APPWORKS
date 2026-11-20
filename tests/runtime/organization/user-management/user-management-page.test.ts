import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererFilter, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {api, ORGANIZATION_SCENARIO, resetUserFixture, USER_NAVIGATION, USER_PATH} from './user-management.fixture'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('人员页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('人员页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => id === ORGANIZATION_SCENARIO
      ? (await import('../../../../config/pages/organization/organization-structure/pagedata.json?raw')).default : null,
    writeText: async () => {throw new Error('人员页不写场景文件')},
  }}),
}))

const {default: UserPage} = await import('@/views/features/organization/user-management/ui/user-management-page.vue')
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
let http: ReturnType<typeof resetUserFixture>
beforeEach(() => {
  http = resetUserFixture()
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

async function open(options: {wait?: boolean; nodeId?: string} = {}) {
  const {wait = true, nodeId = USER_NAVIGATION} = options
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return load.call(this)
  })
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: `/apps/:projectId${USER_PATH}`, component: UserPage,
    meta: {blueprintScenarioId: ORGANIZATION_SCENARIO, nodeId, systemPageIdentityState: 'resolved'},
  }]})
  await router.push(`/apps/APP${USER_PATH}`)
  await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {stubs: {transition: false}, plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  if (wait) await vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper.text()).not.toContain('正在读取人员')
    expect(wrapper.text()).not.toContain('正在读取机构选项')
  }, {timeout: 10000})
  await flushPromises()
  return {wrapper, router, observed}
}

function getButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  if (!button) throw new Error(`按钮不存在: ${label}`)
  return button
}

function currentViews(observed: Set<PageRuntime>) {
  const current = [...observed].find(item => !item.destroyed && item.getDataSet(ORGANIZATION_SCENARIO))
  const users = current?.getDataSet(ORGANIZATION_SCENARIO)?.getView('View_UserDJAndDepCSR', 'default')
  const departments = current?.getDataSet(ORGANIZATION_SCENARIO)?.getView('Base_DepartInfo', 'options')
  if (!users || !departments) throw new Error('人员或机构正式视图未装配')
  return {users, departments}
}

async function openDepartmentOptions(wrapper: VueWrapper) {
  const select = wrapper.getComponent(RendererFilter).getComponent(ElSelect)
  const dropdownId = select.get('input').attributes('aria-controls')
  if (!dropdownId) throw new Error('机构选择器缺少选项面板身份')
  await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
  return new DOMWrapper(document.body).get(`#${dropdownId}`).findAll('[role="option"]')
}

describe('reference user page through the organization data space', () => {
  it('consumes the organization space under its own navigation identity and renders read-only fields', async () => {
    const {wrapper, observed} = await open()
    const table = wrapper.getComponent(RendererTable), {users, departments} = currentViews(observed)
    expect(table.props('dataViewKey')).toBe(`${ORGANIZATION_SCENARIO}@View_UserDJAndDepCSR@default`)
    expect([...observed][0]?.pageId).toBe(USER_NAVIGATION)
    expect(table.findAll('.el-table__header-wrapper th').map(header => header.text()))
      .toEqual(['#', '人员姓名', '人员 ID', '所属机构', '岗位'])
    expect(table.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(10)
    expect(users.total).toBe(14)
    expect(departments.rows).toHaveLength(2)
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['机构甲', '机构乙'])
    for (const cell of table.findAll('.el-table__body-wrapper tbody tr:first-child td')) await cell.trigger('dblclick')
    expect(table.findAll('.el-table__body-wrapper input')).toHaveLength(0)
    expect(users.hasEditingChanges()).toBe(false)
    expect(http.reads.map(read => read.table)).toEqual(['View_UserDJAndDepCSR', 'Base_DepartInfo'])
    expect(http.saves).toHaveLength(0)
  })

  it('queries trimmed names and selected institutions, then resets and preserves refresh paging', async () => {
    const {wrapper, observed} = await open(), {users} = currentViews(observed)
    const filter = wrapper.getComponent(RendererFilter)
    await filter.findAll('input')[0]!.setValue('  人员1  ')
    const options = await openDepartmentOptions(wrapper)
    await options[0]!.trigger('click'); await flushPromises()
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(users.filterExpression).toEqual({logic: 'and', filters: [
      {field: 'UserName', operator: 'contains', value: '人员1'},
      {field: 'DepID', operator: 'eq', value: 'D1'},
    ]})
    expect(users.rows.length).toBeGreaterThan(0)
    expect(users.rows.every(row => row['DepID'] === 'D1' && String(row['UserName']).includes('人员1'))).toBe(true)
    await getButton(wrapper, '重置').trigger('click'); await flushPromises()
    expect(users.filterExpression).toBeUndefined()
    expect(users.total).toBe(14)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(users.page).toBe(2)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(users.page).toBe(2)
    expect(users.rows).toHaveLength(4)
    expect(http.saves).toHaveLength(0)
  })

  it('rejects a route whose navigation identity is the consumed data space', async () => {
    const {wrapper, observed} = await open({nodeId: ORGANIZATION_SCENARIO})
    expect(wrapper.get('.renderer-section-error').text()).toContain('人员管理入口缺少正式导航身份')
    expect(observed.size).toBe(0)
    expect(http.reads).toHaveLength(0)
  })

  it('fails the entry on an option query failure and retries users with options in the same batch', async () => {
    http.failNextTable = 'Base_DepartInfo'
    const {wrapper} = await open()
    expect(wrapper.get('.renderer-section-error').text()).toContain('目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['机构甲', '机构乙'])
  })

  it('offers retry after an initial user query failure', async () => {
    http.failNextTable = 'View_UserDJAndDepCSR'
    const {wrapper} = await open()
    expect(wrapper.get('.renderer-section-error').text()).toContain('目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
  })

  it('ignores late institution results after the application identity changes', async () => {
    let release = () => {}
    const pending = new Promise<void>(resolve => {release = resolve})
    http.beforeDefinitionRead = table => table === 'Base_DepartInfo' ? pending : Promise.resolve()
    const {wrapper, router, observed} = await open({wait: false})
    await vi.waitFor(() => expect(http.reads.map(read => read.table)).toEqual(['View_UserDJAndDepCSR', 'Base_DepartInfo']))
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${USER_PATH}`); await flushPromises()
    release(); await flushPromises()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.text()).toContain('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.saves).toHaveLength(0)
  })
})
