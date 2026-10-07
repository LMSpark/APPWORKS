/**
 * @module @spark-appworks/spark-app:router/page-runtime-pool
 * 职责：按路由调用身份创建并复用 PageRuntime，提供视图包装、关闭、脏检查与配置待刷新标记。
 * 边界：不注册路由、不加载导航；工具文件读取与场景装配由 DynamicRouter 注入。
 * AI用途：排查页面调用实例生命周期或多标签实例隔离时，用本模块定位。
 */
import type { RouteLocationNormalizedLoaded, LocationQuery, RouteParams } from 'vue-router'
import { defineComponent, h, markRaw, ref, type Component, type ComponentPublicInstance } from 'vue'
import {
  PageRuntime,
  PageTool,
  PAGE_TOOL_FILE_NAMES,
  type PageFileReader,
} from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'
import type { RuntimeNavigation, RuntimeNavigationItem } from '../navigation/runtime-navigation'

/** 为一次页面调用装配指定应用中的一个场景；应用身份由请求层校验。 */
export type RuntimeScenarioLoadCommand = Readonly<{ projectId: string; scenarioId: string }>

type RuntimeRouteEntry = { runtime: PageRuntime; view: Component; route: RouteLocationNormalizedLoaded; nodeId: string; key: string }

/** 实例池依赖：页面渲染组件、工具文件读取、场景装配、当前导航树与路由刷新。 */
export type PageRuntimePoolOptions = Readonly<{
  /** 渲染页面调用实例的组件，接收 pageRuntime 与 routeSnapshot。 */
  pageComponent: Component
  /** 读取页面工具文件；未注入时页面加载显式失败。 */
  readPageFile: PageFileReader | undefined
  /** 装配页面调用所需场景；未注入时场景加载显式失败。 */
  loadScenario: ((command: RuntimeScenarioLoadCommand) => Promise<DataSet>) | undefined
  /** 读取当前导航树，用于校验蓝图工具绑定是否已改变。 */
  readNavTree: () => RuntimeNavigation | null
  /** 刷新路由与导航，页面 reload 前调用。 */
  refreshRoutes: () => Promise<unknown>
}>

/** 页面调用实例池：按路由调用身份复用 PageRuntime，负责创建、视图包装、关闭与脏检查。 */
export class PageRuntimePool {
  private readonly pageInstances = new Map<string, RuntimeRouteEntry>()
  /** 由 DynamicRouter 注入渲染、读取、场景与导航依赖。 */
  constructor(private readonly options: PageRuntimePoolOptions) {}

