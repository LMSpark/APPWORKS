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
  type PageRuntimeOptions,
  PageTool,
  PAGE_TOOL_FILE_NAMES,
  type PageFileReader,
  type PageRuntimeSource,
} from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'
import type { RuntimeNavigation, RuntimeNavigationItem } from '../navigation/runtime-navigation'

/** 为一次页面调用装配指定应用中的一个场景；应用身份由请求层校验。 */
export type RuntimeScenarioLoadCommand = Readonly<{
  projectId: string
  scenarioId: string
  source: PageRuntimeSource
  pagedata?: RuntimePagePublicationPagedata
}>

export type RuntimePagePublicationPagedata = Readonly<{
  scenarioId: string
  version: number
  fileName: string
  sha256: string
  sourceRevision: string
  text: string
}>

export type RuntimePagePublicationManifest = Readonly<{
  pageId: string
  scenarioIds: readonly string[]
  sourceRevision: string
  files: ReadonlyArray<Readonly<{
    fileName: 'rule.json' | 'script.js' | 'style.css'
    version: number
    sha256: string
  }>>
  pagedata: readonly RuntimePagePublicationPagedata[]
}>

export type RuntimePagePublicationResolution = Readonly<{
  publicationRef: string
  manifest: RuntimePagePublicationManifest
  assertCurrent(): void
}>

export type RuntimePageNavigationReceiptState =
  | 'BLUEPRINT_ONLY'
  | 'AUTH_MISSING'
  | 'MANIFEST_MISSING'
  | 'SCENARIO_MISSING'
  | 'IDENTITY_CONFLICT'
  | 'READY'

export type RuntimePageNavigationReceipt = Readonly<{
  state: RuntimePageNavigationReceiptState
  reason?: string
  publication?: RuntimePagePublicationResolution
  files?: ReadonlyArray<Readonly<{
    fileName: 'rule.json' | 'script.js' | 'style.css'
    version: number
    text: string
  }>>
  assertCurrent(): void
}>

type RuntimeRouteEntry = { runtime: PageRuntime; view: Component; route: RouteLocationNormalizedLoaded; nodeId: string; key: string; assertCurrent?: () => void }

function hasCompleteNavigationReceipt(receipt: RuntimePageNavigationReceipt | undefined): boolean {
  if (receipt?.state !== 'READY') return true
  const files = receipt.files ?? []
  if (files.length !== PAGE_TOOL_FILE_NAMES.length) return false
  return PAGE_TOOL_FILE_NAMES.every(fileName => {
    const matches = files.filter(file => file.fileName === fileName)
    const proof = receipt.publication?.manifest.files.find(file => file.fileName === fileName)
    return matches.length === 1 && proof !== undefined && matches[0]?.version === proof.version
  })
}

