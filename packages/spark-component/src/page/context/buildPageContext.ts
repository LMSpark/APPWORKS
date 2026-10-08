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
import type {
  PageDataSpaceLayoutCreateCommand,
  PageDataSpaceLayoutRemoteRead,
  PageDataSpaceLayoutWriteCommand,
  PageLocalDraftCommand,
  PageLocalDraftWriteCommand,
  PageRuntimeServicesCapability,
} from '../../runtime/app-services'

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
  dataSpaceLayout?: PageRuntimeServicesCapability['dataSpaceLayout']
  dataSpaceDesign?: PageRuntimeServicesCapability['dataSpaceDesign']
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
  const layoutCapability = deps.dataSpaceLayout
  const layoutScenarioId = layoutCapability?.scenarioId
  const layoutDataSet = layoutScenarioId && pageRuntime.call.scenarioIds.includes(layoutScenarioId)
    ? pageRuntime.getDataSet(layoutScenarioId) : undefined
  const layoutReader = layoutDataSet ? layoutCapability?.createReader() : undefined
  const layoutWriter = layoutDataSet ? layoutCapability?.createWriter?.() : undefined
  const layoutContent = (dataSpaceId: string) => {
    assertCurrent()
    if (!layoutScenarioId || !layoutDataSet || pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) {
      throw new Error('PAGE_DATA_SPACE_LAYOUT_UNAVAILABLE: 页面未声明已装载的数据空间设计场景')
    }
    if (dataSpaceId.trim().length === 0 || dataSpaceId !== dataSpaceId.trim() || dataSpaceId.includes('@')) {
      throw new Error('数据空间布局身份非法')
    }
    return pageRuntime.getContent(`${layoutScenarioId}@${dataSpaceId}`)
  }
  const localDraft = (name: string) => {
    assertCurrent()
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9:._-]*$/.test(name)) {
      throw new Error('PAGE_LOCAL_DRAFT_NAME: 本地草稿名称非法')
    }
    return pageRuntime.getContent(`local-draft:${name}`)
  }
  const assertLocalDraftRevision = (revision: number) => {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('PAGE_LOCAL_DRAFT_REVISION: 本地草稿修订非法')
  }
  const designCapability = deps.dataSpaceDesign
  const designScenarioId = designCapability?.scenarioId
  const designDataSet = designScenarioId && pageRuntime.call.scenarioIds.includes(designScenarioId)
    ? pageRuntime.getDataSet(designScenarioId) : undefined
  const designReader = designDataSet ? designCapability?.createReader() : undefined
  const moduleContext = deps.getModuleContext?.() ?? null
  const assertCurrent = () => { if (deps.signal.aborted || pageRuntime.destroyed || pageRuntime.generation !== generation) throw new Error("PAGE_RUNTIME_STALE: 页面脚本已失效") }
  const requireViewDesign = () => {
    assertCurrent()
    if (!designReader?.viewDesign || !designScenarioId || !designDataSet) throw new Error('PAGE_DATA_SPACE_VIEW_DESIGN_UNAVAILABLE: 页面未声明视图设计能力')
    if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 设计场景已失效')
    return designReader.viewDesign
  }
  const viewDirtyKey = (scenarioId: string) => `data-space-views:${scenarioId}`
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
      getLocalDraft(name: string) {
        const draft = localDraft(name)
        return {content: draft.draft, revision: draft.revision}
      },
      setLocalDraft(command: PageLocalDraftWriteCommand) {
        assertCurrent()
        if (typeof command.content !== 'string') throw new Error('PAGE_LOCAL_DRAFT_CONTENT: 本地草稿必须是文本')
        assertLocalDraftRevision(command.expectedRevision)
        const draft = localDraft(command.name)
        if (draft.revision !== command.expectedRevision) throw new Error('PAGE_LOCAL_DRAFT_STALE: 本地草稿已变化')
        if (draft.baseline === undefined && !draft.acceptRead(null, command.expectedRevision)) {
          throw new Error('PAGE_LOCAL_DRAFT_STALE: 本地草稿已变化')
        }
        draft.setDraft(command.content)
      },
      discardLocalDraft(command: PageLocalDraftCommand) {
        assertCurrent()
        assertLocalDraftRevision(command.expectedRevision)
        const draft = localDraft(command.name)
        if (draft.revision !== command.expectedRevision) throw new Error('PAGE_LOCAL_DRAFT_STALE: 本地草稿已变化')
        draft.discardDraft()
      },
      getDataSpaceLayoutContent(dataSpaceId: string) { return layoutContent(dataSpaceId).snapshot() },
      setDataSpaceLayoutDraft(command: PageDataSpaceLayoutCreateCommand) {
        layoutContent(command.dataSpaceId).setDraft(command.content)
      },
      discardDataSpaceLayoutDraft(dataSpaceId: string) { layoutContent(dataSpaceId).discardDraft() },
      async readDataSpaceLayoutForAdoption(dataSpaceId: string) {
        const content = layoutContent(dataSpaceId)
        if (content.status === 'pending') throw new Error('PAGE_CONTENT_BUSY: 布局写入尚未确认')
        if (!layoutReader) throw new Error('PAGE_DATA_SPACE_LAYOUT_UNAVAILABLE: 布局读取能力不可用')
        const revision = content.revision
        const remote = await layoutReader.readDataSpaceLayout(dataSpaceId)
        assertCurrent()
        return content.offerRemote(remote, revision)
      },
      adoptDataSpaceLayoutRead(dataSpaceId: string, read: PageDataSpaceLayoutRemoteRead) {
        layoutContent(dataSpaceId).adoptRemote(read, read.revision)
      },
      async copyText(text) { assertCurrent(); await pageService.copyText(text); assertCurrent() },
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
      async readDataSpaceLayout(dataSpaceId: string) {
        assertCurrent()
        if (!layoutReader || !layoutScenarioId || !layoutDataSet) {
          throw new Error('PAGE_DATA_SPACE_LAYOUT_UNAVAILABLE: 页面未声明已装载的数据空间设计场景')
        }
        if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        const content = layoutContent(dataSpaceId)
        if (content.status !== 'idle') throw new Error('PAGE_CONTENT_BUSY: 布局写入结果尚未核对，请使用明确的远端读取入口')
        const revision = content.revision
        try {
          const result = await layoutReader.readDataSpaceLayout(dataSpaceId)
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          content.acceptRead(result, revision)
          return result
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async saveDataSpaceLayout(command: PageDataSpaceLayoutWriteCommand) {
        assertCurrent()
        if (!layoutWriter || !layoutScenarioId || !layoutDataSet) {
          throw new Error('PAGE_DATA_SPACE_LAYOUT_UNAVAILABLE: 页面未声明已装载的数据空间设计场景')
        }
        if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        const content = layoutContent(command.dataSpaceId)
        try {
          await content.startWrite({kind: 'save', submitted: command.content, expectedContent: command.expectedContent,
            run: () => layoutWriter.saveDataSpaceLayout(command)})
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async createDataSpaceLayout(command: PageDataSpaceLayoutCreateCommand) {
        assertCurrent()
        if (!layoutWriter || !layoutScenarioId || !layoutDataSet) {
          throw new Error('PAGE_DATA_SPACE_LAYOUT_UNAVAILABLE: 页面未声明已装载的数据空间设计场景')
        }
        if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        const content = layoutContent(command.dataSpaceId)
        try {
          await content.startWrite({kind: 'create', submitted: command.content, expectedContent: null,
            run: () => layoutWriter.createDataSpaceLayout(command)})
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(layoutScenarioId) !== layoutDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async readDataSpaceRelationDependencyOptions() {
        assertCurrent()
        if (!designReader || !designScenarioId || !designDataSet) {
          throw new Error('PAGE_DATA_SPACE_DESIGN_UNAVAILABLE: 页面未声明已装载的数据空间设计场景')
        }
        if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        try {
          const result = await designReader.readRelationDependencyOptions()
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          return result
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async readDataSpaceModelSources(input) {
        assertCurrent()
        if (!designReader?.modelSources || !designScenarioId || !designDataSet) {
          throw new Error('PAGE_DATA_SPACE_MODEL_SOURCES_UNAVAILABLE: 页面未声明模型来源读取能力')
        }
        if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        try {
          const result = await designReader.modelSources.query(input)
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          return result
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async prepareDataSpaceModelSource(source) {
        assertCurrent()
        if (!designReader?.modelSources || !designScenarioId || !designDataSet) {
          throw new Error('PAGE_DATA_SPACE_MODEL_SOURCES_UNAVAILABLE: 页面未声明模型来源读取能力')
        }
        if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
        try {
          const result = await designReader.modelSources.prepare(source)
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          return result
        } catch (error) {
          assertCurrent()
          if (pageRuntime.getDataSet(designScenarioId) !== designDataSet) throw new Error('PAGE_RUNTIME_STALE: 页面场景已失效')
          throw error
        }
      },
      async openDataSpaceViews(scenarioId) {
        const opened = await requireViewDesign().open(scenarioId)
        if (!pageRuntime.destroyed && pageRuntime.generation === generation) pageRuntime.setExternalDirtySource(viewDirtyKey(scenarioId), opened.dirtySource)
        requireViewDesign()
        return opened.state
      },
      async createDataSpaceViews(input) {
        const opened = await requireViewDesign().create(input, requireViewDesign)
        if (!pageRuntime.destroyed && pageRuntime.generation === generation) pageRuntime.setExternalDirtySource(viewDirtyKey(input.scenarioId), opened.dirtySource)
        requireViewDesign()
        return opened.state
      },
      async readDataSpaceViewModel(input) {
        const result = await requireViewDesign().readModel(input)
        requireViewDesign()
        return result
      },
      async stageDataSpaceView(input) {
        const result = await requireViewDesign().stage(input, requireViewDesign)
        requireViewDesign()
        return result
      },
      async saveDataSpaceViews(scenarioId) {
        const result = await requireViewDesign().save(scenarioId, requireViewDesign)
        requireViewDesign()
        return result
      },
      async verifyDataSpaceViews(scenarioId) {
        const result = await requireViewDesign().verify(scenarioId)
        requireViewDesign()
        return result
      },
      async previewDataSpaceViewsRemote(scenarioId) {
        const result = await requireViewDesign().previewRemote(scenarioId)
        requireViewDesign()
        return result
      },
      async adoptDataSpaceViews(input) {
        const result = await requireViewDesign().adopt(input)
        if (result === null && !pageRuntime.destroyed && pageRuntime.generation === generation) pageRuntime.setExternalDirtySource(viewDirtyKey(input.scenarioId), null)
        requireViewDesign()
        return result
      },
      async previewDataSpaceView(input) {
        const result = await requireViewDesign().preview(input)
        requireViewDesign()
        return result
      },
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


