// Prepared for review only. This script has not been executed in this task.
// It uses the existing lowcode runtime, formal DataSet assembly, and DataView query owner.
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {createServer} from 'vite'
import {businessScopeFailure, classifyApplicationSelectionRequest} from './b1-reference-probe-guard.mjs'

const APP = 'D99A1DCE9894698799101EFD70F8FC76'
const TENANT = 'NewApp'
const TARGET_SPACE = '944DEE5A0E5170F903E0E008172C4CD2'
const TARGET_DICTIONARY = '327D74EC0ABC4196AA75C56D944B8201'
const EXPECTED_REFERENCE_MODEL = 'F9F01665D4A98E1FF996CD8A48D3C373'
const DESIGN_SCENARIO = '8D1AB14DD8277F3E7017CD38F77B09FD'
const META_NAME = 'Base_DataModel'
const OUTPUT_FIELDS = Object.freeze(['rowid', 'Name', 'Type', 'DbId', 'MetaName', 'dataSetId'])
const ALLOWED_PATHS = new Set([
  '/api/LoginAuthority/UserLoginByEnt',
  '/api/File/content/text',
  '/api/DataOperation/GetData',
])
const root = process.cwd()
let stage = 'preflight'
let dataSet
let temporaryView
let blockedMutations = 0
let safeFailureCode = ''
let filterSourceFields = {Type: 'Type', DbId: 'DbId'}
let outputSourceFields = []
const ASSEMBLY_MODEL_ALLOWLIST = new Set([
  'Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation',
  'View_TblList', 'Base_TblField',
])
const requestTrace = []

