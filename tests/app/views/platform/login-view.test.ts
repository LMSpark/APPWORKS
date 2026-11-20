import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {createMemoryHistory, createRouter} from 'vue-router'
import {defineComponent, h} from 'vue'
import {readFileSync} from 'node:fs'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {LowcodeApiError, PlatformAuthResource} from '@spark-appworks/spark-lowcode-api'
import {FieldSelect, FieldText, PAGE_SERVICE, RendererButton, RendererDrawer, Spark, registerAllRenderers, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import LoginView from '@/views/platform/LoginView.vue'

const state = vi.hoisted(() => ({
  login: vi.fn(async (_credentials: unknown) => ({})),
  listEnterprises: vi.fn(async () => [{id: 'E1', name: '领码科技', shortName: 'lingma', shortCode: 'LM'}]),
  registerUser: vi.fn(async (_input: unknown) => ({})),
  registerEnterprise: vi.fn(async (_input: unknown) => ({})),
  sendVerificationCode: vi.fn(async (_request: unknown) => undefined),
  reload: vi.fn(async () => undefined),
  landing: vi.fn(async () => undefined),
  dataSets: new Set<DataSet>(),
}))

vi.mock('@/lowcode/data-space/lowcode-public-scenario', () => ({
  loadLowcodePublicScenario: async ({scenarioId, assertCurrent}: {scenarioId: string; assertCurrent: () => void}) => {
    const config: unknown = JSON.parse(readFileSync('config/pages/platform/login/pagedata.json', 'utf8'))
    if (typeof config !== 'object' || config === null || !('tables' in config)) throw Error('bad pagedata')
    const dataSet = DataSet.fromJson({scenarioId, tables: config.tables})
    state.dataSets.add(dataSet)
    const resource = new PlatformAuthResource({platform: state, assertCurrent})
    const view = (name: string) => {const found = dataSet.getView(name); if (!found) throw Error(name); return found}
    bindDataSetReadonlyCommandQuery(view('EnterpriseCatalog'), resource.enterpriseCatalog(view('EnterpriseCatalog')))
    bindDataSetCommandSubmit(view('LoginRequest'), resource.login(view('LoginRequest')))
    bindDataSetCommandSubmit(view('UserRegistrationRequest'), resource.userRegistration(view('UserRegistrationRequest')))
    bindDataSetCommandSubmit(view('EnterpriseRegistrationRequest'), resource.enterpriseRegistration(view('EnterpriseRegistrationRequest')))
    bindDataSetCommandSubmit(view('VerificationCodeRequest'), resource.verificationCode(view('VerificationCodeRequest')))
    return dataSet
  },
}))
vi.mock('@/services/project/project-shell', () => ({PROJECT_SWITCH_KEY: Symbol('project-switch'), reloadAndSyncNavigation: state.reload}))
vi.mock('@/services/project/enterprise-landing', () => ({enterEnterpriseLanding: state.landing}))

const wrappers: VueWrapper[] = []
beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  state.dataSets.clear()
  localStorage.clear(); sessionStorage.clear()
  vi.clearAllMocks(); vi.unstubAllGlobals()
})

async function open() {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: defineComponent({setup: () => () => h('div')})}]})
  const pageService: PageServiceCapability = {
    copyText: async () => {},
    showMessage: () => {},
    showConfirm: async () => true,
    showPrompt: async () => null,
    showAlert: async () => {},
    showDialog: async () => 'cancel',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => { throw new Error('login fixture must not upload') },
    showLoading: () => {},
    navigate: () => {},
  }
  const Host = defineComponent({
    setup() {
      const {sparkProvide} = useSparkComponent({type: 'login-view-test-host'})
      sparkProvide(PAGE_SERVICE, pageService)
      return () => h(LoginView)
    },
  })
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin(), router]}})
  wrappers.push(wrapper)
  await flushPromises()
  const input = (placeholder: string, scope: ParentNode = document.body) => {
    const found = scope.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)
    if (!found) throw new Error(`输入框不存在: ${placeholder}`)
    return found
  }
  const type = async (placeholder: string, value: string, scopeSelector?: string) => {
    const scope = scopeSelector ? document.body.querySelector(scopeSelector) : document.body
    if (!scope) throw new Error(`区域不存在: ${scopeSelector}`)
    const target = input(placeholder, scope); target.value = value
    target.dispatchEvent(new Event('input')); target.dispatchEvent(new Event('change'))
    await flushPromises()
  }
  const click = async (label: string, drawerTitle?: string) => {
    const host = drawerTitle ? wrapper.findAllComponents(RendererDrawer).find(item => item.props('title') === drawerTitle) : wrapper
    if (!host) throw new Error(`抽屉不存在: ${drawerTitle}`)
    const found = host.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!found) throw new Error(`按钮不存在: ${label}`)
    await found.get('button').trigger('click')
    await flushPromises()
  }
  return {wrapper, input, type, click}
}

