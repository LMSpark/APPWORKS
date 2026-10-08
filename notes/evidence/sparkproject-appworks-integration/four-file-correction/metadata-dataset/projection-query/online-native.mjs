import fs from 'node:fs'
import {createServer} from 'vite'

for (const level of ['log', 'info', 'debug', 'warn', 'error']) console[level] = () => {}
const report = {at: new Date().toISOString(), stage: 'initialize', writes: 0, queries: []}
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
let server, dataSet, metadata
let ready = false
let outgoing
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  if (!auth.account || !auth.password || !auth.enterpriseName) throw new Error('Missing authorized login input')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }})
  server = await createServer({configFile: 'vitest.config.ts', logLevel: 'silent', server: {middlewareMode: true}})
  const {lowcodeApi: api, lowcodeHttp: http} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {loadScenarioDataSet, loadLowcodeDataSpaceMetadata} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-runtime.ts')
  const {ScenarioViewConfig} = await server.ssrLoadModule('/packages/spark-project-model/src/index.ts')
  http.interceptors.request.use({onRequest: config => {
    if (ready && config.url !== '/api/DataOperation/GetData') throw new Error('READ_ONLY_PROBE: unexpected endpoint')
    if (ready) outgoing = {mode: config.data.OutputFieldMode ?? 'omitted',
      fields: config.data.Table[0].Fields?.map(field => field.Name) ?? []}
    return {...config, baseURL: 'http://127.0.0.1:5273'}
  }})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item => item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  ready = true
  report.stage = 'assemble-native'
  const formal = await api.dataSpace.design.readModel({designScenarioId: metadataId, dataSpaceId: metadataId, metaName: 'Base_DataSet'})
  const field = formal.fields.find(item => item.canonicalName === 'Name' && item.output)
  if (!field) throw new Error('Formal Name output is missing')
  const configPath = 'config/pages/data-platform/data-space-design/pagedata.json'
  const originalText = fs.readFileSync(configPath, 'utf8')
  const config = JSON.parse(originalText)
  const table = config.tables.Base_DataSet
  table.views.projectionCheck = {...structuredClone(table.views.default), fieldProjection: [{
    fieldId: field.id, source: 'resource', resourceFieldId: field.id,
    resourceField: field.canonicalName, viewField: field.canonicalName,
    type: field.type || 'string', label: field.description, output: true,
    sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: field.primaryKey,
    value: '', valueFunction: '', expression: '',
  }]}
  const parsed = new ScenarioViewConfig(metadataId, JSON.stringify(config))
  const assembly = await loadScenarioDataSet({scenarioId: metadataId, config: parsed})
  dataSet = assembly.dataSet
  const expectedConfig = JSON.stringify(parsed.toJSON())
  report.stage = 'native-queries'
  for (const [viewId, fields] of [['projectionCheck', undefined], ['default', ['Name']], ['default', undefined]]) {
    const view = dataSet.getView('Base_DataSet', viewId)
    if (!view) throw new Error('Native view is missing')
    view.queryContext = {...view.queryContext, formid: targetId}
    await view.loadFromServer(fields ? {fields} : {})
    const row = view.rows[0]
    if (view.rows.length !== 1 || view.total !== 1 || row?.rowid !== targetId) throw new Error('Native query target mismatch')
    const generated = new Set(view.columns.filter(column => column.isComputed).map(column => column.name))
    const returnedFields = Object.keys(row).filter(name => !generated.has(name)).sort()
    const access = view.fieldAccess(row, 'Name')
    if (outgoing?.mode !== 'REQUEST' || access.read !== 'visible' || view.editActionState(row) !== 'enabled') {
      throw new Error('Native projection lost query mode, permissions or identity')
    }
    if ((viewId === 'projectionCheck' || fields) && JSON.stringify(returnedFields) !== JSON.stringify(['Name', 'rowid'])) {
      throw new Error('Native output projection was not respected')
    }
    report.queries.push({viewId, callFields: fields ?? null, ...outgoing, returnedFields,
      displayedColumns: view.columns.filter(column => !column.isComputed).map(column => column.name),
      nameRead: access.read, nameWrite: access.write, editActionState: view.editActionState(row)})
  }
  if (JSON.stringify(parsed.toJSON()) !== expectedConfig || fs.readFileSync(configPath, 'utf8') !== originalText) {
    throw new Error('Native query mutated persisted configuration')
  }
  report.configurationUnchanged = true
  report.stage = 'single-target-metadata'
  metadata = await loadLowcodeDataSpaceMetadata(targetId)
  report.metadata = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => {
    const view = metadata.getView(name, 'default')
    if (!view || view.rows.length !== view.total) throw new Error('Incomplete metadata view')
    return {table: name, rows: view.rows.length, total: view.total}
  })
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
  process.exitCode = 1
} finally {
  dataSet?.destroy()
  metadata?.destroy()
  await server?.close()
  fs.writeFileSync(new URL('./online-native-result.json', import.meta.url), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
