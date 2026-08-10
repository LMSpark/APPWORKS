<!--
@module app:views/app/dev-system/components/NodeTargetConfig
职责：提供 DevSystem 的 NodeTargetConfig 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeTargetConfig。
-->
<template>
  <div>
    <el-divider content-position="left">{{ flags.routeSectionLabel.value }}</el-divider>

    <!-- 目标选择器（system-page / system-action / page） -->
    <el-form-item v-if="flags.showTargetSelector.value" label="目标" class="fi fi--wide">
      <div class="target-select-row">
        <el-select
          v-model="targetValue"
          filterable
          allow-create
          clearable
          :placeholder="targetPlaceholder"
          class="target-select-row__select"
        >
          <template v-if="flags.isSystemPageNode.value">
            <el-option-group label="路由">
              <el-option
                v-for="opt in systemRouteTargetOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </el-option-group>
          </template>
          <template v-else-if="flags.isSystemActionNode.value">
            <el-option
              v-for="opt in actionTargetOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </template>
          <template v-else>
            <el-option
              v-for="opt in pageTargetOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </template>
        </el-select>
        <el-button
          v-if="showCreatePageAction"
          size="small"
          type="primary"
          :loading="creatingPage"
          @click="createPageFromPath"
        >
          <NavIcon name="Plus" :size="12" /> 新建
        </el-button>
      </div>
    </el-form-item>

    <!-- 路径有效性提示 -->
    <el-form-item v-if="flags.showPathStatus.value && pathStatus" label="" label-width="0" class="path-status-item">
      <el-tag :type="pathStatus.type" size="small" disable-transitions>
        <NavIcon :name="pathStatus.icon" :size="12" /> {{ pathStatus.text }}
      </el-tag>
    </el-form-item>
    <el-form-item v-if="flags.isDirectoryNode.value" label="" label-width="0" class="path-status-item">
      <el-tag type="info" size="small" disable-transitions>
        <NavIcon name="InfoFilled" :size="12" /> 当前节点类型无需路由选择或页面选择
      </el-tag>
    </el-form-item>
    <!-- 超链接（link 节点） -->
    <el-form-item v-if="flags.isLinkNode.value" label="超链接" class="fi fi--wide">
      <div class="link-url-row">
        <el-input
          v-model="state.blueprintDraft.path"
          placeholder="https://..."
          @change="state.onLinkUrlChanged"
        />
        <el-button
          :loading="state.linkProbeLoading.value"
          @click="state.probeLinkTarget"
        >
          检测嵌入
        </el-button>
      </div>
    </el-form-item>
    <el-form-item v-if="flags.isLinkNode.value" label="渲染方式" class="fi fi--wide">
      <el-radio-group v-model="state.blueprintDraft.linkTarget" @change="state.markBlueprintDirty">
        <el-radio-button value="iframe">内嵌 iframe</el-radio-button>
        <el-radio-button value="self">当前窗口</el-radio-button>
        <el-radio-button value="new-tab">新标签打开</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item v-if="flags.isLinkNode.value && state.linkProbeInfo.value" label="检测结果" class="fi fi--wide">
      <el-tag :type="state.linkProbeInfo.value.embeddable ? 'success' : 'warning'" size="small" disable-transitions>
        {{ state.linkProbeInfo.value.embeddable ? '可嵌入' : '禁止嵌入' }}
      </el-tag>
      <span class="hint-text" style="margin-left: 8px">{{ state.linkProbeInfo.value.reason }}</span>
    </el-form-item>

    <!-- 跨工程引用（ref 节点） -->
    <el-form-item v-if="flags.isRefNode.value" label="目标工程" class="fi fi--medium">
      <el-select
        v-model="refProjectSelection"
        filterable
        clearable
        placeholder="选择工程"
        :loading="refProjectsLoading"
      >
        <el-option
          v-for="p in refProjectOptions"
          :key="p.value"
          :value="p.value"
          :label="p.label"
        />
      </el-select>
    </el-form-item>
    <el-form-item v-if="flags.isRefNode.value && refProjectSelection" label="目标页面" class="fi fi--medium">
      <el-select
        v-model="refPageSelection"
        filterable
        clearable
        placeholder="选择页面"
        :loading="refPagesLoading"
      >
        <el-option
          v-for="p in refPageOptions"
          :key="p.value"
          :value="p.value"
          :label="p.label"
        />
      </el-select>
    </el-form-item>
    <el-form-item v-if="flags.isRefNode.value && refStatus" label="" label-width="0" class="path-status-item">
      <el-tag :type="refStatus.type" size="small" disable-transitions>
        <NavIcon :name="refStatus.icon" :size="12" /> {{ refStatus.text }}
      </el-tag>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import NavIcon from '@/components/NavIcon.vue'
