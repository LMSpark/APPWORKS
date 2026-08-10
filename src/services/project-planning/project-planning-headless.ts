/**
 * @module app:services/project-planning/project-planning-headless
 * 职责：projectPlanning 隔离式 headless ProjectWorkspace 工厂与 registry getter。
 * 边界：只创建/解析 headless editor，不执行 Agent Run 或项目蓝图落盘。
 * AI用途：projectPlanning Agent Run 需要隔离式 ProjectWorkspace 时，用本模块获取 editor 实例。
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createLowcodeProjectGateways,
  readLowcodePrincipal,
} from '@/lowcode/lowcode-runtime'

/** Project Planning Editor Resolve Context 的运行上下文。 */
export type ProjectPlanningEditorResolveContext = Readonly<{
  /** 模块实例 ID，用于在 headlessRegistry 中查找对应的 ProjectWorkspace 实例；必须事先由 createHeadlessProjectPlanningEditor 注册。 */
  moduleInstanceId: string
}>

/** Headless Project Planning Editor Scope 的语义模型。 */
export type HeadlessProjectPlanningEditorScope = Readonly<{
  /** 租户 ID，用于多租户场景下隔离 API 请求的作用域；未提供时从用户会话推断。 */
  tenantId?: string
  /** 项目 ID，决定 ProjectWorkspace 绑定的项目；未提供时回退到用户默认项目或 'homepage'。 */
  projectId?: string
}>

export function createHeadlessProjectPlanningEditor(
  scope?: string | HeadlessProjectPlanningEditorScope,
): ProjectWorkspace {
  const explicitTenantId = typeof scope === 'string' ? undefined : scope?.tenantId?.trim()
  const explicitProjectId = (typeof scope === 'string' ? scope : scope?.projectId)?.trim()
  const principal = readLowcodePrincipal()
  const defaultTenantId = principal?.enterpriseName.trim()
  const defaultProjectId = principal?.applicationId?.trim()
  const resolvedTenantId = explicitTenantId !== undefined && explicitTenantId.length > 0
    ? explicitTenantId
    : defaultTenantId !== undefined && defaultTenantId.length > 0
      ? defaultTenantId
      : 'platform'
  const resolvedProjectId = explicitProjectId !== undefined && explicitProjectId.length > 0
    ? explicitProjectId
    : defaultProjectId !== undefined && defaultProjectId.length > 0
      ? defaultProjectId
      : 'homepage'
  const editor = new ProjectWorkspace({
    projectId: resolvedProjectId,
    ...createLowcodeProjectGateways(resolvedProjectId),
  })
  editor.project.replaceProjectInfo({
    tenantId: resolvedTenantId,
    projectId: resolvedProjectId,
  })
  return editor
}

export function resolveProjectPlanningEditor(
  context: ProjectPlanningEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): ProjectWorkspace {
  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless projectPlanning editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createProjectPlanningEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  return (context) => resolveProjectPlanningEditor(
    { moduleInstanceId: context.moduleInstanceId },
    headlessRegistry,
  )
}