function fail(code) {
  safeFailureCode = code
  const error = new Error(code)
  error.safeCode = code
  throw error
}
function assert(condition, code) { if (!condition) fail(code) }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex') }
function storage() {
  const values = new Map()
  return Object.freeze({
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)) },
    removeItem: key => { values.delete(String(key)) },
  })
}
function installMemoryBrowserStorage() {
  const sessionStorage = storage()
  globalThis.window = {sessionStorage, location: {pathname: '/'}}
  globalThis.sessionStorage = sessionStorage
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
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return null }
  }
  return data && typeof data === 'object' ? data : null
}
function installReadOnlyGuards(DataSet, DataView, LowcodeDesignFileUpload) {
  const deny = () => {
    blockedMutations++
    return Promise.reject(Object.assign(new Error('READONLY_MUTATION_BLOCKED'), {safeCode: 'READONLY_MUTATION_BLOCKED'}))
  }
  DataSet.prototype.saveChanges = deny
  DataView.prototype.saveChanges = deny
  DataView.saveQueryViews = deny
  LowcodeDesignFileUpload.prototype.uploadWorkingText = deny
  LowcodeDesignFileUpload.prototype.uploadTextVersion = deny
}
function credential() {
  // DPAPI credential stays in this process and is never written to logs or result JSON.
  const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
  const value = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
    {encoding: 'utf8', windowsHide: true}))
  assert(value.TenantName === TENANT, 'CREDENTIAL_TENANT_MISMATCH')
  return {enterpriseName: value.TenantName, account: value.UserName, password: value.Password}
}
function canonicalFilter(filter) { return JSON.stringify(filter ?? null) }
function viewFingerprint(view) {
  return {
    filter: canonicalFilter(view.filterExpression),
    queryContext: JSON.stringify(view.queryContext),
    configHash: sha256(JSON.stringify(view.toJson())),
    rowsHash: sha256(JSON.stringify(view.rows)),
    rows: view.rows.length,
    total: view.total,
    requestState: view.requestState,
  }
}
function safeError(error) {
  return {
    status: 'blocked',
    stage,
    errorType: error && typeof error.name === 'string' ? error.name : 'Error',
    safeCode: safeFailureCode || (error && typeof error.safeCode === 'string' ? error.safeCode : 'RUNTIME_CONSUMPTION_FAILED'),
    blockedMutations,
  }
}
function exactReferenceFilter(filter) {
  if (typeof filter === 'string') {
    try { filter = JSON.parse(filter) } catch { return false }
  }
  if (!filter || filter.Type !== 'and' || !Array.isArray(filter.Filters) || filter.Filters.length !== 2) return false
  const conditions = filter.Filters.filter(item => item && item.Type === 'cond')
  const readValue = item => item?.ValueFun?.Type === 'GetConstValue' ? item.ValueFun.Value : undefined
  return conditions.length === 2
    && conditions.some(item => item.Field === filterSourceFields.Type && item.Operator === 'equal' && readValue(item) === '字典')
    && conditions.some(item => item.Field === filterSourceFields.DbId && item.Operator === 'equal' && readValue(item) === TARGET_DICTIONARY)
}
async function run() {
  installMemoryBrowserStorage()
  const server = await createServer({root, mode: 'development', configFile: path.resolve(root, 'vite.config.ts'),
    server: {middlewareMode: true}, appType: 'custom'})
  let lowcodeApi
  let scope
  let defaultBefore
  let tempTable
  let tempViewId
  let resultRows = []
  let proof
  let failure
  let failureStage
  try {
    const runtimeModule = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
    lowcodeApi = runtimeModule.lowcodeApi
    const apiModule = await server.ssrLoadModule('/packages/spark-lowcode-api/src/index.ts')
    const applicationQueryModule = await server.ssrLoadModule('/packages/spark-lowcode-api/src/platform/lowcode-application.ts')
    const dataModule = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
    installReadOnlyGuards(dataModule.DataSet, dataModule.DataView, apiModule.LowcodeDesignFileUpload)

    runtimeModule.lowcodeHttp.interceptors.request.use({name: 'b1-reference-readonly-allowlist', onRequest: config => {
      const url = new URL(config.url, 'http://127.0.0.1:5273')
      const method = String(config.method ?? 'GET').toUpperCase()
      assert(method === 'POST' && ALLOWED_PATHS.has(url.pathname), 'UNEXPECTED_REQUEST_BLOCKED')
      const body = parseBody(config.data)
      if (url.pathname === '/api/LoginAuthority/UserLoginByEnt') {
        assert(body?.entName === TENANT, 'LOGIN_TENANT_MISMATCH')
        requestTrace.push({path: url.pathname, method, loginTenant: body.entName})
        return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
      }
      const tenantId = readHeader(config.headers, 'tenant-id')
      const appId = readHeader(config.headers, 'X-AppId')

      if (url.pathname === '/api/DataOperation/GetData' && stage === 'application-selection') {
        const selection = classifyApplicationSelectionRequest({body,
          formKey: readHeader(config.headers, 'x-FormKey'), tenantId, appId,
          expectedFormKey: applicationQueryModule.LOWCODE_APPLICATION_CATALOG_FORM_KEY,
          applicationCatalogQuery: applicationQueryModule.applicationCatalogQuery(),
          navigationRootQuery: applicationQueryModule.navigationRootQuery(APP),
        })
        if (selection.errorCode) fail(selection.errorCode)
        requestTrace.push({path: url.pathname, method,
          formKey: applicationQueryModule.LOWCODE_APPLICATION_CATALOG_FORM_KEY, bootstrapQuery: selection.kind})
        return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
      }

      const scopeFailure = businessScopeFailure(tenantId, appId, TENANT, APP)
      if (scopeFailure) fail(scopeFailure)

      if (url.pathname === '/api/File/content/text') {
        assert(body?.appType === 'designfile'
          && body?.customPath === `${APP}/SysForm/${DESIGN_SCENARIO}`
          && body?.fileName === 'pagedata.json' && body?.content === null && body?.isCrossEnt === false
          && body?.isReplace === true && body?.convertType === 0, 'UNEXPECTED_FILE_READ_BLOCKED')
      }
      if (url.pathname === '/api/DataOperation/GetData') {
        const formKey = readHeader(config.headers, 'x-FormKey')
        const tables = Array.isArray(body?.Table) ? body.Table : []
        assert(tables.length === 1 && typeof tables[0]?.Name === 'string', 'UNEXPECTED_DATA_QUERY_BLOCKED')
        assert(formKey === DESIGN_SCENARIO, 'FORM_KEY_SCOPE_MISMATCH')
        const filter = tables[0]?.Filter
        const exactProbe = exactReferenceFilter(filter)
        if (stage === 'temporary-view-query') {
          assert(tables[0].Name === META_NAME && exactProbe, 'UNEXPECTED_PROBE_QUERY_BLOCKED')
          const inputParams = tables[0].inputParams ?? body.inputParams ?? []
          assert(Array.isArray(inputParams) && inputParams.length === 0, 'UNEXPECTED_PROBE_INPUT_PARAMS_BLOCKED')
          const fields = Array.isArray(tables[0].Fields) ? tables[0].Fields : []
          const names = fields.map(field => field && typeof field === 'object' ? field.Name : undefined)
          assert(names.length === outputSourceFields.length
            && outputSourceFields.every(name => names.includes(name)), 'UNEXPECTED_PROBE_OUTPUT_FIELDS_BLOCKED')
        } else {
          assert(stage === 'formal-dataset-assembly' && ASSEMBLY_MODEL_ALLOWLIST.has(tables[0].Name),
            'UNEXPECTED_ASSEMBLY_QUERY_BLOCKED')
        }
        requestTrace.push({path: url.pathname, method, appId, tenantId, formKey, model: tables[0].Name,
          filter: filter ?? null, fields: tables[0].Fields ?? null, page: body.PageParam ?? null,
          inputParams: tables[0].inputParams ?? body.inputParams ?? [], probeFilter: exactProbe})
      } else {
        requestTrace.push({path: url.pathname, method, appId, tenantId})
      }
      return {...config, baseURL: config.baseURL || 'http://127.0.0.1:5273'}
    }})

    stage = 'login'
    await lowcodeApi.platform.login(credential())
    const authenticatedSession = lowcodeApi.platform.session.get()
    assert(authenticatedSession?.enterprise.shortName === TENANT, 'AUTHENTICATED_TENANT_MISMATCH')
    stage = 'application-selection'
    await lowcodeApi.platform.activateApplication(APP)
    scope = lowcodeApi.readRequestScope()
    assert(scope.headers['X-AppId'] === APP && scope.headers['tenant-id'] === TENANT && scope.token,
      'REQUEST_SCOPE_INCOMPLETE')

    stage = 'formal-dataset-assembly'
    const {loadLowcodeDataSpaceMetadata} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-runtime.ts')
    dataSet = await loadLowcodeDataSpaceMetadata(TARGET_SPACE)
    assert(lowcodeApi.readRequestScope().token === scope.token
      && lowcodeApi.readRequestScope().headers['X-AppId'] === APP
      && lowcodeApi.readRequestScope().headers['tenant-id'] === TENANT, 'REQUEST_SCOPE_CHANGED')
    assert(dataSet.scenarioId === DESIGN_SCENARIO && !dataSet.destroyed, 'FORMAL_DATASET_IDENTITY_MISMATCH')

    stage = 'default-view-baseline'
    const table = dataSet.getTable(META_NAME)
    const defaultView = dataSet.getView(META_NAME, 'default')
    assert(table && defaultView && !defaultView.destroyed && table.modelBinding?.modelName === META_NAME,
      'FORMAL_MODEL_TABLE_MISSING')
    defaultBefore = viewFingerprint(defaultView)

    stage = 'temporary-view-query'
    tempViewId = `b1_reference_probe_${Date.now()}_${Math.random().toString(16).slice(2)}`
    temporaryView = defaultView.createQueryView(tempViewId)
    tempTable = table
    assert(OUTPUT_FIELDS.every(field => defaultView.columns.some(column => column.name === field)), 'REQUIRED_OUTPUT_FIELD_MISSING')
    outputSourceFields = OUTPUT_FIELDS.map(fieldName => {
      const field = defaultView.fieldProjection.find(candidate => candidate.viewField === fieldName)
      assert(field && field.source === 'resource', `OUTPUT_FIELD_PROJECTION_MISSING_${fieldName.toUpperCase()}`)
      return field.resourceField
    })
    for (const fieldName of ['Type', 'DbId']) {
      const field = defaultView.fieldProjection.find(candidate => candidate.viewField === fieldName)
      assert(field && field.source === 'resource', `FILTER_FIELD_PROJECTION_MISSING_${fieldName.toUpperCase()}`)
      filterSourceFields[fieldName] = field.resourceField
    }
    temporaryView.configure({filterExpression: dataModule.DataViewFilter.group({logic: 'and', filters: [
      {field: 'Type', operator: 'eq', value: '字典'},
      {field: 'DbId', operator: 'eq', value: TARGET_DICTIONARY},
    ]}), queryContext: {}, queryConfig: {allPages: true, maxRows: 50000, fields: OUTPUT_FIELDS},
    fieldProjection: defaultView.fieldProjection})
    const query = await temporaryView.loadFromServer({allPages: true, maxRows: 50000, fields: OUTPUT_FIELDS})
    assert(query.success && temporaryView.requestState === dataModule.RequestState.Loaded,
      'TEMPORARY_VIEW_NOT_LOADED')
    assert(temporaryView.rows.length === temporaryView.total, 'TEMPORARY_VIEW_INCOMPLETE')
    assert(requestTrace.some(item => item.probeFilter), 'EXACT_FILTER_NOT_SENT')

    stage = 'identity-and-permission-validation'
    for (const row of temporaryView.rows) {
      for (const field of OUTPUT_FIELDS) {
        assert(temporaryView.fieldAccess(row, field).read === 'visible' && Object.hasOwn(row, field),
          'IDENTITY_FIELD_NOT_READABLE')
      }
      assert(row['Type'] === '字典' && row['DbId'] === TARGET_DICTIONARY, 'FILTERED_ROW_IDENTITY_MISMATCH')
      resultRows.push(Object.fromEntries(OUTPUT_FIELDS.map(field => [field, row[field]])))
    }
    assert(resultRows.some(row => row.rowid === EXPECTED_REFERENCE_MODEL && row.dataSetId === TARGET_SPACE),
      'EXPECTED_REFERENCE_MODEL_NOT_FOUND')

    stage = 'default-view-integrity'
    const defaultAfter = viewFingerprint(defaultView)
    assert(JSON.stringify(defaultAfter) === JSON.stringify(defaultBefore),
      'DEFAULT_VIEW_CHANGED')
    assert(blockedMutations === 0, 'MUTATION_ATTEMPT')

    proof = {
      status: 'confirmed',
      mode: 'formal-SPARK-DataView-readonly',
      appId: APP,
      tenantId: TENANT,
      designScenarioId: DESIGN_SCENARIO,
      targetSpaceId: TARGET_SPACE,
      targetDictionaryId: TARGET_DICTIONARY,
      expectedReferenceModelId: EXPECTED_REFERENCE_MODEL,
      formalDataModelBinding: table.modelBinding,
      requestCount: requestTrace.length,
      probeRequestCount: requestTrace.filter(item => item.probeFilter).length,
      requestTrace,
      defaultViewBefore: defaultBefore,
      defaultViewAfter: defaultAfter,
      query: {requestState: temporaryView.requestState, rows: temporaryView.rows.length, total: temporaryView.total,
        allPages: true, outputFields: OUTPUT_FIELDS, matches: resultRows},
      blockedMutations,
      limitation: '仅观察当前正式查询scope可读的设计数据；不构成跨租户或全安装无引用证明。',
    }
  } catch (error) {
    failure = error
    failureStage = stage
  } finally {
    stage = 'cleanup'
    try {
      if (temporaryView && tempTable?.getView(tempViewId) === temporaryView) tempTable.destroyView(tempViewId)
      if (dataSet && !dataSet.destroyed) dataSet.destroy()
      if (temporaryView) assert(temporaryView.destroyed, 'TEMPORARY_VIEW_NOT_DESTROYED')
      if (dataSet) assert(dataSet.destroyed, 'DATASET_NOT_DESTROYED')
      if (proof) proof.cleanup = {temporaryViewDestroyed: Boolean(temporaryView?.destroyed), dataSetDestroyed: Boolean(dataSet?.destroyed)}
    } catch (error) {
      if (!failure) {failure = error; failureStage = 'cleanup'}
    } finally {
      try { await server.close() }
      catch (error) { if (!failure) {failure = error; failureStage = 'cleanup'} }
    }
  }
  if (failure) {stage = failureStage ?? 'preflight'; throw failure}
  if (!proof) fail('PROOF_NOT_CREATED')
  const {writeFile} = await import('node:fs/promises')
  await writeFile(path.join(root, 'node_modules/.cache/metadata-integration-20261024/b1-reference-probe-readonly-result.json'),
    JSON.stringify(proof, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'})
  console.log(JSON.stringify({status: proof.status, mode: proof.mode, requestCount: proof.requestCount,
    probeRequestCount: proof.probeRequestCount, rows: proof.query.rows, total: proof.query.total,
    matches: proof.query.matches, cleanup: proof.cleanup, blockedMutations}, null, 2))
}

run().catch(async error => {
  const record = safeError(error)
  try {
    const {writeFile} = await import('node:fs/promises')
    await writeFile(path.join(root, 'node_modules/.cache/metadata-integration-20261024/b1-reference-probe-readonly-selection-failure.json'),
      JSON.stringify({...record, requestTrace}, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'})
  } catch { /* Existing evidence remains untouched; the safe code is still printed. */ }
  console.log(JSON.stringify(record, null, 2))
  process.exitCode = 1
})
