import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, type Component} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {api, APPLY, BASE, MY, pagedataText, resetEnterpriseAppAuthFixture, REVIEW, session} from './enterprise-app-auth.fixture'
import {provideTestPageService} from '../../../support/helpers/page-service-host'

const confirmBox = vi.hoisted(() => vi.fn<(message: string, title: string) => Promise<string>>())
vi.mock('element-plus', async importOriginal => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {...original, ElMessageBox: {...original.ElMessageBox, confirm: confirmBox}}
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    session: {get: () => session},
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('企业应用授权页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('企业应用授权页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => pagedataText[id] ?? null,
    writeText: async () => {throw new Error('企业应用授权页不写场景文件')},
  }}),
  readLowcodePrincipal: () => ({applicationId: 'APP'}),
}))

const {default: MyPage} = await import('@/views/features/application/enterprise-app-auth-application/ui/my-app-auth-request-page.vue')
const {default: ApplyPage} = await import('@/views/features/application/enterprise-app-auth-application/ui/apply-app-auth-page.vue')
const {default: ReviewPage} = await import('@/views/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page.vue')
const {useFeaturePageRuntime} = await import('@/views/features/shared/runtime/use-feature-page-runtime')

const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
let http: ReturnType<typeof resetEnterpriseAppAuthFixture>
beforeEach(() => {
  http = resetEnterpriseAppAuthFixture()
  session.enterprise.shortName = 'ME'
  confirmBox.mockReset().mockResolvedValue('confirm')
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(component: Component, scenario: string) {
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return load.call(this)
  })
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: `/apps/:projectId${BASE}/page`, component, meta: {blueprintScenarioId: scenario, nodeId: scenario, systemPageIdentityState: 'resolved'}},
  ]})
  await router.push(`/apps/APP${BASE}/page`)
  await router.isReady()
  const wrapper = mount(defineComponent({setup: () => {
    provideTestPageService(router)
    return () => h(RouterView)
  }}), {
    attachTo: document.body, global: {stubs: {transition: false}, plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await settle()
  const runtime = (): PageRuntime => {
    const [current] = observed
    if (!current) throw new Error('缺少页面运行实例')
    return current
  }
  const rows = (key: string) => (runtime().resolveView(key)?.rows ?? []).map(row => row['id'] ?? row['rowid'])
  return {wrapper, observed, runtime, rows}
}
async function settle(): Promise<void> {
  await vi.waitFor(async () => {
    await flushPromises()
    expect(document.body.textContent).not.toMatch(/正在(读取|装配)/)
  }, {timeout: 10000})
  await flushPromises()
}
function buttons(label: string) {
  return [...document.body.querySelectorAll('button')].filter(button => button.textContent?.trim() === label)
}
async function click(label: string, index = 0): Promise<void> {
  const button = buttons(label)[index]
  if (!button) throw new Error(`按钮不存在: ${label}`)
  button.click()
  await settle()
}
async function type(placeholder: string, value: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[placeholder="${placeholder}"]`)
  if (!input) throw new Error(`输入框不存在: ${placeholder}`)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
const authReads = () => http.reads.filter(read => read.table === 'enterprise_app_auth').map(read => JSON.stringify(read.data))

describe('我的申请', () => {
  it('在同一运行实例装配 47DA、0221 与 C06D，常驻范围只列本企业的 REQUEST，名称经选项视图显示', async () => {
    const {observed, runtime, rows} = await open(MyPage, MY)
    expect(observed.size).toBe(1)
    for (const id of [MY, APPLY, REVIEW]) expect(runtime().getDataSet(id)).toBeDefined()
    expect(rows(`${MY}@enterprise_app_auth@default`)).toEqual(['A1', 'A2', 'A3'])
    expect(authReads()[0]).toContain('{"Name":"entShortName","Value":"ME"}')
    const text = document.body.textContent ?? ''
    for (const expected of ['客户管理[crm]', '资源计划[erp]', '办公[oa]', '他企业', '待审批', '初始化超时', '不合适', '2026-11-01 10:00:00']) expect(text).toContain(expected)
    expect(text).not.toContain('请批准')
    const tags = [...document.body.querySelectorAll('.el-tag-global-stub')].map(tag => tag.getAttribute('type'))
    expect(tags).toEqual(['warning', 'danger', 'danger'])
  })

  it('会话缺少企业简称时入口失败，不发出无范围查询', async () => {
    session.enterprise.shortName = ''
    await open(MyPage, MY)
    expect(document.body.textContent).toContain('当前会话缺少企业英文简称或用户身份')
    expect(authReads()).toHaveLength(0)
  })

  it('取消申请与重新申请经确认后只提交本行状态与操作人；确认取消不写入', async () => {
    confirmBox.mockRejectedValueOnce('cancel')
    await open(MyPage, MY)
    expect(buttons('取消申请')).toHaveLength(1)
    expect(buttons('重新申请')).toHaveLength(2)
    await click('取消申请')
    expect(http.saves).toHaveLength(0)
    await click('取消申请')
    expect(http.saves).toEqual([{table: 'enterprise_app_auth', added: [], deleted: [],
      changed: [expect.objectContaining({id: 'A1', auth_status: 'CANCELLED', operator: 'U1'})]}])
    expect(confirmBox).toHaveBeenLastCalledWith('确定要取消对「客户管理[crm]」的申请吗？', '取消申请确认', expect.anything())
    expect(buttons('取消申请')).toHaveLength(0)
    await click('重新申请', 1)
    expect(http.saves[1]).toEqual({table: 'enterprise_app_auth', added: [], deleted: [],
      changed: [expect.objectContaining({id: 'A2', auth_status: 'PENDING', operator: 'U1'})]})
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'A2')?.['review_comment']).toBe('不合适')
  })

  it('本行 auth_status 不可写时不提供取消与重新申请', async () => {
    http.readonlyFields = {enterprise_app_auth: ['auth_status']}
    await open(MyPage, MY)
    expect(buttons('取消申请')).toHaveLength(0)
    expect(buttons('重新申请')).toHaveLength(0)
  })
})

describe('申请应用授权', () => {
  it('内嵌于我的申请：只列别家已发布的应用，关键字按名称或描述匹配，提交只新增一行', async () => {
    const {rows} = await open(MyPage, MY)
    await click('申请应用授权')
    const published = `${REVIEW}@Base_AppSystemList@published`
    expect(rows(published)).toEqual(['APP-X', 'APP-Y', 'APP-Z'])
    await type('搜索应用名称', '资源')
    await click('查询', buttons('查询').length - 1)
    expect(rows(published)).toEqual(['APP-Y'])
    await click('申请')
    expect(document.body.textContent).toContain('应用：资源计划[erp]')
    await type('请填写申请说明（可选）', '请开通')
    await click('提交申请')
    expect(http.saves).toHaveLength(1)
    const [save] = http.saves
    expect(save).toMatchObject({table: 'enterprise_app_auth', changed: [], deleted: []})
    expect(save?.added).toHaveLength(1)
    expect(save?.added[0]).toMatchObject({app_id: 'APP-Y', review_comment: '请开通', operator: 'U1'})
    expect(save?.added[0]).not.toHaveProperty('auth_status')
    expect(rows(`${APPLY}@enterprise_app_auth@default`)).toEqual([])
    expect(document.body.textContent).not.toContain('应用：资源计划[erp]')
  })

  it('独立入口借我的申请身份装配 0221 与 C06D；取消与明确失败撤销新增，结果未知保留并提示核对', async () => {
    const {rows} = await open(ApplyPage, MY)
    const authKey = `${APPLY}@enterprise_app_auth@default`
    expect(rows(`${REVIEW}@Base_AppSystemList@published`)).toEqual(['APP-X', 'APP-Y', 'APP-Z'])
    await click('申请')
    expect(rows(authKey)).toHaveLength(1)
    await click('取消')
    expect(rows(authKey)).toHaveLength(0)
    http.rejectNextSave = true
    await click('申请')
    await click('提交申请')
    expect(document.body.textContent).toContain('保存失败')
    expect(rows(authKey)).toHaveLength(0)
    expect(http.saves).toHaveLength(0)
    http.failAfterWrite = true
    await click('申请')
    await click('提交申请')
    expect(document.body.textContent).toContain('保存结果未知，请刷新核对，不要重复操作')
    expect(http.saves).toHaveLength(1)
    expect(buttons('提交申请')[0]?.disabled).toBe(true)
  })
})

describe('申请列表', () => {
  it('常驻范围只列来源为本企业的待审批 REQUEST；通过只写 INITIALIZING 与操作人', async () => {
    const {rows} = await open(ReviewPage, REVIEW)
    expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual(['R1'])
    for (const expected of ['他企业', '我的应用[mine]', '请批准']) expect(document.body.textContent).toContain(expected)
    await click('审核')
    expect(document.body.textContent).toContain('拒绝原因（不通过时填写）')
    await click('通过')
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]?.changed).toEqual([expect.objectContaining({id: 'R1', auth_status: 'INITIALIZING', operator: 'U1'})])
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1')?.['review_comment']).toBe('请批准')
    expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual([])
  })

  it('不通过写 REJECTED，留空保留申请说明，填写时写入拒绝原因；取消不写入', async () => {
    http.records['enterprise_app_auth']?.push({...http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1'), id: 'R4', review_comment: '第二条'})
    await open(ReviewPage, REVIEW)
    await click('审核')
    await type('可选，拒绝时将写入审批意见', '暂不开放')
    await click('取消')
    expect(http.saves).toHaveLength(0)
    await click('审核')
    await click('不通过')
    expect(http.saves[0]?.changed).toEqual([expect.objectContaining({id: 'R1', auth_status: 'REJECTED', operator: 'U1'})])
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1')?.['review_comment']).toBe('请批准')
    await click('审核')
    await type('可选，拒绝时将写入审批意见', '暂不开放')
    await click('不通过')
    expect(http.saves[1]?.changed).toEqual([expect.objectContaining({id: 'R4', auth_status: 'REJECTED', review_comment: '暂不开放'})])
  })
})

describe('功能页运行实例的伙伴空间', () => {
  const probe = (options: Partial<Parameters<typeof useFeaturePageRuntime>[0]>) => defineComponent({setup() {
    const state = useFeaturePageRuntime({scenarioId: MY, modelName: 'enterprise_app_auth', componentType: 'probe', title: '探针',
      queryContext: () => ({entShortName: 'ME'}), ...options})
    return () => h('p', state.error.value || (state.ready.value ? 'ready' : ''))
  }})

  it.each([[[MY]], [[APPLY, APPLY]], [['']]])('拒绝与主空间相同、重复或空的伙伴空间 %j', async peers => {
    await open(probe({peerScenarioIds: peers}), MY)
    expect(document.body.textContent).toContain('探针伙伴数据空间身份无效或重复')
    expect(authReads()).toHaveLength(0)
  })

  it('选项视图缺失时入口失败，不提供运行实例', async () => {
    await open(probe({peerScenarioIds: [APPLY], optionViews: [`${APPLY}@Base_Enterprise_Info@missing`]}), MY)
    expect(document.body.textContent).toContain(`探针缺少正式选项视图 ${APPLY}@Base_Enterprise_Info@missing`)
  })
})
