<template>
  <div class="dev-project-picker">
    <DisplayAlert v-if="error" :description="error" alert-type="error" :closable="false" />
    <RendererButton v-else-if="ready && viewKey" :data-view-key="viewKey" label="切换项目" @click="pickerOpen = true" />
    <DisplayAlert v-else :description="loading ? '正在读取导航项目…' : '当前导航未配置可用项目'" alert-type="info" :closable="false" />
    <RendererDialog v-model="pickerOpen" title="切换开发项目" width="620px" destroy-on-close>
      <RendererTree
        v-if="ready && viewKey && parentField"
        :key="viewKey"
        :data-view-key="viewKey"
        :node-key="primaryKey"
        :children="fields"
        :tree-props="{highlightCurrent: true, defaultExpandAll: true, expandOnClickNode: false}"
        :show-data-view-meta="false"
        :on-node-click="observeCandidateSelection"
      />
      <RendererTable
        v-else-if="ready && viewKey"
        :key="viewKey"
        :data-view-key="viewKey"
        :children="fields"
        :highlight-current-row="true"
        :show-data-view-meta="false"
        :on-row-click="observeCandidateSelection"
      />
      <template #footer>
        <RendererButton label="取消" @click="pickerOpen = false" />
        <RendererButton v-if="ready && viewKey" :data-view-key="viewKey" label="打开所选项目" :disabled="!canOpen || busy" :loading="busy" @click="openSelected" />
      </template>
    </RendererDialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, DataViewFilter, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DisplayAlert, PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, RendererTree, useSparkComponent} from '@spark-appworks/spark-component'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import type {DevState} from '../useDevState'
import {configureProjectHierarchy, resolveNavHostProjectBinding, resolveProjectCandidate, validateProjectHierarchy} from './nav-host-project-picker-contract'

const props = defineProps<{state: DevState}>()
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'dev-system-nav-host-project-picker'})
const loading = ref(false), error = ref(''), ready = ref(false), viewKey = ref(''), valueField = ref(''), labelField = ref(''), parentField = ref(''), primaryKey = ref(''), fields = ref<SparkNode[]>([])
const busy = ref(false)
const selectionRevision = ref(0)
const pickerOpen = ref(false)
let runtime: PageRuntime | undefined, hostRuntime: PageRuntime | undefined
let generation = 0
const navigationId = computed(() => {
  const value = route.query[SYSTEM_PAGE_NAVIGATION_ID_QUERY]
  return typeof value === 'string' ? value.trim() : ''
})

function dispose(): void {
  ready.value = false
  pickerOpen.value = false
  viewKey.value = ''
  valueField.value = ''
  labelField.value = ''
  parentField.value = ''
  primaryKey.value = ''
  fields.value = []
  busy.value = false
  sparkRemove(PAGE_RUNTIME)
  runtime?.dispose()
  runtime = undefined
  hostRuntime?.dispose()
  hostRuntime = undefined
}

const canOpen = computed(() => {
  void selectionRevision.value
  const view = runtime?.resolveView(viewKey.value)
  const row = view?.currentRow
  if (!view || !row || !valueField.value || !labelField.value) return false
  try {resolveProjectCandidate(view, row, {valueField: valueField.value, labelField: labelField.value}); return true}
  catch {return false}
})

function observeCandidateSelection(): void {selectionRevision.value++}

