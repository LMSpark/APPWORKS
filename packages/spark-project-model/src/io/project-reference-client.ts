import { isRecord } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintTreeData, ProjectPageNodeSummary } from '../blueprint/project-blueprint-node'
import { buildProjectPageSummaries } from '../blueprint/project-blueprint-tree'

export type ProjectSummary = Readonly<{
  projectId: string
  name: string
  icon: string
  description: string
}>

export type ProjectPageReference = ProjectPageNodeSummary & { projectId: string }
export type ListProjectReferencesOptions = Readonly<{ excludeProjectId?: string }>

export type ProjectReferenceGateway = Readonly<{
  listProjects(): Promise<unknown>
  loadProjectBlueprint(projectId: string): Promise<Partial<ProjectBlueprintTreeData>>
}>

export class ProjectReferenceClient {
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
