/**
 * @module app:services/project-planning-agent-run-provider
 * 职责：提供应用运行时 service 层的 project planning agent run provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 壳层 projectPlanning Agent Run provider（隔离式门面实例）。
 *
 * 无 UI：前端自动化入口 时，按 projectId 准备 headless
 * ProjectWorkspace，运行结束可选保存项目蓝图后丢弃，不污染 DevSystem session。
 */

import {
  createAiAgentHost,
  type AiAgentHost,
  type AiAgentHostRunResult,
  type AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiAgentRunPrepare,
  AiAgentRunTarget,
} from '@/services/ai/ai-agent-run'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import {
  buildProjectPlanningAgentInput,
  PROJECT_PLANNING_MODULE_ID,
} from '@/services/project-planning/project-planning-agent-workflow-binding'
import { activateProjectPlanningAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import { createHeadlessProjectPlanningEditor } from '@/services/project-planning/project-planning-headless'
import {
  attachAiDeliveryResult,
  createAiDeliveryFailureError,
  createAiDeliveryResultExtras,
  toError,
  type AiDeliveryArtifact,
  type AiDeliveryMode,
  type AiDeliveryPort,
} from '@/services/ai/ai-delivery-port'

export {
  createHeadlessProjectPlanningEditor,
  createProjectPlanningEditorGetter,
  resolveProjectPlanningEditor,
  type HeadlessProjectPlanningEditorScope,
  type ProjectPlanningEditorResolveContext,
} from '@/services/project-planning/project-planning-headless'

// --- delivery ---

/** projectPlanning Agent Run 落盘时携带的 editor 与蓝图保存策略。 */
export type ProjectPlanningDeliveryContext = Readonly<{
  /** headless ProjectWorkspace 实例，持有当前项目蓝图和配置页模型。 */
  editor: ProjectWorkspace
  /** Agent Run 成功结束后是否自动保存蓝图变更；false 时仅标记 dirty 不落盘。 */
  saveBlueprintAfterRun: boolean
}>

type CreateProjectPlanningDeliveryPortOptions = Readonly<{
  mode: AiDeliveryMode
  rollbackStatus: 'skipped' | 'rolledBack'
}>

export function createProjectPlanningInlineDeliveryPort(): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return createProjectPlanningDeliveryPort({
    mode: 'manual',
    rollbackStatus: 'skipped',
  })
}

export function createProjectPlanningAgentRunDeliveryPort(): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return createProjectPlanningDeliveryPort({
    mode: 'auto',
    rollbackStatus: 'rolledBack',
  })
}

function createProjectPlanningDeliveryPort(
  options: CreateProjectPlanningDeliveryPortOptions,
): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      const blueprintDirty = context.editor.project.blueprintDirty
      if (!context.saveBlueprintAfterRun || !blueprintDirty) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: blueprintDirty ? [createBlueprintArtifact('skipped')] : [],
        }
      }
      try {
        await context.editor.saveAll()
        return {
          mode: options.mode,
          status: 'saved',
          artifacts: [createBlueprintArtifact('saved')],
        }
      } catch (error: unknown) {
        return {
          mode: options.mode,
          status: 'failed',
          artifacts: [createBlueprintArtifact('dirty')],
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const blueprintDirty = context.editor.project.blueprintDirty
      return Promise.resolve({
        mode: options.mode,
        status: blueprintDirty ? options.rollbackStatus : 'skipped',
        artifacts: blueprintDirty ? [createBlueprintArtifact(options.rollbackStatus)] : [],
        message: error.message,
      })
    },
  }
}

function createBlueprintArtifact(status: AiDeliveryArtifact['status']): AiDeliveryArtifact {
  return {
    kind: 'project-blueprint',
    name: 'project-blueprint',
    status,
  }
}

type ProjectPlanningAgentRunScope = Readonly<{
  tenantId: string
  projectId: string
  scopeKey: string
  agentScopeKey: string
  saveBlueprintAfterRun: boolean
}>

export const prepareProjectPlanningAgentRun: AiAgentRunPrepare<AiAgentHost> = async (event, bridgeHost) => {
  if (event.alias !== PROJECT_PLANNING_MODULE_ID) return bridgeHost

  const scope = readProjectPlanningAgentRunScope(event.args, event.requestId)
  const editor = createHeadlessProjectPlanningEditor({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
  })
  await editor.loadBlueprint()

  // 每次 Agent Run 使用独立 AiAgentHost + 闭包 getter，避免共享 Host 的 ensure 幂等
  // 或模块级 registry 在 HMR / 并发同 scope 时丢失 editor。
  const runHost = createAiAgentHost({
    turnCallbacks: createAiAgentTurnCallbacks(),
    maxToolRounds: 16,
  })
  const projectPlanningHost = await activateProjectPlanningAgentWorkflow({
    host: runHost,
    getProjectPlanningEditor: () => editor,
  })

  return createScopedProjectPlanningHost(projectPlanningHost, scope, editor)
}

