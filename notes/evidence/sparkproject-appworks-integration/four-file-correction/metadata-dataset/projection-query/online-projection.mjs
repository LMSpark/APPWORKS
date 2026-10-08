import fs from 'node:fs'
import {createServer} from 'vite'

for (const level of ['log', 'info', 'debug', 'warn', 'error']) console[level] = () => {}
const report = {at: new Date().toISOString(), stage: 'initialize', writes: 0, queries: []}
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const permissionProbe = process.argv.includes('--permission')
let server
let outputMode
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
  const {DataViewFilter} = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
  http.interceptors.request.use({onRequest: config => {
    if (!ready) return {...config, baseURL: 'http://127.0.0.1:5273'}
    if (config.url !== '/api/DataOperation/GetData') throw new Error('READ_ONLY_PROBE: unexpected endpoint')
    const data = {...config.data, ...(outputMode ? {OutputFieldMode: outputMode} : {})}
    outgoing = {path: config.url, mode: data.OutputFieldMode ?? 'omitted',
      fields: data.Table[0].Fields.map(field => field.Name)}
    return {...config, data, baseURL: 'http://127.0.0.1:5273'}
  }})
  report.stage = 'login'
  const enterprises = (await api.platform.listEnterprises()).filter(item => item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  ready = true
  report.stage = 'query-projection'
  const cases = permissionProbe
    ? [{mode: 'REQUEST', fields: ['Name']}, {mode: 'REQUEST', fields: ['rowid', 'Name']}]
    : [undefined, 'MODEL', 'REQUEST'].map(mode => ({mode, fields: ['rowid']}))
  for (const query of cases) {
    outputMode = query.mode
    const context = await api.dataSpace.runtime.query({scenarioId: metadataId, metaName: 'Base_DataSet'}, {
      fields: query.fields, page: {index: 1, size: 20},
      inputParams: [{name: 'formid', value: targetId}],
      filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: targetId}),
    })
    const rows = context.rows
    if (rows.length !== 1 || context.total !== 1
      || (query.fields.includes('rowid') && rows[0].rowid !== targetId)) throw new Error('Unexpected target scope or incomplete result')
    report.queries.push({...outgoing, rowCount: rows.length, total: context.total,
      returnedFields: Object.keys(rows[0]).sort(),
      rowIdentityAvailable: context.rowKey(rows[0]) !== undefined && context.rowKey(rows[0]) !== null,
      identityFieldVisible: context.fieldAccess(context.rowKey(rows[0]), 'rowid').read === 'visible',
      ...(permissionProbe ? {nameReadViaRowKey: context.fieldAccess(context.rowKey(rows[0]), 'Name').read,
        nameReadViaOriginalRow: context.readFieldAccess(rows[0], 'Name'),
        editActionState: context.editActionState(context.rowKey(rows[0]))} : {})})
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
  process.exitCode = 1
} finally {
  await server?.close()
  fs.writeFileSync(new URL(permissionProbe ? './online-permission-result.json' : './online-result.json', import.meta.url), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
