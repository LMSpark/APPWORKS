import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const load = file => import(pathToFileURL(path.resolve(file)).href)
const scenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const report = {at: new Date().toISOString(), appId, scenarioId, stage: 'login'}
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {createRequest} = await load('packages/spark-utils/src/http/Request.ts')
  const {DataViewFilter} = await load('packages/spark-data/src/query/filter/data-view-filter.ts')
  const {default: axios} = await load('packages/spark-utils/node_modules/axios/index.js')
  axios.defaults.adapter = config => axios.getAdapter(config.responseType === 'arraybuffer' ? 'fetch' : 'http')(config)
  const http = createRequest({baseURL: 'http://127.0.0.1:5273', timeout: 30000})
  const storage = new Map()
  const api = new LowcodeApi({http, sessionStorage: {getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}})
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  report.stage = 'read-metadata-space'
  const own = await api.dataSpace.runtime.query({scenarioId, metaName: 'Base_DataSet'}, {
    filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: scenarioId}), allPages: true})
  if (own.rows.length !== 1) throw new Error('Metadata data space record must be unique')
  report.space = Object.fromEntries(Object.entries(own.rows[0]).filter(([key]) =>
    ['rowid', 'Name', 'name', 'Description', 'description', 'inputParams', 'InputParams'].includes(key)))
  report.models = []
  for (const metaName of ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']) {
    const model = await api.dataSpace.design.readModel({designScenarioId: scenarioId, dataSpaceId: scenarioId, metaName})
    report.models.push({id: model.id, metaName: model.metaName, primaryKey: model.primaryKey,
      filter: model.raw.Filter ?? model.raw.filter, inputParams: model.raw.inputParams ?? model.raw.InputParams,
      fields: model.fields.map(field => ({id: field.id, name: field.canonicalName, output: field.output, type: field.type}))})
  }
  const relations = await api.dataSpace.design.readRelations({designScenarioId: scenarioId, dataSpaceId: scenarioId})
  report.relations = relations.map(relation => ({...relation, filterExpression: relation.filterExpression.toJSON()}))
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = {name: error?.name ?? 'Error', message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)}
  process.exitCode = 1
} finally {
  fs.writeFileSync(new URL('contract.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), error: report.error}))
}
