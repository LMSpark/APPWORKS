/**
 * @module @spark-appworks/spark-app:navigation/useTabPages
 * 职责：按运行实例保存页面标签及调用地址。
 * 边界：关闭先校验脏状态，由路由 owner 释放实例。
 * AI用途：定位多场景调用的标签切换、导航取消和关闭规则。
 */
import { onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import { getDynamicRouter } from './nav-access'

/** 一个已打开页面的标签投影；工具实例用 instanceId 定位，fullPath 保留调用参数。 */
export type TabPage = {
  id: string
  path: string
  title: string
  icon?: string
  name?: string
  runtimeName?: string
  projectId?: string
  tenantId?: string
  closable: boolean
  fullPath: string
}
/** 单页或多标签显示方式；切换模式仍遵守实例脏状态检查。 */
export type PageMode = 'single' | 'multi'
/** 标签导航入口配置；注入的导航必须等待完成，失败不得释放原实例。 */
export type UseTabPagesOptions = { navigate?: (fullPath: string) => Promise<void> | void }
const tabs = ref<TabPage[]>([])
const activeTab = ref('')
const mode = ref<PageMode>('multi')
let watchInstalled = false

function toTab(route: RouteLocationNormalizedLoaded): TabPage | null {
  const title = route.meta['title']
  if (typeof title !== 'string' || !title) return null
  const owner = getDynamicRouter()
  const runtime = owner?.getPageRuntime(route)
  const view = runtime ? owner?.getPageRuntimeView(route) : undefined
  const pageId = route.meta['pageId']
  const home = owner?.getNavTree()?.homePath?.split(/[?#]/, 1)[0]
  return { id: runtime?.instanceId ?? route.path, path: route.path, title,
    ...(typeof route.params['projectId'] === 'string' ? { projectId: route.params['projectId'] } : {}),
    ...(typeof route.params['tenantId'] === 'string' ? { tenantId: route.params['tenantId'] } : {}),
    ...(typeof route.meta['icon'] === 'string' ? { icon: route.meta['icon'] } : {}),
    ...(typeof route.name === 'string' ? { name: route.name } : {}),
    ...(view?.name ? { runtimeName: view.name } : {}),
    closable: pageId !== 'dashboard' && pageId !== 'home' && (home === undefined || !route.path.endsWith(home)), fullPath: route.fullPath }
}

function assertClean(candidates: readonly TabPage[]): void {
  const owner = getDynamicRouter()
  for (const tab of candidates) {
    const runtime = tab.runtimeName ? owner?.getPageRuntimeById(tab.id) : undefined
    if (runtime?.isDirty) throw new Error('页面有未保存修改，必须先保存或明确放弃')
  }
}
function release(candidates: readonly TabPage[]): void {
  for (const tab of candidates) if (tab.runtimeName) getDynamicRouter()?.closePageRuntime(tab.id)
  const ids = new Set(candidates.map(tab => tab.id))
  tabs.value = tabs.value.filter(tab => !ids.has(tab.id))
}

export function useTabPages(options?: UseTabPagesOptions) {
  const route = useRoute()
  const router = useRouter()
  async function navigate(fullPath: string): Promise<void> {
    if (options?.navigate) await options.navigate(fullPath)
    else if (await router.push(fullPath)) throw new Error('页面导航已取消，原实例保留')
  }

  if (!watchInstalled) {
    watchInstalled = true
    const removeGuard = router.beforeEach((to, from) => {
      if (mode.value !== 'single' || to.fullPath === from.fullPath) return
      const previous = tabs.value.find(tab => tab.id === activeTab.value)
      if (previous) assertClean([previous])
    })
    const stop = watch(() => route.fullPath, () => {
      const owner = getDynamicRouter()
      const projectId = route.params['projectId']
      const tenantId = route.params['tenantId']
      tabs.value = tabs.value.filter(item => (!item.runtimeName || owner?.getPageRuntimeById(item.id) !== undefined)
        && (typeof projectId !== 'string' || item.projectId === undefined || (item.projectId === projectId && item.tenantId === tenantId)))
      const tab = toTab(router.currentRoute.value)
      if (!tab) return
      if (mode.value === 'single') {
        const previous = tabs.value.filter(item => item.id !== tab.id && item.runtimeName !== undefined)
        assertClean(previous)
        release(previous)
      }
      activeTab.value = tab.id
      const index = tabs.value.findIndex(item => item.id === tab.id)
      if (index < 0) tabs.value.push(tab)
      else tabs.value[index] = tab
    }, { immediate: true })
    onScopeDispose(() => { stop(); removeGuard(); watchInstalled = false })
  }

  async function close(candidates: readonly TabPage[]): Promise<void> {
    assertClean(candidates)
    const removing = new Set(candidates.map(tab => tab.id))
    if (removing.has(activeTab.value)) {
      const target = tabs.value.find(tab => !removing.has(tab.id))
      if (!target) throw new Error('请先打开另一个页面再关闭当前唯一页面')
      await navigate(target.fullPath)
      if (removing.has(activeTab.value)) throw new Error('页面导航未完成，原实例保留')
    }
    release(candidates)
  }
  async function closeTab(id: string): Promise<void> {
    const tab = tabs.value.find(item => item.id === id)
    if (tab?.closable) await close([tab])
  }
  async function closeOthers(id: string): Promise<void> { await close(tabs.value.filter(tab => tab.id !== id && tab.closable)) }
  async function closeAll(): Promise<void> { await close(tabs.value.filter(tab => tab.closable)) }
  async function switchTo(id: string): Promise<void> {
    const tab = tabs.value.find(item => item.id === id)
    if (tab) await navigate(tab.fullPath)
  }
  function setMode(next: PageMode): void {
    if (next === 'single') {
      const candidates = tabs.value.filter(tab => tab.id !== activeTab.value && tab.closable)
      assertClean(candidates)
      release(candidates)
    }
    mode.value = next
  }
  return { tabs, activeTab, mode, closeTab, closeOthers, closeAll, switchTo, setMode }
}