watch([navigationId, () => props.state.projectId], async ([hostId], _old, onCleanup) => {
  const own = ++generation
  let stale = false
  onCleanup(() => { stale = true })
  dispose()
  error.value = ''
  loading.value = false
  if (!hostId) { error.value = '缺少当前导航身份，不能选择项目'; return }
  loading.value = true
  try {
    const currentProject = props.state.projectId
    if (currentProject === getBuiltinApplicationDescriptor().id) {
      error.value = '仓内蓝图尚未接入该资源'
      return
    }
    const relationRuntime = new PageRuntime({pageId: 'dev-system-nav-host-relation', scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      loadScenario: id => loadLowcodeRuntimeScenario({projectId: currentProject, scenarioId: id})})
    hostRuntime = relationRuntime
    await relationRuntime.load()
    if (stale || own !== generation || currentProject !== props.state.projectId) {relationRuntime.dispose(); return}
    const hostView = relationRuntime.resolveView(`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_Navigation_DataRelation@default`)
    if (!hostView) throw new Error('导航宿主关系 DataView 不存在')
    if (hostView.dataSet?.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY
      || hostView.dataTable?.modelBinding?.modelName !== 'Base_Navigation_DataRelation' || hostView.viewId !== 'default') {
      throw new Error('导航宿主关系 DataView 身份不匹配')
    }
    hostView.resetState()
    hostView.queryConfig = {...hostView.queryConfig, allPages: true}
    hostView.filterExpression = DataViewFilter.condition({field: 'prowid', operator: 'eq', value: hostId}).toJSON()
    await hostView.refresh()
    if (stale || own !== generation || currentProject !== props.state.projectId) return
    if (hostView.loadingError) throw hostView.loadingError
    if (hostView.rows.length !== hostView.total) throw new Error('导航宿主关系 DataView 读取不完整')
    if (hostView.total === 0) throw new Error('当前导航未配置项目切换关系')
    if (hostView.total > 1) throw new Error('当前导航存在多条项目切换关系')
    const binding = resolveNavHostProjectBinding(hostView, hostId)
    const {scenarioId, modelName, valueField: mappedValueField, labelField: mappedLabelField, parentField: mappedParentField} = binding
    const next = new PageRuntime({pageId: 'dev-system-nav-host-project-picker', scenarioIds: [scenarioId],
      loadScenario: id => loadLowcodeRuntimeScenario({projectId: currentProject, scenarioId: id})})
    runtime = next
    await next.load()
    if (stale || own !== generation) { next.dispose(); return }
    const candidateView = next.resolveView(buildDataViewKey(modelName, 'default', scenarioId))
    if (!candidateView) throw new Error('导航项目候选默认 DataView 不存在')
    if (candidateView.dataSet?.scenarioId !== scenarioId
      || candidateView.dataTable?.modelBinding?.modelName !== modelName || candidateView.viewId !== 'default') {
      throw new Error('导航项目候选 DataView 身份不匹配')
    }
    candidateView.resetState()
    if (mappedParentField) configureProjectHierarchy(candidateView, {valueField: mappedValueField, labelField: mappedLabelField, parentField: mappedParentField})
    if (mappedParentField) candidateView.queryConfig = {...candidateView.queryConfig, allPages: true}
    await candidateView.refresh()
    if (stale || own !== generation) { next.dispose(); return }
    if (candidateView.loadingError) throw candidateView.loadingError
    if (mappedParentField && candidateView.rows.length !== candidateView.total) throw new Error('导航项目候选 DataView 读取不完整')
    if (candidateView.rows.length === 0) throw new Error('导航项目候选为空')
    if (mappedParentField) validateProjectHierarchy(candidateView, {valueField: mappedValueField, labelField: mappedLabelField, parentField: mappedParentField})
    const candidateFields = [mappedValueField, mappedLabelField, candidateView.primaryKey, ...(mappedParentField ? [mappedParentField] : [])]
    if (candidateFields.some(field => !field || candidateView.rows.some(row => candidateView.fieldAccess(row, field).read !== 'visible'))) {
      throw new Error('导航项目候选值、文案或行身份字段不可读')
    }
    if (mappedParentField) {
      const rowIds = candidateView.rows.map(row => candidateView.getPkKey(row))
      if (rowIds.some(id => id === undefined) || new Set(rowIds).size !== rowIds.length) throw new Error('导航项目候选行身份缺失或重复')
      const values = candidateView.rows.map(row => row[mappedValueField])
      if (values.some(value => typeof value !== 'string' || !value.trim()) || new Set(values).size !== values.length) {
        throw new Error('导航项目候选值为空或重复')
      }
    }
    fields.value = [
      {type: 'r-text', props: {dataMember: 'currentRow', dataField: mappedLabelField, label: '项目名称'}},
      {type: 'r-text', props: {dataMember: 'currentRow', dataField: mappedValueField, label: '项目 ID'}},
    ]
    viewKey.value = buildDataViewKey(modelName, 'default', scenarioId)
    valueField.value = mappedValueField
    labelField.value = mappedLabelField
    parentField.value = mappedParentField ?? ''
    primaryKey.value = candidateView.primaryKey
    sparkProvide(PAGE_RUNTIME, next)
    ready.value = true
  } catch (cause) {
    if (!stale && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); dispose()}
  } finally {if (!stale && own === generation) loading.value = false}
}, {immediate: true})

async function openSelected(): Promise<void> {
  const own = generation
  const selectedView = runtime?.resolveView(viewKey.value)
  const selected = selectedView?.currentRow
  if (!selectedView || !selected || busy.value) return
  busy.value = true
  try {
    const selectedValueField = valueField.value, selectedLabelField = labelField.value
    if (!selectedValueField || !selectedLabelField) return
    let value: string
    try {value = resolveProjectCandidate(selectedView, selected, {valueField: selectedValueField, labelField: selectedLabelField})}
    catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return}
    if (own !== generation || selectedView !== runtime?.resolveView(viewKey.value)) return
    if (!parentField.value) {
      const selectedPk = selectedView.getPkKey(selected)
      const scenario = selectedView.dataSet?.scenarioId
      const model = selectedView.dataTable?.modelBinding?.modelName
      const viewId = selectedView.viewId
      const nav = navigationId.value
      try {
        const rows = await selectedView.queryOptionRows({fields: [selectedView.primaryKey, selectedValueField, selectedLabelField],
          filter: DataViewFilter.condition({field: selectedValueField, operator: 'eq', value}).toJSON()})
        if (own !== generation || selectedView !== runtime?.resolveView(viewKey.value) || nav !== navigationId.value
          || scenario !== selectedView.dataSet?.scenarioId || model !== selectedView.dataTable?.modelBinding?.modelName
          || viewId !== selectedView.viewId || selectedView.getPkKey(selectedView.currentRow ?? {}) !== selectedPk) throw new Error('导航项目候选身份已改变')
        if (rows.length !== 1 || rows[0]?.[selectedView.primaryKey] !== selectedPk || rows[0]?.[selectedValueField] !== value) {
          throw new Error('导航项目候选精确核验失败')
        }
      } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return}
    }
    try {await props.state.openEditingProject({tenantId: props.state.tenantId, projectId: value})}
    catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  } finally {if (own === generation) busy.value = false}
}

onBeforeUnmount(() => {generation++; dispose()})
</script>
