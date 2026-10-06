/**
 * @module app:services/page-design/page-design-agent-run-provider
 * 职责：pageDesign 隔离式 Agent Run——headless editor 注册、三文件 delivery、run preparation。
 * 边界：DevSystem 内联 runner 共用 editor 语义见 page-design-ai-runner；不进入 spark-ai 内核。
 * AI用途：排查 pageDesign Agent Run 的 delivery 与 run preparation 接线时，用本模块定位 provider 契约。
 */
import type {
  AiAgentHost,
  AiAgentTaskChatOptions,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import { asJsonValue } from '@spark-appworks/spark-json-document'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { PageToolFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { PAGE_TOOL_FILE_NAMES } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  resolvePageDesignPlanningContext,
} from '@/services/page-design/page-design-agent-workflow-binding'
import { activatePageDesignAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
} from '@/services/page-design/page-design-headless'
import type {
  AiAgentRunTarget,
  AiAgentRunPrepare,
} from '@/services/ai/ai-agent-run'
import {
  attachAiDeliveryResult,
  createAiDeliveryFailureError,
  createAiDeliveryResultExtras,
  toError,
  type AiDeliveryArtifact,
  type AiDeliveryMode,
  type AiDeliveryPort,
} from '@/services/ai/ai-delivery-port'
import {
  bindPageDesignRunContextFromAgentArgs,
  isPageDesignDataSetOnlyMode,
  type PageDesignAllowedOperations,
  clearPageDesignRunContext,
  readPageDesignRunContext,
} from '@/services/page-design/page-design-gates'

// --- delivery ---

/** pageDesign Agent Run 落盘时携带的 editor 与 pageId 上下文。 */
export type PageDesignDeliveryContext = Readonly<{
  /** 页面设计工作区编辑器。 */
  editor: ProjectWorkspace
  /** 当前页面节点 id。 */
  pageId: string
  requestId?: string
  scenarioId?: string
}>

/** Create Page Design Delivery Port Options 的调用配置。 */
export type CreatePageDesignDeliveryPortOptions = Readonly<{
  /** 交付模式（manual 或 auto）。 */
  mode: AiDeliveryMode
  /** 是否执行实际落盘保存。 */
  shouldSave: boolean
  /** 限定保存的文件名列表（省略则保存全部 dirty 文件）。 */
  saveFileNames?: readonly PageToolFileName[]
  allowedOperations?: PageDesignAllowedOperations
}>

/** 本次交付的明确文件范围及允许操作；省略范围与非法空范围语义不同。 */
type PageDesignDeliverySelection = Pick<CreatePageDesignDeliveryPortOptions, 'saveFileNames' | 'allowedOperations'>
/** 内联交付设置；沿用已确定的目标范围并显式决定是否实际保存。 */
type PageDesignInlineDeliveryOptions = PageDesignDeliverySelection & Readonly<{ autoSave: boolean }>

export function createPageDesignInlineDeliveryPort(options: PageDesignInlineDeliveryOptions): AiDeliveryPort<PageDesignDeliveryContext> {
  const mode: AiDeliveryMode = options.autoSave ? 'auto' : 'manual'
  return createPageDesignDeliveryPort({
    mode,
    shouldSave: options.autoSave,
    ...(options.saveFileNames === undefined ? {} : { saveFileNames: options.saveFileNames }),
    ...(options.allowedOperations === undefined ? {} : { allowedOperations: options.allowedOperations }),
  })
}

export function createPageDesignAgentRunDeliveryPort(options: PageDesignDeliverySelection = {}): AiDeliveryPort<PageDesignDeliveryContext> {
  return createPageDesignDeliveryPort({
    mode: 'auto',
    shouldSave: true,
    ...(options.saveFileNames === undefined ? {} : { saveFileNames: options.saveFileNames }),
    ...(options.allowedOperations === undefined ? {} : { allowedOperations: options.allowedOperations }),
  })
}

function createPageDesignDeliveryPort(
  options: CreatePageDesignDeliveryPortOptions,
): AiDeliveryPort<PageDesignDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      if (context.editor.project.getActivePage()?.pageId !== context.pageId) throw new Error('PAGE_DESIGN_REQUEST_MISMATCH: 交付页面已改变')
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const selectedNames = resolveDeliveryTargetFileNames(dirtyFileNames, options.saveFileNames)
      const targetNames = isPageDesignDataSetOnlyMode(options.allowedOperations) ? [] : selectedNames
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      const scene = context.scenarioId === undefined ? null : context.editor.getScenarioViews(context.scenarioId)
      if (context.scenarioId !== undefined && scene === null) throw new Error('PAGE_DESIGN_SCENARIO_MISSING: 场景尚未加载')
      const shouldSaveScene = options.allowedOperations?.dataSet !== false && scene?.isDirty === true
      const sceneArtifact: AiDeliveryArtifact[] = scene === null ? [] : [{ kind: 'scenario-view', name: scene.scenarioId, status: scene.isDirty ? 'dirty' : 'skipped' }]
      if (!options.shouldSave || (targetNames.length === 0 && !shouldSaveScene)) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: [...createFilteredPageFileArtifacts({ artifactNames, dirtyFileNames, shouldSave: options.shouldSave }), ...sceneArtifact],
        }
      }
      const saves = targetNames.map(name => context.editor.savePageFile(name))
      if (scene && shouldSaveScene) saves.push(context.editor.saveScenarioViews({ scenarioId: scene.scenarioId }))
      const results = await Promise.allSettled(saves)
      const errors = results.flatMap(result => result.status === 'rejected' ? [toError(result.reason).message] : [])
      return {
        mode: options.mode,
        status: errors.length === 0 ? 'saved' : 'failed',
        artifacts: [...targetNames.map((name, index): AiDeliveryArtifact => ({ kind: 'page-file', name,
          status: results[index]?.status === 'fulfilled' ? 'saved' : 'dirty' })), ...sceneArtifact.map(artifact => ({ ...artifact, status: artifact.status === 'dirty' && results.length > targetNames.length ? (results[targetNames.length]?.status === 'fulfilled' ? 'saved' as const : 'dirty' as const) : artifact.status }))],
        ...(errors.length === 0 ? {} : { message: errors.join('\n') }),
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      const scene = context.scenarioId === undefined ? null : context.editor.getScenarioViews(context.scenarioId)
      const sceneArtifacts: AiDeliveryArtifact[] = scene === null ? [] : [{ kind: 'scenario-view', name: scene.scenarioId, status: scene.isDirty ? 'dirty' : 'skipped' }]
      return Promise.resolve({
        mode: options.mode,
        status: 'skipped',
        artifacts: [...createFilteredPageFileArtifacts({ artifactNames, dirtyFileNames, shouldSave: false }), ...sceneArtifacts],
        message: error.message,
      })
    },
  }
}

