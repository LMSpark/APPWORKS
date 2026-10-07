<!--
@module app:views/tenant/CacheManager
职责：提供主应用 CacheManager 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/tenant/CacheManager。
-->
<template>
  <div class="cache-manager">
    <el-page-header content="缓存管理" @back="$router.go(-1)">
      <template #icon><el-icon :size="20"><Coin /></el-icon></template>
    </el-page-header>

    <el-tabs v-model="activeTab" type="border-card" style="margin-top: 16px">
      <!-- ── 前端缓存 ────────────────────────────────────── -->
      <el-tab-pane label="前端缓存" name="frontend">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Refresh" @click="loadFrontendCache">刷新</el-button>
          <el-button type="danger" :icon="Delete" :disabled="feEntries.length === 0" @click="handleClearAllFrontend">
            清除全部
          </el-button>
          <span class="stats-text">
            共 {{ feEntries.length }} 条缓存，约 {{ feTotalSizeKB }} KB
          </span>
        </div>

        <el-table
          :data="feEntries"
          v-loading="feLoading"
          stripe
          border
          size="small"
          max-height="520"
          style="width: 100%"
        >
          <el-table-column prop="key" label="缓存键" min-width="280" show-overflow-tooltip sortable :sort-method="compareKey" />
          <el-table-column prop="sizeKB" label="大小 (KB)" width="100" align="right" sortable :sort-method="compareSize">
            <template #default="{ row }">
              {{ formatSizeKB(row.sizeKB) }}
            </template>
          </el-table-column>
          <el-table-column prop="expirationLevel" label="过期级别" width="100" align="center" sortable>
            <template #default="{ row }">
              <el-tag :type="expirationTagType(row.expirationLevel)" size="small">
                L{{ row.expirationLevel }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sourceTimestampMs" label="文件时间" width="170" sortable :sort-method="compareSourceTimestamp">
            <template #default="{ row }">
              <span :title="row.sourceTimestamp">{{ row.sourceTimestampStr }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="lastAccess" label="最后访问" width="170" sortable :sort-method="compareLastAccess">
            <template #default="{ row }">
              {{ row.lastAccessStr }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="danger" size="small" link @click="handleRemoveFrontend(row.key)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">过期级别说明</el-divider>
        <el-descriptions :column="5" border size="small">
          <el-descriptions-item label="L0">永不过期</el-descriptions-item>
          <el-descriptions-item label="L1">3 天</el-descriptions-item>
          <el-descriptions-item label="L2">7 天</el-descriptions-item>
          <el-descriptions-item label="L3">15 天（默认）</el-descriptions-item>
          <el-descriptions-item label="L4">30 天</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <!-- ── 后端缓存 ────────────────────────────────────── -->
      <el-tab-pane label="后端缓存" name="backend">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Refresh" @click="loadBackendStats">刷新</el-button>
          <el-button type="warning" @click="handleRefreshRoutes">
            刷新路由
          </el-button>
          <el-button type="success" @click="handleReloadNavigation">
            刷新导航
          </el-button>
        </div>

        <el-row :gutter="20" style="margin-top: 16px">
          <el-col :span="12">
            <el-card header="lowcode 租户缓存统计">
              <el-descriptions :column="1" border size="small" v-loading="beLoading">
                <el-descriptions-item label="数据模型缓存数">
                  {{ beStats?.dataSetModelCount ?? '—' }}
                </el-descriptions-item>
                <el-descriptions-item label="开发文件版本缓存数">
                  {{ beStats?.developmentFileCount ?? '—' }}
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 缓存管理页面，查看前后端缓存统计并支持手动清理前端页面缓存；属于应用级路由页，不允许作为 SparkNode 组件配置生成。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Coin, Refresh, Delete } from '@element-plus/icons-vue'
import { refreshRoutes } from '@spark-appworks/spark-app'
import { isRecord } from '@spark-appworks/spark-utils'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'

// ── 前端缓存状态 ──────────────────────────────────────────
const activeTab = ref('frontend')
const feLoading = ref(false)

type FeCacheRow = {
  key: string
  sizeKB: number
  sourceTimestamp: string
  sourceTimestampMs: number
  sourceTimestampStr: string
  expirationLevel: number
  lastAccess: number
  lastAccessStr: string}

const feEntries = ref<FeCacheRow[]>([])

const feTotalSizeKB = computed(() => {
  const total = feEntries.value.reduce((sum, e) => sum + e.sizeKB, 0)
  return total.toFixed(1)
})

function formatSizeKB(sizeKB: number): string {
  return sizeKB.toFixed(1)
}

function compareKey(a: FeCacheRow, b: FeCacheRow): number {
  return a.key.localeCompare(b.key, undefined, { numeric: true })
}

function compareSize(a: FeCacheRow, b: FeCacheRow): number {
  return a.sizeKB - b.sizeKB
}

function compareSourceTimestamp(a: FeCacheRow, b: FeCacheRow): number {
  return a.sourceTimestampMs - b.sourceTimestampMs
}

function compareLastAccess(a: FeCacheRow, b: FeCacheRow): number {
  return a.lastAccess - b.lastAccess
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN')
}

function normalizeSourceTimestamp(value: unknown): { raw: string; time: number; text: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 10_000_000_000) return { raw: String(value), time: value, text: formatTime(value) }
    return { raw: String(value), time: 0, text: String(value) }
  }
  if (typeof value !== 'string') return { raw: '', time: 0, text: '—' }

  const raw = value.trim()
  if (!raw) return { raw: '', time: 0, text: '—' }

  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 10_000_000_000) {
    return { raw, time: numeric, text: formatTime(numeric) }
  }

  const parsed = Date.parse(raw)
  if (Number.isFinite(parsed)) return { raw, time: parsed, text: formatTime(parsed) }

  return { raw, time: 0, text: raw }
}

