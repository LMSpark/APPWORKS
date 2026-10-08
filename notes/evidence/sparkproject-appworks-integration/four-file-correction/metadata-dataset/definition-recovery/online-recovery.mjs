import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'

for (const level of ['log', 'info', 'debug', 'warn', 'error']) console[level] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const report = {at: new Date().toISOString(), stage: 'initialize', writes: 0, reads: 0}
let server, first, repair, file, original
const check = (value, message) => {if (!value) throw new Error(message)}
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  }})
  server = await createServer({configFile: 'vitest.config.ts', logLevel: 'silent', server: {middlewareMode: true}})
  const {lowcodeApi: api, lowcodeHttp: http} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {openLowcodeDataSpaceDesignSession} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-design.ts')
  const {getAppProjectBlueprintWorkspace} = await server.ssrLoadModule('/src/services/project/project-shell.ts')
  let authenticated = false
  http.interceptors.request.use({onRequest: config => {
    if (authenticated) {
      check(['/api/DataOperation/GetData', '/api/File/content/text'].includes(config.url), 'READ_ONLY_PROBE: unexpected endpoint')
      report.reads++
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
  authenticated = true
  report.stage = 'load-persisted-target'
  first = await openLowcodeDataSpaceDesignSession(targetId)
  check(first.definitionError === null, 'Existing target definition is already unavailable')
  check(first.viewState?.persisted && !first.viewState.dirty, 'Expected a clean persisted file')
  file = getAppProjectBlueprintWorkspace(appId).getScenarioViews(targetId)
  check(file, 'Missing shared file owner')
  original = file.getText()
  const locator = {appType: 'designfile', customPath: `${appId}/SysForm/${targetId}`, fileName: 'pagedata.json'}
  const remoteBefore = await api.design.readTextFile(locator)
  check(remoteBefore === original, 'File baseline differs from remote')
  const oldProjection = first.definitionDataSet
  const config = JSON.parse(original)
  const [tableName, table] = Object.entries(config.tables)[0]
  const missing = '__recovery_probe_missing__'
  check(!oldProjection.getTable(tableName).columns.some(column => column.name === missing), 'Probe field unexpectedly exists')
  table.columns = [...(table.columns ?? []), {name: missing, required: true}]
  const invalid = JSON.stringify(config)
  file.setText(invalid)
  check(oldProjection.destroyed, 'Old projection was not invalidated')
  report.stage = 'open-unavailable-definition'
  repair = await openLowcodeDataSpaceDesignSession(targetId)
  check(repair.definitionError?.message.includes(missing), 'Expected a formal field reference diagnostic')
  let refused = false
  try {void repair.definitionDataSet} catch (error) {refused = error === repair.definitionError}
  check(refused && !repair.metadataDataSet.destroyed && repair.viewState.text === invalid, 'Unavailable projection was presented as usable or draft was lost')
  report.failureVisible = true
  report.metadata = Object.entries(repair.metadataDataSet.tables).map(([name, item]) => ({table: name, rows: item.views.default.rows.length}))
  report.stage = 'repair-through-session'
  await repair.stageDefinition({expectedText: invalid, text: original})
  check(repair.definitionError === null && repair.viewState.text === original && !repair.viewState.dirty, 'Validated restoration did not recover clean baseline')
  report.models = Object.keys(repair.definitionDataSet.tables).length
  const remoteAfter = await api.design.readTextFile(locator)
  check(remoteAfter === remoteBefore, 'Read-only validation changed the remote file')
  report.remoteUnchanged = true
  report.fileHash = createHash('sha256').update(remoteAfter).digest('hex')
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
  process.exitCode = 1
} finally {
  if (file && original !== undefined && file.getText() !== original) file.setText(original)
  first?.dispose()
  repair?.dispose()
  report.disposed = (!first || first.metadataDataSet.destroyed) && (!repair || repair.metadataDataSet.destroyed)
  await server?.close()
  fs.writeFileSync(new URL('./online-result.json', import.meta.url), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
