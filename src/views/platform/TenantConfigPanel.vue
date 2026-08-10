<!--
@module app:views/platform/TenantConfigPanel
职责：提供主应用 TenantConfigPanel 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/platform/TenantConfigPanel。
-->
<template>
  <div class="tenant-config-panel">
    <el-skeleton v-if="loading" :rows="8" animated />

    <el-alert
      v-else-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
    />

    <template v-else-if="fullConfig">
      <section class="config-section">
        <div class="section-heading">
          <div>
            <h3>企业配置</h3>
            <p>{{ props.tenantId }}</p>
          </div>
          <el-button :icon="Refresh" :loading="loading" @click="loadConfig">刷新</el-button>
        </div>

        <el-form :model="form" label-width="92px" class="config-form">
          <el-form-item label="企业名称">
            <el-input v-model="form.tenantName" placeholder="租户显示名称" />
          </el-form-item>
          <el-form-item label="域名标识">
            <el-input v-model="form.tenantCode" placeholder="四级域名技术标识" />
          </el-form-item>
          <el-form-item label="Logo">
            <el-input v-model="form.logo" placeholder="Logo URL" />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="主题色">
              <el-color-picker v-model="form.primaryColor" show-alpha />
              <span class="color-value">{{ form.primaryColor || '未设置' }}</span>
            </el-form-item>
            <el-form-item label="圆角">
              <el-input v-model="form.borderRadius" placeholder="4px" />
            </el-form-item>
          </div>
          <el-form-item label="首页路径">
            <el-input v-model="form.homePath" placeholder="/ 或 /dashboard" />
          </el-form-item>
          <el-form-item label="日志级别">
            <el-select v-model="form.logLevel" placeholder="选择日志级别">
              <el-option label="debug" value="debug" />
              <el-option label="info" value="info" />
              <el-option label="warn" value="warn" />
              <el-option label="error" value="error" />
            </el-select>
          </el-form-item>
          <el-alert
            title="当前只读自 lowcode 企业接口；写入需满足治理门禁后启用"
            type="info"
            :closable="false"
            show-icon
          />
          <div class="form-actions">
            <el-button type="primary" :loading="saving" @click="saveBasicConfig">保存基础配置</el-button>
          </div>
        </el-form>
      </section>

      <section class="config-section">
        <h3>当前租户信息</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="企业作用域">
            <el-tag>{{ tenantInfo?.tenantId ?? props.tenantId }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="租户名称">
            {{ tenantInfo?.tenantName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="四级域名标识">
            {{ tenantInfo?.tenantCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="tenantInfo?.status === 'ACTIVE' ? 'success' : 'warning'">
              {{ tenantInfo?.status || '-' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="主题色">
            <span class="color-chip" :style="{ backgroundColor: theme.primaryColor || '#dcdfe6' }" />
            {{ theme.primaryColor || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="圆角">
            {{ theme.borderRadius || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="config-section">
        <h3>应用配置</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="API 地址">
            {{ appConfig.apiBaseUrl || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="首页路径">
            {{ pageNode.homePath || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="日志级别">
            <el-tag :type="logLevelTagType">{{ appConfig.logLevel || '-' }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="config-section">
        <h3>功能开关</h3>
        <div v-if="featureEntries.length > 0" class="feature-list">
          <el-tag
            v-for="[feature, enabled] in featureEntries"
            :key="feature"
            :type="enabled === true ? 'success' : 'info'"
            size="large"
          >
            {{ featureName(feature) }}: {{ enabled === true ? '启用' : '禁用' }}
          </el-tag>
        </div>
        <el-empty v-else description="暂无功能开关" :image-size="72" />
      </section>

      <section class="config-section">
        <div class="section-heading">
          <div>
            <h3>完整配置 JSON</h3>
            <p>来自登录响应 entinfo；密码与敏感字段已从公共 API 投影中排除</p>
          </div>
          <div class="section-actions">
            <el-button :icon="DocumentCopy" @click="copyJson">复制</el-button>
            <el-button type="primary" :loading="savingJson" @click="saveFullConfig">保存 JSON</el-button>
          </div>
        </div>
        <el-input
          v-model="jsonDraft"
          type="textarea"
          :rows="18"
          resize="vertical"
          spellcheck="false"
          class="config-json-editor"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy, Refresh } from '@element-plus/icons-vue'
import { isRecord } from '@spark-appworks/spark-utils'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

type TenantInfo = {
  tenantId: string
  tenantName?: string
  tenantCode?: string
  status?: string
  deletedAt?: string | null
  logo?: string
  theme?: {
    primaryColor?: string
    borderRadius?: string
    [key: string]: unknown
  }}

type TenantFullConfig = {
  tenant?: TenantInfo
  config?: {
    apiBaseUrl?: string
    logLevel?: string
    version?: string
    enableMock?: boolean
    features?: Record<string, unknown>
  }
  pageNode?: {
    apiBaseUrl?: string
    homePath?: string
  }
  enterprise?: unknown
  [key: string]: unknown}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value)
}

function isTenantFullConfig(value: unknown): value is TenantFullConfig {
  return isRecord(value)
    && isOptionalRecord(value['tenant'])
    && isOptionalRecord(value['config'])
    && isOptionalRecord(value['pageNode'])
}

const props = defineProps<{
  tenantId: string
}>()

const loading = ref(false)
const saving = ref(false)
const savingJson = ref(false)
const loadError = ref('')
const fullConfig = ref<TenantFullConfig | null>(null)
const jsonDraft = ref('')
const form = reactive({
  tenantName: '',
  tenantCode: '',
  logo: '',
  primaryColor: '',
  borderRadius: '',
  homePath: '',
  logLevel: '',
})

const tenantInfo = computed(() => fullConfig.value?.tenant)
const appConfig = computed(() => fullConfig.value?.config ?? {})
const pageNode = computed(() => fullConfig.value?.pageNode ?? {})
const theme = computed(() => tenantInfo.value?.theme ?? {})
const featureEntries = computed(() => Object.entries(appConfig.value.features ?? {}))
const fullConfigJson = computed(() => jsonDraft.value || JSON.stringify(fullConfig.value, null, 2))
const logLevelTagType = computed(() => {
  const types: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    debug: 'info',
    info: 'success',
    warn: 'warning',
    error: 'danger',
  }
  return types[appConfig.value.logLevel ?? ''] ?? 'info'
})

function syncForm(config: TenantFullConfig): void {
  const tenant = config.tenant
  const tenantTheme = tenant?.theme ?? {}
  form.tenantName = tenant?.tenantName ?? ''
  form.tenantCode = tenant?.tenantCode ?? ''
  form.logo = tenant?.logo ?? ''
  form.primaryColor = tenantTheme.primaryColor ?? ''
  form.borderRadius = tenantTheme.borderRadius ?? ''
  form.homePath = config.pageNode?.homePath ?? ''
  form.logLevel = config.config?.logLevel ?? ''
}

function enterpriseStatus(checkState: number | null): string {
  if (checkState === 1) return 'ACTIVE'
  if (checkState === 2) return 'REJECTED'
  if (checkState === 0) return 'PENDING'
  return 'UNKNOWN'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadConfig(): Promise<void> {
  if (!props.tenantId) return
  loading.value = true
  loadError.value = ''
  try {
    const session = lowcodeApi.session.get()
    if (session === null || session.enterprise.shortName !== props.tenantId) {
      throw new Error('lowcode 当前会话无权读取该企业')
    }
    const enterprise = await lowcodeApi.platform.getEnterpriseInfo()
    if (enterprise.domainKey !== props.tenantId) {
      throw new Error(`lowcode 企业域名标识不一致：${enterprise.domainKey}`)
    }
    const policy = enterprise.policy
    const config: TenantFullConfig = {
      tenant: {
        tenantId: enterprise.domainKey,
        tenantName: enterprise.chineseShortName
          ?? enterprise.chineseName
          ?? enterprise.englishName
          ?? enterprise.domainKey,
        tenantCode: enterprise.domainKey,
        status: enterpriseStatus(enterprise.checkState),
        logo: enterprise.iconUrl ?? '',
      },
      config: {
        features: policy === null ? {} : {
          userAudit: policy.userAudit,
          passwordRequiresLetter: policy.passwordRequiresLetter,
          passwordRequiresDigit: policy.passwordRequiresDigit,
          passwordRequiresSpecial: policy.passwordRequiresSpecial,
        },
      },
      pageNode: {},
      enterprise,
    }
    fullConfig.value = config
    jsonDraft.value = JSON.stringify(config, null, 2)
    syncForm(config)
  } catch (error) {
    fullConfig.value = null
    loadError.value = `加载租户配置失败: ${errorMessage(error)}`
  } finally {
    loading.value = false
  }
}

async function saveBasicConfig(): Promise<void> {
  if (!props.tenantId) return
  if (!form.tenantName.trim()) {
    ElMessage.warning('租户名称不能为空')
    return
  }
  saving.value = true
  try {
    throw new Error('lowcode 企业配置写接口不满足写前镜像、journal、readback 与补偿门禁')
  } catch (error) {
    ElMessage.error(`保存失败: ${errorMessage(error)}`)
  } finally {
    saving.value = false
  }
}

async function saveFullConfig(): Promise<void> {
  if (!props.tenantId) return
  let parsed: TenantFullConfig
  try {
    const candidate: unknown = JSON.parse(jsonDraft.value)
    if (!isTenantFullConfig(candidate)) {
      throw new Error('完整租户配置必须是对象')
    }
    parsed = candidate
  } catch (error) {
    ElMessage.error(`JSON 格式无效: ${errorMessage(error)}`)
    return
  }

  savingJson.value = true
  try {
    void parsed
    throw new Error('lowcode 未提供 AppWorks 完整租户配置的受治理写入合同')
  } catch (error) {
    ElMessage.error(`保存完整配置失败: ${errorMessage(error)}`)
  } finally {
    savingJson.value = false
  }
}

async function copyJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(fullConfigJson.value)
    ElMessage.success('配置 JSON 已复制')
  } catch (error) {
    ElMessage.error(`复制失败: ${errorMessage(error)}`)
  }
}

function featureName(feature: string): string {
  const names: Record<string, string> = {
    enableExport: '导出功能',
    enableOffline: '离线模式',
  }
  return names[feature] ?? feature
}

watch(
  () => props.tenantId,
  () => {
    void loadConfig()
  },
  { immediate: true },
)
</script>

<style scoped>
.tenant-config-panel {
  min-height: 240px;
}

.config-section {
  padding: 18px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.config-section:first-child {
  padding-top: 0;
}

.config-section:last-child {
  border-bottom: 0;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.section-heading h3,
.config-section h3 {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.35;
}

.section-heading h3 {
  margin-bottom: 4px;
}

.section-heading p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.config-form {
  max-width: 680px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.color-value {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.color-chip {
  display: inline-block;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  vertical-align: middle;
}

.feature-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.config-json-editor :deep(.el-textarea__inner) {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
