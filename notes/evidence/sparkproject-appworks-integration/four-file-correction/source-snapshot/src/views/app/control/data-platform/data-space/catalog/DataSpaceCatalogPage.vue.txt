<template>
  <section class="data-space-catalog">
    <header class="catalog-header">
      <div>
        <h1>数据空间目录</h1>
        <p>查找有权访问的数据空间，可按所属应用筛选。</p>
      </div>
    </header>

    <form class="catalog-search" @submit.prevent="search">
      <label for="catalog-name">名称或 ID</label>
      <input id="catalog-name" v-model="name" type="search" autocomplete="off" placeholder="搜索名称或 rowid">
      <label for="catalog-application">所属应用</label>
      <select id="catalog-application" v-model="selectedSysid" :disabled="applicationsLoading || Boolean(applicationsError) || !scenarioId">
        <option value="">全部应用</option>
        <option v-for="application in applications" :key="application.value" :value="application.value">
          {{ application.label }}
        </option>
      </select>
      <button type="button" :disabled="!selectedSysid" @click="clearApplication">清除所属应用</button>
      <button type="submit">搜索</button>
      <button type="button" @click="reset">重置</button>
    </form>

    <p v-if="applicationsLoading" class="catalog-status" role="status">正在加载应用选项…</p>
    <p v-if="applicationsError" class="catalog-error" role="alert">
      应用选项加载失败：{{ applicationsError }}
      <button type="button" @click="loadApplications">重试应用选项</button>
    </p>

    <p v-if="error" class="catalog-error" role="alert">
      {{ error }}
      <button type="button" @click="load">重试</button>
    </p>
    <p v-else-if="loading" class="catalog-status" role="status">正在加载数据空间…</p>
    <p v-else-if="!rows.length" class="catalog-status" role="status">暂无数据空间</p>
    <p v-if="unresolvedCreatorCount" class="catalog-status" role="status">
      有 {{ unresolvedCreatorCount }} 位创建人当前无法解析
    </p>

    <table v-if="rows.length" class="catalog-table">
      <thead>
        <tr>
          <th scope="col">rowid</th>
          <th scope="col">名称</th>
          <th scope="col">类型</th>
          <th scope="col">描述</th>
          <th scope="col">所属应用</th>
          <th scope="col">创建人</th>
          <th scope="col">创建时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td>{{ row.rowid }}</td>
          <td>{{ row.Name }}</td>
          <td>{{ typeLabel(row.Type) }}</td>
          <td>{{ row.description }}</td>
          <td>{{ applicationLabel(row.sysid) }}</td>
          <td>{{ row.createuser }}</td>
          <td>{{ row.createtime }}</td>
        </tr>
      </tbody>
    </table>

    <footer v-if="total > 0" class="catalog-pagination">
      <span>共 {{ total }} 条</span>
      <label>
        每页
        <select v-model.number="pageSize" :disabled="loading" @change="changePageSize">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
        条
      </label>
      <button type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</button>
      <span>第 {{ page }} 页</span>
      <button type="button" :disabled="loading || page * pageSize >= total" @click="changePage(page + 1)">下一页</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { LowcodeDataSpaceCatalog, type LowcodeDataSpaceCatalogRow } from '@/lowcode/data-space/lowcode-data-space-catalog'

const route = useRoute()
type CatalogApplicationOption = Awaited<ReturnType<LowcodeDataSpaceCatalog['applications']>>[number]
const name = ref('')
const selectedSysid = ref('')
const applications = ref<readonly CatalogApplicationOption[]>([])
const applicationsLoading = ref(false)
const applicationsError = ref('')
const rows = ref<readonly LowcodeDataSpaceCatalogRow[]>([])
const total = ref(0)
const unresolvedCreatorCount = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
let requestRevision = 0
let applicationRevision = 0
let active = true
let ownerScenario = ''
let catalogOwner: LowcodeDataSpaceCatalog | null = null

