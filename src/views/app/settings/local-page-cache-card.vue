<!--
@module app:views/app/settings/local-page-cache-card
职责：在系统设置中查看与清理浏览器 localStorage 里的页面文件缓存（spark_page_ / spark_file_）。
边界：只处理本机缓存，不触及后端缓存（后端缓存由 AppWorks 缓存管理页经 DataView 维护）；缓存回收仍由 FileLoader 按 lastAccess LRU 执行。缓存条目镜像到本地 DataView 供标准表格绑定，不持久化。
AI用途：需要定位本机页面缓存的查看、删除或清空入口时，用本模块定位 views/app/settings/local-page-cache-card。
-->
<template>
  <SparkComponent.RendererCard header="本机页面缓存" class="local-page-cache-card">
    <div class="cache-toolbar">
      <SparkComponent.RendererButton size="small" label="刷新" @click="loadEntries" />
      <SparkComponent.RendererButton size="small" label="清除全部" button-type="danger" :disabled="entries.length === 0" @click="clearAll" />
      <span class="cache-stats">共 {{ entries.length }} 条缓存，约 {{ totalSizeKB }} KB</span>
    </div>
    <SparkComponent.RendererTable v-if="local" :data-view-key="local.key(CACHE_TABLE)" :children="fields" :actions="actions" :auto-columns="false"
      :show-pagination="false" :show-data-view-meta="false" :border="true" :action-column="{label: '操作', width: 100}" />
    <ul class="cache-levels">
      <li><strong>L0</strong> 永不过期</li>
      <li><strong>L1</strong> 3 天</li>
      <li><strong>L2</strong> 7 天</li>
      <li><strong>L3</strong> 15 天（默认）</li>
      <li><strong>L4</strong> 30 天</li>
    </ul>
  </SparkComponent.RendererCard>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { DataRow, SparkNode } from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import { isRecord } from '@spark-appworks/spark-utils'
import { HostLocalRuntime } from '@/layout/host-local-runtime'

const {sparkConsume, sparkProvide, sparkRemove} = SparkComponent.useSparkComponent({type: 'local-page-cache-card'})
const pageService = SparkComponent.consumeRequiredPageService(sparkConsume, 'local-page-cache-card')

type LocalPageCacheRow = {
  key: string
  sizeKB: number
  sourceTimestampMs: number
  sourceTimestampStr: string
  expirationLevel: number
  lastAccessStr: string
}

const CACHE_TABLE = 'HostLocalPageCache'
const CACHE_PREFIXES = ['spark_page_', 'spark_file_']
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'key', label: '缓存键', readonly: true, minWidth: 240, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'sizeKB', label: '大小 (KB)', readonly: true, width: 100}},
  {type: 'r-text', props: {field: 'expirationLevel', label: '过期级别', readonly: true, width: 90}},
  {type: 'r-text', props: {field: 'sourceTimestamp', label: '文件时间', readonly: true, width: 170}},
  {type: 'r-text', props: {field: 'lastAccess', label: '最后访问', readonly: true, width: 170}},
]
const actions: SparkComponent.RToolbarProps = {children: [
  {type: 'r-button', props: {label: '删除', buttonType: 'danger', link: true, onClick: (row: unknown) => { if (isRecord(row) && typeof row['key'] === 'string') removeEntry(row['key']) }}},
]}
const entries = ref<LocalPageCacheRow[]>([])
const totalSizeKB = computed(() => entries.value.reduce((sum, entry) => sum + entry.sizeKB, 0).toFixed(1))
const local = shallowRef<HostLocalRuntime>()
let active = true

function compareKey(a: LocalPageCacheRow, b: LocalPageCacheRow): number {
  return a.key.localeCompare(b.key, undefined, { numeric: true })
}

function formatTime(ts: number): string {
  return ts ? new Date(ts).toLocaleString('zh-CN') : '—'
}

function normalizeSourceTimestamp(value: unknown): { time: number; text: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? { time: value, text: formatTime(value) } : { time: 0, text: String(value) }
  }
  if (typeof value !== 'string' || !value.trim()) return { time: 0, text: '—' }
  const raw = value.trim()
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 10_000_000_000) return { time: numeric, text: formatTime(numeric) }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? { time: parsed, text: formatTime(parsed) } : { time: 0, text: raw }
}

function readEntries(): LocalPageCacheRow[] {
  const rows: LocalPageCacheRow[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    let lastAccess = 0
    let expirationLevel = 3
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
      sourceTimestampMs: sourceTimestamp.time,
      sourceTimestampStr: sourceTimestamp.text,
      expirationLevel,
      lastAccessStr: formatTime(lastAccess),
    })
  }
  return rows.sort((a, b) => (b.sourceTimestampMs - a.sourceTimestampMs) || compareKey(a, b))
}

function tableRows(): DataRow[] {
  return entries.value.map(entry => ({
    key: entry.key,
    sizeKB: entry.sizeKB.toFixed(1),
    expirationLevel: `L${entry.expirationLevel}`,
    sourceTimestamp: entry.sourceTimestampStr,
    lastAccess: entry.lastAccessStr,
  }))
}

function setEntries(rows: LocalPageCacheRow[]): void {
  entries.value = rows
  local.value?.replaceRows(CACHE_TABLE, tableRows())
}

function loadEntries(): void {
  setEntries(readEntries())
}

function removeEntry(key: string): void {
  localStorage.removeItem(key)
  setEntries(entries.value.filter(entry => entry.key !== key))
  pageService.showMessage(`已删除: ${key}`, 'success')
}

async function clearAll(): Promise<void> {
  if (!await pageService.showConfirm(
    `确定清除全部 ${entries.value.length} 条本机页面缓存？页面配置将从服务器重新加载。`,
    '清除本机页面缓存',
    { type: 'warning', confirmText: '清除', cancelText: '取消' },
  )) return
  const keys = entries.value.map(entry => entry.key)
  keys.forEach(key => localStorage.removeItem(key))
  pageService.showMessage(`已清除 ${keys.length} 条缓存`, 'success')
  loadEntries()
}

entries.value = readEntries()
void HostLocalRuntime.create({ scenarioId: 'host-local-page-cache', tables: {
  [CACHE_TABLE]: {
    columns: ['key', 'sizeKB', 'expirationLevel', 'sourceTimestamp', 'lastAccess'].map(name => ({ name, type: 'string' as const })),
    rows: tableRows(),
  },
} }).then(created => {
  if (!active) { created.dispose(); return }
  created.replaceRows(CACHE_TABLE, tableRows())
  sparkProvide(SparkComponent.PAGE_RUNTIME, created.runtime)
  local.value = created
}).catch((error: unknown) => {
  pageService.showMessage(`本机页面缓存装配失败：${error instanceof Error ? error.message : String(error)}`, 'error')
})

onBeforeUnmount(() => {
  active = false
  sparkRemove(SparkComponent.PAGE_RUNTIME)
  local.value?.dispose()
})
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
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
</style>