function createScopedProjectPlanningHost(
  host: AiAgentRunTarget,
  scope: ProjectPlanningAgentRunScope,
  editor: ProjectWorkspace,
): AiAgentRunTarget {
  const delivery = createProjectPlanningAgentRunDeliveryPort()
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== PROJECT_PLANNING_MODULE_ID) return host.dryRun(alias, args)
      return host.dryRun(alias, normalizeProjectPlanningAgentRunInput(args, scope, editor))
    },
    async run(
      alias: string,
      args: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      const normalizedInput = alias === PROJECT_PLANNING_MODULE_ID
        ? normalizeProjectPlanningAgentRunInput(args, scope, editor)
        : args
      let result: AiAgentHostRunResult
      try {
        result = await host.run(alias, normalizedInput, chat)
      } catch (error: unknown) {
        const normalizedError = toError(error)
        const deliveryContext = {
          editor,
          saveBlueprintAfterRun: scope.saveBlueprintAfterRun,
        }
        const deliveryResult = await delivery.rollback(deliveryContext, normalizedError)
        await delivery.trace(deliveryContext, deliveryResult)
        throw attachAiDeliveryResult(normalizedError, deliveryResult)
      }

      const deliveryContext = {
        editor,
        saveBlueprintAfterRun: scope.saveBlueprintAfterRun,
      }
      const deliveryResult = await delivery.save(deliveryContext)
      await delivery.trace(deliveryContext, deliveryResult)
      if (deliveryResult.status === 'failed') {
        throw createAiDeliveryFailureError(
          deliveryResult.message ?? 'projectPlanning Agent Run delivery failed.',
          deliveryResult,
        )
      }
      return {
        ...result,
        resultExtras: {
          ...(result.resultExtras ?? {}),
          ...createAiDeliveryResultExtras(deliveryResult),
          projectPlanning: {
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            projectScopeKey: scope.scopeKey,
            agentScopeKey: scope.agentScopeKey,
            blueprintDirty: editor.project.blueprintDirty,
            savedBlueprint: deliveryResult.status === 'saved',
            blueprintTree: editor.project.blueprintTree,
          },
        },
      }
    },
  }
}

function normalizeProjectPlanningAgentRunInput(
  args: unknown,
  scope: ProjectPlanningAgentRunScope,
  editor: ProjectWorkspace,
): JsonParams {
  if (!isJsonObjectRecord(args)) {
    throw new Error('projectPlanning Agent Run args must be a JSON object.')
  }
  const record = args
  const requirementOverride = readOptionalString(record, 'requirement')
  const planningAttachmentRef = readOptionalString(record, 'planningAttachmentRef')
  const scopeNodeIds = readOptionalStringArray(record, 'scopeNodeIds')
  const includeEmptyRequirement = readOptionalBoolean(record, 'includeEmptyRequirement')
  const options = {
    ...(requirementOverride === undefined ? {} : { requirementOverride }),
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    ...(scopeNodeIds === undefined ? {} : { scopeNodeIds }),
    ...(includeEmptyRequirement === undefined ? {} : { includeEmptyRequirement }),
  }
  return {
    ...buildProjectPlanningAgentInput(editor.project, options),
    projectScopeKey: scope.agentScopeKey,
    projectId: scope.projectId,
  }
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readProjectPlanningAgentRunScope(
  args: Record<string, unknown>,
  requestId?: string,
): ProjectPlanningAgentRunScope {
  const tenantId = readRequiredString(args, 'tenantId')
  const projectId = readRequiredString(args, 'projectId')
  const saveBlueprintAfterRun = readOptionalBoolean(args, 'saveBlueprintAfterRun') === true
  const scopeKey = `${tenantId}:${projectId}`
  return {
    tenantId,
    projectId,
    scopeKey,
    agentScopeKey: requestId === undefined || requestId.trim().length === 0
      ? scopeKey
      : `${scopeKey}:${requestId.trim()}`,
    saveBlueprintAfterRun,
  }
}

function readRequiredString(args: Record<string, unknown>, field: string): string {
  const value = readOptionalString(args, field)
  if (value === undefined) {
    throw new Error(`projectPlanning Agent Run requires ${field}.`)
  }
  return value
}

function readOptionalString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readOptionalBoolean(args: Record<string, unknown>, field: string): boolean | undefined {
  const value = args[field]
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalStringArray(args: Record<string, unknown>, field: string): string[] | undefined {
  const value = args[field]
  if (!Array.isArray(value)) return undefined
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
  return strings.length > 0 ? strings : undefined
}
