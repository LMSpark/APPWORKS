import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref, type Component} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererFilter, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {getSystemScenarioResource, resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {api, JOB_PATH, JOB_SCENARIO, resetJobFixture} from './job-management.fixture'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

vi.mock('@/platform-adapters/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('岗位页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('岗位页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => id === JOB_SCENARIO
      ? (await import('../../../../config/pages/organization/job-management/pagedata.json?raw')).default : null,
    writeText: async () => {throw new Error('岗位页不写场景文件')},
  }}),
}))

const {default: JobPage} = await import('@/views/features/organization/job-management/ui/job-management-page.vue')
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
let http: ReturnType<typeof resetJobFixture>
beforeEach(() => {
  http = resetJobFixture()
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

async function open(wait = true, component: Component = JobPage, prepare?: (runtime: PageRuntime) => void) {
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    const loaded = load.call(this)
    return prepare ? loaded.then(() => prepare(this)) : loaded
  })
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: `/apps/:projectId${JOB_PATH}`, component,
    meta: {blueprintScenarioId: JOB_SCENARIO, nodeId: JOB_SCENARIO, systemPageIdentityState: 'resolved'},
  }]})
  await router.push(`/apps/APP${JOB_PATH}`)
  await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {stubs: {transition: false}, plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  if (wait) await vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper.text()).not.toContain('正在读取岗位')
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
  const current = [...observed].find(item => !item.destroyed && item.getDataSet(JOB_SCENARIO))
  const jobs = current?.getDataSet(JOB_SCENARIO)?.getView('Base_JobInfo', 'default')
  const departments = current?.getDataSet(JOB_SCENARIO)?.getView('Base_DepartInfo', 'default')
  if (!jobs || !departments) throw new Error('岗位或机构正式视图未装配')
  return {jobs, departments}
}

async function openDepartmentOptions(wrapper: VueWrapper) {
  const select = wrapper.getComponent(RendererFilter).getComponent(ElSelect)
  const dropdownId = select.get('input').attributes('aria-controls')
  if (!dropdownId) throw new Error('机构选择器缺少选项面板身份')
  await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
  return new DOMWrapper(document.body).get(`#${dropdownId}`).findAll('[role="option"]')
}

