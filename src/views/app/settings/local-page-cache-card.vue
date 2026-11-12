<!--
@module app:views/app/settings/local-page-cache-card
职责：在系统设置中查看与清理浏览器 localStorage 里的页面文件缓存（spark_page_ / spark_file_）。
边界：只处理本机缓存，不触及后端缓存（后端缓存由 AppWorks 缓存管理页经 DataView 维护）；缓存回收仍由 FileLoader 按 lastAccess LRU 执行。
AI用途：需要定位本机页面缓存的查看、删除或清空入口时，用本模块定位 views/app/settings/local-page-cache-card。
-->
<template>
  <el-card header="本机页面缓存" class="local-page-cache-card">
    <div class="cache-toolbar">
      <el-button size="small" @click="loadEntries">刷新</el-button>
      <el-button size="small" type="danger" :disabled="entries.length === 0" @click="clearAll">清除全部</el-button>
      <span class="cache-stats">共 {{ entries.length }} 条缓存，约 {{ totalSizeKB }} KB</span>
    </div>
    <el-table :data="entries" stripe border size="small" max-height="420" style="width: 100%">
      <el-table-column prop="key" label="缓存键" min-width="280" show-overflow-tooltip sortable :sort-method="compareKey" />
      <el-table-column prop="sizeKB" label="大小 (KB)" width="100" align="right" sortable :sort-method="compareSize" :formatter="formatSize" />
      <el-table-column prop="expirationLevel" label="过期级别" width="100" align="center" sortable>
        <template #default="{ row }">
          <el-tag :type="expirationTagType(row.expirationLevel)" size="small">L{{ row.expirationLevel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sourceTimestampMs" label="文件时间" width="170" sortable :sort-method="compareSourceTimestamp">
        <template #default="{ row }"><span :title="row.sourceTimestamp">{{ row.sourceTimestampStr }}</span></template>
      </el-table-column>
      <el-table-column prop="lastAccess" label="最后访问" width="170" sortable :sort-method="compareLastAccess">
        <template #default="{ row }">{{ row.lastAccessStr }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button type="danger" size="small" link @click="removeEntry(row.key)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-descriptions :column="5" border size="small" class="cache-levels">
      <el-descriptions-item label="L0">永不过期</el-descriptions-item>
      <el-descriptions-item label="L1">3 天</el-descriptions-item>
      <el-descriptions-item label="L2">7 天</el-descriptions-item>
      <el-descriptions-item label="L3">15 天（默认）</el-descriptions-item>
      <el-descriptions-item label="L4">30 天</el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRecord } from '@spark-appworks/spark-utils'

type LocalPageCacheRow = {
  key: string
  sizeKB: number
  sourceTimestamp: string
  sourceTimestampMs: number
  sourceTimestampStr: string
  expirationLevel: number
  lastAccess: number
  lastAccessStr: string
}

const CACHE_PREFIXES = ['spark_page_', 'spark_file_']
const entries = ref<LocalPageCacheRow[]>([])
const totalSizeKB = computed(() => entries.value.reduce((sum, entry) => sum + entry.sizeKB, 0).toFixed(1))

function compareKey(a: LocalPageCacheRow, b: LocalPageCacheRow): number {
  return a.key.localeCompare(b.key, undefined, { numeric: true })
}
function formatSize(row: LocalPageCacheRow): string { return row.sizeKB.toFixed(1) }
function compareSize(a: LocalPageCacheRow, b: LocalPageCacheRow): number { return a.sizeKB - b.sizeKB }
function compareSourceTimestamp(a: LocalPageCacheRow, b: LocalPageCacheRow): number { return a.sourceTimestampMs - b.sourceTimestampMs }
function compareLastAccess(a: LocalPageCacheRow, b: LocalPageCacheRow): number { return a.lastAccess - b.lastAccess }

function formatTime(ts: number): string {
  return ts ? new Date(ts).toLocaleString('zh-CN') : '—'
}

function normalizeSourceTimestamp(value: unknown): { raw: string; time: number; text: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? { raw: String(value), time: value, text: formatTime(value) } : { raw: String(value), time: 0, text: String(value) }
  }
  if (typeof value !== 'string' || !value.trim()) return { raw: '', time: 0, text: '—' }
  const raw = value.trim()
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 10_000_000_000) return { raw, time: numeric, text: formatTime(numeric) }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? { raw, time: parsed, text: formatTime(parsed) } : { raw, time: 0, text: raw }
}

function expirationTagType(level: number): 'success' | 'warning' | 'danger' | 'info' {
  if (level === 0) return 'danger'
  return level <= 2 ? 'warning' : 'info'
}

function loadEntries(): void {
  const rows: LocalPageCacheRow[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    let lastAccess = 0
    let expirationLevel = 3
    // 缓存“新旧”看 sourceTimestamp（后端文件 mtime/版本戳）；cachedAt 只是本地重建时间，不代表文件更新。
    let sourceTimestamp = normalizeSourceTimestamp(undefined)
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) {
        sourceTimestamp = normalizeSourceTimestamp(parsed['sourceTimestamp'])
        if (typeof parsed['lastAccess'] === 'number') lastAccess = parsed['lastAccess']
        if (typeof parsed['expirationLevel'] === 'number') expirationLevel = parsed['expirationLevel']
      }
    } catch {
      // 非 JSON 缓存条目仍可查看与删除，元数据按默认值展示。
    }
    rows.push({
      key,
      sizeKB: new Blob([raw]).size / 1024,
      sourceTimestamp: sourceTimestamp.raw,
      sourceTimestampMs: sourceTimestamp.time,
      sourceTimestampStr: sourceTimestamp.text,
      expirationLevel,
      lastAccess,
      lastAccessStr: formatTime(lastAccess),
    })
  }
  rows.sort((a, b) => (b.sourceTimestampMs - a.sourceTimestampMs) || compareKey(a, b))
  entries.value = rows
}

function removeEntry(key: string): void {
  localStorage.removeItem(key)
  entries.value = entries.value.filter(entry => entry.key !== key)
  ElMessage.success(`已删除: ${key}`)
}

async function clearAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定清除全部 ${entries.value.length} 条本机页面缓存？页面配置将从服务器重新加载。`,
      '清除本机页面缓存',
      { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const keys = entries.value.map(entry => entry.key)
  keys.forEach(key => localStorage.removeItem(key))
  ElMessage.success(`已清除 ${keys.length} 条缓存`)
  loadEntries()
}

onMounted(loadEntries)
</script>

<style scoped>
.local-page-cache-card {
  margin-top: 24px;
}

.cache-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cache-stats {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.cache-levels {
  margin-top: 12px;
}
</style>
