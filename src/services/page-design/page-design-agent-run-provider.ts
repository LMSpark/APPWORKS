/**
 * @module app:services/page-design/page-design-agent-run-provider
 * 职责：pageDesign 隔离式 Agent Run——headless editor 注册、四文件 delivery、run preparation。
 * 边界：DevSystem 内联 runner 共用 editor 语义见 page-design-ai-runner；不进入 spark-ai 内核。
 * AI用途：排查 pageDesign Agent Run 的 delivery 与 run preparation 接线时，用本模块定位 provider 契约。
 */
import type {
  AiAgentHost,
  AiAgentTaskChatOptions,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { PageNodeFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
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
}>

/** Create Page Design Delivery Port Options 的调用配置。 */
export type CreatePageDesignDeliveryPortOptions = Readonly<{
  /** 交付模式（manual 或 auto）。 */
  mode: AiDeliveryMode
  /** 是否执行实际落盘保存。 */
  shouldSave: boolean
  /** 回滚时的交付状态标记。 */
  rollbackStatus: 'skipped' | 'rolledBack'
  /** 限定保存的文件名列表（省略则保存全部 dirty 文件）。 */
  saveFileNames?: readonly PageNodeFileName[]
}>

export function createPageDesignInlineDeliveryPort(options: Readonly<{
  autoSave: boolean
  saveFileNames?: readonly PageNodeFileName[]
}>): AiDeliveryPort<PageDesignDeliveryContext> {
  const mode: AiDeliveryMode = options.autoSave ? 'auto' : 'manual'
  return createPageDesignDeliveryPort({
    mode,
    shouldSave: options.autoSave,
    rollbackStatus: 'skipped',
    ...(options.saveFileNames === undefined ? {} : { saveFileNames: options.saveFileNames }),
  })
}

export function createPageDesignAgentRunDeliveryPort(options: Readonly<{
  saveFileNames?: readonly PageNodeFileName[]
}> = {}): AiDeliveryPort<PageDesignDeliveryContext> {
  return createPageDesignDeliveryPort({
    mode: 'auto',
    shouldSave: true,
    rollbackStatus: 'rolledBack',
    ...(options.saveFileNames === undefined ? {} : { saveFileNames: options.saveFileNames }),
  })
}

function createPageDesignDeliveryPort(
  options: CreatePageDesignDeliveryPortOptions,
): AiDeliveryPort<PageDesignDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const targetNames = resolveDeliveryTargetFileNames(dirtyFileNames, options.saveFileNames)
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      if (!options.shouldSave || targetNames.length === 0) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: createFilteredPageFileArtifacts({
            artifactNames,
            dirtyFileNames,
            shouldSave: options.shouldSave,
          }),
        }
      }
      try {
        await saveTargetPageFiles(context.editor, targetNames)
        return {
          mode: options.mode,
          status: 'saved',
          artifacts: createPageFileArtifacts(targetNames, 'saved'),
        }
      } catch (error: unknown) {
        return {
          mode: options.mode,
          status: 'failed',
          artifacts: createPageFileArtifacts(targetNames, 'dirty'),
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      return Promise.resolve({
        mode: options.mode,
        status: options.rollbackStatus,
        artifacts: createFilteredPageFileArtifacts({
          artifactNames,
          dirtyFileNames,
          shouldSave: options.shouldSave,
          rollbackStatus: options.rollbackStatus,
        }),
        message: error.message,
      })
    },
  }
}

function resolveDeliveryTargetFileNames(
  dirtyFileNames: readonly PageNodeFileName[],
  saveFileNames: readonly PageNodeFileName[] | undefined,
): PageNodeFileName[] {
  if (saveFileNames === undefined) return [...dirtyFileNames]
  return dirtyFileNames.filter(name => saveFileNames.includes(name))
}

