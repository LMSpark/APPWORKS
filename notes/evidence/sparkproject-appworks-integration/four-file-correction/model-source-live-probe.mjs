import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Read-only probe. Credentials arrive on stdin and are never written to the report.
for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const report = { checkedAt: new Date().toISOString(), stage: 'initialize', sources: [] }
const output = 'notes/evidence/sparkproject-appworks-integration/four-file-correction/model-source-live-contract.json'
const load = file => import(pathToFileURL(path.resolve(file)).href)
try {
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const { LowcodeApi } = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const { createRequest } = await load('packages/spark-utils/src/http/Request.ts')
  const { DataViewFilter } = await import('@spark-appworks/spark-data')
  const storage = new Map()
  const api = new LowcodeApi({ http: createRequest({ baseURL: 'http://127.0.0.1:5273', timeout: 15000 }),
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  report.stage = 'enterprise'
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  report.stage = 'login'
  await api.platform.login(auth)
  auth.password = ''
  report.stage = 'application'
  await api.platform.activateApplication('D99A1DCE9894698799101EFD70F8FC76')
  const scenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
  const specs = [
    ['table', 'View_TblList', ['rowid', 'tblname', 'tbldesc', 'dbid', 'DbName']],
    ['dict', '_Base_DictType', ['rowid', 'TypeName', 'functiondesc']],
    ['interface', 'Base_DataServiceInterface', ['rowid', 'Name', 'Desc', 'ProviderID']],
    ['json', 'Base_JsonData', ['rowid', 'name', 'description']],
    ['logicView', 'Base_DataViewList', ['rowid', 'name', 'description']],
    ['databaseView', 'View_ViewList', ['rowid', 'vewname', 'vewdesc', 'dbid', 'DbName']],
  ]
  const shape = (context, fields) => ({ total: context.total, countReported: context.countReported,
    rows: context.rows.map(row => ({ keys: Object.keys(row), hasFormalKey: Boolean(context.rowKey(row)),
      access: Object.fromEntries(fields.map(field => [field, context.readFieldAccess(row, field)])) })) })
  for (const [kind, metaName, fields] of specs) {
    const item = { kind, metaName }
    report.sources.push(item)
    report.stage = kind
    try {
      const context = await api.dataSpace.runtime.query({ scenarioId, metaName }, { fields, page: { index: 1, size: 1 } })
      item.list = shape(context, fields)
      const row = context.rows[0]
      if (row && context.readFieldAccess(row, 'rowid') === 'visible' && typeof row.rowid === 'string') {
        const selected = await api.dataSpace.runtime.query({ scenarioId, metaName }, {
          fields, filter: DataViewFilter.condition({ field: 'rowid', operator: 'eq', value: row.rowid }),
          page: { index: 1, size: 2 },
        })
        item.selection = { total: selected.total, rows: selected.rows.length,
          sameIdentity: selected.rows.length === 1 && selected.readFieldAccess(selected.rows[0], 'rowid') === 'visible'
            && selected.rows[0].rowid === row.rowid }
      }
      if (row && context.readFieldAccess(row, 'rowid') === 'visible' && typeof row.rowid === 'string'
        && !['dict', 'json'].includes(kind)) {
        const names = ['rowid', 'tblid', 'enname', 'cnname', 'DataType', 'description', 'IsPKey']
        item.fields = shape(await api.dataSpace.runtime.query({ scenarioId, metaName: 'Base_TblField' }, {
          fields: names, filter: DataViewFilter.condition({ field: 'tblid', operator: 'eq', value: row.rowid }),
          page: { index: 1, size: 3 },
        }), names)
        if (['interface', 'logicView'].includes(kind)) {
          const params = ['rowid', 'pid', 'parname', 'pardesc', 'parzdtype']
          item.params = shape(await api.dataSpace.runtime.query({ scenarioId, metaName: '_Base_ParamList' }, {
            fields: params, filter: DataViewFilter.condition({ field: 'pid', operator: 'eq', value: row.rowid }),
            page: { index: 1, size: 3 },
          }), params)
        }
      }
    } catch (error) {
      item.failed = true
      item.errorType = error?.name ?? 'Error'
      item.errorCode = typeof error?.code === 'number' ? error.code : null
    }
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.errorType = error?.name ?? 'Error'
  report.errorCode = typeof error?.code === 'number' ? error.code : null
  if (report.stage === 'application') report.errorMessage = String(error?.message ?? '')
    .replace(/Bearer\s+\S+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 240)
}
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(JSON.stringify({ stage: report.stage, failed: report.failed ?? false,
  sources: report.sources.map(item => ({ kind: item.kind, total: item.list?.total, failed: item.failed ?? false })) }))
