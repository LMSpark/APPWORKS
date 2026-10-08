<!--
@module app:views/platform/PlatformApps
职责：提供主应用 PlatformApps 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/platform/PlatformApps。
-->
<template>
  <div class="platform-apps">
    <div class="page-toolbar">
      <div>
        <h2>应用管理</h2>
        <p>按租户查看项目，并进入对应业务工作台。</p>
      </div>
      <div class="toolbar-actions">
        <el-select v-model="selectedTenantId" placeholder="选择租户" style="width: 220px" @change="loadProjects">
          <el-option
            v-for="tenant in tenants"
            :key="tenant.tenantId"
            :label="`${tenant.tenantName || tenant.tenantId} (${tenant.tenantId})`"
            :value="tenant.tenantId"
          />
        </el-select>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!selectedTenantId" @click="openCreateDialog">新建应用</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="projects" row-key="projectId" class="project-table">
      <el-table-column prop="projectId" label="项目 ID" min-width="150" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="projectType" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="row.projectType === 'homepage' ? 'warning' : 'info'">
            {{ row.projectType === 'homepage' ? '应用工场' : '应用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="260" show-overflow-tooltip />
      <el-table-column label="操作" fixed="right" width="180">
        <template #default="{ row }">
          <el-button size="small" type="primary" text @click="enterProject(row)">进入</el-button>
          <el-button
            v-if="row.projectType !== 'homepage'"
            size="small"
            type="danger"
            text
            @click="deleteProject(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" title="新建应用" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="应用 ID">
          <el-input v-model="form.projectId" placeholder="例如 crm" />
        </el-form-item>
        <el-form-item label="应用名称">
          <el-input v-model="form.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="例如 Box" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import {
  lowcodeApi,
  lowcodeEnterpriseDisplayName,
} from '@/lowcode/lowcode-runtime'
import { buildTenantPath } from '@/services/tenant-scope'
import { PROJECT_SWITCH_KEY } from '@/services/project/project-shell'
import { getNavHomePath } from '@spark-appworks/spark-app'

type PlatformTenant = {
  tenantId: string
  tenantName: string
  status: string}

type ProjectItem = {
  projectId: string
  name: string
  projectType: string
  icon: string
  description: string}

const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const tenants = ref<PlatformTenant[]>([])
const selectedTenantId = ref('')
const projects = ref<ProjectItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const form = reactive({
  projectId: '',
  name: '',
  icon: 'Box',
  description: '',
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadTenants(): Promise<void> {
  const session = lowcodeApi.session.get()
  tenants.value = session === null ? [] : [{
    tenantId: session.enterprise.shortName,
    tenantName: lowcodeEnterpriseDisplayName(session.enterprise),
    status: 'ACTIVE',
  }]
  if (!selectedTenantId.value && tenants.value.length > 0) {
    selectedTenantId.value = tenants.value[0]?.tenantId ?? ''
  }
}

async function loadProjects(): Promise<void> {
  if (!selectedTenantId.value) {
    projects.value = []
    return
  }
  loading.value = true
  try {
    projects.value = (await lowcodeApi.platform.listApplications()).map((application) => ({
      projectId: application.id,
      name: application.name,
      projectType: application.isDefault ? 'homepage' : 'application',
      icon: 'Box',
      description: application.description,
    }))
  } catch (error) {
    ElMessage.error(`加载应用失败: ${errorMessage(error)}`)
    projects.value = []
  } finally {
    loading.value = false
  }
}

async function loadAll(): Promise<void> {
  await loadTenants()
  await loadProjects()
}

function openCreateDialog(): void {
  form.projectId = ''
  form.name = ''
  form.icon = 'Box'
  form.description = ''
  dialogVisible.value = true
}

async function submitProject(): Promise<void> {
  if (!form.projectId.trim()) {
    ElMessage.warning('请输入应用 ID')
    return
  }
  submitting.value = true
  try {
    throw new Error('lowcode 现有应用写接口不满足写前镜像、journal、readback 与补偿门禁')
  } catch (error) {
    ElMessage.error(`创建失败: ${errorMessage(error)}`)
  } finally {
    submitting.value = false
  }
}

async function deleteProject(project: ProjectItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除应用「${project.name || project.projectId}」？`, '删除应用', { type: 'warning' })
    throw new Error('lowcode 现有应用删除接口不满足写前镜像、journal、readback 与补偿门禁')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(`删除失败: ${errorMessage(error)}`)
  }
}

async function enterProject(project: ProjectItem): Promise<void> {
  if (!selectedTenantId.value) return
  try {
    if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务')
    const receipt = await projectSwitch.switchAndReload(project.projectId)
    receipt.assertCurrent()
    await router.push(buildTenantPath(
      { tenantId: selectedTenantId.value, projectId: project.projectId },
      getNavHomePath(),
    ))
  } catch (error) {
    ElMessage.error(`进入应用失败: ${errorMessage(error)}`)
  }
}

onMounted(() => {
  void loadAll()
})
</script>

<style scoped>
.platform-apps {
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
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.project-table {
  width: 100%;
}
</style>
