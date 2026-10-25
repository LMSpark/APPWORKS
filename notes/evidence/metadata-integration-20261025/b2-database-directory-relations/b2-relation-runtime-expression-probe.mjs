// Read-only inventory of A8 model aliases and the Base_TblRln physical source.
// All business reads use lowcodeApi SPARK data-space APIs; no write path is invoked.
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {createServer} from 'vite'
import {businessScopeFailure, classifyApplicationSelectionRequest} from '../metadata-integration-20261024/b1-reference-probe-guard.mjs'

const APP = 'D99A1DCE9894698799101EFD70F8FC76'
const TENANT = 'NewApp'
const TARGET_SPACE = 'A8FB2B2B161125A16FD15ED9581CD15B'
let DESIGN_FORM = ''
const REQUIRED_RELATION_FIELDS = Object.freeze([
  'rowid', 'rlname', 'RelshipExp', 'pktbid', 'fktbid', 'pktable', 'fktable', 'IsCascadeDeletion',
])
const ALLOWED_PATHS = new Set(['/api/LoginAuthority/UserLoginByEnt', '/api/DataOperation/GetData'])
const ALLOWED_MODELS = new Set(['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'View_TblList', 'Base_TblField', 'Base_TblRln'])
const ALLOWED_SOURCE_NAMES = new Set(['Base_DataModel', 'View_TblList', 'Base_TblField', 'Base_TblRln'])
const root = process.cwd()
let stage = 'preflight'
let blockedMutations = 0
let safeFailureCode = ''
const requestTrace = []
const responseTrace = []

function fail(code) { safeFailureCode = code; throw Object.assign(new Error(code), {safeCode: code}) }
function assert(condition, code) { if (!condition) fail(code) }
function storage() {
  const values = new Map()
  return Object.freeze({getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)), removeItem: key => values.delete(String(key))})
}
function installMemoryBrowserStorage() {
  globalThis.window = {sessionStorage: storage(), location: {pathname: '/'}}
  globalThis.sessionStorage = globalThis.window.sessionStorage
  globalThis.localStorage = storage()
}
function readHeader(headers, wanted) {
  if (headers && typeof headers.get === 'function') {
    const value = headers.get(wanted)
    if (value !== undefined && value !== null) return String(value)
  }
  if (headers && typeof headers === 'object') {
    const key = Object.keys(headers).find(item => item.toLowerCase() === wanted.toLowerCase())
    if (key !== undefined && headers[key] !== undefined && headers[key] !== null) return String(headers[key])
  }
  return ''
}
function parseBody(data) {
  if (typeof data === 'string') {try {return JSON.parse(data)} catch {return null}}
  return data && typeof data === 'object' ? data : null
}
function credential() {
  // DPAPI secret stays in this process and is never emitted or persisted.
  const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
  const value = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8', windowsHide: true}))
  assert(value.TenantName === TENANT, 'CREDENTIAL_TENANT_MISMATCH')
  return {enterpriseName: value.TenantName, account: value.UserName, password: value.Password}
}
function conditions(filter, output = []) {
  if (typeof filter === 'string') {try {filter = JSON.parse(filter)} catch {return output}}
  if (!filter || typeof filter !== 'object') return output
  if (filter.Type === 'cond') output.push(filter)
  else if (Array.isArray(filter.Filters)) for (const child of filter.Filters) conditions(child, output)
  return output
}
function valueOf(condition) {return condition?.ValueFun?.Type === 'GetConstValue' ? condition.ValueFun.Value : undefined}
function opIs(condition, ...allowed) {return allowed.includes(String(condition?.Operator ?? '').toLowerCase())}
function matching(list, field) {return list.filter(item => item.Field === field)}
function exact(list, field, op, value) {return matching(list, field).filter(item => opIs(item, op) && valueOf(item) === value).length === 1}
function assertTargetQuery(table, body, DataViewFilter) {
  const name = table?.Name
  assert(typeof name === 'string' && ALLOWED_MODELS.has(name), 'UNEXPECTED_METADATA_MODEL_BLOCKED')
  const list = conditions(table.Filter)
  if (name === 'Base_TblRln') {
    assert(list.length === 2 && matching(list, 'RelshipExp').length === 2
      && matching(list, 'RelshipExp').every(item => opIs(item, 'isnotnull', 'isnotempty')), 'UNEXPECTED_RELATION_EXPRESSION_FILTER_BLOCKED')
    const page = body?.PageParam
    assert(page?.index === 1 && page?.size === 20, 'RELATION_QUERY_PAGE_LIMIT_BLOCKED')
    assert(body?.AllPages !== true && page?.allPages !== true, 'RELATION_QUERY_ALL_PAGES_BLOCKED')
    const requested = table?.Fields
    assert(Array.isArray(requested) && requested.length === REQUIRED_RELATION_FIELDS.length
      && REQUIRED_RELATION_FIELDS.every(field => requested.some(item => item?.Name === field)), 'RELATION_FIELD_ALLOWLIST_BLOCKED')
  } else if (name === 'Base_DataSet') {
    assert(list.length === 1 && exact(list, 'rowid', 'equal', TARGET_SPACE), 'UNEXPECTED_SPACE_QUERY_BLOCKED')
  } else if (name === 'Base_DataModel') {
    const inDesign = exact(list, 'dataSetId', 'equal', DESIGN_FORM)
      && matching(list, 'Name').length === 1 && opIs(matching(list, 'Name')[0], 'equal')
      && ['Base_DataModel', 'View_TblList', 'Base_TblField'].includes(valueOf(matching(list, 'Name')[0]))
    const targetDirectory = list.length === 1 && exact(list, 'dataSetId', 'equal', TARGET_SPACE)
    const exactFormalModel = list.length === 2 && exact(list, 'dataSetId', 'equal', TARGET_SPACE)
      && exact(list, 'Name', 'equal', 'Base_TblRln')
    assert(inDesign || targetDirectory || exactFormalModel, 'UNEXPECTED_MODEL_QUERY_BLOCKED')
  } else if (name === 'Base_DataModel_Field') {
    const dataSet = matching(list, 'dataSetId')
    const model = matching(list, 'dataModelId')
    const type = matching(list, 'type')
    assert(list.length === 3 && (exact(list, 'dataSetId', 'equal', DESIGN_FORM) || exact(list, 'dataSetId', 'equal', TARGET_SPACE))
      && model.length === 1 && (opIs(model[0], 'equal', 'in'))
      && (typeof valueOf(model[0]) === 'string' || Array.isArray(valueOf(model[0])))
      && type.length === 1 && opIs(type[0], 'equal') && valueOf(type[0]) === 'dataModel',
    'UNEXPECTED_MODEL_FIELD_QUERY_BLOCKED')
    void dataSet
  } else if (name === 'View_TblList') {
    const tblname = matching(list, 'tblname'), dbid = matching(list, 'dbid')
    const candidate = list.length === 1 && tblname.length === 1 && opIs(tblname[0], 'equal') && valueOf(tblname[0]) === 'Base_TblRln'
    const sourceLookup = list.length === 2 && tblname.length === 1 && dbid.length === 1
      && opIs(tblname[0], 'equal') && ALLOWED_SOURCE_NAMES.has(valueOf(tblname[0]))
      && opIs(dbid[0], 'equal') && typeof valueOf(dbid[0]) === 'string' && valueOf(dbid[0]).length > 0
    assert(candidate || sourceLookup, 'UNEXPECTED_SOURCE_TABLE_QUERY_BLOCKED')
  } else if (name === 'Base_TblField') {
    assert(list.length === 1 && matching(list, 'tblid').length === 1 && opIs(list[0], 'equal', 'in')
      && (typeof valueOf(list[0]) === 'string' || (Array.isArray(valueOf(list[0]))
        && valueOf(list[0]).length > 0 && valueOf(list[0]).length <= 100
        && valueOf(list[0]).every(id => typeof id === 'string' && id.length > 0))),
    'UNEXPECTED_SOURCE_FIELD_QUERY_BLOCKED')
  }
  requestTrace.push({path: '/api/DataOperation/GetData', method: 'POST', stage, formalModel: name,
    ...(name === 'Base_TblRln' ? {page: {index: 1, size: 20}, allPages: false} : {})})
  void body
  void DataViewFilter
}
function extractResult(response) {
  const envelope = response?.data && typeof response.data === 'object' ? response.data : {}
  const result = envelope.Result ?? envelope.result ?? envelope
  return result?.data ?? result?.Data ?? result
}
function recordResponse(response) {
  const result = extractResult(response)
  const code = result?.Code ?? result?.code ?? response?.data?.Code ?? response?.data?.code
  const data = result?.data ?? result?.Data ?? result
  const count = data?.Count ?? data?.count
  const items = data?.Items ?? data?.items
  const safeCode = typeof code === 'number' || (typeof code === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(code)) ? code : null
  responseTrace.push({stage, httpStatus: Number.isFinite(response?.status) ? response.status : null,
    businessCode: safeCode, count: Number.isFinite(count) ? count : null,
    itemCount: Array.isArray(items) ? items.length : null})
}
function scalar(row, name, context) {
  assert(context.readFieldAccess(row, name) === 'visible', `FIELD_NOT_VISIBLE_${name}`)
  const value = row[name]
  assert(value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value), `FIELD_NOT_SCALAR_${name}`)
  return value === null || value === undefined ? '' : String(value).trim()
}
function summarizeExpression(value) {
  if (value === null || value === undefined) return {valueType: 'null'}
  const valueType = Array.isArray(value) ? 'array' : typeof value
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return {valueType, parsed: false} }
  }
  if (!parsed || typeof parsed !== 'object') return {valueType, parsed: false}
  const nodes = []
  const fieldReferenceTypes = []
  const visit = (node, pathName) => {
    if (nodes.length >= 80) return
    if (Array.isArray(node)) {
      nodes.push({path: pathName, type: 'array', length: node.length})
      node.slice(0, 12).forEach((child, index) => visit(child, pathName + '[' + index + ']'))
      return
    }
    if (!node || typeof node !== 'object') return
    const keys = Object.keys(node).sort()
    nodes.push({path: pathName, type: 'object', keys})
    for (const key of keys) {
      const child = node[key]
      if (key.toLowerCase() === 'field') fieldReferenceTypes.push({path: pathName + '.' + key, type: child === null ? 'null' : typeof child})
      if (child && typeof child === 'object') visit(child, pathName + '.' + key)
    }
  }
  visit(parsed, '$')
  return {valueType, parsed: true, rootKeys: Object.keys(parsed).sort(), nodes, fieldReferenceTypes}
}
function reportError(error, fallback) {
  if (error && typeof error.safeCode === 'string') return error.safeCode
  if (safeFailureCode) return safeFailureCode
  if (error?.name === 'RequestError') return 'FORMAL_GETDATA_REQUEST_FAILED'
  if (error?.name === 'LowcodeApiError') return 'FORMAL_API_VALIDATION_FAILED'
  const mapping = [
    [/正式数据空间名称必须唯一且可读/, 'SPACE_DEFINITION_NOT_UNIQUE_OR_READABLE'],
    [/正式数据空间模型列表归属不一致|正式数据空间模型 Name 不能重复/, 'MODEL_DIRECTORY_INVALID'],
    [/来源必须有且仅有一个非租户主键/, 'SOURCE_PRIMARY_KEY_INVALID'],
  ].find(([pattern]) => pattern.test(typeof error?.message === 'string' ? error.message : ''))
  return mapping?.[1] ?? fallback
}

