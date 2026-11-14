<!--
@module app:views/app/settings/local-page-cache-card
职责：在系统设置中查看与清理浏览器 localStorage 里的页面文件缓存（spark_page_ / spark_file_）。
边界：只处理本机缓存，不触及后端缓存（后端缓存由 AppWorks 缓存管理页经 DataView 维护）；缓存回收仍由 FileLoader 按 lastAccess LRU 执行。
AI用途：需要定位本机页面缓存的查看、删除或清空入口时，用本模块定位 views/app/settings/local-page-cache-card。
-->
<template>
  <RendererCard header="本机页面缓存" class="local-page-cache-card">
    <div class="cache-toolbar">
      <RendererButton size="small" label="刷新" @click="loadEntries" />
      <RendererButton size="small" label="清除全部" button-type="danger" :disabled="entries.length === 0" @click="clearAll" />
      <span class="cache-stats">共 {{ entries.length }} 条缓存，约 {{ totalSizeKB }} KB</span>
    </div>
    <table class="cache-table">
      <thead>
        <tr>
          <th>缓存键</th>
          <th>大小 (KB)</th>
          <th>过期级别</th>
          <th>文件时间</th>
          <th>最后访问</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in entries" :key="row.key">
          <td class="cache-key" :title="row.key">{{ row.key }}</td>
          <td class="cache-num">{{ row.sizeKB.toFixed(1) }}</td>
          <td class="cache-num">
            <DisplayTag :type="expirationTagType(row.expirationLevel)">L{{ row.expirationLevel }}</DisplayTag>
          </td>
          <td :title="row.sourceTimestamp">{{ row.sourceTimestampStr }}</td>
          <td>{{ row.lastAccessStr }}</td>
          <td>
            <RendererButton label="删除" button-type="danger" size="small" :link="true" @click="removeEntry(row.key)" />
          </td>
        </tr>
      </tbody>
    </table>
    <ul class="cache-levels">
      <li><strong>L0</strong> 永不过期</li>
      <li><strong>L1</strong> 3 天</li>
      <li><strong>L2</strong> 7 天</li>
      <li><strong>L3</strong> 15 天（默认）</li>
      <li><strong>L4</strong> 30 天</li>
    </ul>
  </RendererCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {DisplayTag, PAGE_SERVICE, RendererButton, RendererCard, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import { isRecord } from '@spark-appworks/spark-utils'

const {sparkConsume} = useSparkComponent({type: 'local-page-cache-card'})
const pageService = consumeRequiredPageService(sparkConsume, 'local-page-cache-card')

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

function expirationTagType(level: number): 'success' | 'warning' | 'danger' | 'info' {
  if (level === 0) return 'danger'
  return level <= 2 ? 'warning' : 'info'
}

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

function loadEntries(): void {
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

.cache-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cache-table th,
.cache-table td {
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 10px;
  text-align: left;
}

.cache-table thead th {
  background: var(--el-fill-color-light);
}

.cache-key {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cache-num {
  text-align: right;
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