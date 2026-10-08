import fs from 'node:fs'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}

const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const modelId = `${metadataId}p000`
const fieldId = '8349CC5F4D3D473A961886A3AFCC1C18'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const fieldTable = 'Base_DataModel_Field'
const apply = process.argv.slice(2).length === 1 && process.argv[2] === '--apply'
const report = {at: new Date().toISOString(), mode: apply ? 'apply' : 'read-only', stage: 'initialize', writes: 0}
const dataSets = []
let server
let loggedIn = false
let writePermitted = false

function check(condition, code) {
  if (!condition) throw new Error(code)
}

function fieldSnapshot(view, row) {
  check(row && Object.hasOwn(row, 'rowid') && view.fieldAccess(row, 'rowid').read === 'visible', 'FIELD_ID_UNREADABLE')
  for (const key of ['dataSetId', 'dataModelId', 'Name', 'type', 'IsOutput']) {
    check(Object.hasOwn(row, key) && view.fieldAccess(row, key).read === 'visible', 'FIELD_DEFINITION_UNREADABLE')
  }
  check(row.rowid === fieldId && row.dataSetId === metadataId && row.dataModelId === modelId
    && row.Name === 'Name' && row.type === 'dataModel', 'FIELD_IDENTITY_MISMATCH')
  return {rowid: row.rowid, dataSetId: row.dataSetId, dataModelId: row.dataModelId,
    Name: row.Name, type: row.type, IsOutput: row.IsOutput}
}

function checkSaveRequest(config) {
  check(config.retry === 0 && config.method === 'POST' && config.headers?.['x-FormKey'] === metadataId,
    'SAVE_REQUEST_CONTEXT_MISMATCH')
  const groups = config.data
  check(Array.isArray(groups) && groups.length === 1, 'SAVE_GROUP_COUNT_MISMATCH')
  const group = groups[0]
  check(group?.TableName === fieldTable && group.CrudModel &&
    Array.isArray(group.CrudModel.Added) && group.CrudModel.Added.length === 0 &&
    Array.isArray(group.CrudModel.Deleted) && group.CrudModel.Deleted.length === 0 &&
    Array.isArray(group.CrudModel.Changed) && group.CrudModel.Changed.length === 1,
  'SAVE_ACTION_MISMATCH')
  const changed = group.CrudModel.Changed[0]
  check(changed?.rowid === fieldId && changed.IsOutput === 1 &&
    typeof changed.lingma_sys_key === 'string' && changed.lingma_sys_key.length > 0 &&
    Object.keys(changed).every(key => ['rowid', 'IsOutput', 'lingma_sys_key'].includes(key)),
  'SAVE_COLUMNS_MISMATCH')
}