  private scenarioCall(query: LocationQuery): Readonly<{ ids: readonly string[]; main?: string }> {
    const main = query['scenarioId']
    if (main !== undefined && (typeof main !== 'string' || !main.trim() || main !== main.trim())) throw new Error('scenarioId 必须是单个非空场景ID')
    const additional = query['additionalScenarioIds']
    const ids = additional === undefined ? [] : Array.isArray(additional) ? [...additional] : [additional]
    if (ids.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim()) || new Set(ids).size !== ids.length || (main !== undefined && ids.includes(main))) throw new Error('additionalScenarioIds 包含空值、重复或主场景')
    const strings = ids.filter((id): id is string => typeof id === 'string').sort()
    return { ids: main === undefined ? strings : [main, ...strings], ...(main === undefined ? {} : { main }) }
  }

  /** 按路由调用身份获取或创建页面实例；非配置页返回 undefined，目标非法时抛错。 */
  getPageRuntime(route: RouteLocationNormalizedLoaded): PageRuntime | undefined {
    if (route.meta['type'] !== 'config-page') return undefined
    const tool = route.meta['programmaticTool'] === true
      ? { pageId: route.params['pageId'], projectId: route.params['projectId'] }
      : route.meta['tool']
    if (typeof tool !== 'object' || tool === null || !('pageId' in tool) || typeof tool.pageId !== 'string'
      || !('projectId' in tool) || typeof tool.projectId !== 'string') throw new Error('配置页缺少正式工具目标')
    const projectId = tool.projectId
    if (route.params['projectId'] !== undefined && route.params['projectId'] !== projectId) throw new Error('页面工具所属项目与调用路径不一致')
    const call = this.scenarioCall(route.query)
    const query = Object.fromEntries(Object.keys(route.query).sort().map(key => [key, key === 'additionalScenarioIds' ? call.ids.filter(id => id !== call.main).sort() : route.query[key]]))
    const key = JSON.stringify([projectId, route.meta['nodeId'], tool.pageId, query, route.hash])
    const existing = this.pageInstances.get(key)
    if (existing && !existing.runtime.destroyed) return existing.runtime
    const page = new PageTool({ pageId: tool.pageId })
    const reader = this.options.readPageFile
    const runtime = markRaw(new PageRuntime({
      tool: page, scenarioIds: call.ids, ...(call.main === undefined ? {} : { mainScenarioId: call.main }),
      loadTool: async () => {
        if (!reader) throw new Error('未注入工具文件读取器')
        const generation = runtime.generation
        const findTool = (nodes: readonly RuntimeNavigationItem[]): RuntimeNavigationItem['tool'] => {
          for (const node of nodes) {
            if (node.id === route.meta['nodeId']) return node.tool
            const match = findTool(node.children ?? [])
            if (match) return match
          }
          return undefined
        }
        const navTree = this.options.readNavTree()
        const registeredTool = findTool(navTree?.items ?? [])
        if (route.meta['programmaticTool'] !== true && navTree !== null
          && (registeredTool?.pageId !== page.pageId || registeredTool.projectId !== projectId)) {
          throw new Error('PAGE_RUNTIME_STALE: 蓝图工具绑定已改变，必须重新打开页面')
        }
        const currentTool = registeredTool ?? tool
        const versionId = 'versionId' in currentTool && typeof currentTool.versionId === 'string' ? currentTool.versionId : undefined
        const files = await Promise.all(PAGE_TOOL_FILE_NAMES.map(async fileName => ({ fileName,
          text: await reader({ projectId, pageId: page.pageId, fileName, ...(versionId === undefined ? {} : { versionId }) }) })))
        if (runtime.destroyed || runtime.generation !== generation) throw new Error('PAGE_RUNTIME_STALE: 工具读取已失效')
        for (const file of files) page.hydrateFileText(file.fileName, file.text)
        page.markLoaded()
        return page
      },
      loadScenario: async scenarioId => {
        if (!this.options.loadScenario) throw new Error('未注入场景运行装配器')
        return this.options.loadScenario({ projectId, scenarioId })
      },
    }))
    const querySnapshot: LocationQuery = {}
    for (const [name, value] of Object.entries(route.query)) {
      const copied = Array.isArray(value) ? [...value] : value
      if (Array.isArray(copied)) Object.freeze(copied)
      querySnapshot[name] = copied
    }
    const paramsSnapshot: RouteParams = {}
    for (const [name, value] of Object.entries(route.params)) {
      const copied = Array.isArray(value) ? [...value] : value
      if (Array.isArray(copied)) Object.freeze(copied)
      paramsSnapshot[name] = copied
    }
    const snapshot = Object.freeze({ ...route, params: Object.freeze(paramsSnapshot),
      query: Object.freeze(querySnapshot), meta: Object.freeze({ ...route.meta }) })
    const view = markRaw(defineComponent({ name: `PageCall_${runtime.instanceId.replaceAll('-', '_')}`,
      setup: (_props, { expose }) => {
        const renderer = ref<ComponentPublicInstance>()
        expose({ reload: async () => {
          if (runtime.isDirty) throw new Error('页面有未保存修改，必须先保存或明确放弃')
          await this.options.refreshRoutes()
          await runtime.reload()
          const reload: unknown = renderer.value === undefined ? undefined : Reflect.get(renderer.value, 'reload')
          if (typeof reload !== 'function') throw new Error('页面渲染器缺少 reload 能力')
          await Reflect.apply(reload, renderer.value, [])
        } })
        return () => h(this.options.pageComponent, { ref: renderer, pageRuntime: runtime, routeSnapshot: snapshot })
      } }))
    this.pageInstances.set(key, { runtime, view, route: snapshot, nodeId: String(route.meta['nodeId']), key })
    return runtime
  }

  /** 返回该路由页面实例对应的包装视图组件。 */
  getPageRuntimeView(route: RouteLocationNormalizedLoaded): Component | undefined {
    const runtime = this.getPageRuntime(route)
    return runtime === undefined ? undefined : [...this.pageInstances.values()].find(entry => entry.runtime === runtime)?.view
  }

  /** 列出已打开实例的视图组件名。 */
  getPageRuntimeNames(): string[] { return [...this.pageInstances.values()].map(entry => entry.view.name ?? '') }
  /** 按实例 ID 查找已打开的页面实例。 */
  getPageRuntimeById(instanceId: string): PageRuntime | undefined { return [...this.pageInstances.values()].find(entry => entry.runtime.instanceId === instanceId)?.runtime }

  /** 关闭并释放实例；有未保存修改时抛错。 */
  closePageRuntime(instanceId: string): void {
    const entry = [...this.pageInstances.values()].find(item => item.runtime.instanceId === instanceId)
    if (!entry) return
    if (entry.runtime.isDirty) throw new Error('页面有未保存修改，必须先保存或明确放弃')
    entry.runtime.dispose()
    this.pageInstances.delete(entry.key)
  }

  /** 任一实例有未保存修改时抛错。 */
  assertPageRuntimesClean(): void {
    if ([...this.pageInstances.values()].some(entry => entry.runtime.isDirty)) throw new Error('打开的页面有未保存修改，必须先保存或明确放弃')
  }

  /** 确认全部干净后释放所有实例。 */
  disposePageRuntimes(): void {
    this.assertPageRuntimesClean()
    for (const entry of this.pageInstances.values()) entry.runtime.dispose()
    this.pageInstances.clear()
  }

  /** 标记该页面的所有实例配置待刷新。 */
  markPageConfigPending(pageId: string): void {
    for (const entry of this.pageInstances.values()) if (entry.runtime.pageId === pageId) entry.runtime.markConfigPending()
  }
}
