<!--
@module app:views/platform/LoginView
职责：提供主应用 LoginView 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/platform/LoginView。
-->
<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">SPARK 应用工场</h1>
      <p class="login-subtitle">配置驱动，快速配系统</p>

      <el-tabs v-model="activeTab" class="login-tabs">
        <!-- ── 登录 ── -->
        <el-tab-pane label="登录" name="login">
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            label-width="0"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="enterpriseName">
              <el-select
                v-model="loginForm.enterpriseName"
                :loading="enterpriseLoading"
                filterable
                allow-create
                default-first-option
                placeholder="选择企业"
                style="width: 100%"
              >
                <el-option
                  v-for="enterprise in enterprises"
                  :key="enterprise.id"
                  :label="enterprise.name"
                  :value="enterprise.shortName"
                />
              </el-select>
            </el-form-item>
            <el-form-item prop="account">
              <el-input v-model="loginForm.account" placeholder="登录账号">
                <template #prefix><el-icon><User /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input v-model="loginForm.password" type="password" show-password placeholder="密码" @keyup.enter="handleLogin">
                <template #prefix><el-icon><Lock /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleLogin">登 录</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ── 注册用户 ── -->
        <el-tab-pane label="注册" name="register">
          <el-form
            ref="regFormRef"
            :model="regForm"
            :rules="regRules"
            label-width="0"
            @submit.prevent="handleRegister"
          >
            <el-form-item prop="enterpriseName">
              <el-input v-model="regForm.enterpriseName" placeholder="企业英文简称">
                <template #prefix><el-icon><OfficeBuilding /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="account">
              <el-input v-model="regForm.account" placeholder="登录账号">
                <template #prefix><el-icon><User /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="displayName">
              <el-input v-model="regForm.displayName" placeholder="显示名称（选填）">
                <template #prefix><el-icon><Edit /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="sex">
              <el-select v-model="regForm.sex" style="width: 100%" placeholder="性别">
                <el-option label="女" value="F" />
                <el-option label="男" value="M" />
              </el-select>
            </el-form-item>
            <el-form-item prop="channel">
              <el-select v-model="regForm.channel" style="width: 100%" placeholder="验证方式">
                <el-option label="邮箱" value="EMAIL" />
                <el-option label="手机号" value="MOBILE" />
              </el-select>
            </el-form-item>
            <el-form-item prop="contact">
              <el-input v-model="regForm.contact" :placeholder="regForm.channel === 'EMAIL' ? '验证邮箱' : '验证手机号'">
                <template #prefix><el-icon><Message /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="verificationCode">
              <el-input v-model="regForm.verificationCode" placeholder="验证码">
                <template #append><el-button @click="sendUserCode">发送验证码</el-button></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input v-model="regForm.password" type="password" show-password placeholder="密码">
                <template #prefix><el-icon><Lock /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="confirmPassword">
              <el-input v-model="regForm.confirmPassword" type="password" show-password placeholder="确认密码" @keyup.enter="handleRegister">
                <template #prefix><el-icon><Lock /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleRegister">注 册</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ── 注册租户 ── -->
        <el-tab-pane label="注册租户" name="register-tenant">
          <el-form
            ref="tenantFormRef"
            :model="tenantForm"
            :rules="tenantRules"
            label-width="0"
            @submit.prevent="handleRegisterTenant"
          >
            <el-form-item prop="domainKey">
              <el-input v-model="tenantForm.domainKey" placeholder="四级域名标识（如 NewApp）">
                <template #prefix><el-icon><Postcard /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="englishName">
              <el-input v-model="tenantForm.englishName" placeholder="企业英文名称">
                <template #prefix><el-icon><OfficeBuilding /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="chineseName">
              <el-input v-model="tenantForm.chineseName" placeholder="企业中文名称" />
            </el-form-item>
            <el-form-item prop="chineseShortName">
              <el-input v-model="tenantForm.chineseShortName" placeholder="企业中文简称" />
            </el-form-item>
            <el-form-item prop="administratorAccount">
              <el-input v-model="tenantForm.administratorAccount" placeholder="管理员账号">
                <template #prefix><el-icon><User /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="administratorPassword">
              <el-input v-model="tenantForm.administratorPassword" type="password" show-password placeholder="管理员密码">
                <template #prefix><el-icon><Lock /></el-icon></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="channel">
              <el-select v-model="tenantForm.channel" style="width: 100%" placeholder="验证方式">
                <el-option label="邮箱" value="EMAIL" />
                <el-option label="手机号" value="MOBILE" />
              </el-select>
            </el-form-item>
            <el-form-item prop="verificationAccount">
              <el-input v-model="tenantForm.verificationAccount" :placeholder="tenantForm.channel === 'EMAIL' ? '管理员邮箱' : '管理员手机号'" />
            </el-form-item>
            <el-form-item prop="verificationCode">
              <el-input v-model="tenantForm.verificationCode" placeholder="验证码" @keyup.enter="handleRegisterTenant">
                <template #append><el-button @click="sendEnterpriseCode">发送验证码</el-button></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleRegisterTenant">注册租户</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 多租户登录页面，提供用户名/密码认证和租户选择入口；属于平台路由页，不允许作为 SparkNode 组件配置生成。
 */
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import { buildTenantPath } from '@/services/tenant-scope'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, User, Lock, Edit, Message, Postcard } from '@element-plus/icons-vue'
import type {
  LowcodeEnterpriseCatalogItem,
  LowcodeEnterpriseRegistration,
  LowcodeUserRegistration,
} from '@spark-appworks/spark-lowcode-api'

