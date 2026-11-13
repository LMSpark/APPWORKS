<!--
@module app:views/platform/LoginView
职责：登录页宿主：装配登录公开场景的独立运行实例并提供给子组件；登录卡片只承载登录，注册账号与注册租户分层到右侧抽屉。
边界：认证经公开场景的命令视图提交，本页只新增命令行、读取回执并进入企业落点；不直接调用认证接口，不保存凭据。
AI用途：需要理解未登录时如何经 SPARK data 命令视图登录、注册时，用本模块定位宿主编排。
-->
<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">SPARK 应用工场</h1>
      <p class="login-subtitle">配置驱动，快速配系统</p>
      <p v-if="loadError" class="login-error" role="alert">{{ loadError }}</p>
      <p v-else-if="!ready" class="login-status" role="status">正在准备登录…</p>
      <template v-else>
        <p v-if="catalogError" class="login-status" role="status">企业目录暂不可用（{{ catalogError }}），请直接输入企业英文简称。</p>
        <LoginForm v-if="loginId !== undefined" :key="loginId" :data-view-key="keys.login" :record-id="loginId" :rejection="loginRejection"
          v-bind="catalogError ? {} : {catalogKey: keys.catalog}" :disabled="entering" @finish="finishLogin" @rejected="rejectLogin" @leave="goHome" />
        <div class="login-links">
          <RendererButton label="注册账号" :link="true" button-type="primary" :disabled="entering || userId !== undefined" @click="openUserRegistration" />
          <RendererButton label="注册租户" :link="true" button-type="primary" :disabled="entering || tenantId !== undefined" @click="openTenantRegistration" />
        </div>
      </template>
    </div>
    <UserRegistrationDrawer v-if="userId !== undefined" :key="userId" :data-view-key="keys.user" :record-id="userId" :rejection="userRejection"
      :code-data-view-key="keys.code" @finish="result => finishRegistration('user', result)" @rejected="rejectUserRegistration" />
    <TenantRegistrationDrawer v-if="tenantId !== undefined" :key="tenantId" :data-view-key="keys.tenant" :record-id="tenantId" :rejection="tenantRejection"
      :code-data-view-key="keys.code" @finish="result => finishRegistration('tenant', result)" @rejected="rejectTenantRegistration" />
  </div>
</template>

<script setup lang="ts">
import {inject, onBeforeUnmount, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, useSparkComponent, type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import {getPublicScenarioResource} from '@/registries/system-scenario-registry'
import {loadLowcodePublicScenario} from '@/lowcode/data-space/lowcode-public-scenario'
import {PROJECT_SWITCH_KEY, reloadAndSyncNavigation} from '@/services/project/project-shell'
import {enterEnterpriseLanding} from '@/services/project/enterprise-landing'
import LoginForm from './login/login-form.vue'
import UserRegistrationDrawer from './login/user-registration-drawer.vue'
import TenantRegistrationDrawer from './login/tenant-registration-drawer.vue'

/** 本浏览器记住的上次登录企业英文简称；非凭据。 */
const ENTERPRISE_KEY = 'spark_login_enterprise'
/** 首页经此键请求打开注册抽屉（register / register-tenant），读取后即清除。 */
const LOGIN_TAB_KEY = 'spark_login_tab'
const scenarioId = getPublicScenarioResource('platformLogin').scenarioId
const tables = {catalog: 'EnterpriseCatalog', login: 'LoginRequest', user: 'UserRegistrationRequest',
  tenant: 'EnterpriseRegistrationRequest', code: 'VerificationCodeRequest'} as const
const keys = {catalog: buildDataViewKey(tables.catalog, 'default', scenarioId), login: buildDataViewKey(tables.login, 'default', scenarioId),
  user: buildDataViewKey(tables.user, 'default', scenarioId), tenant: buildDataViewKey(tables.tenant, 'default', scenarioId),
  code: buildDataViewKey(tables.code, 'default', scenarioId)}

const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY, null)
const requestedTab = sessionStorage.getItem(LOGIN_TAB_KEY)
if (requestedTab) sessionStorage.removeItem(LOGIN_TAB_KEY)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'platform-login-page'})
const session = new NativePageRuntimeSession({provide: () => undefined, remove: () => sparkRemove(PAGE_RUNTIME)})
const ready = ref(false), loadError = ref(''), catalogError = ref(''), entering = ref(false)
const loginId = ref<string | number>(), userId = ref<string | number>(), tenantId = ref<string | number>()
const loginRejection = ref(''), userRejection = ref(''), tenantRejection = ref('')
let active = true

