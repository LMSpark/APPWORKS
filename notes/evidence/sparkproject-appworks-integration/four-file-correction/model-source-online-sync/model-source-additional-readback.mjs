import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}

const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const toolId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const outputPath = 'notes/evidence/sparkproject-appworks-integration/four-file-correction/model-source-online-sync/additional-readback-result.json'
const load = file => import(pathToFileURL(path.resolve(file)).href)
const report = {at: new Date().toISOString(), appId, toolId, targetId, stage: 'initialize', outcomes: []}

function publicError(error) {
  return {errorType: error?.name ?? 'Error', errorCode: typeof error?.code === 'number' ? error.code : null,
    message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
      .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 200)}
}

function visibleProjection(result, row, fields) {
  return Object.fromEntries(fields.map(field => {
    if (result.readFieldAccess(row, field) !== 'visible') throw new Error(`Required readback field unavailable: ${field}`)
    return [field, row[field] ?? null]
  }))
}

function isEmpty(value) {
  return value === null || value === undefined || value === ''
}

try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {createRequest} = await load('packages/spark-utils/src/http/Request.ts')
  const {default: axios} = await load('packages/spark-utils/node_modules/axios/index.js')
  axios.defaults.adapter = config => axios.getAdapter(config.responseType === 'arraybuffer' ? 'fetch' : 'http')(config)
  const http = createRequest({baseURL: 'http://127.0.0.1:5273', timeout: 30000})
  const storage = new Map()
  const api = new LowcodeApi({http, sessionStorage: {getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}})

  report.stage = 'login'
  const enterprise = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprise.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprise[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)

  const {DataViewFilter} = await load('packages/spark-data/src/query/filter/data-view-filter.ts')
  const modelFields = ['rowid', 'dataSetId', 'Name', 'Type', 'DbId', 'DbName']
  const fieldFields = ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'FieldType', 'IsPKey', 'IsOutput', 'AsName', 'ValueFun']
  const readAll = async (metaName, fields) => {
    const result = await api.dataSpace.runtime.query({scenarioId: toolId, metaName}, {
      fields, filter: DataViewFilter.condition({field: 'dataSetId', operator: 'eq', value: targetId}),
      allPages: true, page: {index: 1, size: 100}, maxRows: 5000,
    })
    if (!result.countReported || result.rows.length !== result.total) throw new Error(`Incomplete paged readback: ${metaName}`)
    return {result, rows: result.rows.map(row => visibleProjection(result, row, fields))}
  }

  report.stage = 'formal-readback'
  const modelsRead = await readAll('Base_DataModel', modelFields)
  const fieldsRead = await readAll('Base_DataModel_Field', fieldFields)
  const fieldsByModel = new Map()
  for (const row of fieldsRead.rows) {
    if (!modelsRead.rows.some(model => model.rowid === row.dataModelId)) {
      throw new Error('Field readback contains a row outside the target model set')
    }
    const group = fieldsByModel.get(row.dataModelId) ?? []
    group.push(row)
    fieldsByModel.set(row.dataModelId, group)
  }
  report.modelCount = modelsRead.rows.length
  report.fieldCount = fieldsRead.rows.length
  report.models = modelsRead.rows.map(model => ({...model, fields: (fieldsByModel.get(model.rowid) ?? []).map(field => ({
    ...field, AsNameEmpty: isEmpty(field.AsName), ValueFunEmpty: isEmpty(field.ValueFun),
    AsName: undefined, ValueFun: undefined,
  }))}))

  report.stage = 'formal-model-consumers'
  for (const model of modelsRead.rows) {
    const outcome = {modelId: model.rowid, name: model.Name, type: model.Type}
    try {
      const formal = await api.dataSpace.design.readModel({designScenarioId: toolId, dataSpaceId: targetId, metaName: model.Name})
      outcome.readModel = {status: 'success', primaryKey: formal.primaryKey, fieldCount: formal.fields.length}
    } catch (error) {
      outcome.readModel = {status: 'error', ...publicError(error)}
    }
    report.outcomes.push(outcome)

    const isDictionary = model.Name === 'shif' && model.Type === '字典'
    const isJson = model.Name === 'TestJSON0819' && model.Type === 'JSON'
    if (!isDictionary && !isJson) continue
    report.stage = `runtime-query:${model.Name}`
    try {
      const queried = await api.dataSpace.runtime.query({scenarioId: targetId, metaName: model.Name}, {page: {index: 1, size: 10}})
      const runtime = {status: 'success', countReported: queried.countReported, total: queried.total, rowCount: queried.rows.length}
      const consumer = outcome.readModel
      if (consumer?.status === 'success') {
        runtime.primaryKey = consumer.primaryKey
        runtime.primaryKeySource = 'design.readModel'
      } else {
        runtime.primaryKey = null
        runtime.primaryKeySource = 'not exposed by runtime query result'
      }
      outcome.runtimeQuery = runtime
    } catch (error) {
      outcome.runtimeQuery = {status: 'error', ...publicError(error)}
    }
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  Object.assign(report, publicError(error))
  process.exitCode = 1
}

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), outputPath}))