import { getVuePageEntry, getVuePageOptions } from '@/registries/vue-page-registry'

const props = defineProps<{ state: DevState }>()
const flags = useNodeKindFlags(props.state)

// ── 目标选项 ──

type TargetOption = {
  value: string
  label: string}

const actionTargetOptions: TargetOption[] = [
  { value: 'action:search', label: '动作 · 搜索' },
  { value: 'action:fullscreen', label: '动作 · 全屏' },
  { value: 'action:notifications', label: '动作 · 通知' },
  { value: 'action:theme-toggle', label: '动作 · 主题切换' },
]

type VuePathOption = {
  path: string
  title: string
  displayTitle: string
  extra: string}

function collectPathTitles(nodes: ProjectBlueprintTreeNodeData[], map: Map<string, string>) {
  for (const node of nodes) {
    const path = node.path ?? ''
    const title = node.title ?? ''
    if (path && title && !map.has(path)) {
      map.set(path, title)
    }
    if (Array.isArray(node.children)) {
      collectPathTitles(node.children, map)
    }
  }
}

const navPathTitleMap = computed(() => {
  const map = new Map<string, string>()
  collectPathTitles(props.state.treeData.value, map)
  return map
})

const vuePageOptions = computed<VuePathOption[]>(() => {
  return getVuePageOptions().map((opt) => {
    const navTitle = navPathTitleMap.value.get(opt.path)
    const displayTitle = navTitle ?? opt.title
    const extra = navTitle && navTitle !== opt.title ? `组件: ${opt.title}` : ''
    return { path: opt.path, title: opt.title, displayTitle, extra }
  })
})

const systemRouteTargetOptions = computed<TargetOption[]>(() =>
  vuePageOptions.value.map((opt) => ({
    value: `route:${opt.path}`,
    label: `路由 · ${opt.displayTitle}（${opt.path}）${opt.extra ? ` · ${opt.extra}` : ''}`,
  })),
)

const configPageOptions = computed<Array<{ path: string; title: string }>>(() => {
  return props.state.pageList.value
    .map((p: Record<string, unknown>) => {
      const pageId = String(p['pageId'] ?? '')
      const path = String(p['path'] ?? `/${pageId}`)
      const title = String(p['title'] ?? pageId)
      return { path, title }
    })
})

const pageTargetOptions = computed<TargetOption[]>(() =>
  configPageOptions.value.map((opt: { path: string; title: string }) => ({
    value: `page:${opt.path}`,
    label: `页面 · ${opt.title}（${opt.path}）`,
  })),
)

const targetPlaceholder = computed(() => {
  if (flags.isSystemPageNode.value) return '选择系统页面路由'
  if (flags.isSystemActionNode.value) return '选择系统动作'
  return '选择普通页面（配置页）'
})

// ── 目标选择双向绑定 ──

function applyTargetSelection(value: string) {
  if (flags.isSystemPageNode.value) {
    if (!value) {
      props.state.blueprintDraft.path = ''
      props.state.markBlueprintDirty()
      props.state.clearActivePageContext()
      return
    }
    const routePath = value.replace(/^route:/, '')
    props.state.blueprintDraft.path = routePath
    props.state.handlePathChange(routePath)
    return
  }

  if (flags.isSystemActionNode.value) {
    if (!value) {
      props.state.blueprintDraft.path = ''
      props.state.markBlueprintDirty()
      return
    }
    props.state.blueprintDraft.path = value.replace(/^action:/, '')
    props.state.markBlueprintDirty()
    return
  }

  if (flags.isPageNode.value) {
    if (!value) {
      props.state.blueprintDraft.path = ''
      props.state.markBlueprintDirty()
      props.state.clearActivePageContext()
      return
    }
    const pagePath = value.replace(/^page:/, '')
    props.state.blueprintDraft.path = pagePath
    props.state.handlePathChange(pagePath)
  }
}

const targetValue = computed<string>({
  get() {
    if (flags.isSystemPageNode.value) {
      const path = props.state.blueprintDraft.path
      return path ? `route:${path}` : ''
    }
    if (flags.isSystemActionNode.value) {
      const path = props.state.blueprintDraft.path
      return path ? `action:${path}` : ''
    }
    if (flags.isPageNode.value) {
      return props.state.blueprintDraft.path ? `page:${props.state.blueprintDraft.path}` : ''
    }
    return ''
  },
  set(value) {
    applyTargetSelection(value)
  },
})

// ── 路径有效性状态 ──