/** 实例池依赖：页面渲染组件、工具文件读取、场景装配、当前导航树与路由刷新。 */
export type PageRuntimePoolOptions = Readonly<{
  /** 渲染页面调用实例的组件，接收 pageRuntime 与 routeSnapshot。 */
  pageComponent: Component
  /** 读取页面工具文件；未注入时页面加载显式失败。 */
  readPageFile: PageFileReader | undefined
  /** One scoped read session for the complete tool. Results correspond to the input order. */
  readPageFiles?: (commands: ReadonlyArray<Parameters<PageFileReader>[0]>) => Promise<readonly string[]>
  resolvePagePublication?: (command: Readonly<{
    projectId: string
    pageId: string
    nodeId?: string
    scenarioIds: readonly string[]
  }>) => Promise<RuntimePagePublicationResolution | undefined>
  resolvePageNavigationReceipt?: (command: Readonly<{
    projectId: string
    pageId: string
    nodeId: string
    mainScenarioId?: string
    scenarioIds: readonly string[]
  }>) => Promise<RuntimePageNavigationReceipt>
  /** Reads the active route so retained tabs reject a route/call scope that is no longer current. */
  readCurrentRoute?: () => RouteLocationNormalizedLoaded
  preparePageCall?: (route: RouteLocationNormalizedLoaded) => Readonly<{
    scenarioInputs: NonNullable<PageRuntimeOptions['scenarioInputs']>
    assertCurrent(): void
    createHost?: (runtime: PageRuntime) => Readonly<{
      runtime: PageRuntime
      assertCurrent(): void
      invoke(name: string, input: unknown, signal: AbortSignal): unknown
    }>
  }> | undefined
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

  private async proofText(text: string, expected: string, label: string): Promise<void> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (actual !== expected) throw new Error(`PAGE_PUBLICATION_PROOF_CONFLICT: ${label} sha256 不一致`)
  }

  private scenarioCall(query: LocationQuery, blueprintScenarioId: unknown): Readonly<{ ids: readonly string[]; main?: string }> {
    if (query['deferredScenarioIds'] !== undefined) throw new Error('配置页不能把 deferredScenarioIds 当作调用身份')
    const main = query['scenarioId'] ?? blueprintScenarioId
    if (main !== undefined && (typeof main !== 'string' || !main.trim() || main !== main.trim())) throw new Error('scenarioId 必须是单个非空场景ID')
    const additional = query['additionalScenarioIds']
    const ids = additional === undefined ? [] : Array.isArray(additional) ? [...additional] : [additional]
    if (ids.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim()) || new Set(ids).size !== ids.length || (main !== undefined && ids.includes(main))) throw new Error('additionalScenarioIds 包含空值、重复或主场景')
    const strings = ids.filter((id): id is string => typeof id === 'string').sort()
    return { ids: main === undefined ? strings : [main, ...strings], ...(main === undefined ? {} : { main }) }
  }

  private assertParsedCallQuery(route: RouteLocationNormalizedLoaded): void {
    const queryText = route.fullPath.split('#', 1)[0]?.split('?', 2)[1]
    if (queryText === undefined) return
    const raw = new URLSearchParams(queryText)
    for (const key of ['scenarioId', 'additionalScenarioIds', 'deferredScenarioIds']) {
      if (raw.has(key) && (route.query[key] === undefined || route.query[key] === null)) {
        throw new Error(`${key} 必须具有可解析的参数值`)
      }
    }
  }

  /** 按路由调用身份获取或创建页面实例；非配置页返回 undefined，目标非法时抛错。 */
  getPageRuntime(route: RouteLocationNormalizedLoaded): PageRuntime | undefined {
    if (route.meta['type'] !== 'config-page') return undefined
    const programmatic = route.meta['programmaticTool'] === true
    const tool = programmatic
      ? { pageId: route.params['pageId'], projectId: route.params['projectId'] }
      : route.meta['tool']
    if (typeof tool !== 'object' || tool === null || !('pageId' in tool) || typeof tool.pageId !== 'string'
      || !('projectId' in tool) || typeof tool.projectId !== 'string') throw new Error('配置页缺少正式工具目标')
    const projectId = tool.projectId
    if (route.params['projectId'] !== undefined && route.params['projectId'] !== projectId) throw new Error('页面工具所属项目与调用路径不一致')
    this.assertParsedCallQuery(route)
    const call = this.scenarioCall(route.query, route.meta['blueprintScenarioId'])
    const query = Object.fromEntries(Object.keys(route.query).sort().map(key => [key, key === 'additionalScenarioIds' ? call.ids.filter(id => id !== call.main).sort() : route.query[key]]))
    const published = !programmatic
      && (this.options.resolvePagePublication !== undefined || this.options.resolvePageNavigationReceipt !== undefined)
    const key = JSON.stringify([published ? 'published' : 'design', projectId, route.meta['nodeId'],
      tool.pageId, route.meta['blueprintScenarioId'], query, route.hash])
    const existing = this.pageInstances.get(key)
    if (existing && !existing.runtime.destroyed) {
      existing.assertCurrent?.()
      return existing.runtime
    }
    const prepared = this.options.preparePageCall?.(route)
    prepared?.assertCurrent()
    const inputText = route.query['scenarioInputs']
    if (prepared && inputText !== undefined) throw new Error('此页面调用参数由宿主提供')
    if (inputText !== undefined && (typeof inputText !== 'string' || !inputText.trim())) throw new Error('scenarioInputs 必须是单个非空 JSON 参数')
    const scenarioInputs = prepared?.scenarioInputs ?? (inputText === undefined ? undefined : PageRuntime.parseScenarioInputs(inputText))
    const page = new PageTool({ pageId: tool.pageId })
    const reader = this.options.readPageFile
    let pagedata = new Map<string, RuntimePagePublicationPagedata>()
    let assertReceiptCurrent: (() => void) | undefined
    let publication: RuntimePagePublicationResolution | undefined
    let receipt: RuntimePageNavigationReceipt | undefined
    const routeFullPath = route.fullPath
    const findNode = (nodes: readonly RuntimeNavigationItem[]): RuntimeNavigationItem | undefined => {
      for (const node of nodes) {
        if (node.id === route.meta['nodeId']) return node
        const match = findNode(node.children ?? [])
        if (match) return match
      }
      return undefined
    }
    const assertBindingCurrent = (): void => {
      const currentRoute = this.options.readCurrentRoute?.()
      if (currentRoute !== undefined
        && (currentRoute.fullPath !== routeFullPath || currentRoute.meta['nodeId'] !== route.meta['nodeId']
          || currentRoute.params['projectId'] !== route.params['projectId'])) {
        throw new Error('PAGE_RUNTIME_STALE: 路由或调用身份已改变，必须重新打开页面')
      }
      if (programmatic) return
      const navTree = this.options.readNavTree()
      const node = findNode(navTree?.items ?? [])
      const registeredTool = node?.tool
      if (navTree !== null
        && (registeredTool?.pageId !== page.pageId || registeredTool.projectId !== projectId || node?.blueprintScenarioId !== route.meta['blueprintScenarioId'])) {
        throw new Error('PAGE_RUNTIME_STALE: 蓝图工具绑定已改变，必须重新打开页面')
      }
      assertReceiptCurrent?.()
    }
    const runtime: PageRuntime = markRaw(new PageRuntime({
      tool: page, scenarioIds: call.ids, ...(call.main === undefined ? {} : { mainScenarioId: call.main }),
      ...(scenarioInputs === undefined ? {} : { scenarioInputs }),
      ...(published ? {resolveSource: async (): Promise<PageRuntimeSource> => {
        assertBindingCurrent()
        prepared?.assertCurrent()
        const resolved = this.options.resolvePageNavigationReceipt
          ? undefined
          : await this.options.resolvePagePublication?.({
            projectId, pageId: page.pageId, scenarioIds: call.ids,
            ...(typeof route.meta['nodeId'] === 'string' ? {nodeId: route.meta['nodeId']} : {}),
          })
        resolved?.assertCurrent()
        if (this.options.resolvePageNavigationReceipt) {
          const nodeId = route.meta['nodeId']
          if (typeof nodeId !== 'string' || nodeId.trim() === '') {
            throw new Error('PAGE_NAVIGATION_RECEIPT_IDENTITY_CONFLICT: 导航节点身份缺失')
          }
          receipt = await this.options.resolvePageNavigationReceipt({
            projectId, pageId: page.pageId, nodeId, scenarioIds: call.ids,
            ...(call.main === undefined ? {} : {mainScenarioId: call.main}),
          })
          assertReceiptCurrent = receipt.assertCurrent
          receipt.assertCurrent()
          if (receipt.state !== 'READY') {
            throw new Error(`PAGE_NAVIGATION_RECEIPT_${receipt.state}: ${receipt.reason ?? '页面发布导航收据未就绪'}`)
          }
        }
        publication = receipt?.publication ?? resolved
        if (!hasCompleteNavigationReceipt(receipt)) {
          throw new Error('PAGE_NAVIGATION_RECEIPT_IDENTITY_CONFLICT: READY 收据缺少完整工具文件 proof')
        }
        if (!publication?.manifest) {
          throw new Error('PAGE_RUNTIME_PUBLICATION_REQUIRED: 发布运行必须读取 publication manifest')
        }
        if (!publication.publicationRef.trim()) {
          throw new Error('PAGE_RUNTIME_PUBLICATION_REQUIRED: 发布运行必须读取 publication manifest')
        }
        publication.assertCurrent()
        return {
          mode: 'published' as const,
          sourceRevision: publication.manifest.sourceRevision,
          publicationRef: publication.publicationRef,
          scenarioIds: call.ids,
        }
      }} : {resolveSource: (): Promise<PageRuntimeSource> => {
        prepared?.assertCurrent()
        assertBindingCurrent()
        return Promise.resolve({
          mode: 'design' as const,
          sourceRevision: `working:${projectId}:${page.pageId}:${runtime.instanceId}:${runtime.generation}`,
          publicationRef: null,
          scenarioIds: call.ids,
        })
      }}),
      loadTool: async () => {
        prepared?.assertCurrent()
        const batchReader = this.options.readPageFiles
        if (!reader && !batchReader && receipt?.state !== 'READY') throw new Error('未注入工具文件读取器')
        const generation = runtime.generation
        const assertGenerationCurrent = (): void => {
          if (runtime.destroyed || runtime.generation !== generation) throw new Error('PAGE_RUNTIME_STALE: 工具读取已失效')
        }
        assertBindingCurrent()
        publication?.assertCurrent()
        assertGenerationCurrent()
        pagedata = new Map()
        if (publication) {
          const manifest = publication.manifest
          if (runtime.source.mode !== 'published'
            || manifest.sourceRevision !== runtime.source.sourceRevision
            || publication.publicationRef !== runtime.source.publicationRef) {
            throw new Error('PAGE_PUBLICATION_SCOPE_STALE: 运行来源与 manifest 不一致')
          }
          if (manifest.pageId !== page.pageId) throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: manifest pageId 不一致')
          if (manifest.scenarioIds.length !== call.ids.length
            || manifest.scenarioIds.some(id => !call.ids.includes(id))) {
            throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: manifest 场景集合不一致')
          }
          for (const file of PAGE_TOOL_FILE_NAMES) {
            const matches = manifest.files.filter(item => item.fileName === file)
            if (matches.length !== 1) throw new Error(`PAGE_PUBLICATION_MANIFEST_MISSING: manifest 缺少 ${file}`)
          }
          if (manifest.files.length !== PAGE_TOOL_FILE_NAMES.length
            || manifest.pagedata.length !== call.ids.length
            || new Set(manifest.pagedata.map(item => item.scenarioId)).size !== manifest.pagedata.length) {
            throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: manifest 文件快照不完整')
          }
          for (const scenarioId of call.ids) {
            const snapshot = manifest.pagedata.find(item => item.scenarioId === scenarioId)
            if (!snapshot) throw new Error(`PAGE_PUBLICATION_MANIFEST_MISSING: manifest 缺少 ${scenarioId} pagedata`)
            pagedata.set(scenarioId, snapshot)
            await this.proofText(snapshot.text, snapshot.sha256, `${scenarioId}/pagedata.json`)
          }
        }
        prepared?.assertCurrent()
        assertBindingCurrent()
        publication?.assertCurrent()
        const commands = PAGE_TOOL_FILE_NAMES.map(fileName => ({
          projectId, pageId: page.pageId, fileName,
          ...(publication ? {versionId: publication.publicationRef} : {}),
        }))
        const receiptFiles = new Map(receipt?.state === 'READY'
          ? (receipt.files ?? []).map(file => [file.fileName, file.text])
          : [])
        const texts: readonly unknown[] = receipt?.state === 'READY'
          ? commands.map(command => receiptFiles.get(command.fileName))
          : batchReader ? await batchReader(commands) : reader ? await Promise.all(commands.map(reader)) : []
        assertGenerationCurrent()
        prepared?.assertCurrent()
        assertBindingCurrent()
        publication?.assertCurrent()
        if (texts.length !== commands.length) throw new Error('工具文件读取结果数量不符')
        for (const [index, command] of commands.entries()) {
          const text = texts[index]
          if (typeof text !== 'string') throw new Error('工具文件读取结果缺少文本')
          const proof = publication?.manifest.files.find(file => file.fileName === command.fileName)
          if (publication && !proof) throw new Error(`PAGE_PUBLICATION_MANIFEST_MISSING: manifest 缺少 ${command.fileName}`)
          if (proof) await this.proofText(text, proof.sha256, command.fileName)
        }
        assertGenerationCurrent()
        prepared?.assertCurrent()
        assertBindingCurrent()
        publication?.assertCurrent()
        for (const [index, command] of commands.entries()) {
          const text = texts[index]
          if (typeof text !== 'string') throw new Error('工具文件读取结果缺少文本')
          page.hydrateFileText(command.fileName, text)
        }
        page.markLoaded()
        return page
      },
      loadScenario: async scenarioId => {
        prepared?.assertCurrent()
        assertBindingCurrent()
        if (!this.options.loadScenario) throw new Error('未注入场景运行装配器')
        const snapshot = pagedata.get(scenarioId)
        const dataSet = await this.options.loadScenario({
          projectId, scenarioId, source: runtime.source, ...(snapshot ? {pagedata: snapshot} : {}),
        })
        try { prepared?.assertCurrent(); assertBindingCurrent(); return dataSet }
        catch (error) { dataSet.destroy(); throw error }
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
        const capability = prepared?.createHost?.(runtime)
        if (capability && capability.runtime !== runtime) throw new Error('PAGE_HOST_RUNTIME_MISMATCH')
        const host = capability && {
          runtime,
          assertCurrent() {
            assertBindingCurrent()
            assertReceiptCurrent?.()
            capability.assertCurrent()
          },
          invoke: (name: string, input: unknown, signal: AbortSignal) => capability.invoke(name, input, signal),
        }
        return () => h(this.options.pageComponent, {
          ref: renderer, pageRuntime: runtime, routeSnapshot: snapshot,
          ...(host ? {host} : {}),
        })
      } }))
    this.pageInstances.set(key, { runtime, view, route: snapshot, nodeId: String(route.meta['nodeId']), key,
      ...((prepared || this.options.resolvePageNavigationReceipt) ? {assertCurrent: () => {
        assertBindingCurrent()
        prepared?.assertCurrent()
        assertReceiptCurrent?.()
      }} : {}) })
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
