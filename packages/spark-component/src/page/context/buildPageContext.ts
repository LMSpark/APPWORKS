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
 * $dataSet 使用 getter，保证脚本每次访问都拿到最新值。
 */

import { h, type Ref } from 'vue'
import type { PageServiceCapability } from '../../core/capability-keys.js'
import type { ModuleContext, PageComponentRegistry } from '../../core/capability-keys.js'
import type { PageRoute } from '../../runtime'
import type { DataSet } from '@spark-appworks/spark-data'
import { SparkData } from '@spark-appworks/spark-data'
import type { PageContext } from './types'
import {
  isPermittedAction, resolveFieldPermissionState,
  canCreate, canImport, canExport,
  canDelete, canCreateChild, canEdit,
  isFieldVisible, isFieldEditable, getFieldVisibility,
  filterDeletableRows, filterEditableRows,
  filterFields, getEditableFields, getVisibleFields,
  filterDisplayableFields,
  computeFieldState,
  extractPermissionSnapshot,
  isModelScopedPermAction, isRowScopedPermAction,
} from '../../permission/index.js'
import { pageLogger } from '../services/pageLogger'

// ─── 共享 $refreshData 实现 ──────────────────────────────────────────────────

/**
 * 解析 $refreshData 的 key 参数：
 *   'Orders'          → { tableName: 'Orders', viewId: 'default' }
 *   'Orders@default'  → { tableName: 'Orders', viewId: 'default' }
 *   'Orders@myView'   → { tableName: 'Orders', viewId: 'myView' }
 */
function parseRefreshKey(key: string): { tableName: string; viewId: string } {
  const atIdx = key.indexOf('@')
  if (atIdx === -1) return { tableName: key, viewId: 'default' }
  return { tableName: key.slice(0, atIdx), viewId: key.slice(atIdx + 1) }
}

function createRefreshData(getDataSet: () => DataSet | null): (key?: string) => Promise<void> {
  return async (key?: string) => {
    const ds = getDataSet()
    if (!ds) return
    if (key) {
      const { tableName, viewId } = parseRefreshKey(key)
      const view = ds.getView(tableName, viewId)
      if (view) {
        await view.refresh()
      }
    } else {
      const promises: Array<Promise<void>> = []
      for (const table of Object.values(ds.tables)) {
        const view = table.getView('default')
        if (view) {
          promises.push(view.refresh())
        }
      }
      await Promise.all(promises)
    }
  }
}

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
  /** DataSet getter（闭包引用，每次调用返回最新值） */
  getDataSet: () => DataSet | null
    /** page Route 字段。 */
pageRoute: PageRoute
    /** page Container 字段。 */
pageContainer: Ref<HTMLElement | null>
    /** page Service 字段。 */
pageService: PageServiceCapability
  /** 页面级组件注册中心 getter（可选） */
  getComponentRegistry?: () => PageComponentRegistry | null
  /** 模块上下文 getter（可选，每次调用返回最新快照） */
  getModuleContext?: () => ModuleContext | null}

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
  const { getDataSet, pageRoute, pageContainer, pageService } = deps
  const scriptConsole = createScriptConsole()
  const componentAccess = createComponentAccess(deps.getComponentRegistry)

  return {
    get $dataSet() { return getDataSet() },
    get $moduleContext() { return deps.getModuleContext?.() ?? null },
    $components: componentAccess,

    $route:       pageRoute,
    $el:          () => pageContainer.value,
    $query:       (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll:    (selector: string) => {
      return pageContainer.value?.querySelectorAll(selector)
        ?? document.createDocumentFragment().querySelectorAll(selector)
    },
    $refreshData: createRefreshData(getDataSet),

    $page: pageService,
    permission: {
      isPermittedAction,
      resolveFieldPermissionState(field, row, config) {
        return resolveFieldPermissionState({ field, row, config })
      },
      canCreate, canImport, canExport,
      canDelete, canCreateChild, canEdit,
      isFieldVisible, isFieldEditable, getFieldVisibility,
      filterDeletableRows, filterEditableRows,
      filterFields, getEditableFields, getVisibleFields,
      filterDisplayableFields,
      computeFieldState,
      extractPermissionSnapshot,
      isModelScopedPermAction, isRowScopedPermAction,
    },
    console: scriptConsole,
    SparkData,
    h,

    // Timer APIs — safe wrappers delegating to global timers
    setTimeout:    (handler: (...args: unknown[]) => void, timeout?: number) => window.setTimeout(handler, timeout),
    clearTimeout:  (id?: number) => { window.clearTimeout(id) },
    setInterval:   (handler: (...args: unknown[]) => void, timeout?: number) => window.setInterval(handler, timeout),
    clearInterval: (id?: number) => { window.clearInterval(id) },
  }
}