function resolveDeliveryTargetFileNames(
  dirtyFileNames: readonly PageToolFileName[],
  saveFileNames: readonly PageToolFileName[] | undefined,
): PageToolFileName[] {
  if (saveFileNames === undefined) return [...dirtyFileNames]
  if (!Array.isArray(saveFileNames) || saveFileNames.length === 0
    || saveFileNames.some((name: unknown) => !PAGE_TOOL_FILE_NAMES.some(file => file === name))) {
    throw new Error('PAGE_DESIGN_SAVE_SCOPE_INVALID: 保存范围必须为非空有效文件名数组')
  }
  return dirtyFileNames.filter(name => saveFileNames.includes(name))
}

type CreateFilteredPageFileArtifactsOptions = Readonly<{
  artifactNames: readonly PageToolFileName[]
  dirtyFileNames: readonly PageToolFileName[]
  shouldSave: boolean
}>

function createFilteredPageFileArtifacts(
  options: CreateFilteredPageFileArtifactsOptions,
): readonly AiDeliveryArtifact[] {
  return options.artifactNames.map((name) => {
    const isDirty = options.dirtyFileNames.includes(name)
    if (!options.shouldSave) {
      return { kind: 'page-file', name, status: isDirty ? 'dirty' : 'skipped' }
    }
    return { kind: 'page-file', name, status: 'skipped' }
  })
}

function readDirtyPageFileNames(editor: ProjectWorkspace): PageToolFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

// --- agent run ---

export const preparePageDesignAgentRun: AiAgentRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DESIGN_MODULE_ID) return host

  const initialArgs = asJsonValue(event.args)
  if (!isJsonArgs(initialArgs)) throw new Error('pageDesign args must be JSON object')
  const requestId = event.requestId.trim()
  const pageId = readPageDesignPageId(event.args)
  if (!requestId || pageId === null) throw new Error('pageDesign requires requestId and pageId')
  const editor = createHeadlessPageDesignEditor()
  await editor.loadBlueprint()
  await editor.selectPage(pageId, { forceReload: true })
  const planning = resolvePageDesignPlanningContext(editor.project, pageId)
  const scenarioId = typeof event.args['scenarioId'] === 'string' ? event.args['scenarioId'].trim() : undefined
  if (scenarioId !== undefined) {
    if (!scenarioId) throw new Error('pageDesign scenarioId 不能为空')
    await editor.loadScenarioViews({ scenarioId })
  }
  const editors = new Map<string, ProjectWorkspace>([[requestId, editor]])

  const pageDesignHost = await activatePageDesignAgentWorkflow({
    host: createAiAgentHost({ turnCallbacks: createAiAgentTurnCallbacks(), maxToolRounds: 16 }),
    getPageDesignEditor: createPageDesignEditorGetter(editors),
  })

  return wrapPageDesignAgentRunWithDelivery(pageDesignHost, {
    requestId, pageId, editor, ...(scenarioId === undefined ? {} : { scenarioId }),
  }, { editors, initialArgs: { ...initialArgs, ...planning, projectId: editor.project.projectId } })
}