describe('LoginView on the public login scenario', () => {
  it('signs in through the login command, remembers the enterprise, and enters the landing', async () => {
    localStorage.setItem('spark_login_enterprise', 'lingma')
    const f = await open()
    expect(f.wrapper.findComponent(FieldSelect).props('optionDataViewKey')).toContain('EnterpriseCatalog')
    await f.type('登录账号', 'alice')
    await f.type('密码', 'secret1')
    await f.click('登 录')
    expect(state.login).toHaveBeenCalledWith({enterpriseName: 'lingma', account: 'alice', password: 'secret1'})
    expect(state.reload).toHaveBeenCalledOnce()
    expect(state.landing).toHaveBeenCalledOnce()
    expect(localStorage.getItem('spark_login_enterprise')).toBe('lingma')
  })

  it('shows an explicit rejection, reopens a fresh login command with the same account, and retries', async () => {
    localStorage.setItem('spark_login_enterprise', 'lingma')
    state.login.mockRejectedValueOnce(new LowcodeApiError(401, '账号或密码错误'))
    const f = await open()
    await f.type('登录账号', 'alice')
    await f.type('密码', 'bad')
    await f.click('登 录')
    expect(f.wrapper.get('[role="alert"]').text()).toContain('账号或密码错误')
    expect(state.reload).not.toHaveBeenCalled()
    expect(f.input('登录账号').value).toBe('alice')
    expect(f.input('密码').value).toBe('')
    const [dataSet] = state.dataSets
    expect(dataSet?.getView('LoginRequest')?.rows).toHaveLength(1)
    await f.type('密码', 'secret1')
    await f.click('登 录')
    expect(state.login).toHaveBeenLastCalledWith({enterpriseName: 'lingma', account: 'alice', password: 'secret1'})
    expect(state.landing).toHaveBeenCalledOnce()
  })

  it('falls back to a text input when the enterprise directory is unavailable', async () => {
    state.listEnterprises.mockRejectedValueOnce(new Error('目录不可达'))
    const f = await open()
    expect(f.wrapper.text()).toContain('企业目录暂不可用')
    expect(f.wrapper.findComponent(FieldSelect).exists()).toBe(false)
    expect(f.input('企业英文简称')).toBeTruthy()
  })

  it('opens registration in a drawer from the home-page request and keeps the login card single-purpose', async () => {
    sessionStorage.setItem('spark_login_tab', 'register')
    const f = await open()
    expect(sessionStorage.getItem('spark_login_tab')).toBeNull()
    const drawers = f.wrapper.findAllComponents(RendererDrawer)
    expect(drawers).toHaveLength(1)
    expect(drawers[0]?.props('title')).toBe('注册账号')
    expect(f.wrapper.findAllComponents(FieldText).filter(item => item.element.closest('.login-card')).map(item => item.props('field'))).toEqual(['account', 'password'])
    await f.click('注册租户')
    expect(f.wrapper.findAllComponents(RendererDrawer).map(item => item.props('title'))).toEqual(['注册账号', '注册租户'])
  })

  it('registers a user from the drawer, sends a code through the command view, and signs in', async () => {
    const f = await open()
    await f.click('注册账号')
    const drawer = '.el-drawer'
    await f.type('企业英文简称', 'lingma', drawer)
    await f.type('登录账号', 'bob', drawer)
    await f.type('显示名称', 'Bob', drawer)
    await f.type('验证邮箱', 'b@example.com', drawer)
    await f.click('发送验证码')
    expect(state.sendVerificationCode).toHaveBeenCalledWith({enterpriseName: 'lingma', channel: 'EMAIL', account: 'b@example.com', scene: 'REGISTER'})
    await f.type('验证码', '123456', drawer)
    await f.type('至少 6 位', 'secret1', drawer)
    await f.type('再次输入密码', 'secret1', drawer)
    await f.click('注册')
    expect(state.registerUser).toHaveBeenCalledWith(expect.objectContaining({enterpriseName: 'lingma', account: 'bob', email: 'b@example.com'}))
    expect(state.login).toHaveBeenCalledWith({enterpriseName: 'lingma', account: 'bob', password: 'secret1'})
    expect(state.landing).toHaveBeenCalledOnce()
    expect(f.wrapper.findAllComponents(RendererDrawer)).toHaveLength(0)
  })

  it('keeps the tenant drawer open after an explicit rejection with the non-secret inputs and an empty password', async () => {
    state.registerEnterprise.mockRejectedValueOnce(new LowcodeApiError(400, '验证码错误'))
    const f = await open()
    await f.click('注册租户')
    const drawer = '.el-drawer'
    await f.type('如 NewApp', 'NewApp', drawer)
    await f.type('企业英文名称', 'New App', drawer)
    await f.type('企业中文名称', '新应用', drawer)
    await f.type('企业中文简称', '新应用', drawer)
    await f.type('至少 6 位', 'secret1', drawer)
    await f.type('管理员手机号', '13800000000', drawer)
    await f.type('验证码', '000000', drawer)
    await f.click('注册租户', '注册租户')
    expect(state.registerEnterprise).toHaveBeenCalledOnce()
    expect(state.login).not.toHaveBeenCalled()
    const scope = document.body.querySelector(drawer) ?? document.body
    expect(scope.querySelector('[role="alert"]')?.textContent).toContain('验证码错误')
    expect(f.input('如 NewApp', scope).value).toBe('NewApp')
    expect(f.input('管理员手机号', scope).value).toBe('13800000000')
    expect(f.input('至少 6 位', scope).value).toBe('')
    const [dataSet] = state.dataSets
    expect(dataSet?.getView('EnterpriseRegistrationRequest')?.rows).toHaveLength(1)
  })
})
