import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath, pathToFileURL} from 'node:url'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}

const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const designScenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const dataSpaceId = '97DCB03F75AADEAE6B102B062DB71CEA'
const smokeMode = process.argv[2] === '--smoke'
const [tableName, firstViewId, secondViewId] = smokeMode ? [] : process.argv.slice(2)
if (!smokeMode && (!tableName || !firstViewId || !secondViewId || firstViewId === secondViewId)) {
  throw new Error('Usage: node saved-views-readback.mjs <tableName> <viewId> <secondViewId>')
}

const folder = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(folder, 'saved-views-readback-result.json')
const load = file => import(pathToFileURL(path.resolve(file)).href)
const report = {at: new Date().toISOString(), appId, designScenarioId, dataSpaceId, tableName,
  requestedViewIds: [firstViewId, secondViewId], stage: 'initialize'}
let runtimeA
let runtimeB

function assert(condition, message) { if (!condition) throw new Error(message) }
function publicError(error) {
  return {name: error?.name ?? 'Error', message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 220)}
}
function permissionCounts(view) {
  const counts = {visible: 0, masked: 0, invisible: 0, writeAllowed: 0, writeDenied: 0,
    editableComponents: 0, rows: view.rows.length}
  assert(view.rows.length > 0 && view.columns.length > 0, 'Read-only check needs returned rows and configured columns')
  for (const row of view.rows) for (const column of view.columns) {
    const access = view.fieldAccess(row, column.name)
    if (access.read === 'visible') counts.visible++
    else if (access.read === 'masked') counts.masked++
    else counts.invisible++
    if (access.write === 'allowed') counts.writeAllowed++
    else counts.writeDenied++
    if (access.component === 'editable') counts.editableComponents++
  }
  assert(counts.writeAllowed === 0 && counts.editableComponents === 0, 'A configured DataView field is writable')
  return counts
}
async function requestLoaded(view, label, requestStates, refresh = false) {
  if (refresh) await view.refresh()
  else await view.requestData()
  const deadline = Date.now() + 30000
  while (view.requestState !== requestStates.Loaded && Date.now() < deadline) {
    if (view.requestState === requestStates.Failed) throw new Error(`${label} requestState is Failed`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert(view.requestState === requestStates.Loaded, `${label} requestState is not Loaded`)
  assert(view.countReported, `${label} query did not report total count`)
}

if (smokeMode) {
  const {RequestState: requestStates} = await load('packages/spark-data/src/types.ts')
  const view = {requestState: requestStates.Idle, countReported: true,
    async requestData() { this.requestState = requestStates.Loading; this.requestState = requestStates.Loaded },
    async refresh() { this.requestState = requestStates.Loading; this.requestState = requestStates.Loaded }}
  await requestLoaded(view, 'smoke request', requestStates)
  view.requestState = requestStates.Idle
  await requestLoaded(view, 'smoke refresh', requestStates, true)
  assert(view.requestState === requestStates.Loaded, 'Smoke refresh did not reach Loaded')
  process.stdout.write('requestLoaded-smoke-ok')
  process.exit(0)
}

try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {LowcodeDataSpaceAssembler} = await load('src/lowcode/data-space/lowcode-data-space-assembler.ts')
  const {ScenarioViewConfig} = await load('packages/spark-project-model/src/scenario/scenario-view-config.ts')
  const {PageRuntime} = await load('packages/spark-project-model/src/page/runtime-page.ts')
  const {PageTool} = await load('packages/spark-project-model/src/page/page-tool.ts')
  const {RequestState} = await load('packages/spark-data/src/types.ts')
  const {createRequest} = await load('packages/spark-utils/src/http/Request.ts')
  const {default: axios} = await load('packages/spark-utils/node_modules/axios/index.js')

  axios.defaults.adapter = config => axios.getAdapter(config.responseType === 'arraybuffer' ? 'fetch' : 'http')(config)
  const http = createRequest({baseURL: 'http://127.0.0.1:5273', timeout: 30000})
  const storage = new Map()
  const api = new LowcodeApi({http, sessionStorage: {getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  assert(enterprises.length === 1, 'Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)

  report.stage = 'read-saved-pagedata'
  const locator = {appType: 'designfile', customPath: `${appId}/SysForm/${dataSpaceId}`, fileName: 'pagedata.json'}
  const bytes = new Uint8Array(await api.design.readFileBytes(locator))
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)
  const config = new ScenarioViewConfig(dataSpaceId, text)
  const table = config.toJSON().tables?.[tableName]
  assert(table?.modelBinding, `Configured table not found: ${tableName}`)
  const views = table.views ?? {}
  assert(Object.hasOwn(views, firstViewId) && Object.hasOwn(views, secondViewId), 'Requested views are not both persisted')
  report.savedConfig = {sha256: createHash('sha256').update(bytes).digest('hex'), tableName,
    modelBinding: {modelId: table.modelBinding.modelId, modelName: table.modelBinding.modelName}, viewIds: Object.keys(views)}

  const assembleSavedScenario = async scenarioId => {
    assert(scenarioId === dataSpaceId, 'Unexpected PageRuntime scenario request')
    const names = new Set(Object.values(config.toJSON().tables).map(value => value.modelBinding.modelName))
    const input = {designScenarioId, dataSpaceId: scenarioId}
    const models = await Promise.all([...names].map(metaName => api.dataSpace.design.readModel({...input, metaName})))
    const relations = await api.dataSpace.design.readRelations(input)
    return new LowcodeDataSpaceAssembler(api.dataSpace.runtime, http).assemble({config, models, relations}).dataSet
  }
  const tool = new PageTool({pageId: `saved-views-readback-${dataSpaceId}`})
  tool.hydrateFileText('rule.json', JSON.stringify([
    {type: 'r-table', props: {dataViewKey: `#${dataSpaceId}@${tableName}@${firstViewId}`}},
    {type: 'r-table', props: {dataViewKey: `#${dataSpaceId}@${tableName}@${secondViewId}`}},
  ]))
  tool.markLoaded()
  const createRuntime = () => new PageRuntime({tool, scenarioIds: [dataSpaceId], mainScenarioId: dataSpaceId,
    loadScenario: assembleSavedScenario})

  report.stage = 'page-runtime-load'
  runtimeA = createRuntime()
  runtimeB = createRuntime()
  await Promise.all([runtimeA.load(), runtimeB.load()])
  const materializedA = runtimeA.materialize()
  const materializedB = runtimeB.materialize()
  report.materializedBindings = [firstViewId, secondViewId].every(viewId => {
    const needle = `#${dataSpaceId}@${tableName}@${viewId}`
    return JSON.stringify(materializedA.rule).includes(needle) && JSON.stringify(materializedB.rule).includes(needle)
  })
  assert(report.materializedBindings, 'PageRuntime did not materialize both full view references')

  const dataSetA = runtimeA.getDataSet(dataSpaceId)
  const dataSetB = runtimeB.getDataSet(dataSpaceId)
  assert(dataSetA && dataSetB && dataSetA !== dataSetB, 'PageRuntime calls share a DataSet')
  const aFirst = runtimeA.resolveView(`#${dataSpaceId}@${tableName}@${firstViewId}`)
  const aSecond = runtimeA.resolveView(`#${dataSpaceId}@${tableName}@${secondViewId}`)
  const bFirst = runtimeB.resolveView(`#${dataSpaceId}@${tableName}@${firstViewId}`)
  const bSecond = runtimeB.resolveView(`#${dataSpaceId}@${tableName}@${secondViewId}`)
  assert(aFirst && aSecond && bFirst && bSecond, 'PageRuntime view reference did not resolve')

  report.stage = 'same-runtime-two-views'
  await requestLoaded(aFirst, 'runtimeA first view', RequestState)
  const firstResult = {rowCount: aFirst.rows.length, total: aFirst.total, permissionCounts: permissionCounts(aFirst)}
  assert(aSecond.rows.length === 0, 'Loading first named view populated its sibling')
  await requestLoaded(aSecond, 'runtimeA second view', RequestState)
  const secondResult = {rowCount: aSecond.rows.length, total: aSecond.total, permissionCounts: permissionCounts(aSecond)}
  assert(aFirst.requestState === RequestState.Loaded && aFirst.rows.length === firstResult.rowCount,
    'Loading second named view changed the first view')

  report.stage = 'second-runtime-call'
  await requestLoaded(bFirst, 'runtimeB first view', RequestState)
  const runtimeBFirst = {rowCount: bFirst.rows.length, total: bFirst.total, permissionCounts: permissionCounts(bFirst)}
  assert(bFirst !== aFirst && bFirst.rows !== aFirst.rows, 'Separate PageRuntime calls share view state')

  report.stage = 'refresh-isolation'
  const firstRowsBeforeRefresh = aFirst.rows
  const firstRowBeforeRefresh = aFirst.rows[0]
  const siblingRowsBeforeRefresh = aSecond.rows
  const siblingRowBeforeRefresh = aSecond.rows[0]
  const siblingValuesBeforeRefresh = JSON.stringify(aSecond.rows)
  const otherRuntimeRowsBeforeRefresh = bFirst.rows
  const otherRuntimeRowBeforeRefresh = bFirst.rows[0]
  const otherRuntimeValuesBeforeRefresh = JSON.stringify(bFirst.rows)
  await requestLoaded(aFirst, 'runtimeA refreshed first view', RequestState, true)
  assert(aFirst.rows !== firstRowsBeforeRefresh && aFirst.rows[0] !== firstRowBeforeRefresh,
    'Refresh did not replace first view row objects')
  const refreshResult = {rowCount: aFirst.rows.length, total: aFirst.total, permissionCounts: permissionCounts(aFirst)}
  assert(aSecond.requestState === RequestState.Loaded && aSecond.rows === siblingRowsBeforeRefresh
    && aSecond.rows[0] === siblingRowBeforeRefresh && JSON.stringify(aSecond.rows) === siblingValuesBeforeRefresh,
  'Refreshing first view changed sibling row objects or values')
  assert(bFirst.requestState === RequestState.Loaded && bFirst.rows === otherRuntimeRowsBeforeRefresh
    && bFirst.rows[0] === otherRuntimeRowBeforeRefresh && JSON.stringify(bFirst.rows) === otherRuntimeValuesBeforeRefresh,
  'Refreshing runtimeA changed runtimeB row objects or values')

  report.stage = 'runtime-destroy-isolation'
  runtimeA.dispose()
  runtimeA = null
  await requestLoaded(bSecond, 'runtimeB sibling after runtimeA disposal', RequestState)
  assert(bFirst.requestState === RequestState.Loaded && bFirst.rows === otherRuntimeRowsBeforeRefresh
    && JSON.stringify(bFirst.rows) === otherRuntimeValuesBeforeRefresh,
  'Disposing runtimeA changed runtimeB row objects or values')
  const runtimeBAfterDispose = {rowCount: bSecond.rows.length, total: bSecond.total,
    permissionCounts: permissionCounts(bSecond)}
  assert(runtimeB.isLoaded && !dataSetB.destroyed, 'Disposing runtimeA destroyed runtimeB')

  const finalBytes = new Uint8Array(await api.design.readFileBytes(locator))
  report.savedConfig.finalSha256 = createHash('sha256').update(finalBytes).digest('hex')
  assert(report.savedConfig.sha256 === report.savedConfig.finalSha256, 'Saved pagedata changed during readback')
  report.views = {[firstViewId]: firstResult, [secondViewId]: secondResult}
  report.runtimeB = {first: runtimeBFirst, secondAfterOtherDispose: runtimeBAfterDispose}
  report.refresh = refreshResult
  report.runtimeLoaderBoundary = 'Each PageRuntime loadScenario used logged-in api design.readModel/readRelations and the existing LowcodeDataSpaceAssembler. This verifies persisted config through PageRuntime consumption, not the global App.vue host loader.'
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = publicError(error)
  process.exitCode = 1
} finally {
  runtimeA?.dispose()
  runtimeB?.dispose()
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), outputPath}))
}