const scenarioId = computed(() => {
  const value: unknown = route.meta['blueprintScenarioId']
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

function typeLabel(value: string): string {
  if (value === 'datasource') return '数据源'
  if (value === 'workflow') return '工作流'
  if (value === 'form') return '表单'
  return value
}

function ownerFor(scenario: string): LowcodeDataSpaceCatalog {
  if (catalogOwner !== null && ownerScenario === scenario) return catalogOwner
  catalogOwner = new LowcodeDataSpaceCatalog(scenario)
  ownerScenario = scenario
  return catalogOwner
}

function canPublish(revision: number, scenario: string, owner: LowcodeDataSpaceCatalog | null): boolean {
  return active && revision === requestRevision && scenarioId.value === scenario
    && (owner === null || (catalogOwner === owner && owner.isCurrent()))
}

function canPublishApplications(revision: number, scenario: string, owner: LowcodeDataSpaceCatalog | null): boolean {
  return active && revision === applicationRevision && scenarioId.value === scenario
    && (owner === null || (catalogOwner === owner && owner.isCurrent()))
}

function applicationLabel(sysid: string): string {
  if (sysid === '••••') return sysid
  if (!sysid) return '-'
  return applications.value.find(application => application.value === sysid)?.label ?? sysid
}

async function loadApplications(): Promise<void> {
  const revision = ++applicationRevision
  const currentScenario = scenarioId.value
  applicationsError.value = ''
  if (!currentScenario) {
    applicationsLoading.value = false
    return
  }
  applicationsLoading.value = true
  let requestOwner: LowcodeDataSpaceCatalog | null = null
  try {
    requestOwner = ownerFor(currentScenario)
    const result = await requestOwner.applications()
    if (!canPublishApplications(revision, currentScenario, requestOwner)) return
    applications.value = result
  } catch (cause) {
    if (!canPublishApplications(revision, currentScenario, requestOwner)) return
    applicationsError.value = cause instanceof Error ? cause.message : '应用选项查询失败'
  } finally {
    if (canPublishApplications(revision, currentScenario, requestOwner)) applicationsLoading.value = false
  }
}

async function load(): Promise<void> {
  const revision = ++requestRevision
  const currentScenario = scenarioId.value
  rows.value = []
  total.value = 0
  unresolvedCreatorCount.value = 0
  error.value = ''
  if (!currentScenario) {
    loading.value = false
    error.value = '当前页面缺少正式蓝图场景配置'
    return
  }
  loading.value = true
  let requestOwner: LowcodeDataSpaceCatalog | null = null
  try {
    requestOwner = ownerFor(currentScenario)
    const result = await requestOwner.query({ name: name.value, sysid: selectedSysid.value, page: page.value, pageSize: pageSize.value })
    if (!canPublish(revision, currentScenario, requestOwner)) return
    rows.value = result.rows
    total.value = result.total
    unresolvedCreatorCount.value = result.unresolvedCreatorCount
  } catch (cause) {
    if (!canPublish(revision, currentScenario, requestOwner)) return
    error.value = cause instanceof Error ? cause.message : '数据空间目录查询失败'
  } finally {
    if (canPublish(revision, currentScenario, requestOwner)) loading.value = false
  }
}

function search(): void {
  page.value = 1
  void load()
}

function clearApplication(): void {
  selectedSysid.value = ''
  search()
}

function reset(): void {
  name.value = ''
  selectedSysid.value = ''
  page.value = 1
  void load()
}

function changePage(next: number): void {
  page.value = next
  void load()
}

function changePageSize(): void {
  page.value = 1
  void load()
}

watch(scenarioId, () => {
  catalogOwner = null
  ownerScenario = ''
  applications.value = []
  applicationsError.value = ''
  selectedSysid.value = ''
  page.value = 1
  void loadApplications()
  void load()
})

onMounted(() => {
  void loadApplications()
  void load()
})
onBeforeUnmount(() => {
  active = false
  requestRevision += 1
  applicationRevision += 1
})
</script>

<style scoped>
.data-space-catalog { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary, #303133); }
.catalog-header h1 { margin: 0; font-size: 20px; }
.catalog-header p { margin: 6px 0 0; color: var(--el-text-color-secondary, #606266); }
.catalog-search, .catalog-pagination { display: flex; align-items: center; gap: 10px; }
.catalog-search input, .catalog-pagination select { min-height: 32px; padding: 4px 8px; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; }
.catalog-search input { width: min(360px, 45vw); }
.catalog-search select { min-height: 32px; padding: 4px 8px; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; background: var(--el-bg-color, #fff); }
.catalog-search button, .catalog-pagination button, .catalog-error button { min-height: 32px; padding: 4px 12px; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; background: var(--el-bg-color, #fff); cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
.catalog-error { display: flex; align-items: center; gap: 12px; color: var(--el-color-danger, #f56c6c); }
.catalog-status { color: var(--el-text-color-secondary, #606266); }
.catalog-table { width: 100%; border-collapse: collapse; }
.catalog-table th, .catalog-table td { padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); text-align: left; }
.catalog-table th { color: var(--el-text-color-secondary, #606266); font-weight: 600; }
.catalog-pagination { justify-content: flex-end; }
</style>
