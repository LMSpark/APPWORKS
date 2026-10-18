/**
 * @module @spark-appworks/spark-project-model:page-tool/project-tool-resource
 * 职责：把蓝图工具清单和工具文件接入原生DataView查询及DataSet提交。
 * 边界：仅存储适配内部调用工作区IO；发布快照只读，不创建表或编辑副本。
 * AI用途：工具依赖检查及工作文件维护复用同一SPARK data生命周期。
 */
import {DataViewLocalQuery, type DataColumn, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {ProjectWorkspace} from '../project/project-workspace'
import {projectNodeDeliveryKind} from '../blueprint/project-blueprint-node'
import {resolvePageNodePageId} from '../blueprint/project-blueprint-tree'

/** 复用DataView的查询及保存适配协议。 */
type Executor = Parameters<DataView['bindQueryExecutor']>[0]
/** 原查询结果及其受保护的身份和读写能力。 */
type Result = Awaited<ReturnType<Executor['executeQuery']>>
/** DataSet从视图捕获的原查询基线和本次变更。 */
type SaveCommand = Parameters<NonNullable<Executor['save']>>[0]
type Context = Readonly<{view: DataView; params: QueryParams; rows: readonly DataRow[]}>

/** 正式配置声明的工具资源；编辑仅由查询视图承载，不伪造后端模型身份。 */
export class ProjectToolResource {
  /** 清单和文件是两个独立语义资源；两者都保留默认视图。 */
  static readonly resources = {ProjectToolCatalog: 'project:tool-catalog', ProjectToolFile: 'project:tool-file'} as const
  readonly #contexts = new WeakMap<Result, Context>()
  readonly #projectId: string
  #saving = false

  /** 每次异步边界核对宿主作用域；元数据空间身份与工具所属应用分别校验。 */
  constructor(private readonly options: Readonly<{workspace: ProjectWorkspace; metadataScenarioId: string; assertCurrent(): void}>) {
    this.#projectId = options.workspace.project.projectId
  }

  /** 工具文件参数与场景目标参数不同；缺省版本表示工作文件。 */
  static queryParameters(resourceId: string): ReadonlyArray<Pick<DataColumn, 'name' | 'type' | 'label' | 'required'>> {
    if (resourceId === this.resources.ProjectToolCatalog) return []
    if (resourceId !== this.resources.ProjectToolFile) throw new Error('PROJECT_TOOL_RESOURCE: 未注册的工具资源')
    return [
      {name: 'pageId', type: 'string', label: '工具ID', required: true},
      {name: 'fileName', type: 'string', label: '工具文件名', required: true},
      {name: 'versionId', type: 'string', label: '发布版本ID（空为工作文件）'},
    ]
  }

  private assertView(view: DataView): string {
    this.options.assertCurrent()
    const resource = Object.entries(ProjectToolResource.resources).find(([name]) => name === view.tableName)?.[1]
    if (this.options.workspace.project.projectId !== this.#projectId || view.destroyed || view.dataSet?.destroyed
      || view.dataSet?.scenarioId !== this.options.metadataScenarioId || !resource || view.dataTable?.resourceId !== resource
      || view.dataTable.resourceType !== 'file' || view.dataTable.modelBinding) throw new Error('PROJECT_TOOL_IDENTITY: 工具资源身份已失效')
    return resource
  }

  private identity(params: QueryParams): {pageId: string; fileName: Parameters<ProjectWorkspace['previewPageFileRemote']>[1]; versionId: string} {
    const pageId = params.context?.['pageId'], fileName = params.context?.['fileName'], versionId = params.context?.['versionId'] ?? ''
    const valid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim() === value
      && value !== '.' && value !== '..' && !/[\\/%\u0000-\u001f\u007f]/.test(value)
    if (!valid(pageId) || versionId !== '' && !valid(versionId)
      || fileName !== 'rule.json' && fileName !== 'script.js' && fileName !== 'style.css') throw new Error('PROJECT_TOOL_TARGET: 工具文件参数无效')
    return {pageId, fileName, versionId}
  }

  private async catalog(): Promise<DataRow[]> {
    const root = await this.options.workspace.previewBlueprintRemote()
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

  /** 原文读取后交给统一本地查询执行过滤、排序和投影；查询失败不会清空原视图。 */
  async executeQuery(view: DataView, params: QueryParams): Promise<Result> {
    const resource = this.assertView(view)
    let rows: DataRow[]
    if (resource === ProjectToolResource.resources.ProjectToolCatalog) rows = await this.catalog()
    else {
      const {pageId, fileName, versionId} = this.identity(params)
      const text = await this.options.workspace.previewPageFileRemote(pageId, fileName, versionId || undefined)
      rows = [{fileKey: JSON.stringify([pageId, fileName, versionId]), pageId, fileName, versionId, text, localDirty: this.options.workspace.project.findPageTool(pageId)?.isDirty() ?? false}]
    }
    this.assertView(view)
    return this.result({view, params: structuredClone(params), rows})
  }

  private result(context: Context): Result {
    const {view, params, rows} = context, resource = this.assertView(view)
    const file = resource === ProjectToolResource.resources.ProjectToolFile
    const fields = new Set(file ? ['fileKey', 'pageId', 'fileName', 'versionId', 'text', 'localDirty'] : ['pageId', 'versions'])
    const primaryKeys = file ? ['fileKey'] : ['pageId']
    const selected = DataViewLocalQuery.select({rows, fields, primaryKeys, params})
    const key = (row: Readonly<DataRow>) => String(row[file ? 'fileKey' : 'pageId'])
    const keys = new Set(selected.rows.map(key))
    const guard = () => {
      this.assertView(view)
      if (file && JSON.stringify(this.identity({...params, context: view.queryContext})) !== JSON.stringify(this.identity(params))) throw new Error('PROJECT_TOOL_TARGET: 工具查询参数已改变')
    }
    const writable = (id: unknown) => {
      guard()
      if (!file || !keys.has(String(id))) return false
      const target = this.identity(params)
      return target.versionId === '' && !this.options.workspace.project.findPageTool(target.pageId)?.isDirty()
    }
    const result: Result = {
      rows: selected.rows, total: selected.total, rowKey: key,
      assertIdentity: identity => {
        guard()
        if (identity.scenarioId !== this.options.metadataScenarioId || identity.metaName !== view.tableName
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== resource) throw new Error('PROJECT_TOOL_IDENTITY: 工具查询身份不匹配')
      },
      fieldAccess: (id, field) => {
        guard()
        const visible = keys.has(String(id)) && selected.output.has(field), edit = visible && field === 'text' && writable(id)
        return {read: visible ? 'visible' : 'invisible', write: edit ? 'allowed' : 'denied', component: !visible ? 'hidden' : edit ? 'editable' : 'readonly', required: false, writeMode: edit ? 'editable' : 'readonly'}
      },
      readFieldAccess: (_row, field) => {guard(); return selected.output.has(field) ? 'visible' : 'invisible'},
      addActionState: () => 'disabled', deleteActionState: () => 'disabled', createChildActionState: () => 'disabled',
      editActionState: (id, available) => writable(id) && available !== false ? 'enabled' : 'disabled',
      viewActionState: (id, available) => {guard(); return keys.has(String(id)) && available !== false ? 'enabled' : 'disabled'},
    }
    this.#contexts.set(result, context)
    return result
  }

  /** 只提交捕获的工作文件text差异；每个文件独立确认，失败保留DataView变更供显式接续。 */
  async save(command: SaveCommand): Promise<Awaited<ReturnType<NonNullable<Executor['save']>>>> {
    if (this.#saving) throw new Error('PROJECT_TOOL_SAVE_PENDING: 工具资源正在提交')
    const targets = new Set<string>()
    const changes = command.changes.map(change => {
      const context = this.#contexts.get(change.context)
      if (!context || this.assertView(context.view) !== ProjectToolResource.resources.ProjectToolFile) throw new Error('PROJECT_TOOL_CONTEXT: 必须使用文件原查询提交')
      change.context.assertIdentity(change.identity)
      const target = this.identity(context.params), original = context.rows[0], row = change.changes.changed?.[0]
      const key = JSON.stringify([target.pageId, target.fileName])
      if (targets.has(key) || target.versionId || change.changes.added?.length || change.changes.deleted?.length
        || change.changes.changed?.length !== 1 || !original || !row || typeof row['text'] !== 'string'
        || Object.keys(row).some(field => !['text', '_pk'].includes(field) && JSON.stringify(row[field]) !== JSON.stringify(original[field]))) throw new Error('PROJECT_TOOL_CHANGE: 只能修改一个工作文件的原文')
      if (this.options.workspace.project.findPageTool(target.pageId)?.isDirty()) throw new Error('PAGE_TOOL_CONFLICT: 工具文件有本地编辑')
      targets.add(key)
      return {change, context, target, original, text: row['text']}
    })
    this.#saving = true
    try {
      const receipts: Awaited<ReturnType<NonNullable<Executor['save']>>> = []
      for (const item of changes) {
        await this.options.workspace.savePageFileChange({...item.target, expectedText: String(item.original['text']), text: item.text,
          assertCurrent: () => item.change.context.assertIdentity(item.change.identity)})
        const row = {...item.original, text: item.text, localDirty: false}
        receipts.push({metaName: item.context.view.tableName, added: [], changed: [row], deleted: [], changedFields: [['text', 'localDirty']],
          context: this.result({...item.context, rows: [row]})})
      }
      return receipts
    } finally {this.#saving = false}
  }
}
