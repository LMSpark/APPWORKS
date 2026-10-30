/**
 * @module @spark-appworks/spark-project-model:page-tool/project-tool-resource
 * 职责：把蓝图工具清单投影为只读 DataView。
 * 边界：ProjectToolFile 的查询、写入、版本及 attempt 均由 spark-data FileResource 适配器承接。
 */
import {DataViewLocalQuery, type DataColumn, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {ProjectWorkspace} from '../project/project-workspace'
import {projectNodeDeliveryKind, type ProjectBlueprintTreeData} from '../blueprint/project-blueprint-node'
import {resolvePageNodePageId} from '../blueprint/project-blueprint-tree'

type Executor = Parameters<DataView['bindQueryExecutor']>[0]
type Result = Awaited<ReturnType<Executor['executeQuery']>>

/** 只读工具目录投影；工具文件是独立 FileResource，不由此类读取或保存。 */
export class ProjectToolResource {
  static readonly resources = {ProjectToolCatalog: 'project:tool-catalog', ProjectToolFile: 'project:tool-file'} as const
  readonly #projectId: string

  constructor(private readonly options: Readonly<{workspace: ProjectWorkspace; metadataScenarioId: string; assertCurrent(): void;
    blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>}>) {
    this.#projectId = options.workspace.project.projectId
  }

  static queryParameters(resourceId: string): ReadonlyArray<Pick<DataColumn, 'name' | 'type' | 'label' | 'required'>> {
    if (resourceId === this.resources.ProjectToolCatalog) return []
    if (resourceId !== this.resources.ProjectToolFile) throw new Error('PROJECT_TOOL_RESOURCE: 未注册的工具资源')
    return [
      {name: 'pageId', type: 'string', label: '工具ID', required: true},
      {name: 'fileName', type: 'string', label: '工具文件名', required: true},
      {name: 'versionId', type: 'string', label: '发布版本ID（空为工作文件）'},
    ]
  }

  private assertCatalogView(view: DataView): void {
    this.options.assertCurrent()
    if (this.options.workspace.project.projectId !== this.#projectId || view.destroyed || view.dataSet?.destroyed
      || view.dataSet?.scenarioId !== this.options.metadataScenarioId || view.tableName !== 'ProjectToolCatalog'
      || view.dataTable?.resourceId !== ProjectToolResource.resources.ProjectToolCatalog
      || view.dataTable.resourceType !== 'file' || view.dataTable.modelBinding) throw new Error('PROJECT_TOOL_IDENTITY: 工具目录身份已失效')
  }

  private async catalog(): Promise<DataRow[]> {
    const projectTree = this.options.blueprintTreeProjection
    if (!projectTree) throw new Error('PROJECT_TOOL_CATALOG_OWNER: 缺少正式导航 DataView 树投影 owner')
    const root = await projectTree()
    this.options.assertCurrent()
    const ids = new Map<string, Set<string>>()
    const visit = (node: (typeof root.children)[number]): void => {
      const id = resolvePageNodePageId(node)
      if (projectNodeDeliveryKind(node) === 'page' && !id) throw new Error(`蓝图工具 ${node.nodeId} 缺少可解析的正式文件身份`)
      if (id) {
        if (node.projectId !== this.#projectId) throw new Error(`蓝图工具 ${node.nodeId} 不属于当前应用`)
        const versions = ids.get(id) ?? new Set<string>(), version = node.source['VersionId']
        if (typeof version === 'string' && version.trim()) versions.add(version)
        ids.set(id, versions)
      }
      node.children?.forEach(visit)
    }
    visit(root)
    return [...ids].sort(([a], [b]) => a.localeCompare(b)).map(([pageId, versions]) => ({pageId, versions: [...versions].sort()}))
  }

  async executeQuery(view: DataView, params: QueryParams): Promise<Result> {
    this.assertCatalogView(view)
    const rows = await this.catalog()
    this.assertCatalogView(view)
    const primaryKey = view.primaryKey
    const selected = DataViewLocalQuery.select({rows, fields: new Set(['pageId', 'versions']), primaryKeys: [primaryKey], params})
    const keys = new Set(selected.rows.map(row => String(row[primaryKey])))
    const guard = () => this.assertCatalogView(view)
    return {
      rows: selected.rows, total: selected.total, rowKey: row => row[primaryKey],
      assertIdentity: identity => {
        guard()
        if (identity.scenarioId !== this.options.metadataScenarioId || identity.metaName !== view.tableName
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== ProjectToolResource.resources.ProjectToolCatalog) {
          throw new Error('PROJECT_TOOL_IDENTITY: 工具目录查询身份不匹配')
        }
      },
      fieldAccess: (id, field) => {guard(); const visible = keys.has(String(id)) && selected.output.has(field)
        return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden', required: false, writeMode: 'readonly'}},
      readFieldAccess: (_row, field) => {guard(); return selected.output.has(field) ? 'visible' : 'invisible'},
      addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
      createChildActionState: () => 'disabled', viewActionState: (id, available = true) => {
        guard()
        return !keys.has(String(id)) ? 'hidden' : available ? 'enabled' : 'disabled'
      },
    }
  }
}
