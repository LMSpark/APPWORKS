<!--
@module app:views/app/dev-system/DevPreviewTab
职责：提供 DevSystem 的 DevPreviewTab 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevPreviewTab。
-->
<template>
  <div class="dev-preview-tab">
    <!-- 工具栏 -->
    <div class="preview-toolbar">
      <div class="preview-toolbar__left">
        <FieldSwitch
          v-model="livePreview"
          active-text="实时预览"
          inactive-text="手动"
        />
        <FieldSwitch
          v-model="autoRefresh"
          active-text="切Tab刷新"
          inactive-text="—"
        />
      </div>
      <div class="preview-toolbar__right">
        <RendererButton label="刷新预览" button-type="default" :loading="loading" @click="refresh" />
      </div>
    </div>

    <!-- 预览区域 -->
    <div class="preview-container">
      <template v-if="loading">
        <DisplayAlert title="正在加载预览…" alert-type="info" />
      </template>
      <template v-else-if="parseError">
        <div class="error-panel">
          <DisplayAlert title="解析失败" :description="parseError" alert-type="error" />
        </div>
      </template>
      <template v-else-if="previewRuntime">
        <SparkPageRenderer
          :page-runtime="previewRuntime"
          :route-snapshot="routeSnapshot"
        />
      </template>
      <template v-else>
        <DisplayEmpty description="暂无可预览的内容，请先编辑页面配置" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { DisplayAlert,DisplayEmpty,FieldSwitch,RendererButton,SparkPageRenderer } from '@spark-appworks/spark-component'
import { PageRuntime, PageTool, ScenarioDefinitionDocument, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import type { PageRoute } from '@spark-appworks/spark-component/runtime'
import { loadScenarioDataSet } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { isRecord } from '@spark-appworks/spark-utils'
import type { DevState } from './useDevState'

const props = defineProps<{
  state: DevState
  /** 外部通知刷新（如切 Tab 时 ++） */
  refreshToken?: number
}>()

const autoRefresh = ref(true)
const livePreview = ref(true)
const loading = ref(false)
const parseError = ref<string | null>(null)
const previewRuntime = shallowRef<PageRuntime | null>(null)
const routeSnapshot = shallowRef<PageRoute>({path:'',fullPath:'',name:null,params:{},query:{},hash:''})
let generation = 0
async function refresh():Promise<void> {
  if(previewRuntime.value?.isDirty){previewRuntime.value.markConfigPending();parseError.value='预览仍有未保存业务数据，请保存后刷新';return}
  const current = ++generation
  previewRuntime.value?.dispose()
  previewRuntime.value = null
  loading.value = true
  parseError.value = null
  let runtime:PageRuntime | undefined
  try {
    const pageId = props.state.activePageId.value
    const workspace = props.state.editor
    const active = props.state.project.getActivePage()
    if (!pageId || !active || active.pageId !== pageId) throw new Error('请先选择一个配置页面')
    const fileViews=await Promise.all(props.state.pageFileNames.map(fileName=>props.state.loadPageToolFileDataView({pageId,fileName})))
    if(current!==generation||props.state.activePageId.value!==pageId)throw new Error('PAGE_PREVIEW_STALE: 预览文件读取期间编辑目标已改变')
    const tool = new PageTool({pageId})
    for(let index=0;index<props.state.pageFileNames.length;index++){
      const fileName=props.state.pageFileNames[index]!
      const view=fileViews[index]!,row=view.currentRow,id=row&&view.getPkKey(row),edited=id===null||id===undefined?row:view.getEditingRow(id)??row
      if(!edited||edited['pageId']!==pageId||edited['fileName']!==fileName||typeof edited['text']!=='string')throw new Error(`PAGE_PREVIEW_FILE: ${fileName} 的 DataView 行身份或文本无效`)
      if(view.hasUnconfirmedSave)throw new Error(`PAGE_PREVIEW_FILE_UNKNOWN: ${fileName} 的保存回执仍待核验`)
      tool.hydrateFileText(fileName,edited['text'])
    }
    tool.markLoaded()
    const mainScenarioId = props.state.selectedNode.value?.dataSpace?.scenarioId
    const ids = new Set<string>(mainScenarioId ? [mainScenarioId] : [])
    const collect=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(collect);return}if(!isRecord(value))return;const binding=value['dataViewKey'];if(typeof binding==='string' && binding.startsWith('#')){const id=binding.slice(1).split('@')[0];if(id)ids.add(id)}Object.values(value).forEach(collect)}
    collect(tool.toDefinition().rule)
    const assertCurrent=():void=>{if(current!==generation || workspace!==props.state.editor || props.state.activePageId.value!==pageId)throw new Error('PAGE_PREVIEW_STALE: 预览所属编辑页面已改变')}
    runtime=new PageRuntime({tool,scenarioIds:[...ids],...(mainScenarioId ? {mainScenarioId} : {}),loadScenario:async scenarioId=>{
      assertCurrent()
      const scope=lowcodeApi.readRequestScope()
      if(scope.headers['X-AppId']!==props.state.projectId)throw new Error('场景预览需要当前运行应用与编辑项目一致')
      const assertScope=():void=>{assertCurrent();if(lowcodeApi.readRequestScope().token!==scope.token)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景预览请求代次已失效')}
      const definitions=await workspace.loadScenarioDefinitions({scenarioId})
      assertScope()
      const document=await ScenarioDefinitionDocument.open(definitions,scenarioId)
      let config:ScenarioViewConfig
      try {assertScope();config=new ScenarioViewConfig(scenarioId,document.getText())} finally {document.dispose()}
      const result=await loadScenarioDataSet({scenarioId,config,assertCurrent:assertScope})
      assertScope()
      return result.dataSet
    }})
    await runtime.load()
    assertCurrent()
    runtime.materialize()
    const path=`/__page/${pageId}`
    routeSnapshot.value=Object.freeze({path,fullPath:path,name:null,params:Object.freeze({projectId:props.state.projectId,pageId}),query:Object.freeze({}),hash:''})
    previewRuntime.value=runtime
  } catch(error) {
    runtime?.dispose()
    if(current===generation)parseError.value=error instanceof Error ? error.message : String(error)
  } finally { if(current===generation)loading.value=false }
}

// 外部 refreshToken 变化时触发刷新（切 Tab 驱动）
watch(() => props.refreshToken, () => {
  if (autoRefresh.value) void refresh()
})

let _liveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleLiveRefresh() {
  if (!livePreview.value) return
  if (_liveTimer !== null) clearTimeout(_liveTimer)
  _liveTimer = setTimeout(() => {
    _liveTimer = null
    if (loading.value) return // 正在手动刷新中，跳过
    void refresh()
  }, 500)
}

// 监听内存 PageNode 的可渲染输入，而不是监听通用 editor revision。
// 相同工具文本及场景视图不会因其它编辑事件重建运行实例。
watch(
  [
    () => props.state.activePageId.value,
    () => props.state.externalDataViewRevision.value,
    () => props.state.selectedNode.value?.dataSpace?.scenarioId,
    () => { void props.state.scenarioDefinitionRevision.value; return props.state.scenarioDefinitionDocument.value?.getText() },
  ],
  scheduleLiveRefresh,
)
onBeforeUnmount(() => {
  if (_liveTimer !== null) clearTimeout(_liveTimer)
  generation++;previewRuntime.value?.dispose()
})

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.dev-preview-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  background: var(--el-bg-color);
}
.preview-toolbar__left,
.preview-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 80px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.error-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
