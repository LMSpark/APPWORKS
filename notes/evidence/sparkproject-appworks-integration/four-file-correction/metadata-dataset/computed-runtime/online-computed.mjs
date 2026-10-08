import fs from 'node:fs'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const report = {at: new Date().toISOString(), targetId, stage: 'initialize', writes: 0}
let server
let session
function check(value, message) { if (!value) throw new Error(message) }
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }})
  server = await createServer({configFile: 'vitest.config.ts', logLevel: 'silent', server: {middlewareMode: true}})
  const {lowcodeApi: api, lowcodeHttp: http} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {openLowcodeDataSpaceDesignSession} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-design.ts')
  let loggedIn = false
  let queryRequests = 0
  http.interceptors.request.use({onRequest: config => {
    if (loggedIn) {
      check(['/api/DataOperation/GetData', '/api/File/content/text'].includes(config.url), 'Unexpected non-read API')
      if (config.url === '/api/DataOperation/GetData') queryRequests++
    }
    return {...config, baseURL: 'http://127.0.0.1:5273'}
  }})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item => item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  check(enterprises.length === 1, 'Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  loggedIn = true
  report.stage = 'open-single-target-session'
  session = await openLowcodeDataSpaceDesignSession(targetId)
  const metadata = session.metadataDataSet
  const definition = session.definitionDataSet
  check(metadata.scenarioId === '8D1AB14DD8277F3E7017CD38F77B09FD', 'Wrong metadata scenario')
  check(definition?.scenarioId === targetId && !session.viewState.dirty, 'Wrong target file')
  report.metadata = Object.entries(metadata.tables).map(([name, table]) => {
    const view = table.views.default
    check(view.rows.length === view.total, 'Incomplete metadata')
    check(view.rows.every(row => row[name === 'Base_DataSet' ? 'rowid' : 'dataSetId'] === targetId), 'Out-of-target metadata')
    return {name, rows: view.rows.length}
  })
  report.stage = 'compute-on-real-query-context'
  const table = metadata.getTable('Base_DataSet')
  const view = table?.getView('default')
  const row = view?.rows[0]
  check(row, 'No target space row')
  const column = view.columns.find(item => !item.isComputed && !item.computeExpression && view.fieldAccess(row, item.name).read === 'visible')
  check(column, 'No visible formal field')
  const originalColumns = table.columns
  const originalRow = structuredClone(row)
  const beforeQueries = queryRequests
  const beforeFile = session.viewState.text
  const name = '__computedAcceptance'
  check(!table.columns.some(item => item.name === name), 'Probe name collision')
  table.columns = [...table.columns, {name, type: 'number', computeExpression: `String(__row[${JSON.stringify(column.name)}]).length`}]
  view.recomputeColumns()
  check(row[name] === String(originalRow[column.name]).length, 'Computed value mismatch')
  const access = view.fieldAccess(row, name)
  check(access.read === 'visible' && access.write === 'denied' && access.component === 'readonly', 'Computed permission mismatch')
  check(!Object.hasOwn(view.stripComputedColumns(row), name), 'Computed field leaked into submit data')
  table.columns = originalColumns
  view.recomputeColumns()
  check(!Object.hasOwn(row, name) && JSON.stringify(row) === JSON.stringify(originalRow), 'Original query row not restored')
  check(queryRequests === beforeQueries && session.viewState.text === beforeFile && !session.viewState.dirty, 'Computation changed query or file')
  report.computation = {tableName: table.tableName, sourceField: column.name, valueMatched: true,
    readonly: true, strippedFromSubmission: true, originalRowRestored: true, fileUnchanged: true, extraRequests: 0}
  session.dispose()
  check(metadata.destroyed && definition.destroyed, 'DataSets not released')
  report.disposed = true
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
  process.exitCode = 1
} finally {
  session?.dispose()
  await server?.close()
  fs.writeFileSync(new URL('online-result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify(report))
}
