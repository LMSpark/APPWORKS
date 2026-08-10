/**
 * @module app:services/page-data-design-agent-run-provider
 * 职责：pageDataDesign Agent Run preset，归一化为 pageDesign 并绑定 selective save 上下文。
 * 边界：不单独注册业务能力；alias 仅用于调度路由。
 * AI用途：排查 pageDataDesign 如何落到 pageDesign run 与 pagedata.json 落盘时，用本模块。
 */
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { PageNodeFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  type PageDesignRunInput,
} from '@/services/page-design/page-design-agent-workflow-binding'
import { activatePageDesignAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import type { PageDesignAllowedOperations } from '@/services/page-design/page-design-gates'
import {
  bindPageDesignRunContext,
  clearPageDesignRunContext,
} from '@/services/page-design/page-design-gates'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
} from '@/services/page-design/page-design-headless'
import {
  wrapPageDesignAgentRunWithDelivery,
} from '@/services/page-design/page-design-agent-run-provider'
import type {
  AiAgentRunPrepare,
  AiAgentRunTarget,
} from '@/services/ai/ai-agent-run'

export const PAGE_DATA_DESIGN_MODULE_ID = 'pageDataDesign'

/** pageDataDesign preset：只允许 DataSet / pagedata.json。 */
export const PAGE_DATA_DESIGN_ALLOWED_OPERATIONS = {
  dataSet: true,
  nodeTree: false,
  script: false,
  style: false,
  blueprint: false,
} as const satisfies PageDesignAllowedOperations

export const PAGE_DATA_DESIGN_SAVE_FILE_NAMES = ['pagedata.json'] as const satisfies readonly PageNodeFileName[]

const PAGE_DATA_DESIGN_RUN_CONTEXT = {
  allowedOperations: PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
  deliverySaveFileNames: PAGE_DATA_DESIGN_SAVE_FILE_NAMES,
} as const

/** Page Data Design Host Input 的输入数据。 */
export type PageDataDesignHostInput = Readonly<{
  /** 目标页面 ID；用于定位 pageDesign 编辑器和落盘上下文。 */
  pageId: string
  /** 页面设计需求描述；作为 LLM 策划的基础输入。 */
  description: string
  /** 经合并增强后的有效描述（含 dataRequirement 补充说明）；传递给 pageDesign 运行时。 */
  effectiveDescription: string
  /** 所属项目 ID；用于跨页面上下文和知识查询。 */
  projectId?: string
  /** 策划任务标题；用于 AI 会话标识和回溯。 */
  planningTitle?: string
  /** 策划任务蓝图路径；标识当前节点在项目蓝图中的位置。 */
  planningPath?: string
  /** 数据建模专项补充需求；会追加到 description 末尾作为 LLM 额外指引。 */
  dataRequirement?: string
}>

export function normalizePageDataDesignToPageDesignInput(
  args: Record<string, unknown>,
): JsonParams {
  const input = readPageDataDesignHostInput(args)
  const description = mergePageDataDesignDescription(input)
  const normalized: PageDesignRunInput = {
    pageId: input.pageId,
    description,
    effectiveDescription: input.effectiveDescription,
    allowedOperations: PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
  }
  if (input.projectId !== undefined) normalized.projectId = input.projectId
  if (input.planningTitle !== undefined) normalized.planningTitle = input.planningTitle
  if (input.planningPath !== undefined) normalized.planningPath = input.planningPath
  return normalized
}

const pageDataDesignEditors = new Map<string, ProjectWorkspace>()

export const preparePageDataDesignAgentRun: AiAgentRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DATA_DESIGN_MODULE_ID) return host

  const pageId = readPageDataDesignPageId(event.args)
  if (pageId !== null) {
    const editor = createHeadlessPageDesignEditor()
    await editor.selectPage(pageId, { forceReload: true })
    pageDataDesignEditors.set(pageId, editor)
  }

  const pageDesignHost = await activatePageDesignAgentWorkflow({
    host,
    getPageDesignEditor: createPageDesignEditorGetter(pageDataDesignEditors),
  })

  return createPageDataDesignPresetHost(pageDesignHost, pageId)
}

function createPageDataDesignPresetHost(
  host: AiAgentRunTarget,
  pageId: string | null,
): AiAgentRunTarget {
  const savingHost = wrapPageDesignAgentRunWithDelivery(host, pageId, pageDataDesignEditors)
  return {
    has(alias) {
      if (alias === PAGE_DATA_DESIGN_MODULE_ID) return true
      return savingHost.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== PAGE_DATA_DESIGN_MODULE_ID) return savingHost.dryRun(alias, args)
      return savingHost.dryRun(
        PAGE_DESIGN_MODULE_ID,
        normalizePageDataDesignToPageDesignInput(readJsonObjectArgs(args)),
      )
    },
    async run(
      alias: string,
      args: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      if (alias !== PAGE_DATA_DESIGN_MODULE_ID) {
        return savingHost.run(alias, args, chat)
      }
      const normalizedArgs = normalizePageDataDesignToPageDesignInput(readJsonObjectArgs(args))
      if (pageId !== null) bindPageDataDesignRunContext(pageId)
      try {
        return await savingHost.run(PAGE_DESIGN_MODULE_ID, normalizedArgs, chat)
      } finally {
        if (pageId !== null) clearPageDataDesignRunContext(pageId)
      }
    },
  }
}

function bindPageDataDesignRunContext(pageId: string): void {
  bindPageDesignRunContext(pageId, PAGE_DATA_DESIGN_RUN_CONTEXT)
}

function clearPageDataDesignRunContext(pageId: string): void {
  clearPageDesignRunContext(pageId)
}

function readJsonObjectArgs(args: unknown): Record<string, unknown> {
  if (!isJsonRecord(args)) {
    throw new Error('pageDataDesign args must be a JSON object.')
  }
  return args
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readPageDataDesignPageId(args: Record<string, unknown>): string | null {
  const pageId = args['pageId']
  if (typeof pageId !== 'string') return null
  const normalized = pageId.trim()
  return normalized.length > 0 ? normalized : null
}

function readPageDataDesignHostInput(args: Record<string, unknown>): PageDataDesignHostInput {
  const pageId = readRequiredString(args, 'pageId')
  const description = readRequiredString(args, 'description')
  const effectiveDescription = readRequiredString(args, 'effectiveDescription')
  const projectId = readOptionalString(args, 'projectId')
  const planningTitle = readOptionalString(args, 'planningTitle')
  const planningPath = readOptionalString(args, 'planningPath')
  const dataRequirement = readOptionalString(args, 'dataRequirement')
  return {
    pageId,
    description,
    effectiveDescription,
    ...(projectId === undefined ? {} : { projectId }),
    ...(planningTitle === undefined ? {} : { planningTitle }),
    ...(planningPath === undefined ? {} : { planningPath }),
    ...(dataRequirement === undefined ? {} : { dataRequirement }),
  }
}

function mergePageDataDesignDescription(input: PageDataDesignHostInput): string {
  const base = input.description.trim()
  const dataRequirement = input.dataRequirement?.trim()
  if (dataRequirement === undefined || dataRequirement.length === 0) return base
  return `${base}\n\n数据建模补充说明:\n${dataRequirement}`
}

function readRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`pageDataDesign requires string field "${key}".`)
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`pageDataDesign requires non-empty "${key}".`)
  }
  return normalized
}

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}