const router = useRouter()
const savedTab = sessionStorage.getItem('spark_login_tab')
const activeTab = ref(savedTab ?? 'login')
if (savedTab) sessionStorage.removeItem('spark_login_tab')
const loading = ref(false)
const errorMsg = ref('')
const enterpriseLoading = ref(false)
const enterprises = ref<readonly LowcodeEnterpriseCatalogItem[]>([])

async function loadEnterprises(): Promise<void> {
  enterpriseLoading.value = true
  try {
    enterprises.value = await lowcodeApi.platform.listEnterprises()
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '企业列表加载失败')
  } finally {
    enterpriseLoading.value = false
  }
}

onMounted(loadEnterprises)

function goHome() {
  void router.replace('/')
}

function getUserHomePath(enterpriseName: string): string {
  return buildTenantPath({ tenantId: enterpriseName, projectId: 'homepage' }, '/app-list')
}

// ── 登录表单 ────────────────────────────────────────────────────────────────

const loginForm = reactive({ enterpriseName: '', account: '', password: '' })
const loginFormRef = ref<FormInstance>()
const loginRules: FormRules = {
  enterpriseName: [{ required: true, message: '请输入企业英文简称', trigger: 'blur' }],
  account: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    const session = await lowcodeApi.platform.login(loginForm)
    await reloadAndSyncNavigation()
    await router.replace(getUserHomePath(session.enterprise.shortName))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

// ── 注册表单 ────────────────────────────────────────────────────────────────

type UserRegistrationForm = Pick<
  LowcodeUserRegistration,
  'enterpriseName' | 'account' | 'displayName' | 'password' | 'sex' | 'channel' | 'verificationCode'
> & {
  confirmPassword: string
  contact: string
}

const regForm = reactive<UserRegistrationForm>({
  enterpriseName: '',
  account: '',
  password: '',
  confirmPassword: '',
  displayName: '',
  sex: 'F',
  channel: 'EMAIL',
  contact: '',
  verificationCode: '',
})
const regFormRef = ref<FormInstance>()
const regRules: FormRules = {
  enterpriseName: [{ required: true, message: '请输入企业英文简称', trigger: 'blur' }],
  account: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入用户名称', trigger: 'blur' }],
  contact: [{ required: true, message: '请输入验证账号', trigger: 'blur' }],
  verificationCode: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '密码至少 6 位', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== regForm.password) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

async function handleRegister() {
  const valid = await regFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    await lowcodeApi.platform.registerUser({
      enterpriseName: regForm.enterpriseName,
      account: regForm.account,
      displayName: regForm.displayName,
      password: regForm.password,
      sex: regForm.sex,
      channel: regForm.channel,
      phone: regForm.channel === 'MOBILE' ? regForm.contact : '',
      email: regForm.channel === 'EMAIL' ? regForm.contact : '',
      verificationCode: regForm.verificationCode,
    })
    const session = await lowcodeApi.platform.login({
      enterpriseName: regForm.enterpriseName,
      account: regForm.account,
      password: regForm.password,
    })
    await reloadAndSyncNavigation()
    await router.replace(getUserHomePath(session.enterprise.shortName))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}

// ── 注册租户表单 ────────────────────────────────────────────────────────────

async function sendUserCode(): Promise<void> {
  await lowcodeApi.platform.sendVerificationCode({
    enterpriseName: regForm.enterpriseName,
    channel: regForm.channel,
    account: regForm.contact,
    scene: 'REGISTER',
  })
  ElMessage.success('验证码已发送')
}

type EnterpriseRegistrationForm = Omit<LowcodeEnterpriseRegistration, 'phone' | 'email'>

const tenantForm = reactive<EnterpriseRegistrationForm>({
  domainKey: '',
  englishName: '',
  chineseName: '',
  chineseShortName: '',
  administratorAccount: 'admin',
  administratorPassword: '',
  channel: 'MOBILE',
  verificationAccount: '',
  verificationCode: '',
})
const tenantFormRef = ref<FormInstance>()
const tenantRules: FormRules = {
  domainKey: [
    { required: true, message: '请输入四级域名标识', trigger: 'blur' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/, message: '以字母开头，3-32 个字母/数字/_/-', trigger: 'blur' },
  ],
  englishName: [{ required: true, message: '请输入企业英文名称', trigger: 'blur' }],
  chineseName: [{ required: true, message: '请输入企业中文名称', trigger: 'blur' }],
  chineseShortName: [{ required: true, message: '请输入企业中文简称', trigger: 'blur' }],
  administratorAccount: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  administratorPassword: [{ required: true, message: '请输入管理员密码', trigger: 'blur' }, { min: 6, message: '密码至少 6 位', trigger: 'blur' }],
  verificationAccount: [{ required: true, message: '请输入验证账号', trigger: 'blur' }],
  verificationCode: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
}

async function sendEnterpriseCode(): Promise<void> {
  await lowcodeApi.platform.sendVerificationCode({
    enterpriseName: tenantForm.domainKey,
    channel: tenantForm.channel,
    account: tenantForm.verificationAccount,
    scene: 'REGISTER_ENT',
  })
  ElMessage.success('验证码已发送')
}

async function handleRegisterTenant() {
  const valid = await tenantFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    await lowcodeApi.platform.registerEnterprise({
      ...tenantForm,
      phone: tenantForm.channel === 'MOBILE' ? tenantForm.verificationAccount : '',
      email: tenantForm.channel === 'EMAIL' ? tenantForm.verificationAccount : '',
    })
    const session = await lowcodeApi.platform.login({
      enterpriseName: tenantForm.domainKey,
      account: tenantForm.administratorAccount,
      password: tenantForm.administratorPassword,
    })
    await reloadAndSyncNavigation()
    await router.replace(getUserHomePath(session.enterprise.shortName))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '租户注册失败'
  } finally {
    loading.value = false
  }
}
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

.login-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.login-btn {
  width: 100%;
  height: 42px;
  font-size: 16px;
}

.btn-group {
  display: flex;
  gap: 12px;
  width: 100%;
}

.btn-group .login-btn {
  flex: 1;
}

.cancel-btn {
  height: 42px;
  font-size: 16px;
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

.input-icon {
  font-size: 14px;
  line-height: 1;
}

/* 暗黑模式 */
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
