<!--
@module app:views/tenant/Settings
职责：提供主应用 Settings 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/tenant/Settings。
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
        <!-- 左侧配置面板 -->
        <el-col :span="16">
          <el-card header="⚙️ 系统配置">
            <el-form :model="settings" label-width="120px" size="default">
              <!-- 应用设置 -->
              <el-divider content-position="left">应用设置</el-divider>
              <el-form-item label="应用名称">
                <el-input v-model="settings.appName" disabled />
              </el-form-item>
              <el-form-item label="应用版本">
                <el-input v-model="settings.appVersion" disabled />
              </el-form-item>
              <el-form-item label="主题模式">
                <el-radio-group v-model="settings.theme">
                  <el-radio value="light">浅色主题</el-radio>
                  <el-radio value="dark">深色主题</el-radio>
                  <el-radio value="auto">跟随系统</el-radio>
                </el-radio-group>
              </el-form-item>

              <!-- 渲染设置 -->
              <el-divider content-position="left">渲染设置</el-divider>
              <el-form-item label="页面渲染模式">
                <el-checkbox-group v-model="settings.renderModes" disabled>
                  <el-checkbox value="vue-component">Vue 组件页面</el-checkbox>
                  <el-checkbox value="config-page">配置页面</el-checkbox>
                  <el-checkbox value="spark-component">SPARK 组件</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="动态路由">
                <el-switch v-model="settings.dynamicRouting" disabled />
                <span class="form-hint">启用后支持运行时注册页面</span>
              </el-form-item>
              <el-form-item label="配置缓存">
                <el-switch v-model="settings.configCache" disabled />
                <span class="form-hint">缓存页面配置以提升性能</span>
              </el-form-item>

              <!-- 开发设置 -->
              <el-divider content-position="left">开发设置</el-divider>
              <el-form-item label="日志级别">
                <el-select v-model="settings.logLevel" disabled placeholder="选择日志级别">
                  <el-option label="DEBUG" value="debug" />
                  <el-option label="INFO" value="info" />
                  <el-option label="WARN" value="warn" />
                  <el-option label="ERROR" value="error" />
                </el-select>
              </el-form-item>
              <el-form-item label="开发工具">
                <el-switch v-model="settings.devTools" disabled />
                <span class="form-hint">启用 Vue DevTools 支持</span>
              </el-form-item>
              <el-form-item label="热重载">
                <el-switch v-model="settings.hotReload" disabled />
                <span class="form-hint">配置文件变更时自动重载</span>
              </el-form-item>

              <!-- 操作按钮 -->
              <el-form-item>
                <el-button type="primary" @click="saveSettings">保存设置</el-button>
                <el-button @click="resetSettings">重置默认</el-button>
                <el-button type="info" @click="exportSettings">导出配置</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <!-- 右侧信息面板 -->
        <el-col :span="8">
          <el-card header="📊 系统状态" class="status-card">
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">渲染引擎</span>
                <el-tag type="success">SPARK</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">Vue 版本</span>
                <el-tag>3.5.0</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">路由模式</span>
                <el-tag type="warning">混合模式</el-tag>
              </div>
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
          </el-card>

          <el-card header="🛠️ 页面管理" style="margin-top: 16px;">
            <div class="page-management">
              <el-button 
                type="primary" 
                size="small" 
                @click="createConfigPage"
                style="width: 100%; margin-bottom: 8px"
              >
                ➕ 新建配置页面
              </el-button>
              <el-button 
                type="success" 
                size="small" 
                @click="createVuePage"
                style="width: 100%; margin-bottom: 8px"
              >
                🎯 新建 Vue 页面
              </el-button>
              <el-button 
                type="warning" 
                size="small" 
                @click="refreshRoutes"
                style="width: 100%"
              >
                🔄 重载路由
              </el-button>
            </div>
          </el-card>

          <el-card header="📋 最近操作" style="margin-top: 16px;">
            <el-timeline>
              <el-timeline-item
                v-for="log in operationLogs"
                :key="log.id"
                :timestamp="log.time"
              >
                {{ log.action }}
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 系统设置面板，提供全局参数配置和偏好设置管理界面；属于租户路由页，不允许作为 SparkNode 组件配置生成。
 */
