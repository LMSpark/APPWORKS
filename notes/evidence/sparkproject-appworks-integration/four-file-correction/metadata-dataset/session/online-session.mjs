import fs from 'node:fs'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
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
  report.requests = []
  http.interceptors.request.use({onRequest: config => {
    if (loggedIn) {
      check(['/api/DataOperation/GetData', '/api/File/content/text'].includes(config.url), 'Unexpected non-read API')
      report.requests.push({path: config.url})
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
  check(session.targetId === targetId && metadata.scenarioId === metadataId, 'Metadata and target identity mismatch')
  check(definition && definition.scenarioId === targetId && definition !== metadata, 'Target definition is not an independent native DataSet')
  check(session.viewState.persisted && !session.viewState.dirty && session.viewState.scenarioId === targetId, 'File owner has not read the persisted target')
  report.metadata = Object.entries(metadata.tables).map(([name, table]) => {
    const view = table.views.default
    check(view.rows.length === view.total, 'Incomplete metadata query')
    check(view.rows.every(row => row[name === 'Base_DataSet' ? 'rowid' : 'dataSetId'] === targetId), 'Metadata escaped target scope')
    return {name, rows: view.rows.length, views: Object.keys(table.views)}
  })
  report.definitions = Object.entries(definition.tables).map(([tableName, table]) => {
    check(table.modelBinding?.modelId && table.modelBinding?.modelName, 'Missing formal model binding')
    check(Object.values(table.views).every(view => view.dataTable === table && view.dataSet === definition), 'Views detached from native hierarchy')
    return {tableName, columns: table.columns.filter(column => !column.isComputed).length, views: Object.keys(table.views)}
  })
  check(report.metadata.length === 4 && report.definitions.length === 7, 'Unexpected model coverage')
  session.dispose()
  check(metadata.destroyed && definition.destroyed, 'Session did not release both DataSets')
  session.dispose()
  report.disposed = true
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 260)
  process.exitCode = 1
} finally {
  session?.dispose()
  await server?.close()
  fs.writeFileSync(new URL('online-result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed),
    metadata: report.metadata?.map(item => ({name: item.name, rows: item.rows})),
    models: report.definitions?.length, disposed: report.disposed, error: report.error}))
}
