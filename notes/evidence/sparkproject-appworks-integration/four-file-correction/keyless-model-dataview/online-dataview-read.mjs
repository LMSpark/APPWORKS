import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const phase = process.argv[2]
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after')
const outputPath = new URL(`online-${phase}.json`, import.meta.url)
const load = file => import(pathToFileURL(path.resolve(file)).href)
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const designScenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const dataSpaceId = '97DCB03F75AADEAE6B102B062DB71CEA'
const report = {at: new Date().toISOString(), phase, stage: 'initialize', appId, dataSpaceId}
let dataSet
function assert(condition, message) { if (!condition) throw new Error(message) }

try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {createRequest} = await load('packages/spark-utils/src/http/Request.ts')
  const {default: axios} = await load('packages/spark-utils/node_modules/axios/index.js')
  const {LowcodeDataSpaceAssembler} = await load('src/lowcode/data-space/lowcode-data-space-assembler.ts')
  const {ScenarioViewConfig} = await load('packages/spark-project-model/src/scenario/scenario-view-config.ts')
  axios.defaults.adapter = config => axios.getAdapter(config.responseType === 'arraybuffer' ? 'fetch' : 'http')(config)
  const http = createRequest({baseURL: 'http://127.0.0.1:5273', timeout: 30000})
  const storage = new Map()
  const api = new LowcodeApi({http, sessionStorage: {getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}})
  report.stage = 'login'
  const enterprise = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  assert(enterprise.length === 1, 'Enterprise identity is not unique')
  auth.enterpriseName = enterprise[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)

  report.stage = 'readModel'
  const model = await api.dataSpace.design.readModel({designScenarioId, dataSpaceId, metaName: 'shif'})
  report.model = {id: model.id, name: model.metaName, primaryKey: model.primaryKey,
    fields: model.fields.map(field => ({name: field.canonicalName, output: field.output, primaryKey: field.primaryKey}))}
  assert(model.id === '23242F5DF24156A738D99A9270802B24', 'Unexpected retained test model')
  assert(model.primaryKey === '', 'Dictionary must remain without a formal primary key')
  const config = new ScenarioViewConfig(dataSpaceId, JSON.stringify({scenarioId: dataSpaceId,
    tables: {dictionary: {modelBinding: {modelId: model.id, modelName: model.metaName},
      views: {default: {page: 1, pageSize: 10}, second: {page: 1, pageSize: 10}}}}, viewCascades: []}))
  report.stage = 'assemble'
  const assembly = new LowcodeDataSpaceAssembler(api.dataSpace.runtime, http).assemble({config, models: [model], relations: []})
  dataSet = assembly.dataSet
  const first = dataSet.getView('dictionary', 'default')
  const second = dataSet.getView('dictionary', 'second')
  assert(first && second && first !== second, 'Two independent named views required')

  report.stage = 'first-view-query'
  await first.requestData()
  assert(first.rows.length > 0, 'Dictionary DataView has no returned rows')
  const outputs = model.fields.filter(field => field.output).map(field => field.canonicalName)
  const firstRow = first.rows[0]
  const fields = outputs.map(field => ({field, ...first.fieldAccess(firstRow, field)}))
  assert(fields.some(field => field.read === 'visible'), 'DataView has no visible field')
  assert(fields.every(field => field.write === 'denied' && field.component !== 'editable'), 'Keyless DataView became writable')
  assert(first.primaryKey === '' && first.getPkKey(firstRow) === undefined, 'DataView invented a primary key')
  assert(first.addActionState() !== 'enabled' && first.editActionState(firstRow) !== 'enabled'
    && first.deleteActionState(firstRow) !== 'enabled' && first.createChildActionState(firstRow) !== 'enabled', 'Keyless write action enabled')
  assert(first.currentRow === null && first.selectedRows.length === 0, 'Keyless row auto-selected by id')
  assert(second.rows.length === 0, 'Querying first view mutated second view')
  const visible = fields.find(field => field.read === 'visible').field
  assert(first.fieldAccess({...firstRow}, visible).read === 'invisible', 'Copied row inherited query read permission')
  report.firstView = {rowCount: first.rows.length, total: first.total, fields, add: first.addActionState(),
    edit: first.editActionState(firstRow), delete: first.deleteActionState(firstRow), child: first.createChildActionState(firstRow)}

  report.stage = 'second-view-query'
  await second.requestData()
  assert(second.rows.length > 0, 'Second DataView query failed')
  assert(second.rows[0] !== firstRow, 'Named views share mutable rows')
  assert(second.fieldAccess(firstRow, visible).read === 'invisible', 'Other view row inherited read permission')
  assert(first.fieldAccess(second.rows[0], visible).read === 'invisible', 'Foreign row accepted by first view')
  assert(second.fieldAccess(second.rows[0], visible).read === 'visible', 'Second view cannot read its own row')
  report.secondView = {rowCount: second.rows.length, total: second.total, isolatedRows: true}

  report.stage = 'refresh'
  await first.refresh()
  assert(first.rows.length > 0 && first.rows[0] !== firstRow, 'Refresh did not replace result')
  assert(first.fieldAccess(firstRow, visible).read === 'invisible', 'Old result row retained permission after refresh')
  assert(first.fieldAccess(first.rows[0], visible).read === 'visible', 'Refreshed row lost permission')
  report.refresh = {oldRowDenied: true, currentRowReadable: true, secondViewStillReadable:
    second.fieldAccess(second.rows[0], visible).read === 'visible'}
  assert(report.refresh.secondViewStillReadable, 'Refreshing first view invalidated second view')
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = {name: error?.name ?? 'Error', message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)}
  process.exitCode = 1
} finally {
  dataSet?.destroy()
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), outputPath: outputPath.pathname}))
}
