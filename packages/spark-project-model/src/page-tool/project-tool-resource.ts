/**
 * @module @spark-appworks/spark-project-model:page-tool/project-tool-resource
 * 职责：把蓝图工具清单投影为只读 DataView。
 * 边界：ProjectToolFile 的查询、写入、版本及 attempt 均由 spark-data FileResource 适配器承接。
 */
import type {BindReadonlyCommandQueryOptions, DataColumn, DataRow, DataView} from '@spark-appworks/spark-data'
import type {ProjectWorkspace} from '../project/project-workspace'
import {projectNodeDeliveryKind, type ProjectBlueprintTreeData} from '../blueprint/project-blueprint-node'
import {resolvePageNodePageId} from '../blueprint/project-blueprint-tree'


/** 本次注入的已加载蓝图视图树（含编辑覆盖）的只读工具投影；不证明后台工具或发布依赖全集。工具文件是独立 FileResource。 */
export class ProjectToolResource {
  static readonly resources = {ProjectToolCatalog: 'project:tool-catalog', ProjectToolFile: 'project:tool-file'} as const
  static readonly catalogResource = Object.freeze({resourceType: 'logical-view', resourceId: 'project:tool-catalog'} as const)
  readonly #projectId: string

  constructor(private readonly options: Readonly<{workspace: ProjectWorkspace; metadataScenarioId: string; assertCurrent(): void;
    blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>}>) {
    this.#projectId = options.workspace.project.projectId
  }

  static queryParameters(resourceId: string): ReadonlyArray<Pick<DataColumn, 'name' | 'type' | 'label' | 'required'>> {
    if (resourceId !== this.resources.ProjectToolFile) throw new Error('PROJECT_TOOL_RESOURCE: 未注册的工具资源')
    return [
      {name: 'pageId', type: 'string', label: '工具ID', required: true},
      {name: 'fileName', type: 'string', label: '工具文件名', required: true},
      {name: 'versionId', type: 'string', label: '发布版本ID（空为工作文件）'},
    ]
  }

  /** 保留的旧目录文件声明必须显式转换，不交给文件owner执行。 */
  static assertDeclaration(table: Readonly<Record<string, unknown>>): void {
    if (table['resourceId'] === this.catalogResource.resourceId
      && (table['resourceType'] !== this.catalogResource.resourceType || table['modelBinding'] !== undefined)) {
      throw new Error('PROJECT_TOOL_CATALOG_DECLARATION: 工具目录须声明为无后端模型绑定的logical-view，请一次性转换旧文件声明')
    }
  }

  private assertScope(): void {
    this.options.assertCurrent()
    if (this.options.workspace.project.projectId !== this.#projectId) throw new Error('PROJECT_TOOL_IDENTITY: 工具目录应用已失效')
  }

  private assertCatalogView(view: DataView): void {
    this.assertScope()
    const dataSet = view.dataSet, table = view.dataTable
    if (view.destroyed || dataSet?.destroyed !== false || table?.getView(view.viewId) !== view
      || dataSet.getTable(view.tableName) !== table || dataSet.scenarioId !== this.options.metadataScenarioId
      || view.tableName !== 'ProjectToolCatalog' || table.resourceId !== ProjectToolResource.resources.ProjectToolCatalog
      || table.resourceType !== ProjectToolResource.catalogResource.resourceType || table.modelBinding) throw new Error('PROJECT_TOOL_IDENTITY: 工具目录身份已失效')
    const columns = table.columns, keys = columns.filter(column => column.isPrimaryKey === true)
    if (view.primaryKey !== 'pageId' || keys.length !== 1 || keys[0]?.name !== 'pageId'
      || columns.filter(column => column.name === 'pageId' && column.type === 'string').length !== 1
      || columns.filter(column => column.name === 'versions' && column.type === 'json').length !== 1
      || columns.some(column => (column.name === 'pageId' || column.name === 'versions') && (Boolean(column.computeExpression) || column.isComputed === true))) {
      throw new Error('PROJECT_TOOL_CATALOG_COLUMNS: 工具目录必须声明pageId字符串主键与versions JSON字段')
    }
  }

  private async catalog(): Promise<DataRow[]> {
    const projectTree = this.options.blueprintTreeProjection
    if (!projectTree) throw new Error('PROJECT_TOOL_CATALOG_OWNER: 缺少正式导航 DataView 树投影 owner')
    const root = await projectTree()
    this.options.assertCurrent()
    const ids = new Map<string, Set<string>>()
    const visit = (node: (typeof root.children)[number]): void => {
      if (node.projectId !== this.#projectId) throw new Error('PROJECT_TOOL_IDENTITY: 蓝图树不属于本次应用')
      const id = resolvePageNodePageId(node)
      if (projectNodeDeliveryKind(node) === 'page' && !id) throw new Error(`蓝图工具 ${node.nodeId} 缺少可解析的正式文件身份`)
      if (id) {
        const versions = ids.get(id) ?? new Set<string>(), version = node.source['VersionId']
        if (typeof version === 'string' && version.trim()) versions.add(version)
        ids.set(id, versions)
      }
      node.children?.forEach(visit)
    }
    visit(root)
    return [...ids].sort(([a], [b]) => a.localeCompare(b)).map(([pageId, versions]) => ({pageId, versions: [...versions].sort()}))
  }

  /** 为本次DataTable实例提供只读绑定；实际命名/派生查询各自核身份并复用公共参数、投影及权限链。 */
  queryBinding(view: DataView): BindReadonlyCommandQueryOptions {
    this.assertCatalogView(view)
    const dataSet = view.dataSet, table = view.dataTable
    const assertTarget = (target: DataView): void => {
      this.assertCatalogView(target)
      if (target.dataSet !== dataSet || target.dataTable !== table) throw new Error('PROJECT_TOOL_IDENTITY: 工具目录实例已替换')
    }
    return {
      resource: ProjectToolResource.catalogResource,
      guard: () => this.assertScope(),
      queryColumns: target => {assertTarget(target); return target.dataTable?.columns.filter(column => column.name === 'pageId' || column.name === 'versions') ?? []},
      captureQueryInputs: target => {assertTarget(target); return () => assertTarget(target)},
      loadRows: async target => {assertTarget(target); return this.catalog()},
    }
  }
}
