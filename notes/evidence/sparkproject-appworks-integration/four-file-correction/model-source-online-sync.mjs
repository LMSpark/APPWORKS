import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Fixed test tool only; credentials remain in memory. Inspection always precedes upload.
for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const mode = process.argv[2] ?? 'inspect'
if (!['inspect', 'sync', 'probe', 'readback', 'reference'].includes(mode)) throw new Error('Unsupported mode')
const evidence = 'notes/evidence/sparkproject-appworks-integration/four-file-correction'
const folder = `${evidence}/model-source-online-sync`
const manifestPath = `${folder}/manifest.json`
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const toolId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const localFolder = 'config/pages/data-platform/data-space-design'
const entries = ['pagedata.json', 'script.js', 'style.css', 'rule.json'].map(fileName => ({
  fileName, customPath: fileName === 'pagedata.json' ? `${appId}/SysForm/${toolId}` : `${appId}/${toolId}`,
  local: `${localFolder}/${fileName}`, backup: `${folder}/${fileName}.before`,
}))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const load = file => import(pathToFileURL(path.resolve(file)).href)
const report = {at: new Date().toISOString(), mode, appId, toolId, stage: 'initialize', outcomes: []}
fs.mkdirSync(folder, {recursive: true})
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {LowcodeDesignFileUpload} = await load('packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts')
  const {createRequest} = await load('packages/spark-utils/src/http/Request.ts')
  const {default: axios} = await load('packages/spark-utils/node_modules/axios/index.js')
  // Built-in fetch preserves ArrayBuffer; Node's built-in HTTP adapter encodes multipart.
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
  const uploader = new LowcodeDesignFileUpload({http, readScope: () => api.readRequestScope()})
  const read = entry => api.design.readFileBytes({appType: 'designfile', customPath: entry.customPath, fileName: entry.fileName})
  report.stage = mode
  if (mode === 'reference') {
    const {DataViewFilter} = await load('packages/spark-data/src/query/filter/data-view-filter.ts')
    const fields = ['rowid', 'Name', 'MetaName', 'DbId', 'DbName']
    const result = await api.dataSpace.runtime.query({scenarioId: toolId, metaName: 'Base_DataModel'},
      {fields, filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: `${toolId}p000`}), page: {index: 1, size: 2}})
    report.outcomes = result.rows.map(row => Object.fromEntries(fields.map(field => {
      if (result.readFieldAccess(row, field) !== 'visible') throw new Error(`Reference field unavailable: ${field}`)
      return [field, row[field] ?? null]
    })))
  } else if (mode === 'readback') {
    const {DataViewFilter} = await load('packages/spark-data/src/query/filter/data-view-filter.ts')
    const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
    report.targetId = targetId
    for (const [metaName, fields] of [
      ['Base_DataModel', ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', 'DbId', 'DbName']],
      ['Base_DataModel_Field', ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'FieldType', 'IsPKey', 'IsOutput']],
    ]) {
      const result = await api.dataSpace.runtime.query({scenarioId: toolId, metaName}, {fields,
        filter: DataViewFilter.condition({field: 'dataSetId', operator: 'eq', value: targetId}),
        allPages: true, page: {index: 1, size: 100}, maxRows: 1000})
      if (!result.countReported || result.rows.length !== result.total) throw new Error('Incomplete formal readback')
      report.outcomes.push({metaName, total: result.total, rows: result.rows.map(row => Object.fromEntries(fields.map(field => {
        if (result.readFieldAccess(row, field) !== 'visible') throw new Error(`Formal readback field unavailable: ${field}`)
        return [field, row[field] ?? null]
      })))})
    }
    report.stage = 'formal-model-consumer'
    const modelName = process.argv[3] ?? 'copyTable'
    const model = await api.dataSpace.design.readModel({designScenarioId: toolId, dataSpaceId: targetId, metaName: modelName})
    report.formalModel = {id: model.id, name: model.name, primaryKey: model.primaryKey, fieldCount: model.fields.length}
    report.stage = 'runtime-query-consumer'
    const runtimeResult = await api.dataSpace.runtime.query({scenarioId: targetId, metaName: modelName},
      {fields: [model.primaryKey], page: {index: 1, size: 10}})
    report.runtimeQuery = {countReported: runtimeResult.countReported, total: runtimeResult.total, rows: runtimeResult.rows.length}
  } else if (mode === 'probe') {
    const fields = ['rowid', 'tblname', 'dbid', 'DbName']
    const result = await api.dataSpace.runtime.query({scenarioId: toolId, metaName: 'View_TblList'},
      {fields, page: {index: 1, size: 10}})
    report.total = result.total
    report.outcomes = result.rows.map(row => Object.fromEntries(fields.map(field => [field,
      {read: result.readFieldAccess(row, field), value: result.readFieldAccess(row, field) === 'visible' ? row[field] ?? null : null}])))
  } else if (mode === 'inspect') {
    if (fs.existsSync(manifestPath)) throw new Error('Inspection already retained; do not overwrite original backups')
    const manifest = []
    for (const entry of entries) {
      const remote = await read(entry)
      const local = fs.readFileSync(entry.local)
      fs.writeFileSync(entry.backup, remote, {flag: 'wx'})
      manifest.push({...entry, remoteSha256: digest(remote), localSha256: digest(local),
        remoteBytes: remote.length, localBytes: local.length, changed: digest(remote) !== digest(local)})
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'})
    report.outcomes = manifest.map(({fileName, changed, remoteBytes, localBytes}) => ({fileName, changed, remoteBytes, localBytes}))
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    for (const entry of entries) {
      const saved = manifest.find(item => item.fileName === entry.fileName && item.customPath === entry.customPath)
      const local = fs.readFileSync(entry.local)
      if (!saved || digest(local) !== saved.localSha256 || digest(fs.readFileSync(entry.backup)) !== saved.remoteSha256) {
        throw new Error(`Local candidate or retained backup changed: ${entry.fileName}`)
      }
      const remote = await read(entry)
      if (digest(remote) === saved.localSha256) {
        report.outcomes.push({fileName: entry.fileName, status: 'already-matches', sha256: saved.localSha256})
        continue
      }
      if (digest(remote) !== saved.remoteSha256) throw new Error(`Remote changed since inspection: ${entry.fileName}`)
      report.stage = `upload:${entry.fileName}`
      await uploader.uploadWorkingText({...entry, text: new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(local)})
      const final = await read(entry)
      if (digest(final) !== saved.localSha256) throw new Error(`Remote readback mismatch: ${entry.fileName}`)
      report.outcomes.push({fileName: entry.fileName, status: 'uploaded-and-byte-verified', sha256: saved.localSha256})
      fs.writeFileSync(`${folder}/sync-progress.json`, `${JSON.stringify(report, null, 2)}\n`)
    }
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.errorType = error?.name ?? 'Error'
  report.errorCode = typeof error?.code === 'number' ? error.code : null
  report.message = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
  process.exitCode = 1
}
fs.writeFileSync(`${folder}/${mode}-result.json`, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(JSON.stringify(report))