async function run() {
  installMemoryBrowserStorage()
  const server = await createServer({root, mode: 'development', configFile: path.resolve(root, 'vite.config.ts'),
    server: {middlewareMode: true}, appType: 'custom'})
  let lowcodeApi, scope
  const result = {status: 'incomplete', targetSpaceId: TARGET_SPACE, spaceDefinition: null, models: null, formalModel: null, relationRows: null,
    sourceCandidates: null, physicalFields: null, requiredRelationOutputFields: REQUIRED_RELATION_FIELDS,
    requestTrace, responseTrace, blockedMutations}
  try {
    const runtimeModule = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
    lowcodeApi = runtimeModule.lowcodeApi
    const appQueryModule = await server.ssrLoadModule('/packages/spark-lowcode-api/src/platform/lowcode-application.ts')
    const designModule = await server.ssrLoadModule('/packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts')
    DESIGN_FORM = designModule.DATA_SPACE_DESIGN_FORM_KEY
    assert(typeof DESIGN_FORM === 'string' && DESIGN_FORM.length > 0, 'DESIGN_FORM_KEY_MISSING')
    const dataModule = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
    const deny = () => {
      blockedMutations++
      return Promise.reject(Object.assign(new Error('READONLY_MUTATION_BLOCKED'), {safeCode: 'READONLY_MUTATION_BLOCKED'}))
    }
    dataModule.DataSet.prototype.saveChanges = deny
    dataModule.DataView.prototype.saveChanges = deny
    dataModule.DataView.saveQueryViews = deny
    runtimeModule.lowcodeHttp.interceptors.request.use({name: 'b2-relation-runtime-expression-readonly-allowlist', onRequest: config => {
      const url = new URL(config.url, 'http://127.0.0.1:5273')
      const method = String(config.method ?? 'GET').toUpperCase()
      assert(method === 'POST' && ALLOWED_PATHS.has(url.pathname), 'UNEXPECTED_REQUEST_BLOCKED')
      const body = parseBody(config.data)
      if (url.pathname === '/api/LoginAuthority/UserLoginByEnt') {
        assert(body?.entName === TENANT, 'LOGIN_TENANT_MISMATCH')
        requestTrace.push({path: url.pathname, method, stage: 'login'})
        return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
      }
      const tenantId = readHeader(config.headers, 'tenant-id')
      const appId = readHeader(config.headers, 'X-AppId')
      const formKey = readHeader(config.headers, 'x-FormKey')
      if (stage === 'application-selection') {
        const selection = classifyApplicationSelectionRequest({body, formKey, tenantId, appId,
          expectedFormKey: appQueryModule.LOWCODE_APPLICATION_CATALOG_FORM_KEY,
          applicationCatalogQuery: appQueryModule.applicationCatalogQuery(),
          navigationRootQuery: appQueryModule.navigationRootQuery(APP)})
        if (selection.errorCode) fail(selection.errorCode)
        requestTrace.push({path: url.pathname, method, stage, bootstrapQuery: selection.kind})
        return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
      }
      const scopeFailure = businessScopeFailure(tenantId, appId, TENANT, APP)
      if (scopeFailure) fail(scopeFailure)
      const tables = Array.isArray(body?.Table) ? body.Table : []
      assert(tables.length === 1, 'MULTI_MODEL_QUERY_BLOCKED')
      const relationDataRead = tables[0]?.Name === 'Base_TblRln'
      assert(formKey === (relationDataRead ? TARGET_SPACE : DESIGN_FORM), 'DESIGN_FORM_KEY_MISMATCH')
      assertTargetQuery(tables[0], body, dataModule.DataViewFilter)
      return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
    }})
    runtimeModule.lowcodeHttp.interceptors.response.use({name: 'b2-relation-runtime-expression-response-summary', onResponse: response => {
      recordResponse(response)
      return response
    }})

    stage = 'login'
    const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
    const user = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8', windowsHide: true}))
    assert(user.TenantName === TENANT, 'CREDENTIAL_TENANT_MISMATCH')
    await lowcodeApi.platform.login({enterpriseName: user.TenantName, account: user.UserName, password: user.Password})
    assert(lowcodeApi.platform.session.get()?.enterprise.shortName === TENANT, 'AUTHENTICATED_TENANT_MISMATCH')
    stage = 'application-selection'
    await lowcodeApi.platform.activateApplication(APP)
    scope = lowcodeApi.readRequestScope()
    assert(scope.headers['X-AppId'] === APP && scope.headers['tenant-id'] === TENANT && scope.token, 'REQUEST_SCOPE_INCOMPLETE')
    const assertCurrent = () => {
      const current = lowcodeApi.readRequestScope()
      assert(current.token === scope.token && current.headers['X-AppId'] === APP
        && current.headers['tenant-id'] === TENANT, 'REQUEST_SCOPE_CHANGED')
    }

    const {DataViewFilter} = dataModule
    stage = 'formal-model-readback'
    const formalModel = await lowcodeApi.dataSpace.design.readModel({designScenarioId: DESIGN_FORM,
      dataSpaceId: TARGET_SPACE, metaName: 'Base_TblRln', assertCurrent})
    assertCurrent()
    const outputFields = formalModel.fields.filter(field => field.output).map(field => field.name).sort()
    assert(formalModel.id === 'D2B9B94A1641BB87E6D3D9251A14D70D' && formalModel.primaryKey === 'rowid'
      && outputFields.length === 13 && outputFields.includes('RelshipExp'), 'FORMAL_RELATION_MODEL_MISMATCH')
    result.formalModel = {status: 'confirmed', id: formalModel.id, primaryKey: formalModel.primaryKey,
      outputCount: outputFields.length, outputFields}

    stage = 'runtime-relations-with-expression'
    const relationContext = await lowcodeApi.dataSpace.runtime.query({scenarioId: TARGET_SPACE, metaName: 'Base_TblRln'}, {
      filter: DataViewFilter.group({logic: 'and', filters: [
        {field: 'RelshipExp', operator: 'is-not-null'}, {field: 'RelshipExp', operator: 'is-not-empty'},
      ]}),
      fields: ['rowid', 'rlname', 'RelshipExp', 'pktbid', 'fktbid', 'pktable', 'fktable', 'IsCascadeDeletion'],
      page: {index: 1, size: 20}, outputFieldMode: 'REQUEST',
    })
    assertCurrent()
    const relationRows = relationContext.rows.map(row => {
      const rawExpression = row.RelshipExp
      assert(relationContext.readFieldAccess(row, 'RelshipExp') === 'visible', 'FIELD_NOT_VISIBLE_RelshipExp')
      const id = scalar(row, 'rowid', relationContext)
      return {
        rowidMasked: id.length > 6 ? id.slice(0, 3) + '…' + id.slice(-2) : id ? 'present' : '',
        relationNamePresent: Boolean(scalar(row, 'rlname', relationContext)),
        parentTablePresent: Boolean(scalar(row, 'pktable', relationContext)),
        childTablePresent: Boolean(scalar(row, 'fktable', relationContext)),
        parentTableIdPresent: Boolean(scalar(row, 'pktbid', relationContext)),
        childTableIdPresent: Boolean(scalar(row, 'fktbid', relationContext)),
        cascadeValue: scalar(row, 'IsCascadeDeletion', relationContext),
        expression: summarizeExpression(rawExpression),
      }
    })
    result.relationRows = {status: relationContext.countReported ? 'confirmed' : 'count-unavailable',
      count: relationContext.total, returned: relationRows.length, rows: relationRows}

    result.blockedMutations = blockedMutations
    assert(blockedMutations === 0, 'MUTATION_ATTEMPT')
    result.status = 'confirmed'
  } catch (error) {
    result.status = 'blocked'
    result.runFailure = {stage, errorType: typeof error?.name === 'string' ? error.name : 'Error',
      safeCode: reportError(error, 'RELATION_EXPRESSION_READ_FAILED'), ...(Number.isFinite(error?.status) ? {httpStatus: error.status} : {})}
    result.blockedMutations = blockedMutations
  } finally {
    await server.close()
  }
  const fs = await import('node:fs/promises')
  await fs.writeFile(path.join(root, 'node_modules/.cache/metadata-integration-20261025/b2-relation-runtime-expression-read.json'),
    JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'})
  console.log(JSON.stringify({status: result.status, targetSpaceId: TARGET_SPACE,
    formalModelId: result.formalModel?.id ?? null, outputCount: result.formalModel?.outputCount ?? null,
    relationRows: result.relationRows?.returned ?? null, blockedMutations: result.blockedMutations,
    failureCode: result.runFailure?.safeCode ?? null}, null, 2))
  if (result.status !== 'confirmed') process.exitCode = 1
}

run().catch(error => {
  console.log(JSON.stringify({status: 'blocked', stage,
    errorType: error && typeof error.name === 'string' ? error.name : 'Error',
    safeCode: safeFailureCode || (error && typeof error.safeCode === 'string' ? error.safeCode : 'PROBE_SETUP_FAILED'),
    blockedMutations}, null, 2))
  process.exitCode = 1
})
