import {DataViewLocalQuery, type DataColumn, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {LowcodeDesignApi} from '@spark-appworks/spark-lowcode-api'

export const PROJECT_TOOL_VERSION_TABLE = 'ProjectToolVersion'
export const PROJECT_TOOL_VERSION_RESOURCE_ID = 'project:tool-version'
export const PROJECT_TOOL_VERSION_COLUMNS: readonly DataColumn[] = Object.freeze([
  {name: 'versionKey', label: '版本身份', type: 'string', required: true, isPrimaryKey: true},
  {name: 'pageId', label: '工具ID', type: 'string', required: true},
  {name: 'fileName', label: '文件名', type: 'string', required: true},
  {name: 'version', label: '版本号', type: 'number', required: true},
  {name: 'snapshotFileName', label: '快照文件名', type: 'string'},
  {name: 'lastModified', label: '修改时间', type: 'number'},
])
export const PROJECT_TOOL_VERSION_VIEWS = Object.freeze({default: Object.freeze({
  autoLoad: false,
  autoCurrentFirst: false,
  autoSelectFirst: false,
  queryContext: Object.freeze({pageId: '', fileName: 'rule.json'}),
  queryConfig: Object.freeze({allPages: true, maxRows: 50000}),
})})
export const PROJECT_TOOL_VERSION_QUERY_PARAMETERS = Object.freeze({default: Object.freeze([
  Object.freeze({name: 'pageId', type: 'string', label: '工具ID', required: true}),
  Object.freeze({name: 'fileName', type: 'string', label: '工具文件名', required: true}),
])})

type Result = Awaited<ReturnType<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>
type VersionIdentity = Readonly<{pageId: string; fileName: 'rule.json' | 'script.js' | 'style.css'}>

/** Read-only remote version catalog. The registry binds it only when the formal file resource exists. */
export class ProjectToolVersionResource {
  readonly #applicationId: string

  constructor(private readonly options: Readonly<{applicationId: string; api: Pick<LowcodeDesignApi, 'listFileVersions'>; assertCurrent(): void}>) {
    const applicationId = options.applicationId.trim()
    if (!applicationId || applicationId !== options.applicationId || /[\\/%\u0000-\u001f\u007f]/.test(applicationId)) {
      throw new Error('PROJECT_TOOL_VERSION_SCOPE: 应用身份无效')
    }
    this.#applicationId = applicationId
  }

  private identity(params: QueryParams): VersionIdentity {
    const pageId = params.context?.['pageId'], fileName = params.context?.['fileName']
    const validPageId = typeof pageId === 'string' && pageId.length > 0 && pageId.trim() === pageId
      && pageId !== '.' && pageId !== '..' && !/[\\/%\u0000-\u001f\u007f]/.test(pageId)
    if (!validPageId || fileName !== 'rule.json' && fileName !== 'script.js' && fileName !== 'style.css') {
      throw new Error('PROJECT_TOOL_VERSION_TARGET: 版本目录查询身份无效')
    }
    return {pageId, fileName}
  }

  async executeQuery(view: DataView, params: QueryParams): Promise<Result> {
    this.assertView(view)
    const identity = this.identity(params)
    const versions = await this.options.api.listFileVersions({appType: 'designfile', customPath: `${this.#applicationId}/${identity.pageId}`, fileName: identity.fileName})
    this.assertView(view)
    if (JSON.stringify(this.identity({...params, context: view.queryContext})) !== JSON.stringify(identity)) {
      throw new Error('PROJECT_TOOL_VERSION_STALE: 版本目录查询身份已改变')
    }
    const rows: DataRow[] = versions.map(item => ({versionKey: JSON.stringify([identity.pageId, identity.fileName, item.version]),
      pageId: identity.pageId, fileName: identity.fileName, version: item.version, snapshotFileName: item.fileName, lastModified: item.lastModified}))
    const selected = DataViewLocalQuery.select({rows, fields: new Set(PROJECT_TOOL_VERSION_COLUMNS.map(column => column.name)), primaryKeys: ['versionKey'], params})
    const keys = new Set(selected.rows.map(row => String(row['versionKey'])))
    const fields = new WeakMap<DataRow, ReadonlySet<string>>(selected.rows.map(row => [row,
      new Set(Object.keys(row).filter(field => field !== '_pk'))]))
    const assertCurrent = () => {
      this.assertView(view)
      if (JSON.stringify(this.identity({...params, context: view.queryContext})) !== JSON.stringify(identity)) {
        throw new Error('PROJECT_TOOL_VERSION_STALE: 版本目录视图身份已改变')
      }
    }
    return {
      rows: selected.rows,
      total: selected.total,
      rowKey: row => row['versionKey'],
      assertIdentity: resourceIdentity => {
        assertCurrent()
        if (resourceIdentity.scenarioId !== view.dataSet?.scenarioId || resourceIdentity.metaName !== PROJECT_TOOL_VERSION_TABLE
          || resourceIdentity.resource?.resourceType !== 'file' || resourceIdentity.resource.resourceId !== PROJECT_TOOL_VERSION_RESOURCE_ID) {
          throw new Error('PROJECT_TOOL_VERSION_IDENTITY: 视图资源身份不匹配')
        }
      },
      fieldAccess: (rowKey, field) => {
        assertCurrent()
        const row = selected.rows.find(item => String(item['versionKey']) === String(rowKey))
        const visible = !!row && selected.output.has(field) && fields.get(row)?.has(field)
        return {read: visible ? 'visible' as const : 'invisible' as const, write: 'denied' as const,
          component: visible ? 'readonly' as const : 'hidden' as const, required: false, writeMode: 'readonly' as const}
      },
      readFieldAccess: (row, field) => {
        assertCurrent()
        return selected.rows.includes(row) && fields.get(row)?.has(field) ? 'visible' as const : 'invisible' as const
      },
      addActionState: () => {assertCurrent(); return 'disabled' as const},
      editActionState: () => {assertCurrent(); return 'disabled' as const},
      deleteActionState: () => {assertCurrent(); return 'disabled' as const},
      createChildActionState: () => {assertCurrent(); return 'disabled' as const},
      viewActionState: (rowKey: unknown) => {assertCurrent(); return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
    }
  }

  private assertView(view: DataView): void {
    this.options.assertCurrent()
    if (view.destroyed || view.dataSet?.destroyed || view.dataTable?.tableName !== PROJECT_TOOL_VERSION_TABLE
      || view.dataTable.resourceType !== 'file' || view.dataTable.resourceId !== PROJECT_TOOL_VERSION_RESOURCE_ID
      || view.dataTable.modelBinding) throw new Error('PROJECT_TOOL_VERSION_IDENTITY: 正式版本资源未绑定')
  }
}
