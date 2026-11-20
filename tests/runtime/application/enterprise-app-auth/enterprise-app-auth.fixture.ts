import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import myRequests from '../../../../config/pages/application/enterprise-app-auth/my-requests/pagedata.json'
import apply from '../../../../config/pages/application/enterprise-app-auth/apply/pagedata.json'
import review from '../../../../config/pages/application/enterprise-app-auth/review/pagedata.json'
import {ApiBackend, createApiService} from '../../page/api-provider/api-provider.fixture'

export const MY = '47DA54EA853C8780976D43CF2369B096', APPLY = '02215DFBCA2079FBC076CEF7D91FBF6E', REVIEW = 'C06D41607B6258106F35A0A319B71804'
export const BASE = '/features/application/enterprise-app-auth-application/ui'
type PagedataFilter = Readonly<{field?: string; filters?: readonly PagedataFilter[]}>
type PagedataTables = Readonly<{tables: Record<string, {
  modelBinding: {modelId: string; modelName: string}
  columns?: readonly {name: string}[]
  views: Record<string, {scopeFilter?: PagedataFilter; queryConfig: {fields: readonly string[]}}>
}>}>
const configs: Readonly<Record<string, PagedataTables>> = {[MY]: myRequests, [APPLY]: apply, [REVIEW]: review}
export const pagedataText: Record<string, string> = Object.fromEntries(Object.entries(configs).map(([id, value]) => [id, JSON.stringify(value)]))
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

/** 与线上正式模型一致：授权表主键 id；两份字典无正式主键。 */
const primaryKeys: Readonly<Record<string, string>> = {enterprise_app_auth: 'id', app_auth_status: '', app_request_type: ''}

function filterFields(filter: PagedataFilter | undefined): string[] {
  if (!filter) return []
  return filter.filters ? filter.filters.flatMap(filterFields) : filter.field ? [filter.field] : []
}

/** 正式模型字段取各视图投影与常驻范围字段，排除场景计算列。 */
function formalModels(scenarioId: string): FormalModel[] {
  const config = configs[scenarioId]
  if (!config) return []
  return Object.entries(config.tables).map(([name, table]) => {
    const computed = new Set((table.columns ?? []).map(column => column.name))
    const pk = primaryKeys[name] ?? 'rowid', modelId = table.modelBinding.modelId
    const names = new Set([...(pk ? [pk] : []),
      ...Object.values(table.views).flatMap(view => [...view.queryConfig.fields, ...filterFields(view.scopeFilter)])])
    return {id: modelId, name, metaName: table.modelBinding.modelName, sourceType: 'table', sourceId: 'DB', sourceName: name, primaryKey: pk,
      businessMain: false, raw: {}, fields: [...names].filter(field => !computed.has(field)).map((field, order) => ({id: `${modelId}-${field}`, modelId,
        name: field, canonicalName: field, primaryKey: field === pk, description: field, type: field === 'ordIdx' ? 'number' : 'string',
        output: true, computed: false, order, orderType: '', raw: {}}))}
  })
}

const auth = (id: string, values: Record<string, unknown>) => ({id, enterprise_id: 'E-ME', ent_shortname: 'ME', source_ent: 'OTHER',
  request_type: 'REQUEST', requested_at: '2026-11-01 10:00:00.0', review_comment: '', init_error: null, operator: 'U0', ...values})
export const seed = {
  enterprise_app_auth: [
    auth('A1', {app_id: 'APP-X', auth_status: 'PENDING', review_comment: '申请甲'}),
    auth('A2', {app_id: 'APP-Y', auth_status: 'REJECTED', review_comment: '不合适'}),
    auth('A3', {app_id: 'APP-Z', auth_status: 'FAILED', review_comment: '说明', init_error: '初始化超时'}),
    auth('A4', {app_id: 'APP-Y', auth_status: 'ACTIVE', request_type: 'GRANT'}),
    auth('R1', {enterprise_id: 'E-OTHER', ent_shortname: 'OTHER', source_ent: 'ME', app_id: 'APP-M', auth_status: 'PENDING', review_comment: '请批准'}),
    auth('R2', {enterprise_id: 'E-OTHER', ent_shortname: 'OTHER', source_ent: 'ME', app_id: 'APP-M', auth_status: 'ACTIVE'}),
    auth('R3', {enterprise_id: 'E-OTHER', ent_shortname: 'OTHER', source_ent: 'ME', app_id: 'APP-M', auth_status: 'PENDING', request_type: 'GRANT'}),
  ],
  Base_AppSystemList: [
    {rowid: 'APP-X', AppName: 'crm', AppDesc: '客户管理', publisher_ent: 'OTHER', app_status: 'PUBLISHED', Memo: '备注甲'},
    {rowid: 'APP-Y', AppName: 'erp', AppDesc: '资源计划', publisher_ent: 'OTHER', app_status: 'PUBLISHED', Memo: ''},
    {rowid: 'APP-Z', AppName: 'oa', AppDesc: '办公', publisher_ent: 'THIRD', app_status: 'PUBLISHED', Memo: ''},
    {rowid: 'APP-M', AppName: 'mine', AppDesc: '我的应用', publisher_ent: 'ME', app_status: 'PUBLISHED', Memo: ''},
    {rowid: 'APP-D', AppName: 'draft', AppDesc: '草稿应用', publisher_ent: 'OTHER', app_status: 'DRAFT', Memo: ''},
  ],
  Base_Enterprise_Info: [{rowid: 'E-ME', ShortName: 'ME', CName: '本企业'}, {rowid: 'E-OTHER', ShortName: 'OTHER', CName: '他企业'}],
  app_auth_status: ['PENDING:待审批', 'INITIALIZING:初始化中', 'ACTIVE:已生效', 'FAILED:初始化失败', 'REJECTED:已拒绝', 'CANCELLED:已取消', 'REVOKED:已撤销']
    .map((item, index) => {const [val, txt] = item.split(':'); return {rowid: `S${index}`, val, txt, ordIdx: index}}),
  app_request_type: [{rowid: 'T1', val: 'REQUEST', txt: '申请', ordIdx: 1}, {rowid: 'T2', val: 'GRANT', txt: '授权', ordIdx: 2}],
}

export const api = createApiService()
export const session = {enterprise: {shortName: 'ME'}, identity: {userId: 'U1'}}

/** 每个用例重建内存后端；三场景共用同一物理授权表。 */
export function resetEnterpriseAppAuthFixture(): ApiBackend {
  api.reset(structuredClone(seed))
  api.service.readModelBatch.mockImplementation(({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
    Promise.resolve(formalModels(dataSpaceId).filter(model => metaNames.includes(model.metaName))))
  const http = new ApiBackend()
  http.primaryKeys['enterprise_app_auth'] = 'id'
  http.records = structuredClone(seed)
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