try {
  check(process.argv.slice(2).length === 0 || apply, 'ARGUMENTS_INVALID')
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }})
  server = await createServer({configFile: 'vitest.config.ts', logLevel: 'silent', server: {middlewareMode: true}})
  const {lowcodeApi: api, lowcodeHttp: http} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {loadLowcodeDataSpaceMetadata} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-runtime.ts')
  const {DataViewFilter} = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
  http.interceptors.request.use({onRequest: config => {
    if (loggedIn) {
      if (config.url === '/api/DataOperation/GetData') {
        check(config.retry === 0 && config.method === 'POST', 'READ_REQUEST_UNEXPECTED')
      } else if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        check(apply && writePermitted && report.writes === 0, 'WRITE_NOT_PERMITTED')
        checkSaveRequest(config)
        report.writes += 1 // Count an attempted request; a failed response is not retried.
        writePermitted = false
      } else throw new Error('API_NOT_PERMITTED')
    }
    return {...config, baseURL: 'http://127.0.0.1:5273'}
  }})

  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  check(enterprises.length === 1, 'ENTERPRISE_IDENTITY_MISMATCH')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  loggedIn = true

  report.stage = 'preflight'
  const dataSet = await loadLowcodeDataSpaceMetadata(metadataId)
  dataSets.push(dataSet)
  const view = dataSet.getView(fieldTable, 'default')
  check(view && view.rows.length === view.total, 'FIELD_VIEW_INCOMPLETE')
  const matches = view.rows.filter(row => row.rowid === fieldId)
  check(matches.length === 1, 'FIELD_NOT_UNIQUE')
  const row = matches[0]
  report.before = fieldSnapshot(view, row)
  check(report.before.IsOutput === 0 || report.before.IsOutput === 1, 'OUTPUT_STATE_UNEXPECTED')
  if (report.before.IsOutput === 0) {
    check(view.fieldAccess(row, 'IsOutput').write === 'allowed', 'OUTPUT_NOT_WRITABLE')
  }
  const beforeFile = new URL('space-name-output-before.json', import.meta.url)
  if (!fs.existsSync(beforeFile)) fs.writeFileSync(beforeFile, `${JSON.stringify(report.before, null, 2)}\n`, {flag: 'wx'})

  if (apply && report.before.IsOutput === 0) {
    report.stage = 'save'
    const rowId = view.getPkKey(row)
    check(rowId === fieldId && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges(), 'FIELD_EDIT_BASELINE_INVALID')
    view.updateEditingValue(rowId, 'IsOutput', 1)
    const patch = view.getEditingPatch(rowId)
    check(patch && Object.keys(patch).length === 1 && patch.IsOutput === 1, 'FIELD_EDIT_DELTA_INVALID')
    writePermitted = true
    const saved = await dataSet.saveChanges({views: [{tableName: fieldTable, viewId: 'default', ids: [rowId]}]})
    writePermitted = false
    check(report.writes === 1 && saved.success === true && saved.data?.savedCount === 1 &&
      saved.data?.createdCount === 0 && saved.data?.deletedCount === 0 &&
      saved.data?.failedCount === 0 && saved.data?.failedViews?.length === 0, 'SAVE_RECEIPT_INVALID')
    report.receipt = {success: true, savedCount: 1, createdCount: 0, deletedCount: 0, failedCount: 0}
  } else {
    report.action = report.before.IsOutput === 1 ? 'already-enabled' : 'read-only'
  }

  report.stage = 'independent-readback'
  const fresh = await loadLowcodeDataSpaceMetadata(metadataId)
  dataSets.push(fresh)
  check(fresh !== dataSet, 'READBACK_NOT_INDEPENDENT')
  const freshView = fresh.getView(fieldTable, 'default')
  check(freshView && freshView.rows.length === freshView.total, 'READBACK_VIEW_INCOMPLETE')
  const freshRows = freshView.rows.filter(item => item.rowid === fieldId)
  check(freshRows.length === 1, 'READBACK_NOT_UNIQUE')
  report.after = fieldSnapshot(freshView, freshRows[0])
  if (apply || report.before.IsOutput === 1) check(report.after.IsOutput === 1, 'READBACK_OUTPUT_NOT_ENABLED')
  else check(report.after.IsOutput === 0, 'READBACK_CHANGED_IN_READ_ONLY_MODE')

  if (apply || report.before.IsOutput === 1) {
    report.stage = 'formal-model-readback'
    const formal = await api.dataSpace.design.readModel({designScenarioId: metadataId,
      dataSpaceId: metadataId, metaName: 'Base_DataSet'})
    const nameFields = formal.fields.filter(field => field.id === fieldId)
    check(nameFields.length === 1 && nameFields[0].name === 'Name' && nameFields[0].output === true,
      'FORMAL_MODEL_OUTPUT_NOT_ENABLED')
    report.formalModel = {metaName: formal.metaName, nameOutput: true}

    report.stage = 'formal-space-query'
    report.headers = []
    for (const dataSpaceId of [metadataId, targetId]) {
      const result = await api.dataSpace.runtime.query({scenarioId: metadataId, metaName: 'Base_DataSet'}, {
        fields: ['rowid', 'Name'], filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: dataSpaceId}),
        page: {index: 1, size: 2},
      })
      const header = result.rows[0]
      check(result.countReported && result.total === 1 && result.rows.length === 1 &&
        header?.rowid === dataSpaceId && result.readFieldAccess(header, 'rowid') === 'visible' &&
        result.readFieldAccess(header, 'Name') === 'visible' &&
        typeof header.Name === 'string' && Boolean(header.Name.trim()), 'FORMAL_SPACE_NAME_UNREADABLE')
      report.headers.push({dataSpaceId, name: header.Name, readable: true})
    }
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.errorType = error?.name ?? 'Error'
  report.errorCode = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.message)
    ? error.message : 'UNCLASSIFIED_ERROR'
  process.exitCode = 1
} finally {
  writePermitted = false
  for (const dataSet of dataSets) dataSet.destroy()
  report.dataSetsDestroyed = dataSets.length
  await server?.close()
  const resultFile = apply ? 'space-name-output-apply-result.json' : 'space-name-output-read-only-result.json'
  fs.writeFileSync(new URL(resultFile, import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed),
    errorCode: report.errorCode, writes: report.writes, dataSetsDestroyed: report.dataSetsDestroyed}))
}
