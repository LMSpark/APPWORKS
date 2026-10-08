import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {createServer} from 'vite'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const createMissing = process.argv.includes('--create-missing')
const verifyCandidate = process.argv.includes('--verify-candidate')
const report = {at: new Date().toISOString(), targetId, stage: 'initialize', writes: 0}
let server
let dataSet
function check(value, message) { if (!value) throw new Error(message) }
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }})
  server = await createServer({configFile: 'vitest.config.ts', logLevel: 'silent', server: {middlewareMode: true}})
  const {lowcodeApi: api, lowcodeHttp: http, createLowcodeProjectGateways} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {loadScenarioDataSet} = await server.ssrLoadModule('/src/lowcode/data-space/lowcode-data-space-runtime.ts')
  const {ScenarioViewConfig} = await server.ssrLoadModule('/packages/spark-project-model/src/scenario/scenario-view-config.ts')
  const {ProjectWorkspace} = await server.ssrLoadModule('/packages/spark-project-model/src/project/project-workspace.ts')
  let loggedIn = false
  report.requests = []
  http.interceptors.request.use({onRequest: config => {
    if (loggedIn) {
      const allowed = ['/api/DataOperation/GetData', '/api/File/content/text', '/api/File/DownFile']
      if (createMissing) allowed.push('/api/File/UploadFile')
      check(allowed.includes(config.url), 'Unexpected API')
      if (config.url === '/api/File/UploadFile') {
        check(report.stage === 'save-new-target-file', 'Upload outside explicit save')
        check(config.data instanceof FormData, 'Unexpected upload payload')
        check(config.data.get('customPath') === `${appId}/SysForm/${targetId}`
          && config.data.get('newName') === 'pagedata.json', 'Upload target mismatch')
        report.writes += 1
        check(report.writes === 1, 'Repeated upload refused')
      }
      report.requests.push({path: config.url})
    }
    return {...config, baseURL: 'http://127.0.0.1:5273'}
  }})
  http.interceptors.response.use({onResponse: response => {
    // Node's Axios adapter returns Buffer for arraybuffer; preserve the bytes in the browser transport shape.
    if (Buffer.isBuffer(response.data)) {
      report.binaryTransport = 'node-buffer-normalized-to-arraybuffer'
      return {...response, data: response.data.buffer.slice(response.data.byteOffset, response.data.byteOffset + response.data.byteLength)}
    }
    return response
  }})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item => item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  check(enterprises.length === 1, 'Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  loggedIn = true
  report.stage = 'read-target-pagedata'
  const gateways = createLowcodeProjectGateways(appId)
  const gateway = gateways.scenarioViews
  let text = await gateway.readText(targetId)
  report.filePresent = text !== null
  if (createMissing) {
    check(text === null, 'Target file already exists; creation refused')
    report.preimage = null
    report.stage = 'read-formal-models-for-new-file'
    const scope = api.readRequestScope().token
    const assertCurrent = () => check(api.readRequestScope().token === scope, 'Request scope changed')
    const models = await api.dataSpace.design.readModels({designScenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD', dataSpaceId: targetId, assertCurrent})
    check(models.length > 0, 'No formal models returned')
    const tables = Object.fromEntries(models.map(model => [model.metaName, {
      modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: {}},
    }]))
    check(Object.keys(tables).length === models.length, 'Duplicate formal model names')
    const candidate = JSON.stringify({scenarioId: targetId, tables, viewCascades: []}, null, 2)
    report.stage = 'validate-before-save'
    const preview = await loadScenarioDataSet({scenarioId: targetId, config: new ScenarioViewConfig(targetId, candidate), assertCurrent})
    preview.dataSet.destroy()
    check(preview.diagnostics.length === 0, 'Candidate has unresolved model relations')
    fs.writeFileSync(new URL('pilot-pagedata-candidate.json', import.meta.url), `${candidate}\n`)
    report.candidateSha256 = createHash('sha256').update(candidate).digest('hex')
    const workspace = new ProjectWorkspace({projectId: appId, ...gateways})
    const draft = await workspace.createScenarioViews({scenarioId: targetId, text: candidate, assertCurrent})
    report.stage = 'save-new-target-file'
    await workspace.saveScenarioViews({scenarioId: targetId, assertCurrent})
    check(draft.isPersisted && !draft.isDirty && draft.saveStatus === 'idle', 'Save not confirmed')
    report.saveConfirmed = true
    report.stage = 'reopen-in-new-workspace'
    const reopened = await new ProjectWorkspace({projectId: appId, ...gateways}).loadScenarioViews({scenarioId: targetId})
    text = reopened.getText()
    check(text === candidate && reopened !== draft, 'Fresh workspace did not read the saved definition')
    report.reopened = true
  }
  if (text !== null) {
    report.sha256 = createHash('sha256').update(text).digest('hex')
    if (verifyCandidate) {
      const previous = JSON.parse(fs.readFileSync(new URL('online-persistence-create-result.json', import.meta.url), 'utf8'))
      check(report.sha256 === previous.candidateSha256, 'Remote text differs from submitted candidate')
      const bytes = await api.design.readFileBytes({appType: 'designfile', customPath: `${appId}/SysForm/${targetId}`, fileName: 'pagedata.json'})
      check(createHash('sha256').update(bytes).digest('hex') === previous.candidateSha256, 'Remote bytes differ from submitted candidate')
      const reopened = await new ProjectWorkspace({projectId: appId, ...gateways}).loadScenarioViews({scenarioId: targetId})
      check(reopened.getText() === text && reopened.isPersisted && !reopened.isDirty, 'Fresh owner did not recover the remote file')
      report.uploadRecoveryVerified = true
      report.reopened = true
    }
    const config = new ScenarioViewConfig(targetId, text)
    report.stage = 'assemble-with-formal-database-models'
    const scope = api.readRequestScope().token
    const assembly = await loadScenarioDataSet({scenarioId: targetId, config, assertCurrent: () => {
      check(api.readRequestScope().token === scope, 'Request scope changed')
    }})
    dataSet = assembly.dataSet
    check(dataSet.scenarioId === targetId, 'Target runtime scenario identity mismatch')
    report.tables = Object.entries(config.toJSON().tables).map(([tableName, definition]) => {
      const table = dataSet.getTable(tableName)
      check(table && isDeepStrictEqual(table.modelBinding, definition.modelBinding), 'Formal model identity mismatch')
      check(!Object.hasOwn(definition, 'columns'), 'File duplicated formal columns')
      const views = Object.entries(definition.views).map(([viewId, source]) => {
        const view = dataSet.getView(tableName, viewId)
        check(view && view.dataTable === table, 'Named view not attached to its model')
        for (const [key, value] of Object.entries(source)) {
          check(isDeepStrictEqual(JSON.parse(JSON.stringify(view[key])), value), `View configuration mismatch: ${tableName}@${viewId}.${key}`)
        }
        check(!Object.hasOwn(source, 'rows'), 'File persisted runtime rows')
        return {viewId, configurationKeys: Object.keys(source), native: view.constructor.name}
      })
      return {tableName, columns: table.columns.filter(column => !column.isComputed).length,
        native: table.constructor.name, views}
    })
    check(await gateway.readText(targetId) === text, 'Remote file changed during read-only validation')
    report.resourceRelations = dataSet.resourceRelations.length
    report.viewCascades = dataSet.viewCascades.length
    report.diagnostics = assembly.diagnostics
    report.stage = 'complete'
  } else {
    report.stage = 'target-file-missing'
  }
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 260)
  process.exitCode = 1
} finally {
  dataSet?.destroy()
  await server?.close()
  fs.writeFileSync(new URL(createMissing ? 'online-persistence-create-result.json'
    : verifyCandidate ? 'online-persistence-verification-result.json' : 'online-persistence-result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), filePresent: report.filePresent,
    tables: report.tables?.map(table => ({name: table.tableName, columns: table.columns, views: table.views.length})), error: report.error}))
}
