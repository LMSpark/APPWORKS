import {DataSet, DataViewLocalQuery, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {BuiltinNavigationResource, BuiltinScenarioResource} from '@/registries/builtin-application-registry'

type QueryResult = Awaited<ReturnType<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>
type RepositoryTextResource = Readonly<{id: string; resourceId: string; path: string; tableName: string}>
const repositoryFiles = {
  ...import.meta.glob<string>('../../../../config/pages/**/*.json', {query: '?raw', import: 'default'}),
  ...import.meta.glob<string>('../../../../config/navigation/*.json', {query: '?raw', import: 'default'}),
}
const columns = ['id', 'text', 'sourceRevision']

/** A read-only repository file resource; content loading is owned by its native DataView executor. */
function createRepositoryTextDataSet(resource: RepositoryTextResource): DataSet {
  const dataSet = DataSet.fromJson({scenarioId: resource.id, dataSetName: '仓内配置资源', tables: {
    [resource.tableName]: {resourceType: 'file', resourceId: resource.resourceId,
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'},
        {name: 'sourceRevision', type: 'string'}],
      views: {default: {autoLoad: false, queryConfig: {allPages: true, maxRows: 1}}}},
  }})
  const view = dataSet.getView(resource.tableName, 'default')
  if (!view) {dataSet.destroy(); throw new Error('REPOSITORY_RESOURCE_VIEW_MISSING: 仓内配置 DataView 不存在')}
  view.bindQueryExecutor({executeQuery: async (currentView, params) => query(resource, currentView, params)},
    {resource: {resourceType: 'file', resourceId: resource.resourceId}})
  return dataSet
}

/** Read a scenario file through its registered repository DataView. */
export async function readRepositoryScenarioText(resource: BuiltinScenarioResource, assertCurrent: () => void): Promise<string> {
  return readRepositoryText({id: resource.scenarioId, resourceId: resource.resourceId, path: resource.path,
    tableName: 'RepositoryScenario'}, assertCurrent)
}

/** Read the AppWorks program navigation declaration through the same repository DataView owner. */
export async function readRepositoryNavigationText(resource: BuiltinNavigationResource, applicationId: string,
  assertCurrent: () => void): Promise<string> {
  return readRepositoryText({id: applicationId, resourceId: resource.resourceId, path: resource.path,
    tableName: 'RepositoryNavigation'}, assertCurrent)
}

async function readRepositoryText(resource: RepositoryTextResource, assertCurrent: () => void): Promise<string> {
  const dataSet = createRepositoryTextDataSet(resource)
  try {
    const view = dataSet.getView(resource.tableName, 'default')
    if (!view) throw new Error('REPOSITORY_RESOURCE_VIEW_MISSING: 仓内配置 DataView 不存在')
    await view.refresh()
    assertResourceIdentity(resource, view)
    assertCurrent()
    if (view.loadingError) throw view.loadingError
    const row = view.rows.find(item => item['id'] === resource.id)
    if (!row || typeof row['text'] !== 'string' || view.fieldAccess(row, 'text').read !== 'visible') {
      throw new Error(`REPOSITORY_RESOURCE_CONTENT_MISSING: ${resource.id} 仓内配置不可读`)
    }
    return row['text']
  } finally {dataSet.destroy()}
}

async function query(resource: RepositoryTextResource, view: DataView, params: QueryParams): Promise<QueryResult> {
  assertResourceIdentity(resource, view)
  const loader = repositoryFiles[`../../../../${resource.path}`]
  if (!loader || !isRegisteredPath(resource.path)) {
    throw new Error(`REPOSITORY_RESOURCE_FILE_MISSING: ${resource.id} 的仓内配置未构建`)
  }
  const content = await loader()
  assertResourceIdentity(resource, view)
  if (typeof content !== 'string') throw new Error(`REPOSITORY_RESOURCE_FILE_INVALID: ${resource.id} 配置不是文本`)
  const rows: DataRow[] = [{id: resource.id, text: content, sourceRevision: await revision(content)}]
  const selected = DataViewLocalQuery.select({rows, fields: new Set(columns), primaryKeys: ['id'], params})
  const rowKey = (row: Readonly<Record<string, unknown>>) => row['id']
  const allowed = (key: unknown, field: string): boolean => selected.rows.some(row => rowKey(row) === key) && selected.output.has(field)
  return {rows: selected.rows, total: selected.total, rowKey,
    assertIdentity: identity => {
      assertResourceIdentity(resource, view)
      if (identity.scenarioId !== resource.id || identity.metaName !== resource.tableName
        || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== resource.resourceId) {
        throw new Error('REPOSITORY_RESOURCE_IDENTITY: 仓内配置 DataView 身份不匹配')
      }
    },
    fieldAccess: (key, field) => {
      const visible = allowed(key, field)
      return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden',
        required: false, writeMode: 'readonly'}
    },
    readFieldAccess: (row, field) => selected.rows.includes(row) && selected.output.has(field) ? 'visible' : 'invisible',
    addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden', viewActionState: key => selected.rows.some(row => rowKey(row) === key) ? 'enabled' : 'hidden'}
}

function isRegisteredPath(path: string): boolean {
  return (path.startsWith('config/pages/') || path.startsWith('config/navigation/')) && !path.includes('..')
}

async function revision(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function assertResourceIdentity(resource: RepositoryTextResource, view: DataView): void {
  if (view.destroyed || view.dataSet?.destroyed !== false || view.dataSet.scenarioId !== resource.id
    || view.tableName !== resource.tableName || view.dataTable?.resourceType !== 'file'
    || view.dataTable.resourceId !== resource.resourceId || view.dataTable.modelBinding !== undefined) {
    throw new Error('REPOSITORY_RESOURCE_IDENTITY: 仓内配置 DataView 身份已失效')
  }
}