type PageDesignPreparedRun = Readonly<{ editors: Map<string, ProjectWorkspace>; initialArgs: JsonParams }>

function wrapPageDesignAgentRunWithDelivery(
  host: AiAgentRunTarget,
  context: PageDesignDeliveryContext,
  prepared: PageDesignPreparedRun,
): AiAgentRunTarget {
  const { pageId } = context
  const requestId = context.requestId
  if (!requestId) throw new Error('pageDesign delivery requires requestId')
  let released = false
  let running = false
  const normalize = (args: JsonParams): JsonParams => {
    if (released) throw new Error('PAGE_DESIGN_REQUEST_RELEASED: 请求工作区已释放')
    if ((args['requestId'] !== undefined && args['requestId'] !== requestId)
      || (args['pageId'] !== undefined && args['pageId'] !== pageId)
      || (args['scenarioId'] !== undefined && args['scenarioId'] !== context.scenarioId)) throw new Error('PAGE_DESIGN_REQUEST_MISMATCH: 请求目标不一致')
    return { ...prepared.initialArgs, ...args, effectiveDescription: prepared.initialArgs['effectiveDescription'] ?? '', projectId: prepared.initialArgs['projectId'] ?? '', requestId, pageId, ...(context.scenarioId === undefined ? {} : { scenarioId: context.scenarioId }) }
  }
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== PAGE_DESIGN_MODULE_ID) return host.dryRun(alias, args)
      const input = asJsonValue(args)
      if (!isJsonArgs(input)) throw new Error('pageDesign args must be an object')
      const normalized = normalize(input)
      if (running || readPageDesignRunContext(requestId) !== undefined) throw new Error('PAGE_DESIGN_REQUEST_ACTIVE: 请求已在运行')
      try {
        bindPageDesignRunContextFromAgentArgs(requestId, normalized)
        return host.dryRun(alias, normalized)
      } finally { clearPageDesignRunContext(requestId) }
    },
    async run(
      alias: string,
      args: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      if (alias !== PAGE_DESIGN_MODULE_ID) return host.run(alias, args, chat)
      const input = normalize(args)
      if (running) throw new Error('PAGE_DESIGN_REQUEST_RUNNING: 请求已在运行')
      if (readPageDesignRunContext(requestId) !== undefined) throw new Error('PAGE_DESIGN_REQUEST_ACTIVE: requestId 已由其它运行占用')
      running = true
      try {
        bindPageDesignRunContextFromAgentArgs(requestId, input)
        const runContext = readPageDesignRunContext(requestId)
        const delivery = createPageDesignAgentRunDeliveryPort({
          ...(runContext?.allowedOperations === undefined ? {} : { allowedOperations: runContext.allowedOperations }),
          ...(runContext?.deliverySaveFileNames === undefined
            ? {}
            : { saveFileNames: runContext.deliverySaveFileNames }),
        })
        let result: AiAgentHostRunResult
        try {
          result = await host.run(alias, input, chat)
        } catch (error: unknown) {
          const normalizedError = toError(error)
          const deliveryContext = context
          const deliveryResult = { ...await delivery.rollback(deliveryContext, normalizedError), requestId, pageId, ...(context.scenarioId === undefined ? {} : { scenarioId: context.scenarioId }) }
          await delivery.trace(deliveryContext, deliveryResult)
          throw attachAiDeliveryResult(normalizedError, deliveryResult)
        }

        const deliveryContext = context
        const deliveryResult = { ...await delivery.save(deliveryContext), requestId, pageId, ...(context.scenarioId === undefined ? {} : { scenarioId: context.scenarioId }) }
        await delivery.trace(deliveryContext, deliveryResult)
        if (deliveryResult.status === 'failed') {
          throw createAiDeliveryFailureError(
            deliveryResult.message ?? 'pageDesign Agent Run delivery failed.',
            deliveryResult,
          )
        }
        return {
          ...result,
          resultExtras: {
            ...(result.resultExtras ?? {}),
            ...createAiDeliveryResultExtras(deliveryResult),
            pageDesign: { requestId, pageId, ...(context.scenarioId === undefined ? {} : { scenarioId: context.scenarioId }) },
          },
        }
      } finally {
        released = true
        prepared.editors.delete(requestId)
        clearPageDesignRunContext(requestId)
      }
    },
  }
}

function isJsonArgs(value: unknown): value is JsonParams {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPageDesignPageId(args: Record<string, unknown>): string | null {
  const pageId = args['pageId']
  if (typeof pageId !== 'string') return null
  const normalized = pageId.trim()
  return normalized.length > 0 ? normalized : null
}

export {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
  resolvePageDesignEditor,
  type PageDesignEditorResolveContext,
} from '@/services/page-design/page-design-headless'
