import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, type Component} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElDialog} from 'element-plus'
import {SparkNodeTree} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererDialog, RendererForm, RendererTable, Spark, SparkPageRenderer, registerAllRenderers} from '@spark-appworks/spark-component'
import {api, APPLY, BASE, MY, pagedataText, resetEnterpriseAppAuthFixture, REVIEW, session} from './enterprise-app-auth.fixture'
import {provideTestPageService} from '../../../support/helpers/page-service-host'
import myRequests from '../../../../config/pages/application/enterprise-app-auth/my-requests/pagedata.json'
import reviewRequests from '../../../../config/pages/application/enterprise-app-auth/review/pagedata.json'

const confirmBox = vi.hoisted(() => vi.fn<(message: string, title: string) => Promise<string>>())
vi.mock('element-plus', async importOriginal => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {...original, ElMessageBox: {...original.ElMessageBox, confirm: confirmBox}}
})
vi.mock('@/views/features/application/enterprise-app-auth-application/ui/request-tool/style.css?raw', async () => {
  const {readFileSync} = await import('node:fs')
  return {default: readFileSync('src/views/features/application/enterprise-app-auth-application/ui/request-tool/style.css', 'utf8')}
})
vi.mock('@/platform-adapters/lowcode-runtime', () => ({
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

const loadPageRuntime = PageRuntime.prototype.load
async function open(component: Component, scenario: string) {
  const observed = new Set<PageRuntime>()
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return loadPageRuntime.call(this)
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
  it('uses formal view identities for initial queries, dictionary labels and the original request action', async () => {
    const original = pagedataText[MY]!
    const {enterprise_app_auth: requestRows, app_auth_status: statusOptions, ...other} = myRequests.tables
    pagedataText[MY] = JSON.stringify({...myRequests, tables: {requestRows, statusOptions, ...other}})
    try {
      const {runtime, rows} = await open(MyPage, MY)
      expect(document.body.textContent).toContain('待审批')
      expect(rows(`${MY}@enterprise_app_auth@default`)).toEqual(['A1', 'A2', 'A3'])
      expect(runtime().resolveView(`${MY}@enterprise_app_auth@default`)?.tableName).toBe('requestRows')
      expect(runtime().resolveView(`${MY}@app_auth_status@default`)?.tableName).toBe('statusOptions')
      expect(runtime().resolveView(`${MY}@requestRows@default`)).toBeUndefined()
      await click('取消申请')
      expect(http.saves).toEqual([{table: 'enterprise_app_auth', added: [], deleted: [],
        changed: [expect.objectContaining({id: 'A1', auth_status: 'CANCELLED'})]}])
      expect(runtime().resolveView(`${MY}@enterprise_app_auth@default`)?.rows.find(row => row['id'] === 'A1')?.['auth_status'])
        .toBe('CANCELLED')
    } finally {
      pagedataText[MY] = original
    }
  })

  it('在同一运行实例装配 47DA、0221 与 C06D，常驻范围只列本企业的 REQUEST，名称经选项视图显示', async () => {
    const {wrapper, observed, runtime, rows} = await open(MyPage, MY)
    expect(observed.size).toBe(1)
    const renderer = wrapper.getComponent(SparkPageRenderer)
    expect(renderer.props('pageRuntime')).toBe(runtime())
    expect(runtime().call.mainScenarioId).toBe(MY)
    const list = renderer.getComponent(RendererTable)
    expect(runtime().resolveView(list.props('dataViewKey')!)).toBe(runtime().getDataSet(MY)?.getView('enterprise_app_auth', 'default'))
    expect(renderer.get('style').text()).toContain(`[data-page="${runtime().instanceId}"].spark-page-container .my-app-auth`)
    for (const id of [MY, APPLY, REVIEW]) expect(runtime().getDataSet(id)).toBeDefined()
    expect(rows(`${MY}@enterprise_app_auth@default`)).toEqual(['A1', 'A2', 'A3'])
    const actions = wrapper.findAllComponents(RendererButton).filter(item => ['取消申请', '重新申请'].includes(item.props('label') ?? ''))
    expect(actions).toHaveLength(3)
    for (const action of actions) {
      expect(typeof action.props('dataViewKey')).toBe('string')
      expect(action.props('dataViewKey')).toBe(`${MY}@enterprise_app_auth@default`)
    }
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
  it.each([
    {change: 'principal', action: '取消申请', title: '取消申请确认', id: 'A1', status: 'PENDING'},
    {change: 'query', action: '重新申请', title: '重新申请确认', id: 'A2', status: 'REJECTED'},
    {change: 'none', action: '取消申请', title: '取消申请确认', id: 'A1', status: 'PENDING'},
  ])('settles only the original request confirmation after $change', async ({change, action, title, id, status}) => {
    const initialUser = session.identity.userId
    api.service.readRequestScope.mockImplementation(() => ({
      token: session.identity.userId === initialUser ? 'scope' : 'replacement-principal-scope',
      headers: {'X-AppId': 'APP'},
    }))
    const {runtime} = await open(MyPage, MY)
    const view = runtime().resolveView(`${MY}@enterprise_app_auth@default`)
    const original = view?.rows.find(row => row['id'] === id)
    if (!view || !original) throw Error('Expected the original request row')
    const assertOriginal = view.captureReadRow(original, ['id', 'auth_status'])
    const beforeSave = vi.fn(() => Promise.resolve())
    http.beforeSave = beforeSave
    let accept: (() => void) | undefined
    confirmBox.mockImplementationOnce(() => new Promise<string>(resolve => {accept = () => resolve('confirm')}))
    try {
      await click(action)
      expect(confirmBox).toHaveBeenCalledTimes(1)
      expect(confirmBox).toHaveBeenCalledWith(expect.any(String), title, expect.anything())
      if (!accept) throw Error('The original confirmation did not open')
      expect(beforeSave).not.toHaveBeenCalled()
      if (change === 'query') {
        expect((await view.requestRefresh({defer: false})).refreshStatus).toBe('read')
        const replacement = view.rows.find(row => row['id'] === id)
        expect(replacement?.['auth_status']).toBe(status)
        expect(assertOriginal).toThrow()
      }
      if (change !== 'none') {
        view.updateEditingValue('A3', 'review_comment', 'same-view sibling draft')
      }
      const edit = vi.spyOn(view, 'updateEditingValue')
      if (change === 'principal') session.identity.userId = 'U2'
      accept()
      await settle()
      if (change === 'none') {
        expect(beforeSave).toHaveBeenCalledTimes(1)
        expect(http.saves).toEqual([{table: 'enterprise_app_auth', added: [], deleted: [],
          changed: [expect.objectContaining({id, auth_status: 'CANCELLED', operator: initialUser})]}])
        expect(view.rows.find(row => row['id'] === id)?.['auth_status']).toBe('CANCELLED')
        return
      }
      expect.soft(edit).not.toHaveBeenCalled()
      expect.soft(beforeSave).not.toHaveBeenCalled()
      expect.soft(http.saves).toHaveLength(0)
      expect.soft(http.records['enterprise_app_auth']?.find(row => row['id'] === id))
        .toMatchObject({id, auth_status: status, operator: 'U0'})
      expect.soft(view.hasEditingChanges(id)).toBe(false)
      expect(view.getEditingRow('A3')?.['review_comment']).toBe('same-view sibling draft')
    } finally {
      session.identity.userId = initialUser
    }
  })

  it('does not confirm an authorization update when the original DataSet rejects the editing row', async () => {
    const {runtime} = await open(MyPage, MY)
    const view = runtime().resolveView(`${MY}@enterprise_app_auth@default`)
    if (!view) throw Error('Expected the original request view')
    vi.spyOn(view, 'applyEditingRows').mockResolvedValueOnce({success: false, data: {
      appliedCount: 0, failedCount: 1, failedIds: ['A1'], failedErrors: {A1: '当前申请未应用修改'},
    }})
    await click('取消申请')
    expect(http.saves).toHaveLength(0)
    expect(view.hasEditingChanges('A1')).toBe(false)
    expect(document.body.textContent).toContain('当前申请未应用修改')
    expect(document.body.textContent).not.toContain('已取消申请')
    expect(view.rows.find(row => row['id'] === 'A1')?.['auth_status']).toBe('PENDING')
  })

  it('does not confirm a single-record authorization save with no acknowledged mutation', async () => {
    const {runtime} = await open(MyPage, MY)
    const view = runtime().resolveView(`${MY}@enterprise_app_auth@default`)
    if (!view) throw Error('Expected the original request view')
    const {commitAppAuthRecord} = await import('@/views/features/application/enterprise-app-auth-application/model/enterprise-app-auth-application-model')
    await expect(commitAppAuthRecord(view, 'A1')).rejects.toThrow('原记录没有已确认的保存回执')
    expect(http.saves).toHaveLength(0)
  })

  it('rejects a staged deletion before dispatching the authorization save', async () => {
    const {runtime} = await open(MyPage, MY)
    const view = runtime().resolveView(`${MY}@enterprise_app_auth@default`)
    const row = view?.rows.find(item => item['id'] === 'A1')
    if (!view || !row || !view.dataSet) throw Error('Expected the original request row')
    view.dirtyTracking.trackDelete('A1', row)
    const save = vi.spyOn(view.dataSet, 'saveRecord')
    const {commitAppAuthRecord} = await import('@/views/features/application/enterprise-app-auth-application/model/enterprise-app-auth-application-model')
    await expect(commitAppAuthRecord(view, 'A1')).rejects.toThrow('授权记录保存不允许删除')
    expect(save).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
    expect(view.dirtyTracking.isPendingDelete('A1')).toBe(true)
  })

  it('本行 auth_status 不可写时不提供取消与重新申请', async () => {
    http.readonlyFields = {enterprise_app_auth: ['auth_status']}
    await open(MyPage, MY)
    expect(buttons('取消申请')).toHaveLength(0)
    expect(buttons('重新申请')).toHaveLength(0)
  })
})

describe('申请应用授权', () => {
  const publishedKey = `${REVIEW}@Base_AppSystemList@published`
  const applyKey = `${APPLY}@enterprise_app_auth@default`
  function outerApplyDialog(wrapper: VueWrapper) {
    const dialog = wrapper.findAllComponents(RendererDialog).find(item =>
      item.props('title') === '申请应用授权' && item.props('width') === 960)
    if (!dialog) throw new Error('缺少内嵌申请外层弹窗')
    return dialog
  }

  it('独立路由与内嵌入口各自调用同一申请工具，表格读 C06D，表单编辑本次 0221', async () => {
    const embedded = await open(MyPage, MY)
    const parent = embedded.wrapper.getComponent(SparkPageRenderer).props('pageRuntime')
    await click('申请应用授权')
    const renderer = outerApplyDialog(embedded.wrapper).getComponent(SparkPageRenderer)
    const child = renderer.props('pageRuntime')
    expect(embedded.observed.size).toBe(2)
    expect(child.instanceId).not.toBe(parent.instanceId)
    const requests = child.resolveView(applyKey)
    const parentRequests = parent.resolveView(applyKey)
    if (!requests || !parentRequests) throw new Error('缺少 0221 申请视图')
    expect(requests).not.toBe(parentRequests)
    expect(renderer.getComponent(RendererTable).props('dataViewKey')).toBe(publishedKey)
    await click('申请')
    const form = renderer.getComponent(RendererForm)
    expect(form.props('dataViewKey')).toBe(applyKey)
    const added = requests.rows[0]
    if (!added) throw new Error('子调用缺少原新增申请')
    expect(form.props('contextRowId')).toBe(requests.getPkKey(added))
    expect(parentRequests.rows).toHaveLength(0)
    const direct = await open(ApplyPage, MY)
    const directRenderer = direct.wrapper.getComponent(SparkPageRenderer)
    const independent = directRenderer.props('pageRuntime')
    expect(direct.observed.size).toBe(1)
    expect(independent.instanceId).not.toBe(child.instanceId)
    expect(independent.resolveView(applyKey)?.rows).toEqual([])
    expect(directRenderer.getComponent(RendererTable).props('dataViewKey')).toBe(publishedKey)
    expect(independent.call.mainScenarioId).toBe(MY)
    expect(child.call.mainScenarioId).toBe(MY)
    expect(child.tool.pageId).toBe('apply-app-auth-page')
    expect(independent.materialize()).toEqual(child.materialize())
    expect(http.saves).toHaveLength(0)
  })

  it('内嵌于我的申请：只列别家已发布的应用，关键字按名称或描述匹配，提交只新增一行', async () => {
    const {wrapper} = await open(MyPage, MY)
    await click('申请应用授权')
    const child = outerApplyDialog(wrapper).getComponent(SparkPageRenderer).props('pageRuntime')
    const published = child.resolveView(publishedKey)
    const requests = child.resolveView(applyKey)
    if (!published || !requests) throw new Error('缺少申请工具的正式视图')
    expect(published.rows.map(row => row['rowid'])).toEqual(['APP-X', 'APP-Y', 'APP-Z'])
    await type('搜索应用名称', '资源')
    await click('查询', buttons('查询').length - 1)
    expect(published.rows.map(row => row['rowid'])).toEqual(['APP-Y'])
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
    expect(requests.rows).toEqual([])
    expect(document.body.textContent).not.toContain('应用：资源计划[erp]')
  })

  it('内嵌申请关闭外层后清掉未提交草稿，再打开仍能选择应用', async () => {
    const {wrapper} = await open(MyPage, MY)
    await click('申请应用授权')
    await click('申请')
    const outer = outerApplyDialog(wrapper)
    outer.getComponent(ElDialog).vm.$emit('update:modelValue', false)
    await settle()
    expect(http.saves).toHaveLength(0)
    await click('申请应用授权')
    expect(document.body.textContent).not.toContain('上一次申请尚未提交或取消')
    expect(buttons('申请').length).toBeGreaterThan(0)
    await click('申请')
    outerApplyDialog(wrapper).getComponent(ElDialog).vm.$emit('update:modelValue', false)
    await settle()
    expect(outerApplyDialog(wrapper).props('modelValue')).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('内嵌申请已写入而回执丢失，关闭外层再打开仍持有原批次，不能发起第二笔', async () => {
    const {wrapper, observed} = await open(MyPage, MY)
    await click('申请应用授权')
    const outer = outerApplyDialog(wrapper)
    const renderer = outer.getComponent(SparkPageRenderer)
    const original = renderer.props('pageRuntime')
    const view = original.resolveView(applyKey)
    const dataSet = original.getDataSet(APPLY)
    if (!view || !dataSet) throw new Error('缺少原申请运行视图')
    await click('申请')
    const originalId = renderer.getComponent(RendererForm).props('contextRowId')
    if (typeof originalId !== 'string' && typeof originalId !== 'number') throw new Error('缺少原申请行键')
    http.failAfterWrite = true
    await click('提交申请')
    const batchId = dataSet.saveJournal.batchId
    expect(batchId).toEqual(expect.any(String))
    expect(view.hasUnconfirmedSaveFor([originalId])).toBe(true)
    expect(http.saves).toHaveLength(1)
    outer.getComponent(ElDialog).vm.$emit('update:modelValue', false)
    await settle()
    expect(outerApplyDialog(wrapper).props('modelValue')).toBe(false)
    await click('申请应用授权')
    const reopened = outerApplyDialog(wrapper)
    expect(reopened.props('modelValue')).toBe(true)
    const current = reopened.getComponent(SparkPageRenderer).props('pageRuntime')
    expect(current).toBe(original)
    expect(observed.size).toBe(2)
    expect(current.resolveView(applyKey)).toBe(view)
    expect(current.getDataSet(APPLY)?.saveJournal.batchId).toBe(batchId)
    expect(view.hasUnconfirmedSaveFor([originalId])).toBe(true)
    expect(document.body.textContent).toContain('保存结果未知')
    expect(buttons('申请').filter(button => !button.disabled)).toHaveLength(0)
    expect(http.saves).toHaveLength(1)
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
  it.each([['auth_status', 'ACTIVE'], ['source_ent', 'OTHER'], ['request_type', 'GRANT'], ['hidden request_type', null]])('refuses to start a review with an invalid pending scope (%s)', async (field, value) => {
    const {runtime, rows} = await open(ReviewPage, REVIEW)
    expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual(['R1'])
    const original = http.records['enterprise_app_auth']!.find(row => row['id'] === 'R1')!
    if (value === null) http.hiddenFieldsById['enterprise_app_auth'] = {R1: ['request_type']}
    else original[field] = value

    await click('审核')

    const audit = runtime().resolveView(`${REVIEW}@enterprise_app_auth@audit`)!
    expect(audit.hasEditingChanges()).toBe(false)
    expect(audit.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(buttons('通过').filter(button => !button.disabled)).toHaveLength(0)
    expect(buttons('不通过').filter(button => !button.disabled)).toHaveLength(0)
    expect(document.body.textContent).toContain('待审范围')
    expect(http.saves).toHaveLength(0)
  })

  it('audits the original request with separately named main and company tables', async () => {
    const original = pagedataText[REVIEW]!
    const {enterprise_app_auth: requestRows, Base_Enterprise_Info: companyRows, ...other} = reviewRequests.tables
    pagedataText[REVIEW] = JSON.stringify({...reviewRequests, tables: {requestRows, companyRows, ...other}})
    try {
      const {wrapper, observed, runtime, rows} = await open(ReviewPage, REVIEW)
      const renderer = wrapper.getComponent(SparkPageRenderer)
      const current = runtime()
      expect(renderer.props('pageRuntime')).toBe(current)
      expect(current.call.scenarioIds).toEqual([REVIEW])
      const rule = SparkNodeTree.fromRuleJson(current.materialize().rule)
      expect(rule.findByType({type: 'r-table'}).total).toBe(1)
      expect(rule.findByType({type: 'r-dialog'}).total).toBe(1)
      expect(rule.findByType({type: 'r-form'}).total).toBe(2)
      const listKey = `${REVIEW}@enterprise_app_auth@default`
      const auditKey = `${REVIEW}@enterprise_app_auth@audit`
      const requests = current.getDataSet(REVIEW)
      const listView = current.resolveView(listKey)
      const auditView = current.resolveView(auditKey)
      expect(listView).toBeDefined()
      expect(auditView).toBeDefined()
      expect(listView).toBe(requests?.getView('requestRows', 'default'))
      expect(auditView).toBe(requests?.getView('requestRows', 'audit'))
      expect(auditView).not.toBe(listView)
      expect(renderer.getComponent(RendererTable).props('dataViewKey')).toBe(listKey)
      const companyView = runtime().resolveView(`${REVIEW}@Base_Enterprise_Info@byShortName`)
      expect(companyView?.tableName).toBe('companyRows')
      expect(companyView?.rows.some(row => row['ShortName'] === 'OTHER')).toBe(true)
      expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual(['R1'])
      await click('审核')
      expect(observed.size).toBe(1)
      const forms = renderer.getComponent(RendererDialog).findAllComponents(RendererForm)
      expect(forms.map(form => [form.props('dataViewKey'), form.props('contextRowId')]))
        .toEqual(expect.arrayContaining([[listKey, 'R1'], [auditKey, 'R1']]))
      expect(forms).toHaveLength(2)
      expect(auditView?.queryContext['recordId']).toBe('R1')
      expect(auditView?.queryContext['entShortName']).toBe('ME')
      const detailRequest = authReads().find(request => request.includes('"recordId"'))
      expect(detailRequest).toContain('{"Name":"recordId","Value":"R1"}')
      expect(detailRequest).toContain('{"Name":"entShortName","Value":"ME"}')
      expect(rows(auditKey)).toEqual(['R1'])
      expect(document.body.textContent).toContain('拒绝原因（不通过时填写）')
      await click('通过')
      expect(http.saves).toEqual([{table: 'enterprise_app_auth', added: [], deleted: [],
        changed: [expect.objectContaining({id: 'R1', auth_status: 'INITIALIZING'})]}])
      expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual([])
    } finally {
      pagedataText[REVIEW] = original
    }
  })

  it('常驻范围只列来源为本企业的待审批 REQUEST；通过只写 INITIALIZING 与操作人', async () => {
    const {wrapper, rows} = await open(ReviewPage, REVIEW)
    expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual(['R1'])
    const audit = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '审核')
    expect(typeof audit?.props('dataViewKey')).toBe('string')
    expect(audit?.props('dataViewKey')).toBe(`${REVIEW}@enterprise_app_auth@default`)
    for (const expected of ['他企业', '我的应用[mine]', '请批准']) expect(document.body.textContent).toContain(expected)
    await click('审核')
    expect(document.body.textContent).toContain('拒绝原因（不通过时填写）')
    await click('通过')
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]?.changed).toEqual([expect.objectContaining({id: 'R1', auth_status: 'INITIALIZING', operator: 'U1'})])
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1')?.['review_comment']).toBe('请批准')
    expect(rows(`${REVIEW}@enterprise_app_auth@default`)).toEqual([])
  })

  it('审核确认拒绝同键后继读取，关闭后可从新读取重新审核', async () => {
    const {runtime} = await open(ReviewPage, REVIEW)
    await click('审核')
    await type('可选，拒绝时将写入审批意见', '本次的拒绝原因')
    const list = runtime().resolveView(`${REVIEW}@enterprise_app_auth@default`)!
    expect((await list.requestRefresh({defer: false})).refreshStatus).toBe('read')
    await click('不通过')
    expect(http.saves).toHaveLength(0)
    expect(document.body.textContent).toContain('原查询身份或行已变化')
    await click('取消')
    await click('审核')
    await click('不通过')
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]?.changed).toEqual([expect.objectContaining({id: 'R1', auth_status: 'REJECTED'})])
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1')?.['review_comment']).toBe('请批准')
  })

  it('keeps a lost review receipt recoverable by its original key after the request leaves PENDING', async () => {
    const {runtime} = await open(ReviewPage, REVIEW)
    await click('审核')
    const audit = runtime().resolveView(`${REVIEW}@enterprise_app_auth@audit`)!
    const dataSet = audit.dataSet!
    http.failAfterWrite = true
    await click('不通过')
    expect(document.body.textContent).toContain('保存结果未知')
    expect(audit.hasUnconfirmedSaveFor(['R1'])).toBe(true)
    expect(buttons('不通过')[0]?.disabled).toBe(true)
    expect(http.saves).toHaveLength(1)
    expect(http.records['enterprise_app_auth']?.find(row => row['id'] === 'R1')?.['auth_status']).toBe('REJECTED')

    const batchId = dataSet.saveJournal.batchId
    if (!batchId) throw Error('缺少原审核批次')
    const recovered = await dataSet.verifySaveJournalAndRead({batchId, receiptViews: [audit], readbackViews: []})
    expect(recovered.settlement).toBe('confirmed')
    expect(audit.hasUnconfirmedSaveFor(['R1'])).toBe(false)
    expect(http.saves).toHaveLength(1)
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