/**
 * 系统设置页面 - 配置管理和系统监控
 * 
 * @component Settings
 * @description
 * 系统配置管理页面，提供应用设置、渲染模式配置、开发工具选项和系统监控功能。
 * 展示路由统计、操作日志，支持配置持久化到本地存储。
 * 
 * 核心功能：
 * 1. **应用设置**：应用名称、版本、主题模式配置
 * 2. **渲染设置**：页面渲染模式选择、动态路由、配置缓存开关
 * 3. **开发设置**：日志级别、开发工具、热重载配置
 * 4. **系统监控**：实时显示总路由数、配置页面数、Vue 页面数
 * 5. **操作日志**：记录和显示系统操作历史
 * 6. **配置持久化**：保存设置到 localStorage
 * 
 * @example
 * 路由配置：
 * ```typescript
 * {
 *   path: '/settings',
 *   component: Settings
 * }
 * ```
 * 
 * @example
 * 配置数据结构：
 * ```typescript
 * {
 *   appName: 'SPARK 混合渲染系统',
 *   appVersion: '1.0.0',
 *   theme: 'light' | 'dark' | 'auto',
 *   renderModes: ['vue-component', 'config-page', 'spark-component'],
 *   dynamicRouting: true,
 *   configCache: true,
 *   logLevel: 'debug' | 'info' | 'warn' | 'error',
 *   devTools: true,
 *   hotReload: true
 * }
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getNavTree, isThemeMode, useTheme } from '@spark-appworks/spark-app'
import { getVuePageOptions, hasVuePage } from '@/registries/vue-page-registry'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import packageMetadata from '../../../package.json'

const router = useRouter()
const theme = useTheme()

// 设置数据
const settings = ref({
  appName: 'SPARK 应用工场',
  appVersion: packageMetadata.version,
  theme: 'light',
  renderModes: ['vue-component', 'config-page'],
  dynamicRouting: true,
  configCache: true,
  logLevel: 'debug',
  devTools: true,
  hotReload: true
})

// 路由统计
const routeCount = computed(() => router.getRoutes().length)
const configPageCount = ref(0)
const vuePageCount = ref(getVuePageOptions().length)

// 操作日志
const operationLogs = ref<Array<{ id: number; action: string; time: string }>>([])

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
  settings.value.appName = lowcodeApi.application.get()?.application.name ?? 'SPARK 应用工场'
  configPageCount.value = countConfigPages()
  vuePageCount.value = getVuePageOptions().length
}

// 保存设置
const saveSettings = () => {
  ElMessage.success('SPARK 主题偏好已应用；运行配置保持只读')
  
  // 添加操作日志
  operationLogs.value.unshift({
    id: Date.now(),
    action: '保存系统设置',
    time: new Date().toLocaleString()
  })
}

// 重置设置
const resetSettings = () => {
  settings.value = {
    appName: lowcodeApi.application.get()?.application.name ?? 'SPARK 应用工场',
    appVersion: packageMetadata.version,
    theme: 'auto',
    renderModes: ['vue-component', 'config-page'],
    dynamicRouting: true,
    configCache: true,
    logLevel: 'debug',
    devTools: true,
    hotReload: true
  }
  ElMessage.info('已重置为默认设置')
}

// 导出配置
const exportSettings = () => {
  const config = JSON.stringify(settings.value, null, 2)
  const blob = new Blob([config], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'spark-settings.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('配置已导出')
}

// 新建配置页面
const createConfigPage = () => {
  ElMessage.info('配置页面创建功能开发中...')
}

// 新建 Vue 页面
const createVuePage = () => {
  ElMessage.info('Vue 页面创建功能开发中...')
}

// 重载路由
const refreshRoutes = async () => {
  try {
    await reloadAndSyncNavigation()
    syncRuntimeFacts()
    ElMessage.success('已从 lowcode 重新读取导航')
    operationLogs.value.unshift({
      id: Date.now(),
      action: '从 lowcode 重载导航',
      time: new Date().toLocaleString()
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

// 加载保存的设置
onMounted(() => {
  syncRuntimeFacts()
  // 同步主题服务当前状态到 UI
  if (theme) {
    settings.value.theme = theme.mode
  }
})

// 主题模式变更时实时同步到 ThemeService
watch(() => settings.value.theme, (newMode) => {
  if (theme && isThemeMode(newMode)) {
    theme.setMode(newMode)
  }
})
</script>

<style scoped>
.settings-page {
  padding: 24px;
}

.settings-content {
  margin-top: 24px;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
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

.page-management {
  display: flex;
  flex-direction: column;
}

.el-timeline {
  padding-left: 0;
}

:deep(.el-timeline-item__timestamp) {
  font-size: 11px;
}
</style>
