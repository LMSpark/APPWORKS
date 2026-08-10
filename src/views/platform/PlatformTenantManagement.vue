<!--
@module app:views/platform/PlatformTenantManagement
职责：提供主应用 PlatformTenantManagement 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/platform/PlatformTenantManagement。
-->
<template>
  <div class="platform-tenants">
    <div class="page-toolbar">
      <div>
        <h2>租户管理</h2>
        <p>平台租户、管理员和入口状态统一维护。</p>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" @click="loadTenants">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建租户</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="tenants" row-key="tenantId" class="tenant-table">
      <el-table-column prop="tenantId" label="企业作用域" min-width="150" />
      <el-table-column prop="tenantName" label="租户名称" min-width="180" />
      <el-table-column prop="tenantCode" label="四级域名标识" min-width="140" />
      <el-table-column prop="adminUserName" label="管理员" min-width="120" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'warning'">
            {{ tenantStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" min-width="180" />
      <el-table-column label="操作" fixed="right" width="420">
        <template #default="{ row }">
          <el-button size="small" type="primary" text @click="enterTenant(row)">进入</el-button>
          <el-button size="small" text @click="openConfigDrawer(row)">配置</el-button>
          <el-button size="small" text @click="openEditDialog(row)">编辑</el-button>
          <el-button
            v-if="row.tenantId !== 'platform' && row.status === 'ACTIVE'"
            size="small"
            text
            type="warning"
            @click="disableTenant(row)"
          >
            禁用
          </el-button>
          <el-button
            v-if="row.tenantId !== 'platform' && row.status === 'DISABLED'"
            size="small"
            text
            type="success"
            @click="enableTenant(row)"
          >
            启用
          </el-button>
          <el-button
            v-if="row.tenantId !== 'platform'"
            size="small"
            text
            type="danger"
            @click="deleteTenant(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingTenant ? '编辑租户' : '新建租户'" width="520px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="租户 ID">
          <el-input v-model="form.tenantId" :disabled="Boolean(editingTenant)" placeholder="例如 acme" />
        </el-form-item>
        <el-form-item label="租户名称">
          <el-input v-model="form.tenantName" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="租户编码">
          <el-input v-model="form.tenantCode" placeholder="例如 ACME" />
        </el-form-item>
        <template v-if="!editingTenant">
          <el-form-item label="管理员">
            <el-input v-model="form.adminUsername" placeholder="admin" />
          </el-form-item>
          <el-form-item label="初始密码">
            <el-input v-model="form.adminPassword" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTenant">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="configDrawerVisible"
      :title="configDrawerTitle"
      size="min(720px, 100vw)"
      destroy-on-close
      @closed="handleConfigDrawerClosed"
    >
      <TenantConfigPanel
        v-if="selectedConfigTenantId"
        :tenant-id="selectedConfigTenantId"
        @updated="handleConfigUpdated"
      />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { lowcodeApi, lowcodeEnterpriseDisplayName } from '@/lowcode/lowcode-runtime'
import { buildTenantPath } from '@/services/tenant-scope'
import { PROJECT_SWITCH_KEY } from '@/services/project/project-shell'
import { getNavHomePath } from '@spark-appworks/spark-app'
import TenantConfigPanel from './TenantConfigPanel.vue'

type PlatformTenant = {
  tenantId: string
  tenantName: string
  tenantCode: string
  status: 'ACTIVE' | 'DISABLED' | string
  defaultProjectId: string
  adminUserName: string
  updatedAt?: string}

const route = useRoute()
const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const loading = ref(false)
const submitting = ref(false)
const tenants = ref<PlatformTenant[]>([])
const dialogVisible = ref(false)
const editingTenant = ref<PlatformTenant | null>(null)
const configDrawerVisible = ref(false)
const selectedConfigTenantId = ref('')
const selectedConfigTenantName = ref('')
const form = reactive({
  tenantId: '',
  tenantName: '',
  tenantCode: '',
  adminUsername: 'admin',
  adminPassword: 'admin123',
})
const configDrawerTitle = computed(() => {
  const label = selectedConfigTenantName.value || selectedConfigTenantId.value
  return label ? `租户配置 - ${label}` : '租户配置'
})

function resetForm(): void {
  form.tenantId = ''
  form.tenantName = ''
  form.tenantCode = ''
  form.adminUsername = 'admin'
  form.adminPassword = 'admin123'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function tenantStatusText(status: string): string {
  if (status === 'ACTIVE') return '启用'
  if (status === 'DISABLED') return '禁用'
  return '未知'
}

async function loadTenants(): Promise<void> {
  loading.value = true
  try {
    const session = lowcodeApi.session.get()
    const enterprise = session === null ? null : await lowcodeApi.platform.getEnterpriseInfo()
    tenants.value = session === null ? [] : [{
      tenantId: enterprise?.domainKey ?? session.enterprise.shortName,
      tenantName: enterprise?.chineseShortName
        ?? enterprise?.chineseName
        ?? lowcodeEnterpriseDisplayName(session.enterprise),
      tenantCode: enterprise?.domainKey ?? session.enterprise.shortName,
      status: enterprise?.checkState === 1 ? 'ACTIVE' : 'UNKNOWN',
      defaultProjectId: 'homepage',
      adminUserName: enterprise?.administratorAccount ?? session.identity.account,
      ...(enterprise?.createdAt === null || enterprise?.createdAt === undefined
        ? {}
        : { updatedAt: enterprise.createdAt }),
    }]
    syncConfigDrawerFromRoute()
  } catch (error) {
    ElMessage.error(`加载租户失败: ${errorMessage(error)}`)
  } finally {
    loading.value = false
  }
}

function getRouteTenantId(): string | null {
  const tenantQuery = route.query['tenant']
  if (typeof tenantQuery === 'string' && tenantQuery.trim()) return tenantQuery.trim()
  if (Array.isArray(tenantQuery) && typeof tenantQuery[0] === 'string' && tenantQuery[0].trim()) {
    return tenantQuery[0].trim()
  }
  return null
}

function replaceTenantQuery(tenantId: string | null): void {
  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'tenant') continue
    if (typeof value === 'string') nextQuery[key] = value
  }
  if (tenantId !== null) nextQuery['tenant'] = tenantId
  void router.replace({ path: route.path, query: nextQuery })
}

function selectConfigTenant(row: PlatformTenant): void {
  selectedConfigTenantId.value = row.tenantId
  selectedConfigTenantName.value = row.tenantName || row.tenantId
  configDrawerVisible.value = true
}

function openConfigDrawer(row: PlatformTenant): void {
  selectConfigTenant(row)
  if (getRouteTenantId() !== row.tenantId) {
    replaceTenantQuery(row.tenantId)
  }
}

function syncConfigDrawerFromRoute(): void {
  const tenantId = getRouteTenantId()
  if (tenantId === null) return

  const row = tenants.value.find(item => item.tenantId === tenantId)
  if (row) {
    selectConfigTenant(row)
    return
  }

  if (tenants.value.length > 0) {
    ElMessage.warning(`租户「${tenantId}」不存在或未在平台租户列表中启用`)
    replaceTenantQuery(null)
  }
}

function handleConfigUpdated(): void {
  void loadTenants()
}

function handleConfigDrawerClosed(): void {
  selectedConfigTenantId.value = ''
  selectedConfigTenantName.value = ''
  if (getRouteTenantId() !== null) {
    replaceTenantQuery(null)
  }
}

function openCreateDialog(): void {
  editingTenant.value = null
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(row: PlatformTenant): void {
  editingTenant.value = row
  form.tenantId = row.tenantId
  form.tenantName = row.tenantName
  form.tenantCode = row.tenantCode
  form.adminUsername = row.adminUserName || 'admin'
  form.adminPassword = ''
  dialogVisible.value = true
}

async function submitTenant(): Promise<void> {
  if (!form.tenantId.trim() || !form.tenantName.trim()) {
    ElMessage.warning('请填写租户 ID 和租户名称')
    return
  }
  submitting.value = true
  try {
    throw new Error('lowcode 企业变更接口不满足写前镜像、journal、readback 与补偿门禁')
  } catch (error) {
    ElMessage.error(`保存失败: ${errorMessage(error)}`)
  } finally {
    submitting.value = false
  }
}

async function enableTenant(row: PlatformTenant): Promise<void> {
  ElMessage.error(`无法启用「${row.tenantName}」：lowcode 未提供受治理的企业启停合同`)
}

async function disableTenant(row: PlatformTenant): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定禁用租户「${row.tenantName || row.tenantId}」？`, '禁用租户', { type: 'warning' })
    throw new Error('lowcode 未提供受治理的企业启停合同')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(`禁用失败: ${errorMessage(error)}`)
  }
}

async function deleteTenant(row: PlatformTenant): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除租户「${row.tenantName || row.tenantId}」？此操作为软删除。`, '删除租户', { type: 'warning' })
    throw new Error('lowcode 未提供受治理的企业删除合同')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(`删除失败: ${errorMessage(error)}`)
  }
}

async function enterTenant(row: PlatformTenant): Promise<void> {
  const projectId = row.defaultProjectId || 'homepage'
  if (!projectSwitch) {
    ElMessage.error('租户管理页缺少项目切换服务')
    return
  }
  await projectSwitch.switchAndReload(projectId)
  await router.push(buildTenantPath({ tenantId: row.tenantId, projectId }, getNavHomePath()))
}

onMounted(() => {
  void loadTenants()
})

watch(
  () => route.query['tenant'],
  () => {
    syncConfigDrawerFromRoute()
  },
)
</script>

<style scoped>
.platform-tenants {
  padding: 20px;
}

.page-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.page-toolbar h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.page-toolbar p {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.toolbar-actions {
  display: flex;
  gap: 10px;
}

.tenant-table {
  width: 100%;
}

:deep(.el-drawer__body) {
  padding-top: 10px;
}
</style>
