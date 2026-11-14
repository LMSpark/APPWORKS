<!--
@module app:views/app/Settings
职责：显示当前应用名称与版本，切换本机主题模式，查看已注册路由统计并从 lowcode 重载导航（含路由刷新），管理本机页面缓存。
边界：主题与页面缓存只涉及本机；应用与导航数据来自现有运行时，不在本页另存设置；后端缓存不在本页维护。
AI用途：需要定位主题切换、路由统计、手动重载导航或本机页面缓存入口时，用本模块定位 views/app/Settings。
-->
<template>
  <div class="settings-page">
    <RendererPageHeader content="系统设置" @back="router.go(-1)" />

    <div class="settings-content">
      <RendererRow :gutter="24">
        <RendererCol :span="16">
          <RendererCard header="应用">
            <RendererForm :grid-columns="1" label-width="120px" :show-data-view-meta="false">
              <FieldText :model-value="appName" label="应用名称" readonly />
              <FieldText :model-value="packageMetadata.version" label="应用版本" readonly />
              <FieldRadio v-model="themeMode" label="主题模式" :options="[...themeOptions]" />
            </RendererForm>
          </RendererCard>
        </RendererCol>

        <RendererCol :span="8">
          <RendererCard header="路由" class="status-card">
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">已注册路由</span>
                <DisplayTag type="info">{{ routeCount }} 个</DisplayTag>
              </div>
              <div class="status-item">
                <span class="status-label">配置页面</span>
                <DisplayTag type="info">{{ configPageCount }} 个</DisplayTag>
              </div>
              <div class="status-item">
                <span class="status-label">Vue 组件页面</span>
                <DisplayTag type="success">{{ vuePageCount }} 个</DisplayTag>
              </div>
            </div>
            <RendererButton label="重载导航" button-type="warning" size="small" class="reload-button" @click="reloadNavigation" />
          </RendererCard>
        </RendererCol>
      </RendererRow>
      <LocalPageCacheCard />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 系统设置页；属于应用路由页，不允许作为 SparkNode 组件配置生成。
 */
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getNavTree, useTheme } from '@spark-appworks/spark-app'
import {DisplayTag,
  FieldRadio,
  FieldText,
  isThemeMode,
  PAGE_SERVICE,
  RendererButton,
  RendererCard,
  RendererCol,
  RendererForm,
  RendererPageHeader,
  RendererRow,
  consumeRequiredPageService,
  useSparkComponent,
  type ThemeMode,
} from '@spark-appworks/spark-component'
import { getVuePageOptions, hasVuePage } from '@/registries/vue-page-registry'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import packageMetadata from '../../../package.json'
import LocalPageCacheCard from './settings/local-page-cache-card.vue'

const router = useRouter()
const {sparkConsume} = useSparkComponent({type: 'app-settings'})

const pageService = consumeRequiredPageService(sparkConsume, 'app-settings')
const theme = useTheme()

const themeOptions = [
  { value: 'light', label: '浅色主题' },
  { value: 'dark', label: '深色主题' },
  { value: 'auto', label: '跟随系统' },
] as const

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
    pageService.showMessage('已从 lowcode 重新读取导航', 'success')
  } catch (error) {
    pageService.showMessage(error instanceof Error ? error.message : String(error), 'error')
  }
}

onMounted(syncRuntimeFacts)

watch(themeMode, (mode) => {
  if (theme && isThemeMode(mode)) theme.setMode(mode)
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