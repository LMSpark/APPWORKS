/**
 * @module @spark-appworks/spark-app:navigation/useTabPages
 * 职责：提供应用壳层 useTabPages 能力，围绕 TabPage、PageMode、UseTabPagesOptions 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/useTabPages。
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationNormalizedGeneric } from 'vue-router'

/** Tab Page 的语义模型。 */
export type TabPage = {
  /** 路由完整路径（唯一标识） */
  path: string
  /** 显示标题 */
  title: string
  /** 图标（来自 route.meta.icon） */
  icon?: string
  /** 路由 name */
  name?: string
  /** 可否关闭（首页默认不可关闭） */
  closable: boolean
  /** 完整路由信息快照 */
  fullPath: string}

/** Page Mode 的语义模型。 */
export type PageMode = 'single' | 'multi'

/** Use Tab Pages Options 的调用配置。 */
export type UseTabPagesOptions = {
    /** navigate 回调。 */
navigate?: (fullPath: string) => Promise<void> | void}

const _tabs = ref<TabPage[]>([])
const _activeTab = ref('')
const _mode = ref<PageMode>('multi')

/** 是否已初始化（避免多组件重复 watch） */
let _watchInstalled = false

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function toTab(route: RouteLocationNormalizedGeneric): TabPage | null {
  const title = readString(route.meta['title'])
  if (!title) return null
  const icon = readString(route.meta['icon'])
  const name = readString(route.name)
  // pageId 由 DynamicRouter 从 ProjectBlueprintTreeNodeData.id 写入 route.meta
  const pageId = readString(route.meta['pageId'])
  return {
    path: route.path,
    title,
    ...(icon !== undefined ? { icon } : {}),
    ...(name !== undefined ? { name } : {}),
    closable: pageId !== 'dashboard' && pageId !== 'home',
    fullPath: route.fullPath,
  }
}

export function useTabPages(options?: UseTabPagesOptions) {
  const route = useRoute()
  const router = useRouter()

  function navigate(fullPath: string) {
    if (options?.navigate) {
      void options.navigate(fullPath)
      return
    }
    void router.push(fullPath)
  }

  // 只安装一次 route watcher
  if (!_watchInstalled) {
    _watchInstalled = true
    watch(
      () => route.fullPath,
      () => {
        const tab = toTab(route)
        if (!tab) return
        _activeTab.value = tab.path
        const idx = _tabs.value.findIndex(t => t.path === tab.path)
        if (idx === -1) {
          _tabs.value.push(tab)
        } else {
          // 更新 fullPath（query/hash 可能变化）
          const existing = _tabs.value[idx]
          if (existing) existing.fullPath = tab.fullPath
        }
      },
      { immediate: true },
    )
  }

  function closeTab(path: string) {
    const idx = _tabs.value.findIndex(t => t.path === path)
    if (idx === -1) return
    const tab = _tabs.value[idx]
    if (!tab?.closable) return

    _tabs.value.splice(idx, 1)

    // 如果关闭的是当前激活页，跳转到相邻页
    if (_activeTab.value === path) {
      const next = _tabs.value[Math.min(idx, _tabs.value.length - 1)]
      if (next) {
        navigate(next.fullPath)
      }
    }
  }

  function closeOthers(path: string) {
    _tabs.value = _tabs.value.filter(t => t.path === path || !t.closable)
    if (!_tabs.value.some(t => t.path === _activeTab.value)) {
      const target = _tabs.value.find(t => t.path === path) ?? _tabs.value[0]
      if (target) {
        navigate(target.fullPath)
      }
    }
  }

  function closeAll() {
    _tabs.value = _tabs.value.filter(t => !t.closable)
    const target = _tabs.value[0]
    if (target) {
      navigate(target.fullPath)
    }
  }

  function switchTo(path: string) {
    const tab = _tabs.value.find(t => t.path === path)
    if (tab) {
      navigate(tab.fullPath)
    }
  }

  function setMode(mode: PageMode) {
    _mode.value = mode
    if (mode === 'single') {
      // 单页模式：仅保留当前激活页 + 不可关闭页
      _tabs.value = _tabs.value.filter(t => t.path === _activeTab.value || !t.closable)
    }
  }

  return {
    tabs: _tabs,
    activeTab: _activeTab,
    mode: _mode,
    closeTab,
    closeOthers,
    closeAll,
    switchTo,
    setMode,
  }
}
