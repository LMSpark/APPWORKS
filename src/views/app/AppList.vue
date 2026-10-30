<!--
@module app:views/app/AppList
职责：提供主应用 AppList 能力，围绕应用目录连接视图、服务、布局和应用路由。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/AppList。
-->
<template>
  <div class="app-list-page">
    <p v-if="runtimeError" role="alert">{{ runtimeError }}</p>
    <RendererPageHeader
      v-if="scenarioView && !runtimeError"
      :data-view-key="scenarioDataViewKey"
      title="返回"
      content="应用管理"
      @back="router.go(-1)"
    />

    <div class="app-list-content">
      <RendererList
        v-if="scenarioView && !runtimeError"
        class="app-scenario-list"
        :data-view-key="scenarioDataViewKey"
        :children="scenarioRowChildren"
        :columns="4"
        :grid-columns="24"
        :grid-gap="20"
        :item-grid-gap="0"
        :show-pagination="false"
        :use-card="true"
        card-shadow="hover"
        row-key="rowid"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
/**
 * @description 应用列表页面，以卡片网格展示已创建的项目/应用及入口；不作为 SparkNode 组件配置生成。
 */
import { ref, shallowRef, onMounted, computed, inject, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { lowcodeApi, readLowcodePrincipal } from '@/lowcode/lowcode-runtime'
import { PROJECT_SWITCH_KEY } from '@/services/project/project-shell'
import { buildApplicationPath, parseApplicationPathScope, APPLICATION_CATALOG_PROJECT_ID } from '@/services/application-scope'
import { getNavHomePath } from '@spark-appworks/spark-app'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { PAGE_RUNTIME, RendererList, RendererPageHeader, useSparkComponent } from '@spark-appworks/spark-component'
import type { DataRow, DataView, SparkNode } from '@spark-appworks/spark-data'
import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {getFormalModelView, loadLowcodeApplicationCatalog} from '@/lowcode/lowcode-application-catalog'

type ProjectItem = {
  projectId: string
  name: string
  description: string
}

const router = useRouter()
const route = useRoute()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const { sparkProvide } = useSparkComponent({ type: 'app-list' })
const runtimeError = ref('')
const scenarioView = shallowRef<DataView | null>(null)
let runtime: PageRuntime | undefined
let active = true
let generation = 0
let unsubscribe: (() => void) | undefined

const blueprintScenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const scenarioId = computed(() => blueprintScenarioId.value || getBuiltinScenarioResource('projectBlueprint').scenarioId)
const scenarioViewId = computed(() => blueprintScenarioId.value ? 'default' : 'catalogApps')
const scenarioDataViewKey = computed(() => `${scenarioId.value}@Base_AppSystemList@${scenarioViewId.value}`)

function projectFromRow(row: DataRow): ProjectItem {
  const view = scenarioView.value
  if (!view || view.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('应用目录 DataView 缺少可读的应用身份')
  const id = row['rowid']
  if (typeof id !== 'string' || !id.trim()) throw new Error('应用目录 DataView 返回了无效主键')
  const description = view.fieldAccess(row, 'AppDesc').read === 'visible' ? String(row['AppDesc'] ?? '') : ''
  const code = view.fieldAccess(row, 'AppName').read === 'visible' ? String(row['AppName'] ?? '') : ''
  return {projectId: id, name: description || code || id, description}
}

function rowButton(type: string, id: string, props: Record<string, unknown>): SparkNode {
  return {type, id, props}
}

const scenarioRowChildren = computed<SparkNode[]>(() => {
  const dataViewKey = scenarioDataViewKey.value
  const field = (id: string, dataField: string, extra: Record<string, unknown> = {}) => rowButton('r-text', id, {
    dataViewKey, dataMember: 'currentRow', dataField, ...extra,
  })
  const button = (id: string, label: string, extra: Record<string, unknown> = {}) => rowButton('r-button', id, {
    dataViewKey, label, buttonSize: 'small', ...extra,
  })
  const condition = (fieldName: string, predicate: (row: DataRow) => boolean) => (
    ({ row, dataSource }: { row?: DataRow | null; dataSource?: DataView | null }) => Boolean(row && dataSource
      && Object.hasOwn(row, fieldName) && dataSource.fieldAccess(row, fieldName).read === 'visible' && predicate(row))
  )
  return [
    rowButton('display-icon', 'app-icon', { icon: 'Box', iconSize: 32 }),
    field('app-name', 'AppDesc', { displayFallbackFields: ['AppName', 'rowid'], label: '应用名称' }),
    field('app-description', 'Memo', { emptyText: '暂无描述', label: '描述' }),
    {
      type: 'r-toolbar',
      id: 'app-actions',
      props: {wrap: true, gridColSpan: 24},
      children: [
      button('app-home-tag', '应用工场', { disabled: true, buttonType: 'warning', onBeforeRender: condition('IsSys', row => Number(row['IsSys'] ?? 0) === 1) }),
      button('app-standard-tag', '应用', { disabled: true, buttonType: 'info', onBeforeRender: condition('IsSys', row => Number(row['IsSys'] ?? 0) !== 1) }),
      button('app-switch', '进入应用', { buttonType: 'primary', onBeforeRender: condition('rowid', row => String(row['rowid'] ?? '') !== currentProjectId.value), onClick: (row: DataRow) => handleSwitch(projectFromRow(row)) }),
      button('app-current-tag', '当前应用', { disabled: true, buttonType: 'success', onBeforeRender: condition('rowid', row => String(row['rowid'] ?? '') === currentProjectId.value) }),
      ],
    },
  ]
})

const currentProjectId = computed(() => lowcodeApi.application.get()?.application.id ?? APPLICATION_CATALOG_PROJECT_ID)

async function loadProjects() {
  return loadScenarioProjects(scenarioId.value)
}

async function loadScenarioProjects(scenarioId: string): Promise<void> {
  const own = ++generation
  runtimeError.value = ''
  scenarioView.value = null
  runtime?.dispose(); runtime = undefined; unsubscribe?.(); unsubscribe = undefined
  const isBlueprintScenario = Boolean(blueprintScenarioId.value)
  const projectId = parseApplicationPathScope(route.path)?.projectId ?? ''
  if (isBlueprintScenario && !projectId) { runtimeError.value = '应用目录页面缺少正式应用身份'; return }
  try {
    const current = new PageRuntime({pageId: 'application-manager-page', scenarioIds: [scenarioId],
      loadScenario: id => isBlueprintScenario
        ? loadLowcodeRuntimeScenario({projectId, scenarioId: id})
        : loadLowcodeApplicationCatalog()})
    runtime = current
    sparkProvide(PAGE_RUNTIME, current)
    await current.load()
    if (!active || own !== generation || current.destroyed) { current.dispose(); return }
    const loaded = current.getDataSet(scenarioId)
    const view = loaded ? getFormalModelView(loaded, 'Base_AppSystemList', scenarioViewId.value) : undefined
    if (!loaded || !view) throw new Error('应用目录场景缺少 Base_AppSystemList@default')
    if (view.queryConfig.allPages !== true) throw new Error('应用目录 DataView 必须配置 queryConfig.allPages=true，避免静默只显示第一页')
    const update = () => {
      if (!active || own !== generation) return
      try {
        validateScenarioView(view)
        runtimeError.value = ''
      } catch (cause) {
        runtimeError.value = cause instanceof Error ? cause.message : String(cause)
      }
    }
    unsubscribe = loaded.onAnyViewChange({rowsChanged: update, requestStateChanged: update})
    const result = await view.requestRefresh()
    if (!active || own !== generation || current.destroyed) return
    if (!result.success) throw new Error(result.message ?? '应用目录 DataView 查询未成功')
    validateScenarioView(view)
    scenarioView.value = view
  } catch (cause) {
    if (active && own === generation) {
      runtimeError.value = cause instanceof Error ? cause.message : String(cause)
      unsubscribe?.(); unsubscribe = undefined
      runtime?.dispose(); runtime = undefined; scenarioView.value = null
    }
  }
}

function validateScenarioView(view: DataView): void {
  if (view.primaryKey !== 'rowid' || view.dataTable?.modelBinding?.modelName !== 'Base_AppSystemList') {
    throw new Error('应用目录 DataView 模型或主键身份不匹配')
  }
  for (const row of view.rows) {
    if (view.fieldAccess(row, 'rowid').read !== 'visible') {
      throw new Error('应用目录 DataView 缺少可读的应用身份')
    }
    if (typeof row['rowid'] !== 'string' || !String(row['rowid']).trim()) {
      throw new Error('应用目录 DataView 返回了无效主键')
    }
  }
}

function getProjectSwitch() {
  if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务，无法同步项目上下文')
  return projectSwitch
}

async function handleSwitch(project: ProjectItem) {
  try {
    const principal = readLowcodePrincipal()
    if (!principal) throw new Error('未登录，无法切换应用')
    const receipt = await getProjectSwitch().switchAndReload(project.projectId)
    receipt.assertCurrent()
    const failure = await router.push(buildApplicationPath({ projectId: project.projectId }, getNavHomePath()))
    receipt.assertCurrent()
    if (failure) throw new Error('应用页面导航未完成')
    ElMessage.success(`已切换到「${project.name}」`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '切换应用失败')
  }
}

onMounted(async () => {
  await loadProjects()
})
watch(() => route.meta['blueprintScenarioId'], () => {
  generation++; unsubscribe?.(); unsubscribe = undefined; runtime?.dispose(); runtime = undefined; scenarioView.value = null
  runtimeError.value = ''
  void loadProjects()
}, {flush: 'sync'})
onBeforeUnmount(() => { active = false; generation++; unsubscribe?.(); runtime?.dispose(); runtime = undefined })
</script>

<style scoped>
.app-list-page {
  padding: 20px;
}

.app-list-content {
  margin-top: 20px;
}

</style>