type NodeTargetStatus = {
  /** Element Plus tag 类型：success=匹配，info=可接受提示，warning=配置缺失，danger=不可用。 */
  type: 'success' | 'info' | 'warning' | 'danger'
  icon: string
  text: string}

/**
 * 根据当前节点类型检查 path 的业务含义。
 *
 * 判断顺序与 UI 目标选择时序保持一致：
 * 1. system-action：先匹配内置动作，未知动作作为自定义标识。
 * 2. system-page：检查 Vue 页面注册表，允许运行菜单标题与组件标题不同。
 * 3. page：检查配置页是否已存在，不存在时提示可新建。
 */
const pathStatus = computed<NodeTargetStatus | null>(() => {
  if (!flags.showPathStatus.value) return null
  const path = props.state.blueprintDraft.path
  if (!path) return null

  if (flags.isSystemActionNode.value) {
    const knownAction = actionTargetOptions.find(o => o.value === `action:${path}`)
    if (knownAction) {
      return { type: 'success', icon: 'SuccessFilled', text: `已知动作：${path}` }
    }
    return { type: 'info', icon: 'InfoFilled', text: `自定义动作标识符：${path}` }
  }

  if (flags.isSystemPageNode.value) {
    const entry = getVuePageEntry(path)
    if (entry !== undefined) {
      const nodeTitle = props.state.blueprintDraft.title.trim()
      if (nodeTitle && nodeTitle !== entry.title) {
        return {
          type: 'info',
          icon: 'InfoFilled',
          text: `组件页为「${entry.title}」，当前运行菜单标题为「${nodeTitle}」（允许不同）`,
        }
      }
      return { type: 'success', icon: 'SuccessFilled', text: `匹配 Vue 组件：${entry.title}` }
    }
    return { type: 'warning', icon: 'WarningFilled', text: `路径 ${path} 未在 Vue 页面注册表中声明` }
  }

  // 配置页面：检查 pageList
  const pageId = path.replace(/^\/+/, '')
  if (!pageId) return null
  const exists = props.state.pageList.value.some(
    (p: Record<string, unknown>) => String(p['pageId'] ?? '') === pageId,
  )
  if (exists) {
    return { type: 'success', icon: 'SuccessFilled', text: `配置页面已存在：${pageId}` }
  }
  return { type: 'danger', icon: 'CircleCloseFilled', text: `配置页面不存在：${pageId}（需先创建）` }
})

function normalizeConfigPageId(value: string | undefined): string {
  return (value ?? '').trim().replace(/^\/+/, '')
}

function hasConfigPage(pageId: string): boolean {
  return props.state.pageList.value.some(
    (page: Record<string, unknown>) => String(page['pageId'] ?? '') === pageId,
  )
}

const showCreatePageAction = computed(() => flags.isPageNode.value)
const explicitTargetPageId = computed(() => normalizeConfigPageId(props.state.blueprintDraft.path))
const fallbackNodePageId = computed(() => normalizeConfigPageId(props.state.blueprintDraft.id))
const createPageCandidateId = computed(() => {
  const explicitPageId = explicitTargetPageId.value
  if (explicitPageId && !hasConfigPage(explicitPageId)) return explicitPageId
  return fallbackNodePageId.value
})

// ── 跨工程引用：工程选择 → 页面选择 ──

type SelectOption = {
  value: string
  label: string}

const refProjectsLoading = ref(false)
const refPagesLoading = ref(false)
const refProjectOptions = ref<SelectOption[]>([])
const refPageOptions = ref<SelectOption[]>([])
const refProjectSelection = ref('')
const refPageSelection = ref('')
const syncingRefSelection = ref(false)

/** 加载工程列表（排除当前工程） */
async function loadRefProjects() {
  refProjectsLoading.value = true
  try {
    const projects = await props.state.listReferenceProjects()
    refProjectOptions.value = projects
      .map((p) => ({
        value: p.projectId,
        label: p.name || p.projectId,
      }))
  } catch {
    refProjectOptions.value = []
  } finally {
    refProjectsLoading.value = false
  }
}

/** 加载指定工程的 page 节点列表 */
async function loadRefPages(projectId: string) {
  refPagesLoading.value = true
  refPageOptions.value = []
  try {
    const pages = await props.state.listReferenceProjectPages(projectId)
    refPageOptions.value = pages.map((page) => {
      const suffix = page.path ? `（${page.path}）` : ''
      return {
        value: page.nodeId,
        label: `${page.title || page.pageId}${suffix}`,
      }
    })
  } catch {
    refPageOptions.value = []
  } finally {
    refPagesLoading.value = false
  }
}

