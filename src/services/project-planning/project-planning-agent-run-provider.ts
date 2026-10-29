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
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import type {
  AiAgentRunPrepare,
  AiAgentRunTarget,
} from '@/services/ai/ai-agent-run'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import {
  buildProjectPlanningAgentInput,
  PROJECT_PLANNING_MODULE_ID,
  synchronizeProjectPlanningTreeFromDataView,
} from '@/services/project-planning/project-planning-agent-workflow-binding'
import { activateProjectPlanningAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import { createHeadlessProjectPlanningEditor } from '@/services/project-planning/project-planning-headless'
import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
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
  /** True only after a live DataView command returned its accepted receipt and readback. */
  dataViewBlueprintSaved?: boolean
  /** True when the original DataView command still needs explicit Save All recovery. */
  dataViewBlueprintPending?: boolean
  /** A later plan mutation was attempted after this run had already issued its single DataView command. */
  dataViewBlueprintRepeatRejected?: boolean
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
    save(context) {
      if (context.dataViewBlueprintPending === true) {
        return Promise.resolve({
          mode: options.mode,
          status: 'failed',
          artifacts: [createBlueprintArtifact('dirty')],
          message: '项目策划 DataView 命令仍待核验；原命令身份已保留，请沿工作台 Save All 完成回读。',
        })
      }
      if (context.dataViewBlueprintRepeatRejected === true) {
        return Promise.resolve({
          mode: options.mode,
          status: 'failed',
          artifacts: [createBlueprintArtifact(context.dataViewBlueprintSaved === true ? 'saved' : 'dirty')],
          message: context.dataViewBlueprintSaved === true
            ? '本次运行的首个蓝图命令已由 DataView 确认保存；后续计划变更已拒绝，因此本次规划仅部分完成。请保留未提交计划。'
            : '本次运行已发出蓝图 DataView 命令；后续计划变更已拒绝，首个命令未确认保存，请保留计划并核验原命令。',
        })
      }
      if (context.dataViewBlueprintSaved === true) {
        return Promise.resolve({ mode: options.mode, status: 'saved', artifacts: [createBlueprintArtifact('saved')] })
      }
      const blueprintDirty = context.editor.project.blueprintDirty
      if (!context.saveBlueprintAfterRun || !blueprintDirty) {
        return Promise.resolve({
          mode: options.mode,
          status: 'skipped',
          artifacts: blueprintDirty ? [createBlueprintArtifact('skipped')] : [],
        })
      }
      return Promise.resolve({
        mode: options.mode,
        status: 'failed',
        artifacts: [createBlueprintArtifact('dirty')],
        message: '项目策划蓝图没有获准的 Base_NavigationInfo DataView 命令上下文，拒绝经 ProjectWorkspace.saveAll 提交。请保留策划结果并等待 DataView 命令接线。',
      })
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
  projectId: string
  projectScopeKey: string
  agentScopeKey: string
  saveBlueprintAfterRun: boolean
}>

export const prepareProjectPlanningAgentRun: AiAgentRunPrepare<AiAgentHost> = async (event, bridgeHost) => {
  if (event.alias !== PROJECT_PLANNING_MODULE_ID) return bridgeHost

  const scope = readProjectPlanningAgentRunScope(event.args, event.requestId)
  const editor = createHeadlessProjectPlanningEditor({projectId: scope.projectId})
  const runtime = new PageRuntime({
    pageId: 'project-planning-agent-run',
    scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY],
    mainScenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
    loadScenario: scenarioId => {
      if (scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) throw new Error(`项目策划蓝图运行时未声明场景 ${scenarioId}`)
      return loadLowcodeRuntimeScenario({ projectId: scope.projectId, scenarioId })
    },
  })
  try {
    await runtime.load()
    const dataSet = runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
    if (!dataSet) throw new Error('项目策划蓝图运行时缺少正式目录 DataSet')
    const owner = new BlueprintWorkspaceDataView(dataSet, scope.projectId, () => {
      if (runtime.destroyed || !runtime.isLoaded || runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY) !== dataSet) {
        throw new Error('项目策划蓝图 DataView 运行时已失效')
      }
    })
    try {
      await owner.loadProjectTree()
      synchronizeProjectPlanningTreeFromDataView(editor.project, owner)
    } finally {
      owner.dispose()
    }
  } finally {
    runtime.dispose()
  }

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
            projectId: scope.projectId,
            projectScopeKey: scope.projectScopeKey,
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
  const projectId = readRequiredString(args, 'projectId')
  const saveBlueprintAfterRun = readOptionalBoolean(args, 'saveBlueprintAfterRun') === true
  return {
    projectId,
    projectScopeKey: projectId,
    agentScopeKey: requestId === undefined || requestId.trim().length === 0
      ? projectId
      : `${projectId}:${requestId.trim()}`,
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
