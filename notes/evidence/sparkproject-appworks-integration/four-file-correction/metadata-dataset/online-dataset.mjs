import fs from 'node:fs'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const report = {at: new Date().toISOString(), appId, targetId, stage: 'initialize'}
const dataSets = []
let server
function assert(condition, message) { if (!condition) throw new Error(message) }
function summary(dataSet, target) {
  assert(dataSet.scenarioId === metadataId, 'Metadata identity changed to target identity')
  const tables = Object.entries(dataSet.tables).map(([name, table]) => {
    const view = table.views.default
    assert(view, `Missing default view: ${name}`)
    assert(view.rows.length === view.total, `Incomplete rows: ${name}`)
    assert(view.rows.every(row => row[name === 'Base_DataSet' ? 'rowid' : 'dataSetId'] === target), `Cross-target result: ${name}`)
    for (const named of Object.values(table.views)) {
      assert(named.queryContext.formid === target, `Missing input parameter: ${name}@${named.viewId}`)
      assert(named.dataTable === table, `Detached DataView: ${name}@${named.viewId}`)
    }
    return {name, constructor: table.constructor.name, modelBinding: table.modelBinding,
      columns: table.columns.filter(column => !column.isComputed).map(column => ({name: column.name, type: column.type, isPrimaryKey: column.isPrimaryKey === true})),
      views: Object.entries(table.views).map(([viewId, value]) => ({viewId, constructor: value.constructor.name,
        input: value.queryContext, filter: value.filterExpression, rows: value.rows.length, total: value.total})),
      rows: view.rows.length, total: view.total}
  })
  return {constructor: dataSet.constructor.name, scenarioId: dataSet.scenarioId,
    tables, resourceRelations: dataSet.resourceRelations, viewCascades: dataSet.viewCascades}
}
try {
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
  let loggedIn = false
  let reads = 0
  report.requests = []
  http.interceptors.request.use({onRequest: config => {
    report.requests.push({path: config.url, hasAuth: Boolean(config.headers?.Authorization), hasTenant: Boolean(config.headers?.['tenant-id'])})
    if (loggedIn) {
      assert(config.url === '/api/DataOperation/GetData', `Unexpected API after login: ${config.url}`)
      reads += 1
    }
    return {...config, baseURL: 'http://127.0.0.1:5273'}
  }})
  http.interceptors.response.use({onResponse: response => {
    report.requests.at(-1).status = response.status
    report.requests.at(-1).code = response.data?.Code
    return response
  }})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  assert(enterprises.length === 1, 'Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  report.stage = 'activate-application'
  await api.platform.activateApplication(appId)
  loggedIn = true
  report.stage = 'load-target'
  const first = await loadLowcodeDataSpaceMetadata(targetId)
  dataSets.push(first)
  report.target = summary(first, targetId)
  const firstRows = first.getTable('Base_DataModel').views.default.rows
  report.stage = 'load-independent-target'
  const second = await loadLowcodeDataSpaceMetadata(metadataId)
  dataSets.push(second)
  report.other = summary(second, metadataId)
  assert(first !== second, 'DataSet instances were shared')
  assert(first.getTable('Base_DataModel') !== second.getTable('Base_DataModel'), 'DataTable instances were shared')
  assert(first.getTable('Base_DataModel').views.default.rows === firstRows, 'Second target replaced first target rows')
  assert(first.getTable('Base_DataModel').views.default.queryContext.formid === targetId, 'Second target overwrote first input')
  report.isolated = true
  report.reads = reads
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = {name: error?.name ?? 'Error', message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 260)}
  process.exitCode = 1
} finally {
  dataSets.forEach(dataSet => dataSet.destroy())
  await server?.close()
  fs.writeFileSync(new URL('online-result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), error: report.error,
    tables: report.target?.tables.map(table => ({name: table.name, columns: table.columns.length, views: table.views.length, rows: table.rows})),
    isolated: report.isolated}))
}