function expirationTagType(level: number): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (level === 0) return 'danger'
  if (level <= 2) return 'warning'
  return 'info'
}

function loadFrontendCache() {
  feLoading.value = true
  try {
    const entries: FeCacheRow[] = []
    const prefixes = ['spark_page_', 'spark_file_']

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (!prefixes.some(p => key.startsWith(p))) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      const sizeBytes = new Blob([raw]).size
      let lastAccess = 0
      let expirationLevel = 3
      // 页面四文件缓存的“新旧”看 sourceTimestamp：它来自后端文件 mtime/版本戳。
      // cachedAt 只是浏览器写入 localStorage 的时间，页面没改但本地重建缓存时会变化；
      // 用 cachedAt 展示或排序会让缓存管理页看起来像文件更新了，实际不是。
      let sourceTimestamp = normalizeSourceTimestamp(undefined)

      try {
        const parsed: unknown = JSON.parse(raw)
        if (isRecord(parsed)) {
          sourceTimestamp = normalizeSourceTimestamp(parsed['sourceTimestamp'])
          if (typeof parsed['lastAccess'] === 'number') lastAccess = parsed['lastAccess']
          if (typeof parsed['expirationLevel'] === 'number') expirationLevel = parsed['expirationLevel']
        }
      } catch {
        // 解析失败，保留默认值
      }

      entries.push({
        key,
        sizeKB: sizeBytes / 1024,
        sourceTimestamp: sourceTimestamp.raw,
        sourceTimestampMs: sourceTimestamp.time,
        sourceTimestampStr: sourceTimestamp.text,
        expirationLevel,
        lastAccess,
        lastAccessStr: formatTime(lastAccess),
      })
    }

    // 这里仅是管理页展示顺序。真正的前端缓存回收仍由 FileLoader 按 lastAccess LRU 处理，
    // 不能复用这个 sourceTimestamp 排序去决定清缓存先后。
    entries.sort((a, b) => (b.sourceTimestampMs - a.sourceTimestampMs) || compareKey(a, b))
    feEntries.value = entries
  } finally {
    feLoading.value = false
  }
}

function handleRemoveFrontend(key: string) {
  localStorage.removeItem(key)
  feEntries.value = feEntries.value.filter(e => e.key !== key)
  ElMessage.success(`已删除: ${key}`)
}

async function handleClearAllFrontend() {
  try {
    await ElMessageBox.confirm(
      `确定清除全部 ${feEntries.value.length} 条前端缓存？页面配置将从服务器重新加载。`,
      '清除前端缓存',
      { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' },
    )
    const keysToRemove = feEntries.value.map(e => e.key)
    keysToRemove.forEach(key => localStorage.removeItem(key))
    ElMessage.success(`已清除 ${keysToRemove.length} 条缓存`)
    loadFrontendCache()
  } catch {
    // 用户取消
  }
}

// ── 后端缓存状态 ──────────────────────────────────────────
const beLoading = ref(false)

type BackendStats = {
  dataSetModelCount: number
  developmentFileCount: number}

const beStats = ref<BackendStats | null>(null)

async function loadBackendStats() {
  beLoading.value = true
  try {
    beStats.value = await lowcodeApi.platform.getCacheStats()
  } catch (e) {
    ElMessage.error(`加载后端统计失败: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    beLoading.value = false
  }
}

async function handleRefreshRoutes() {
  try {
    const result = await refreshRoutes()
    ElMessage.success(`路由已刷新，共 ${result?.items.length ?? 0} 条导航项`)
  } catch (e) {
    ElMessage.error(`路由刷新失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function handleReloadNavigation() {
  try {
    const result = await reloadAndSyncNavigation()
    ElMessage.success(`导航菜单已刷新，共 ${result?.items.length ?? 0} 个顶级入口`)
  } catch (e) {
    ElMessage.error(`导航刷新失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── 初始化 ──────────────────────────────────────────────
onMounted(() => {
  loadFrontendCache()
  void loadBackendStats()
})
</script>

<style scoped>
.cache-manager {
  padding: 20px;
  max-width: 1200px;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.stats-text {
  margin-left: auto;
  color: #909399;
  font-size: 13px;
}
</style>