async function syncRefSelectionFromNode(): Promise<void> {
  if (!flags.isRefNode.value) {
    syncingRefSelection.value = true
    refProjectSelection.value = ''
    refPageSelection.value = ''
    refPageOptions.value = []
    syncingRefSelection.value = false
    return
  }

  await loadRefProjects()

  const selectedNode = props.state.selectedNode.value
  syncingRefSelection.value = true

  if (selectedNode?.nodeKind === 'ref' && selectedNode.refId) {
    const projectId = selectedNode.refProjectId ?? props.state.projectId
    refProjectSelection.value = projectId

    if (projectId) {
      await loadRefPages(projectId)
    } else {
      refPageOptions.value = []
    }

    refPageSelection.value = selectedNode.refId
  } else {
    refProjectSelection.value = ''
    refPageSelection.value = ''
    refPageOptions.value = []
  }

  syncingRefSelection.value = false
}

watch(
  () => [
    flags.isRefNode.value,
    props.state.selectedNode.value?.id ?? '',
    props.state.selectedNode.value?.refId ?? '',
    props.state.selectedNode.value?.refProjectId ?? '',
  ],
  () => {
    void syncRefSelectionFromNode()
  },
  { immediate: true },
)

// 工程切换→加载该工程页面列表
watch(refProjectSelection, (projectId) => {
  if (syncingRefSelection.value) return
  refPageSelection.value = ''
  if (projectId) {
    void loadRefPages(projectId)
  } else {
    refPageOptions.value = []
    props.state.blueprintDraft.refId = ''
    props.state.markBlueprintDirty()
  }
})

// 页面选择→写入 refId
watch(refPageSelection, (nodeId) => {
  if (syncingRefSelection.value) return
  if (nodeId && nodeId !== props.state.blueprintDraft.id) {
    props.state.blueprintDraft.refId = nodeId
    props.state.markBlueprintDirty()
  } else if (!nodeId) {
    props.state.blueprintDraft.refId = ''
    props.state.markBlueprintDirty()
  }
})

// ── 引用状态提示 ──

const refStatus = computed<NodeTargetStatus | null>(() => {
  if (!flags.isRefNode.value) return null
  const refId = props.state.blueprintDraft.refId
  if (!refId) return null

  if (refId === props.state.blueprintDraft.id) {
    return { type: 'danger', icon: 'CircleCloseFilled', text: '不能引用自身' }
  }

  const selectedNode = props.state.selectedNode.value
  if (!selectedNode || selectedNode.nodeKind !== 'ref') return null

  if (selectedNode.refBroken) {
    return { type: 'danger', icon: 'CircleCloseFilled', text: '引用断链：目标节点不存在或不是 page 类型' }
  }
  if (selectedNode.refPath) {
    const cross = selectedNode.refProjectId ? `（跨工程: ${selectedNode.refProjectId}）` : '（同工程）'
    return { type: 'success', icon: 'SuccessFilled', text: `引用有效 → ${selectedNode.refPath} ${cross}` }
  }
  return { type: 'info', icon: 'InfoFilled', text: '保存后可验证引用状态' }
})

// ── 快速创建页面 ──

const creatingPage = ref(false)

async function createPageFromPath() {
  if (!showCreatePageAction.value) return

  const pageId = createPageCandidateId.value
  if (!pageId) {
    props.state.addStatus('请先填写节点 ID，或在目标中输入要新建的页面路径', 'warning')
    return
  }
  if (hasConfigPage(pageId)) {
    props.state.addStatus(`页面 ${pageId} 已存在，请修改目标路径或节点 ID 后再新建`, 'warning')
    return
  }

  const nodeTitle = props.state.blueprintDraft.title.trim() || pageId
  const nodeIcon = props.state.blueprintDraft.icon.trim() || 'Document'
  creatingPage.value = true
  try {
    const created = await props.state.createPageForSelectedNode({
      pageId,
      title: nodeTitle,
      icon: nodeIcon,
    })
    if (!created) {
      props.state.addStatus(`页面 ${pageId} 创建失败或蓝图交付目标保存失败`, 'warning')
      return
    }

    props.state.addStatus(`页面 ${pageId} 创建成功并已绑定到当前节点`, 'success')
  } catch (error) {
    props.state.addStatus(`页面创建失败: ${String(error)}`, 'error')
  } finally {
    creatingPage.value = false
  }
}
</script>

<style scoped>
.target-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.target-select-row__select {
  flex: 1;
  min-width: 0;
}

.link-url-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.hint-text {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.path-status-item {
  margin-top: -4px;
}
.path-status-item :deep(.el-form-item__content) {
  justify-content: flex-start;
}
</style>