function assertCurrent(): void {
  if (!active) throw new Error('PLATFORM_LOGIN_STALE: 登录页已关闭')
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function view(table: string): DataView {
  const found = session.runtime?.getDataSet(scenarioId)?.getView(table, 'default')
  if (!found) throw new Error(`登录场景缺少 ${table} 视图`)
  return found
}

function receipt(table: string, id: string | number | undefined): Readonly<DataRow> | undefined {
  if (id === undefined) return undefined
  const target = view(table)
  return target.rows.find(row => target.getPkKey(row) === id)
}

function text(row: Readonly<DataRow> | undefined, field: string): string {
  const value = row?.[field]
  return typeof value === 'string' ? value : ''
}

async function addCommand(table: string, initial: DataRow): Promise<string | number> {
  const target = view(table)
  const row = await target.addRow(initial)
  assertCurrent()
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error(`${table} 命令未生成记录身份`)
  target.setCurrentRow(row)
  return id
}

/** 明确失败后原编辑身份已失效：放弃原待提交命令行，以保留的非凭据输入开新行；密码类字段须重新输入。 */
async function reopenCommand(table: string, id: string | number, kept: readonly string[]): Promise<string | number> {
  const target = view(table)
  const stale = receipt(table, id)
  const initial: DataRow = {}
  for (const field of kept) initial[field] = text(stale, field)
  target.discardPendingChanges([id])
  return addCommand(table, initial)
}

async function openLogin(initial: Readonly<{enterpriseName: string; account: string}>): Promise<void> {
  loginRejection.value = ''
  loginId.value = await addCommand(tables.login, {...initial, password: ''})
}

async function rejectLogin(reason: string): Promise<void> {
  const id = loginId.value
  if (!active || id === undefined) return
  try {
    loginId.value = await reopenCommand(tables.login, id, ['enterpriseName', 'account'])
    loginRejection.value = reason
  } catch (cause) {if (active) ElMessage.error(message(cause))}
}

async function rejectUserRegistration(reason: string): Promise<void> {
  const id = userId.value
  if (!active || id === undefined) return
  try {
    userId.value = await reopenCommand(tables.user, id, ['enterpriseName', 'account', 'displayName', 'sex', 'channel', 'contact', 'verificationCode'])
    userRejection.value = reason
  } catch (cause) {if (active) ElMessage.error(message(cause))}
}

async function rejectTenantRegistration(reason: string): Promise<void> {
  const id = tenantId.value
  if (!active || id === undefined) return
  try {
    tenantId.value = await reopenCommand(tables.tenant, id,
      ['domainKey', 'englishName', 'chineseName', 'chineseShortName', 'administratorAccount', 'channel', 'verificationAccount', 'verificationCode'])
    tenantRejection.value = reason
  } catch (cause) {if (active) ElMessage.error(message(cause))}
}

async function load(): Promise<void> {
  try {
    const current = session.acquire({pageId: 'platform-login', scenarioIds: [scenarioId],
      loadScenario: id => loadLowcodePublicScenario({name: 'platformLogin', scenarioId: id, assertCurrent})})
    await current.load()
    assertCurrent()
    await Promise.all([tables.login, tables.user, tables.tenant, tables.code].map(name => view(name).refresh()))
    assertCurrent()
    const catalog = view(tables.catalog)
    try {
      await catalog.refresh()
      if (catalog.loadingError) throw catalog.loadingError
    } catch (cause) {catalogError.value = message(cause)}
    assertCurrent()
    sparkProvide(PAGE_RUNTIME, current)
    await openLogin({enterpriseName: localStorage.getItem(ENTERPRISE_KEY) ?? '', account: ''})
    ready.value = true
    if (requestedTab === 'register') await openUserRegistration()
    else if (requestedTab === 'register-tenant') await openTenantRegistration()
  } catch (cause) {
    if (active) loadError.value = message(cause)
  }
}

async function enter(identity: Readonly<{enterpriseName: string; account: string}>): Promise<void> {
  entering.value = true
  try {
    localStorage.setItem(ENTERPRISE_KEY, identity.enterpriseName)
    await reloadAndSyncNavigation()
    await enterEnterpriseLanding({router, projectSwitch})
  } catch (cause) {
    // 应用范围切换会卸载本页，失败只能经全局提示呈现，不得因本页已关闭而吞掉。
    ElMessage.error(message(cause))
    if (active) await openLogin(identity)
  } finally {
    if (active) entering.value = false
  }
}

async function finishLogin(result: DataViewRecordEditingFinish): Promise<void> {
  if (!active || result !== 'saved') return
  const row = receipt(tables.login, loginId.value)
  const identity = {enterpriseName: text(row, 'enterpriseName'), account: text(row, 'account')}
  if (text(row, 'outcome') !== 'signed-in' || !identity.enterpriseName) {
    ElMessage.error('登录已返回，但回执不可读；请重新登录')
    await openLogin(identity)
    return
  }
  await enter(identity)
}

async function openUserRegistration(): Promise<void> {
  if (userId.value !== undefined || entering.value) return
  try {
    userRejection.value = ''
    userId.value = await addCommand(tables.user, {enterpriseName: localStorage.getItem(ENTERPRISE_KEY) ?? '', account: '', displayName: '',
      sex: 'F', channel: 'EMAIL', contact: '', verificationCode: '', password: '', confirmPassword: ''})
  } catch (cause) {if (active) ElMessage.error(message(cause))}
}

async function openTenantRegistration(): Promise<void> {
  if (tenantId.value !== undefined || entering.value) return
  try {
    tenantRejection.value = ''
    tenantId.value = await addCommand(tables.tenant, {domainKey: '', englishName: '', chineseName: '', chineseShortName: '',
      administratorAccount: 'admin', administratorPassword: '', channel: 'MOBILE', verificationAccount: '', verificationCode: ''})
  } catch (cause) {if (active) ElMessage.error(message(cause))}
}

async function finishRegistration(kind: 'user' | 'tenant', result: DataViewRecordEditingFinish): Promise<void> {
  const id = kind === 'user' ? userId.value : tenantId.value
  if (kind === 'user') userId.value = undefined
  else tenantId.value = undefined
  if (!active || result !== 'saved') return
  const row = receipt(kind === 'user' ? tables.user : tables.tenant, id)
  const identity = kind === 'user'
    ? {enterpriseName: text(row, 'enterpriseName'), account: text(row, 'account')}
    : {enterpriseName: text(row, 'domainKey'), account: text(row, 'administratorAccount')}
  const outcome = text(row, 'outcome')
  if (outcome === 'signed-in') {await enter(identity); return}
  if (outcome === 'registered') {
    ElMessage.success({message: `注册成功，暂未能自动登录：${text(row, 'message')}`, duration: 8000})
    return
  }
  ElMessage.error('注册已返回，但回执不可读；请稍后直接登录确认')
}

function goHome(): void {
  void router.replace('/')
}

onMounted(load)
onBeforeUnmount(() => {active = false; session.dispose()})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 420px;
  padding: 40px 36px 28px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-title {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 4px;
}

.login-subtitle {
  text-align: center;
  font-size: 14px;
  color: #909399;
  margin: 0 0 24px;
}

.login-status {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}

.login-links {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}

.login-error {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 13px;
  text-align: center;
}

html.dark .login-page {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

html.dark .login-card {
  background: #1d1e1f;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

html.dark .login-title {
  color: #e5eaf3;
}
</style>
