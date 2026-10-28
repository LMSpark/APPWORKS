import {DataSet, DataViewLocalQuery, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {LowcodeNavigationAuthorizationContext, LowcodeNavigationAuthorizationEvidence,
  LowcodeNavigationAuthorizationItem} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

const TABLE_NAME = 'NavigationAuthorization'
const COLUMNS = ['id', 'payload']

type AuthorizationResourceIdentity = Readonly<{applicationId: string; navigationRootId: string; resourceId: string;
  executionToken: string; executionApplicationId: string; executionRootId: string; assertCallerCurrent: () => void}>
type QueryResult = Awaited<ReturnType<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>

/** Read the official menu authorization control-plane response through a read-only semantic DataView. */
export async function readNavigationAuthorizationDataView(input: Readonly<{
  applicationId: string
  navigationRootId: string
  assertCurrent: () => void
}>): Promise<LowcodeNavigationAuthorizationEvidence> {
  const identity = captureIdentity(input)
  const dataSet = createAuthorizationDataSet(identity)
  try {
    const view = dataSet.getView(TABLE_NAME, 'default')
    if (!view) throw new Error('NAVIGATION_AUTHORIZATION_VIEW_MISSING: 授权 DataView 未登记')
    await view.refresh()
    assertIdentity(identity, view)
    input.assertCurrent()
    if (view.loadingError) throw view.loadingError
    const row = view.rows.find(candidate => candidate['id'] === identity.resourceId)
    if (!row || typeof row['payload'] !== 'string') throw new Error('NAVIGATION_AUTHORIZATION_RESULT_MISSING: 授权响应不可读')
    if (view.fieldAccess(row, 'payload').read !== 'visible') throw new Error('NAVIGATION_AUTHORIZATION_RESULT_HIDDEN: 授权响应不可读')
    return parseEvidence(row['payload'])
  } finally {dataSet.destroy()}
}

function captureIdentity(input: Readonly<{applicationId: string; navigationRootId: string; assertCurrent: () => void}>): AuthorizationResourceIdentity {
  input.assertCurrent()
  const applicationId = input.applicationId.trim()
  const navigationRootId = input.navigationRootId.trim()
  if (!applicationId || !navigationRootId) throw new Error('NAVIGATION_AUTHORIZATION_IDENTITY_REQUIRED: 授权应用和导航根不能为空')
  const scope = lowcodeApi.readRequestScope()
  const active = lowcodeApi.application.get()
  const resourceId = `navigation-authorization:${applicationId}:${navigationRootId}`
  const executionApplicationId = active?.application.id
  if (!executionApplicationId || !active.navigationRootId) {
    throw new Error('NAVIGATION_AUTHORIZATION_SCOPE_REQUIRED: 缺少有效执行应用上下文')
  }
  input.assertCurrent()
  return {applicationId, navigationRootId, resourceId, executionToken: scope.token,
    executionApplicationId, executionRootId: active.navigationRootId, assertCallerCurrent: input.assertCurrent}
}

function createAuthorizationDataSet(identity: AuthorizationResourceIdentity): DataSet {
  const dataSet = DataSet.fromJson({scenarioId: identity.navigationRootId, dataSetName: '正式菜单授权响应', tables: {
    [TABLE_NAME]: {resourceType: 'navigation-authorization', resourceId: identity.resourceId,
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'payload', type: 'string'},
      ],
      views: {default: {autoLoad: false, queryConfig: {allPages: true, maxRows: 1}}}},
  }})
  const view = dataSet.getView(TABLE_NAME, 'default')
  if (!view) {dataSet.destroy(); throw new Error('NAVIGATION_AUTHORIZATION_VIEW_MISSING: 授权 DataView 未登记')}
  view.bindQueryExecutor({executeQuery: async (currentView, params) => query(identity, currentView, params)},
    {resource: {resourceType: 'navigation-authorization', resourceId: identity.resourceId}})
  return dataSet
}

