/**
 * @module @spark-appworks/spark-project-model:io/project-reference-client
 * 职责：跨项目目录和页面摘要读取。
 * 边界：只返回引用投影，不持有当前项目编辑态。
 * AI用途：读取其他项目页面引用候选。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintTreeData, ProjectPageNodeSummary } from '../blueprint/project-blueprint-node'
import { buildProjectPageSummaries } from '../blueprint/project-blueprint-tree'

/** 引用候选项目的只读目录摘要。 */
export type ProjectSummary = Readonly<{
  projectId: string
  name: string
  icon: string
  description: string
}>

/** 附带目标项目身份的交付摘要，不进入当前编辑owner。 */
export type ProjectPageReference = ProjectPageNodeSummary & { projectId: string }
/** 明确排除当前项目的引用查询条件。 */
export type ListProjectReferencesOptions = Readonly<{ excludeProjectId?: string }>

/** 宿主提供的跨项目目录及正式蓝图读取能力。 */
export type ProjectReferenceGateway = Readonly<{
  listProjects(): Promise<unknown>
  loadProjectBlueprint(projectId: string): Promise<Partial<ProjectBlueprintTreeData>>
}>

/** 跨项目只读引用查询门面，不转移当前项目状态。 */
export class ProjectReferenceClient {
  /** 绑定宿主目录及正式蓝图读取能力。 */
  public constructor(private readonly gateway: ProjectReferenceGateway) {}

  public async listProjects(options: ListProjectReferencesOptions = {}): Promise<ProjectSummary[]> {
    const rows = await this.gateway.listProjects()
    const excludeProjectId = options.excludeProjectId?.trim()
    return normalizeProjectRows(rows)
      .filter((project) => project.projectId !== '' && project.projectId !== excludeProjectId)
  }

  public async listProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    const root = await this.gateway.loadProjectBlueprint(normalizedProjectId)
    return buildProjectPageSummaries(Array.isArray(root.children) ? root.children : [])
      .map((page) => ({ ...page, projectId: normalizedProjectId }))
  }
}

function normalizeProjectRows(value: unknown): ProjectSummary[] {
  return Array.isArray(value) ? value.map(normalizeProjectRow) : []
}

function normalizeProjectRow(value: unknown): ProjectSummary {
  if (!isRecord(value)) return { projectId: '', name: '', icon: '', description: '' }
  const projectId = readString(value, 'projectId') || readString(value, 'id')
  return {
    projectId,
    name: readString(value, 'name') || projectId,
    icon: readString(value, 'icon'),
    description: readString(value, 'description'),
  }
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key] : ''
}
