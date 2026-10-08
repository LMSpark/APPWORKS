import fs from 'node:fs'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const report = {at: new Date().toISOString(), targetId, stage: 'initialize', writes: 0, requests: []}
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
  check(definition && definition.scenarioId === targetId && definition !== metadata, 'Missing independent native target DataSet')
  check(session.viewState.persisted && !session.viewState.dirty, 'Target file is not a clean persisted file')
  report.metadata = Object.entries(metadata.tables).map(([name, table]) => {
    const view = table.views.default
    check(view.rows.length === view.total, 'Incomplete metadata query')
    check(view.rows.every(row => row[name === 'Base_DataSet' ? 'rowid' : 'dataSetId'] === targetId), 'Metadata escaped target scope')
    return {name, rows: view.rows.length}
  })
  const before = session.viewState.text
  const entry = Object.entries(definition.tables).find(([, table]) => table.columns.some(column => !column.isComputed && !column.computeExpression))
  check(entry, 'No formal output column available')
  const [tableName, table] = entry
  const originalColumns = table.columns.filter(column => !column.isComputed).map(column => ({...column}))
  const column = originalColumns[0]
  const name = 'localDefinitionProbe'
  check(!table.columns.some(item => item.name === name), 'Probe column already exists')
  const config = JSON.parse(before)
  const expression = '1 + 2'
  config.tables[tableName].columns = [...(config.tables[tableName].columns ?? []), {name, type: 'number', label: 'Local probe', computeExpression: expression}]
  report.stage = 'stage-computed-definition'
  const staged = await session.stageDefinition({expectedText: before, text: JSON.stringify(config)})
  const current = session.definitionDataSet
  const currentTable = current.getTable(tableName)
  const local = currentTable.columns.find(item => item.name === name)
  check(local?.type === 'number' && local.label === 'Local probe' && local.computeExpression === expression, 'Native computed definition was not assembled')
  check(JSON.stringify(currentTable.columns.filter(item => !item.isComputed && !item.computeExpression)) === JSON.stringify(originalColumns), 'Formal database columns changed')
  check(Object.values(currentTable.views).every(view => view.columns.some(item => item.name === name)), 'Computed definition missing from a model-owned view')
  check(staged.dirty && definition.destroyed, 'Prior projection was not replaced')
  const invalid = JSON.parse(staged.text)
  invalid.tables[tableName].columns.push({name: column.name, type: 'number', computeExpression: expression})
  let collisionRejected = false
  try { await session.stageDefinition({expectedText: staged.text, text: JSON.stringify(invalid)}) }
  catch (error) { collisionRejected = String(error?.message).includes('本地计算列与正式输出字段重名') }
  check(collisionRejected && session.viewState.text === staged.text && session.definitionDataSet === current, 'Collision changed the current draft')
  report.stage = 'restore-original-file'
  const restored = await session.stageDefinition({expectedText: staged.text, text: before})
  const finalDefinition = session.definitionDataSet
  check(!restored.dirty && restored.text === before && current.destroyed, 'Exact original file was not restored')
  check(!finalDefinition.getTable(tableName).columns.some(item => item.name === name), 'Removed computation remains in native definition')
  report.computedDefinition = {tableName, formalFieldsPreserved: true, nativeFormulaRestored: true,
    allViewsIncludeLocalColumn: true, collisionRejectedBeforeDraftWrite: true, originalFileRestored: true,
    temporaryLocalEditOnly: true, onlineSaveAttempted: false}
  session.dispose()
  check(metadata.destroyed && definition.destroyed && current.destroyed && finalDefinition.destroyed, 'DataSets not released')
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
  process.stdout.write(JSON.stringify({...report, requests: report.requests.length}))
}
