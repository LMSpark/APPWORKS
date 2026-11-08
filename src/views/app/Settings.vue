<!--
@module app:views/app/Settings
职责：显示当前应用名称与版本，切换本机主题模式，查看已注册路由统计并从 lowcode 重载导航。
边界：主题只写本机偏好；应用与导航数据来自现有运行时，不在本页另存设置。
AI用途：需要定位主题切换、路由统计或手动重载导航入口时，用本模块定位 views/app/Settings。
-->
<template>
  <div class="settings-page">
    <el-page-header content="系统设置" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">⚙️</span>
      </template>
    </el-page-header>

    <div class="settings-content">
      <el-row :gutter="24">
        <el-col :span="16">
          <el-card header="应用">
            <el-form label-width="120px" size="default">
              <el-form-item label="应用名称">
                <el-input :model-value="appName" disabled />
              </el-form-item>
              <el-form-item label="应用版本">
                <el-input :model-value="packageMetadata.version" disabled />
              </el-form-item>
              <el-form-item label="主题模式">
                <el-radio-group v-model="themeMode">
                  <el-radio value="light">浅色主题</el-radio>
                  <el-radio value="dark">深色主题</el-radio>
                  <el-radio value="auto">跟随系统</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card header="路由" class="status-card">
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">已注册路由</span>
                <el-tag type="info">{{ routeCount }} 个</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">配置页面</span>
                <el-tag type="info">{{ configPageCount }} 个</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">Vue 组件页面</span>
                <el-tag type="success">{{ vuePageCount }} 个</el-tag>
              </div>
            </div>
            <el-button type="warning" size="small" style="width: 100%; margin-top: 12px" @click="reloadNavigation">
              重载导航
            </el-button>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 系统设置页；属于应用路由页，不允许作为 SparkNode 组件配置生成。
 */
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getNavTree, useTheme } from '@spark-appworks/spark-app'
import { isThemeMode, type ThemeMode } from '@spark-appworks/spark-component'
import { getVuePageOptions, hasVuePage } from '@/registries/vue-page-registry'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import packageMetadata from '../../../package.json'

const router = useRouter()
const theme = useTheme()

const appName = ref('SPARK 应用工场')
const themeMode = ref<ThemeMode>(theme?.mode ?? 'light')
const routeCount = ref(0)
const configPageCount = ref(0)
const vuePageCount = ref(0)

function countConfigPages(): number {
  const root = getNavTree()
  if (root === null) return 0
  const visit = (nodes: typeof root.items): number => nodes.reduce((total, node) => {
    const own = node.itemKind === 'page' && !hasVuePage(node.path ?? '') ? 1 : 0
    return total + own + visit(node.children ?? [])
  }, 0)
  return visit(root.items)
}

function syncRuntimeFacts(): void {
  appName.value = lowcodeApi.application.get()?.application.name ?? 'SPARK 应用工场'
  routeCount.value = router.getRoutes().length
  configPageCount.value = countConfigPages()
  vuePageCount.value = getVuePageOptions().length
}

async function reloadNavigation(): Promise<void> {
  try {
    await reloadAndSyncNavigation()
    syncRuntimeFacts()
    ElMessage.success('已从 lowcode 重新读取导航')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(syncRuntimeFacts)

watch(themeMode, (mode) => {
  if (theme && isThemeMode(mode)) theme.setMode(mode)
})
</script>

<style scoped>
.settings-page {
  padding: 24px;
}

.settings-content {
  margin-top: 24px;
}

.status-card {
  height: fit-content;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.status-label {
  font-size: 14px;
  color: #606266;
}
</style>