describe('reference job page through SPARK data', () => {
  it('registers the official scenario and renders read-only job fields and data-view options', async () => {
    const resource = getSystemScenarioResource('jobManagement')
    expect(resolveSystemScenarioResource(JOB_SCENARIO)).toEqual(resource)
    const {wrapper, observed} = await open()
    const table = wrapper.getComponent(RendererTable), {jobs, departments} = currentViews(observed)
    expect(wrapper.text()).toContain('当前租户')
    expect(table.props('dataViewKey')).toBe(`${JOB_SCENARIO}@Base_JobInfo@default`)
    expect(table.findAll('.el-table__header-wrapper th').map(header => header.text()))
      .toEqual(['#', '岗位名称', '岗位编码', '所属机构', '机构 ID', '职级'])
    expect(table.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(10)
    expect(table.findAll('th.is-sortable').map(header => header.text())).toEqual(['岗位名称', '岗位编码', '所属机构', '机构 ID', '职级'])
    expect(jobs.total).toBe(23)
    expect(departments.rows).toHaveLength(2)
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['机构甲', 'D2'])
    expect(table.props('children')?.every(field => typeof field === 'object' && field !== null && field.props?.['readonly'] === true)).toBe(true)
    for (const cell of table.findAll('.el-table__body-wrapper tbody tr:first-child td')) await cell.trigger('dblclick')
    expect(table.findAll('.el-table__body-wrapper input')).toHaveLength(0)
    expect(jobs.hasEditingChanges()).toBe(false)
    expect(http.reads.map(read => read.table)).toEqual(['Base_JobInfo', 'Base_DepartInfo'])
    expect(http.saves).toHaveLength(0)
  })

  it('queries trimmed names and selected institutions, then resets and preserves refresh paging', async () => {
    const {wrapper, observed} = await open(), {jobs} = currentViews(observed)
    const filter = wrapper.getComponent(RendererFilter)
    await filter.findAll('input')[0]!.setValue('  岗位1  ')
    const options = await openDepartmentOptions(wrapper)
    await options[0]!.trigger('click'); await flushPromises()
    expect(http.reads).toHaveLength(2)
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(jobs.filterExpression).toEqual({logic: 'and', filters: [
      {field: 'JobName', operator: 'contains', value: '岗位1'},
      {field: 'Depid', operator: 'eq', value: 'D1'},
    ]})
    expect(jobs.rows.every(row => row['Depid'] === 'D1' && String(row['JobName']).includes('岗位1'))).toBe(true)
    await getButton(wrapper, '重置').trigger('click'); await flushPromises()
    expect(jobs.filterExpression).toBeUndefined()
    expect(jobs.page).toBe(1)
    expect(jobs.total).toBe(23)
    expect(filter.find('.renderer-table-filters__count').exists()).toBe(false)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(jobs.page).toBe(2)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(jobs.page).toBe(2)
    expect(jobs.rows).toHaveLength(10)
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(jobs.page).toBe(1)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    await getButton(wrapper, '重置').trigger('click'); await flushPromises()
    expect(jobs.page).toBe(1)
    expect(http.reads.map(read => read.table)).toEqual([
      'Base_JobInfo', 'Base_DepartInfo', 'Base_JobInfo', 'Base_JobInfo', 'Base_JobInfo', 'Base_JobInfo',
      'Base_JobInfo', 'Base_JobInfo', 'Base_JobInfo',
    ])
    expect(http.saves).toHaveLength(0)
  })

  it('excludes blank institution IDs and queries the trimmed ID without changing the source view', async () => {
    http.records['Base_DepartInfo']?.push(
      {rowid: 'dep-blank', DepID: '   ', DepName: '空白标识机构'},
      {rowid: 'dep-padded', DepID: '  D3  ', DepName: '机构丙'},
    )
    const firstJob = http.records['Base_JobInfo']?.[0]
    if (!firstJob) throw new Error('岗位夹具缺少首条记录')
    firstJob['Depid'] = 'D3'
    const {wrapper, observed} = await open(), {jobs, departments} = currentViews(observed)
    const options = await openDepartmentOptions(wrapper)
    expect(options.map(option => option.text())).toEqual(['机构甲', 'D2', '机构丙'])
    expect(departments.rows.find(row => row['rowid'] === 'dep-blank')?.['DepID']).toBe('   ')
    expect(departments.rows.find(row => row['rowid'] === 'dep-padded')?.['DepID']).toBe('  D3  ')
    await options[2]!.trigger('click'); await flushPromises()
    await getButton(wrapper, '查询').trigger('click'); await flushPromises()
    expect(jobs.filterExpression).toEqual({field: 'Depid', operator: 'eq', value: 'D3'})
    expect(jobs.rows).toHaveLength(1)
    expect(jobs.rows[0]?.['Depid']).toBe('D3')
    expect(departments.hasEditingChanges()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('reports colliding trimmed institution IDs and recovers when the option view is refreshed', async () => {
    const records = http.records['Base_DepartInfo']
    if (!records) throw new Error('岗位夹具缺少机构记录')
    records.push({rowid: 'dep-duplicate', DepID: ' D1 ', DepName: '冲突机构'})
    const {wrapper, observed} = await open(), {departments} = currentViews(observed)
    const select = wrapper.getComponent(RendererFilter).getComponent(ElSelect)
    await vi.waitFor(() => expect(wrapper.text()).toContain('选项值去空白后不唯一'))
    expect(select.props('disabled')).toBe(true)
    expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
    expect(departments.rows.find(row => row['rowid'] === 'dep-duplicate')?.['DepID']).toBe(' D1 ')
    records.pop()
    await departments.refresh(); await flushPromises()
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('选项值去空白后不唯一'))
    expect(select.props('disabled')).toBe(false)
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['机构甲', 'D2'])
    expect(departments.hasEditingChanges()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('does not expose institutions whose option identity is not readable', async () => {
    http.hiddenFields['Base_DepartInfo'] = ['DepID']
    const {wrapper} = await open()
    expect(await openDepartmentOptions(wrapper)).toHaveLength(0)
  })

  it('uses the readable option identity when institution names are hidden', async () => {
    http.hiddenFields['Base_DepartInfo'] = ['DepName']
    const {wrapper} = await open()
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['D1', 'D2'])
  })

  it('loads institution options across formal query pages', async () => {
    http.records['Base_DepartInfo'] = Array.from({length: 501}, (_, index) => ({
      rowid: `dep-${index}`, DepID: `D${index}`, DepName: `机构${index}`,
    }))
    const {observed} = await open(), {departments} = currentViews(observed)
    expect(departments.rows).toHaveLength(501)
    expect(http.reads.map(read => read.table)).toEqual(['Base_JobInfo', 'Base_DepartInfo', 'Base_DepartInfo'])
  })

  it.each([
    {parent: 'Base_DepartInfo', child: 'Base_JobInfo', sourceField: 'DepID', targetField: 'Depid'},
    {parent: 'Base_JobInfo', child: 'Base_DepartInfo', sourceField: 'Depid', targetField: 'DepID'},
  ])('keeps the entry closed until $child completes its required query', async relation => {
    let configure = true
    let prepared: PageRuntime | undefined
    const {wrapper, observed} = await open(true, JobPage, runtime => {
      if (!configure || prepared === runtime) return
      prepared = runtime
      const dataSet = runtime.getDataSet(JOB_SCENARIO)
      if (!dataSet) throw Error('岗位数据空间未装配')
      dataSet.addCascade({
        kind: 'query', parentTable: relation.parent, parentViewId: 'default',
        childTable: relation.child, childViewId: 'default', autoLoad: false,
        filterBindings: [{sourceField: relation.sourceField, targetField: relation.targetField, emptyValueMode: 'emptyResult'}],
      })
    })
    expect(http.reads.some(read => read.table === relation.child)).toBe(false)
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(wrapper.get('.renderer-section-error').text()).toContain(`${relation.child}@default`)
    expect([...observed].every(runtime => runtime.destroyed)).toBe(true)

    configure = false
    http.records[relation.child] = []
    await getButton(wrapper, '重试').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(wrapper.find('.renderer-section-error').exists()).toBe(false)
    expect(http.reads.some(read => read.table === relation.child)).toBe(true)
    const {jobs, departments} = currentViews(observed)
    expect((relation.child === 'Base_JobInfo' ? jobs : departments).total).toBe(0)
  })

  it('fails the entry on an option query failure and retries jobs with options in the same batch', async () => {
    http.failNextTable = 'Base_DepartInfo'
    const {wrapper} = await open()
    expect(wrapper.get('.renderer-section-error').text()).toContain('目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(wrapper.find('.renderer-section-error').exists()).toBe(false)
    expect((await openDepartmentOptions(wrapper)).map(option => option.text())).toEqual(['机构甲', 'D2'])
    expect(http.reads.map(read => read.table)).toEqual(['Base_JobInfo', 'Base_DepartInfo', 'Base_JobInfo', 'Base_DepartInfo'])
  })

  it('offers retry after an initial job query failure', async () => {
    http.failNextTable = 'Base_JobInfo'
    const {wrapper} = await open()
    expect(wrapper.get('.renderer-section-error').text()).toContain('目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(wrapper.find('.renderer-section-error').exists()).toBe(false)
  })

  it('reports and retries a failed job refresh without dropping the current page', async () => {
    const {wrapper, observed} = await open(), {jobs} = currentViews(observed)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    http.failNextTable = 'Base_JobInfo'
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('目录查询失败')
    expect(jobs.page).toBe(2)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(jobs.loadingError).toBeNull()
    expect(jobs.page).toBe(2)
    expect(jobs.rows).toHaveLength(10)
  })

  it('ignores late institution results after the application identity changes', async () => {
    let release = () => {}
    const pending = new Promise<void>(resolve => {release = resolve})
    http.beforeDefinitionRead = table => table === 'Base_DepartInfo' ? pending : Promise.resolve()
    const {wrapper, router, observed} = await open(false)
    await vi.waitFor(() => expect(http.reads.map(read => read.table)).toEqual(['Base_JobInfo', 'Base_DepartInfo']))
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${JOB_PATH}`); await flushPromises()
    release(); await flushPromises()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.text()).toContain('SPARK_EXECUTION_SCOPE_STALE')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('preserves a busy feature runtime until the current route is explicitly reopened', async () => {
    const busy = ref(true)
    const host = defineComponent({setup() {
      const runtime = useFeaturePageRuntime({scenarioId: JOB_SCENARIO, modelName: 'Base_JobInfo',
        componentType: 'preserved-feature-test', title: '测试目录', preserveRuntime: () => busy.value})
      return () => h('button', {disabled: busy.value, 'data-runtime-ready': String(runtime.ready.value), onClick: runtime.loadCurrentRoute},
        runtime.reloadBlocked.value ? '切换到当前导航' : runtime.ready.value ? '目录已加载' : runtime.error.value)
    }})
    const {wrapper, router, observed} = await open(false, host)
    await vi.waitFor(() => expect(wrapper.text()).toBe('目录已加载'))
    const original = [...observed][0]!
    await router.push(`/apps/OTHER${JOB_PATH}`)
    await vi.waitFor(() => expect(wrapper.text()).toBe('切换到当前导航'))
    expect(wrapper.get('button').attributes('data-runtime-ready')).toBe('false')
    expect(original.destroyed).toBe(false)
    expect(observed.size).toBe(1)
    busy.value = false
    await flushPromises()
    expect(original.destroyed).toBe(false)
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(original.destroyed).toBe(true))
    expect(observed.size).toBe(2)
  })
})
