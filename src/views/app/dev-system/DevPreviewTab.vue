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
        <el-switch
          v-model="livePreview"
          active-text="实时预览"
          inactive-text="手动"
          size="small"
        />
        <el-switch
          v-model="autoRefresh"
          active-text="切Tab刷新"
          inactive-text="—"
          size="small"
        />
      </div>
      <div class="preview-toolbar__right">
        <el-button size="small" @click="refresh" :loading="loading">
          <NavIcon name="RefreshRight" :size="14" /> 刷新预览
        </el-button>
      </div>
    </div>

    <!-- 预览区域 -->
    <div class="preview-container">
      <template v-if="loading">
        <div class="preview-loading">
          <el-icon class="is-loading"><Loading /></el-icon> 加载中...
        </div>
      </template>
      <template v-else-if="parseError">
        <div class="error-panel">
          <el-alert type="error" :closable="false" show-icon>
            <template #title>解析失败</template>
            {{ parseError }}
          </el-alert>
        </div>
      </template>
      <template v-else-if="previewPageNode">
        <SparkPageRenderer
          :pageNode="previewPageNode"
          :pageNodeRevision="props.state.projectRevision.value"
        />
      </template>
      <template v-else>
        <el-empty description="暂无可预览的内容，请先编辑页面配置" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { SparkPageRenderer } from '@spark-appworks/spark-component'
import type { PageNodeLike } from '@spark-appworks/spark-project-model'
import type { DevState } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps<{
  state: DevState
  /** 外部通知刷新（如切 Tab 时 ++） */
  refreshToken?: number
}>()

const autoRefresh = ref(true)
const livePreview = ref(true)
const loading = ref(false)
const parseError = ref<string | null>(null)
const previewPageNode = shallowRef<PageNodeLike | null>(null)

function requireActivePageNodeLoaded(): PageNodeLike {
  const pageId = props.state.activePageId.value
  const activePage = props.state.project.getActivePage()
  if (!pageId || activePage === null) {
    throw new Error('请先选择一个已加载的配置页面')
  }
  if (activePage.pageId !== pageId) {
    throw new Error(`预览页面节点不一致: 当前页面 ${pageId}, 节点 ${activePage.pageId}`)
  }
  if (!activePage.isLoaded) {
    throw new Error(`页面节点 ${pageId} 尚未加载完成，无法预览`)
  }
  const renderPageNode = props.state.editor.getActivePageRenderNode()
  if (renderPageNode === null) {
    throw new Error(`页面节点 ${pageId} 尚未打开，无法预览`)
  }
  return renderPageNode
}

function refresh() {
  loading.value = true
  parseError.value = null
  try {
    previewPageNode.value = requireActivePageNodeLoaded()
  } catch (err) {
    parseError.value = err instanceof Error ? err.message : String(err)
    previewPageNode.value = null
  } finally {
    loading.value = false
  }
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
    refresh()
  }, 500)
}

// 监听内存 PageNode 的可渲染输入，而不是监听通用 editor revision。
// revision 会因选中节点、蓝图状态等非预览输入变化而递增；这里让相同四文件文本不会重复重建预览。
watch(
  [
    () => props.state.activePageId.value,
    () => props.state.project.readPageFileText('rule.json'),
    () => props.state.project.readPageFileText('pagedata.json'),
    () => props.state.project.readPageFileText('script.js'),
    () => props.state.project.readPageFileText('style.css'),
  ],
  scheduleLiveRefresh,
)
onBeforeUnmount(() => {
  if (_liveTimer !== null) clearTimeout(_liveTimer)
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
