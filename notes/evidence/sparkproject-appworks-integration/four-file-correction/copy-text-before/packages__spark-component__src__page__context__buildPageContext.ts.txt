/**
 * @module @spark-appworks/spark-component:page/context/buildPageContext
 * 职责：提供 build Page Context 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 脚本沙箱上下文（PageContext）构建工厂
 *
 * 构建传入 `with (__ctx)` 沙箱的完整上下文对象。
 * 数据与服务能力由当前页面调用持有，关闭后旧脚本失效。
 */

import { h, type Ref } from 'vue'
import type { PageServiceCapability, PageComponentRegistry } from '../../core/capability-keys.js'
import type { ContextSnapshot } from '@spark-appworks/spark-utils'
import type { PageRoute } from '../../runtime'
import type { PageRuntime } from '@spark-appworks/spark-project-model'
import { SparkData } from '@spark-appworks/spark-data'
import type { PageContext } from './types'
import { pageLogger } from '../services/pageLogger'

function createScriptConsole(): Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'> {
  return {
    log: (...args: unknown[]) => { pageLogger.info('[script]', ...args) },
    info: (...args: unknown[]) => { pageLogger.info('[script]', ...args) },
    warn: (...args: unknown[]) => { pageLogger.warn('[script]', ...args) },
    error: (...args: unknown[]) => { pageLogger.error('[script]', ...args) },
    debug: (...args: unknown[]) => { pageLogger.debug('[script]', ...args) },
  }
}

// ─── 共享基础上下文（两条渲染线共用）────────────────────────────────────

/** buildPageContext 所需的依赖引用 */
type PageContextDeps = {
  /** 当前页面调用及其场景数据 owner。 */
  pageRuntime: PageRuntime
  signal: AbortSignal
    /** page Route 字段。 */
pageRoute: PageRoute
    /** page Container 字段。 */
pageContainer: Ref<HTMLElement | null>
    /** page Service 字段。 */
pageService: PageServiceCapability
  /** 页面级组件注册中心 getter（可选） */
  getComponentRegistry?: () => PageComponentRegistry | null
  /** 构建时捕获当前调用的模块上下文快照。 */
  getModuleContext?: () => ContextSnapshot | null}

function createComponentAccess(getRegistry?: () => PageComponentRegistry | null): PageContext['$components'] {
  return {
    get(id: string) {
      return getRegistry?.()?.getInstance(id) ?? null
    },
    list(type?: string) {
      return getRegistry?.()?.listInstances(type) ?? []
    },
    getApi<T = unknown>(id: string): T | null {
      return getRegistry?.()?.getApi<T>(id) ?? null
    },
    getApisByType<T = unknown>(type: string): T[] {
      return getRegistry?.()?.getApisByType<T>(type) ?? []
    },
  }
}

/**
 * 构建脚本沙箱上下文
 */
export function buildPageContext(deps: PageContextDeps): PageContext {
  const { pageRuntime, pageRoute, pageContainer, pageService } = deps
  const timeouts = new Set<number>()
  const intervals = new Set<number>()
  const generation = pageRuntime.generation
  const moduleContext = deps.getModuleContext?.() ?? null
  const assertCurrent = () => { if (deps.signal.aborted || pageRuntime.destroyed || pageRuntime.generation !== generation) throw new Error("PAGE_RUNTIME_STALE: 页面脚本已失效") }
  deps.signal.addEventListener("abort", () => {
    for (const id of timeouts) window.clearTimeout(id)
    for (const id of intervals) window.clearInterval(id)
    timeouts.clear(); intervals.clear()
  }, { once: true })
  const scriptConsole = createScriptConsole()
  const componentAccess = createComponentAccess(deps.getComponentRegistry)

  return {
    get $moduleContext() { assertCurrent(); return moduleContext },
    $components: componentAccess,

    $route:       pageRoute,
    $el:          () => pageContainer.value,
    $query:       (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll:    (selector: string) => {
      return pageContainer.value?.querySelectorAll(selector)
        ?? document.createDocumentFragment().querySelectorAll(selector)
    },

    $page: {
      showMessage(...args) { assertCurrent(); pageService.showMessage(...args) },
      async showConfirm(...args) { assertCurrent(); const value = await pageService.showConfirm(...args); assertCurrent(); return value },
      async showPrompt(...args) { assertCurrent(); const value = await pageService.showPrompt(...args); assertCurrent(); return value },
      async showAlert(...args) { assertCurrent(); await pageService.showAlert(...args); assertCurrent() },
      async showDialog(...args) { assertCurrent(); const value = await pageService.showDialog(...args); assertCurrent(); return value },
      async selectEntities(...args) { assertCurrent(); const value = await pageService.selectEntities(...args); assertCurrent(); return value },
      async browseFiles(...args) { assertCurrent(); const value = await pageService.browseFiles(...args); assertCurrent(); return value },
      async uploadFiles(...args) { assertCurrent(); const value = await pageService.uploadFiles(...args); assertCurrent(); return value },
      showLoading(...args) { assertCurrent(); pageService.showLoading(...args) },
      navigate(...args) { assertCurrent(); pageService.navigate(...args) },
      getDataSet(scenarioId: string) { assertCurrent(); return pageRuntime.getDataSet(scenarioId) },
      resolveView(binding: string) { assertCurrent(); return pageRuntime.resolveView(binding) },
    },
    console: scriptConsole,
    SparkData,
    h,

    // Timer APIs — safe wrappers delegating to global timers
    setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => {
      assertCurrent()
      const id = window.setTimeout(() => { timeouts.delete(id); if (!deps.signal.aborted && !pageRuntime.destroyed && pageRuntime.generation === generation) handler() }, timeout)
      timeouts.add(id); return id
    },
    clearTimeout: (id?: number) => { window.clearTimeout(id); if (id !== undefined) timeouts.delete(id) },
    setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => {
      assertCurrent()
      const id = window.setInterval(() => { if (!deps.signal.aborted && !pageRuntime.destroyed && pageRuntime.generation === generation) handler() }, timeout)
      intervals.add(id); return id
    },
    clearInterval: (id?: number) => { window.clearInterval(id); if (id !== undefined) intervals.delete(id) },
  }
}


