<!--
@module app:views/app/Settings
职责：显示当前应用名称与版本，切换本机主题模式，查看已注册路由统计并从 lowcode 重载导航（含路由刷新），管理本机页面缓存。
边界：主题与页面缓存只涉及本机；应用与导航数据来自现有运行时，不在本页另存设置；后端缓存不在本页维护。
AI用途：需要定位主题切换、路由统计、手动重载导航或本机页面缓存入口时，用本模块定位 views/app/Settings。
-->
<template>
  <div class="settings-page">
    <SparkComponent.RendererPageHeader content="系统设置" @back="router.go(-1)" />

    <div class="settings-content">
      <SparkComponent.RendererRow :gutter="24">
        <SparkComponent.RendererCol :span="16">
          <SparkComponent.RendererCard header="应用">
            <SparkComponent.RendererForm v-if="local" :data-view-key="local.key(SETTINGS_TABLE)" :grid-columns="1" label-width="120px" :show-data-view-meta="false">
              <SparkComponent.FieldText field="appName" label="应用名称" readonly />
              <SparkComponent.FieldText field="version" label="应用版本" readonly />
              <SparkComponent.FieldRadio field="themeMode" label="主题模式" :option-data-view-key="local.key(THEME_TABLE)" option-value-field="id" option-label-field="title" />
            </SparkComponent.RendererForm>
          </SparkComponent.RendererCard>
        </SparkComponent.RendererCol>

        <SparkComponent.RendererCol :span="8">
          <SparkComponent.RendererCard header="路由" class="status-card">
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">已注册路由</span>
                <SparkComponent.DisplayTag :content="`${routeCount} 个`" tag-type="info" />
              </div>
              <div class="status-item">
                <span class="status-label">配置页面</span>
                <SparkComponent.DisplayTag :content="`${configPageCount} 个`" tag-type="info" />
              </div>
              <div class="status-item">
                <span class="status-label">Vue 组件页面</span>
                <SparkComponent.DisplayTag :content="`${vuePageCount} 个`" tag-type="success" />
              </div>
            </div>
            <SparkComponent.RendererButton label="重载导航" button-type="warning" size="small" class="reload-button" @click="reloadNavigation" />
          </SparkComponent.RendererCard>
        </SparkComponent.RendererCol>
      </SparkComponent.RendererRow>
      <LocalPageCacheCard />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 系统设置页；属于应用路由页，不允许作为 SparkNode 组件配置生成。
 */
import { ref, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { getNavTree, useTheme } from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import { getVuePageOptions, hasVuePage } from '@/registries/vue-page-registry'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import { HostLocalRuntime } from '@/layout/host-local-runtime'
import packageMetadata from '../../../package.json'
import LocalPageCacheCard from './settings/local-page-cache-card.vue'

const router = useRouter()
const {sparkConsume, sparkProvide, sparkRemove} = SparkComponent.useSparkComponent({type: 'app-settings'})

const pageService = SparkComponent.consumeRequiredPageService(sparkConsume, 'app-settings')
const theme = useTheme()

const SETTINGS_TABLE = 'HostAppSettings'
const THEME_TABLE = 'HostThemeModeOptions'
const SETTINGS_ROW = 'settings'
const DEFAULT_APP_NAME = 'SPARK 应用工场'

const local = shallowRef<HostLocalRuntime>()
let unsubscribe: (() => void) | undefined
let active = true
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

function appName(): string {
  return lowcodeApi.application.get()?.application.name ?? DEFAULT_APP_NAME
}

function syncRuntimeFacts(): void {
  local.value?.write(SETTINGS_TABLE, SETTINGS_ROW, { appName: appName() })
  routeCount.value = router.getRoutes().length
  configPageCount.value = countConfigPages()
  vuePageCount.value = getVuePageOptions().length
}

async function reloadNavigation(): Promise<void> {
  try {
    await reloadAndSyncNavigation()
    syncRuntimeFacts()
    pageService.showMessage('已从 lowcode 重新读取导航', 'success')
  } catch (error) {
    pageService.showMessage(error instanceof Error ? error.message : String(error), 'error')
  }
}

void HostLocalRuntime.create({ scenarioId: 'host-app-settings', tables: {
  [SETTINGS_TABLE]: {
    columns: ['id', 'appName', 'version', 'themeMode'].map(name => ({ name, type: 'string' as const })),
    rows: [{ id: SETTINGS_ROW, appName: appName(), version: packageMetadata.version, themeMode: theme?.mode ?? 'light' }],
  },
  [THEME_TABLE]: {
    columns: [{ name: 'id', type: 'string' }, { name: 'title', type: 'string' }],
    rows: [{ id: 'light', title: '浅色主题' }, { id: 'dark', title: '深色主题' }, { id: 'auto', title: '跟随系统' }],
  },
} }).then(created => {
  if (!active) { created.dispose(); return }
  sparkProvide(SparkComponent.PAGE_RUNTIME, created.runtime)
  unsubscribe = created.onFieldEdit(SETTINGS_TABLE, (field, value) => {
    if (field === 'themeMode' && theme && SparkComponent.isThemeMode(value)) theme.setMode(value)
  })
  local.value = created
  syncRuntimeFacts()
}).catch((error: unknown) => {
  pageService.showMessage(`系统设置装配失败：${error instanceof Error ? error.message : String(error)}`, 'error')
})

onMounted(syncRuntimeFacts)

onBeforeUnmount(() => {
  active = false
  unsubscribe?.()
  sparkRemove(SparkComponent.PAGE_RUNTIME)
  local.value?.dispose()
})
</script>

<style scoped>
.settings-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.settings-content {
  margin-top: 24px;
}

.status-card {
  height: 100%;
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
}

.status-label {
  color: var(--el-text-color-regular);
}

.reload-button {
  width: 100%;
  margin-top: 12px;
}
</style>