type CreateFilteredPageFileArtifactsOptions = Readonly<{
  artifactNames: readonly PageNodeFileName[]
  dirtyFileNames: readonly PageNodeFileName[]
  shouldSave: boolean
  rollbackStatus?: 'skipped' | 'rolledBack'
}>

function createFilteredPageFileArtifacts(
  options: CreateFilteredPageFileArtifactsOptions,
): readonly AiDeliveryArtifact[] {
  return options.artifactNames.map((name) => {
    const isDirty = options.dirtyFileNames.includes(name)
    if (options.rollbackStatus === 'rolledBack') {
      return { kind: 'page-file', name, status: isDirty ? 'rolledBack' : 'skipped' }
    }
    if (!options.shouldSave) {
      return { kind: 'page-file', name, status: isDirty ? 'dirty' : 'skipped' }
    }
    return { kind: 'page-file', name, status: 'skipped' }
  })
}

async function saveTargetPageFiles(
  editor: ProjectWorkspace,
  targetNames: readonly PageNodeFileName[],
): Promise<void> {
  await Promise.all(targetNames.map(name => editor.savePageFile(name)))
}

function readDirtyPageFileNames(editor: ProjectWorkspace): PageNodeFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

function createPageFileArtifacts(
  fileNames: readonly PageNodeFileName[],
  status: AiDeliveryArtifact['status'],
): readonly AiDeliveryArtifact[] {
  return fileNames.map(name => ({
    kind: 'page-file',
    name,
    status,
  }))
}

// --- agent run ---

const pageDesignEditors = new Map<string, ProjectWorkspace>()

export const preparePageDesignAgentRun: AiAgentRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DESIGN_MODULE_ID) return host

  const pageId = readPageDesignPageId(event.args)
  if (pageId !== null) {
    const editor = createHeadlessPageDesignEditor()
    await editor.selectPage(pageId, { forceReload: true })
    pageDesignEditors.set(pageId, editor)
  }

  const pageDesignHost = await activatePageDesignAgentWorkflow({
    host,
    getPageDesignEditor: createPageDesignEditorGetter(pageDesignEditors),
  })

  return wrapPageDesignAgentRunWithDelivery(pageDesignHost, pageId)
}

export function wrapPageDesignAgentRunWithDelivery(
  host: AiAgentRunTarget,
  pageId: string | null,
  editors: Map<string, ProjectWorkspace> = pageDesignEditors,
): AiAgentRunTarget {
  return createSavingPageDesignHost(host, pageId, editors)
}

function createSavingPageDesignHost(
  host: AiAgentRunTarget,
  pageId: string | null,
  editors: Map<string, ProjectWorkspace>,
): AiAgentRunTarget {
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      return host.dryRun(alias, args)
    },
    async run(
      alias: string,
      args: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      const editor = pageId === null ? undefined : editors.get(pageId)
      if (pageId !== null) bindPageDesignRunContextFromAgentArgs(pageId, args)
      const runContext = pageId === null ? undefined : readPageDesignRunContext(pageId)
      const delivery = createPageDesignAgentRunDeliveryPort({
        ...(runContext?.deliverySaveFileNames === undefined
          ? {}
          : { saveFileNames: runContext.deliverySaveFileNames }),
      })
      try {
        let result: AiAgentHostRunResult
        try {
          result = await host.run(alias, args, chat)
        } catch (error: unknown) {
          if (editor === undefined || pageId === null) throw error
          const normalizedError = toError(error)
          const deliveryContext = { editor, pageId }
          const deliveryResult = await delivery.rollback(deliveryContext, normalizedError)
          await delivery.trace(deliveryContext, deliveryResult)
          throw attachAiDeliveryResult(normalizedError, deliveryResult)
        }

        if (editor === undefined || pageId === null) return result
        const deliveryContext = { editor, pageId }
        const deliveryResult = await delivery.save(deliveryContext)
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
          },
        }
      } finally {
        if (pageId !== null) {
          editors.delete(pageId)
          clearPageDesignRunContext(pageId)
        }
      }
    },
  }
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