async function query(
  identity: AuthorizationResourceIdentity,
  view: DataView,
  params: QueryParams,
): Promise<QueryResult> {
  assertIdentity(identity, view)
  const assertCurrent = (): void => {
    identity.assertCallerCurrent()
    const current = lowcodeApi.readRequestScope()
    const active = lowcodeApi.application.get()
    if (current.token !== identity.executionToken || active?.application.id !== identity.executionApplicationId
      || active.navigationRootId !== identity.executionRootId) {
      throw new Error('NAVIGATION_AUTHORIZATION_SCOPE_STALE: 菜单授权读取期间应用身份已变化')
    }
  }
  assertCurrent()
  const evidence = await lowcodeApi.blueprint.readNavigationAuthorization(identity.applicationId, identity.navigationRootId)
  assertCurrent()
  const payload = JSON.stringify(evidence)
  const selected = DataViewLocalQuery.select({rows: [{id: identity.resourceId, payload}],
    fields: new Set(COLUMNS), primaryKeys: ['id'], params})
  const rowKey = (row: Readonly<Record<string, unknown>>) => row['id']
  const canRead = (key: unknown, field: string): boolean => selected.rows.some(row => rowKey(row) === key) && selected.output.has(field)
  assertIdentity(identity, view)
  return {rows: selected.rows, total: selected.total, rowKey,
    assertIdentity: resource => {
      assertIdentity(identity, view)
      if (resource.scenarioId !== identity.navigationRootId || resource.metaName !== TABLE_NAME
        || resource.resource?.resourceType !== 'navigation-authorization'
        || resource.resource.resourceId !== identity.resourceId) {
        throw new Error('NAVIGATION_AUTHORIZATION_IDENTITY_MISMATCH: 授权 DataView 资源身份变化')
      }
    },
    fieldAccess: (key, field) => {
      const visible = canRead(key, field)
      return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden',
        required: false, writeMode: 'readonly'}
    },
    readFieldAccess: (row, field) => selected.rows.includes(row) && selected.output.has(field) ? 'visible' : 'invisible',
    addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden', viewActionState: key => selected.rows.some(row => rowKey(row) === key) ? 'enabled' : 'hidden'}
}

function assertIdentity(identity: AuthorizationResourceIdentity, view: DataView): void {
  if (view.destroyed || view.dataSet?.destroyed !== false || view.dataSet.scenarioId !== identity.navigationRootId
    || view.tableName !== TABLE_NAME || view.dataTable?.resourceType !== 'navigation-authorization'
    || view.dataTable.resourceId !== identity.resourceId || view.dataTable.modelBinding !== undefined) {
    throw new Error('NAVIGATION_AUTHORIZATION_IDENTITY_MISMATCH: 授权 DataView 身份已变化')
  }
}

function parseEvidence(payload: string): LowcodeNavigationAuthorizationEvidence {
  let value: unknown
  try {value = JSON.parse(payload)} catch {throw new Error('NAVIGATION_AUTHORIZATION_RESULT_INVALID: 授权响应不是有效 JSON')}
  if (!isAuthorizationEvidence(value)) {
    throw new Error('NAVIGATION_AUTHORIZATION_RESULT_INVALID: 授权响应结构无效')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAuthorizationEvidence(value: unknown): value is LowcodeNavigationAuthorizationEvidence {
  return isRecord(value) && Array.isArray(value['items']) && value['items'].every(isAuthorizationItem)
    && Array.isArray(value['contexts']) && value['contexts'].every(isAuthorizationContext)
}

function isAuthorizationItem(value: unknown): value is LowcodeNavigationAuthorizationItem {
  if (!isRecord(value)) return false
  const kind = value['targetKind']
  return typeof value['id'] === 'string' && typeof value['target'] === 'string'
    && (kind === 'cfg' || kind === 'empty' || kind === 'external' || kind === 'route' || kind === 'vue')
    && (value['formKey'] === null || typeof value['formKey'] === 'string')
    && Array.isArray(value['children']) && value['children'].every(isAuthorizationItem)
}

function isAuthorizationContext(value: unknown): value is LowcodeNavigationAuthorizationContext {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string' && typeof value['navigationId'] === 'string'
    && typeof value['title'] === 'string' && typeof value['childRowId'] === 'string'
    && typeof value['textParameterName'] === 'string' && typeof value['valueParameterName'] === 'string'
    && typeof value['workflowId'] === 'string'
    && (value['flowState'] === null || typeof value['flowState'] === 'number' && Number.isFinite(value['flowState']))
    && typeof value['valueField'] === 'string' && typeof value['textField'] === 'string'
    && typeof value['titlePlacement'] === 'string'
}
