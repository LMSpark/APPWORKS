import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}
const load = file => import(pathToFileURL(path.resolve(file)).href)
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const dataSpaceId = '97DCB03F75AADEAE6B102B062DB71CEA'
const folder = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const report = {at: new Date().toISOString(), appId, dataSpaceId, stage: 'login'}
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
  const enterprises = (await api.platform.listEnterprises()).filter(item =>
    item.name === auth.enterpriseName || item.shortName === auth.enterpriseName)
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)
  report.stage = 'read-space-views'
  try {
    const locator = {appType: 'designfile', customPath: `${appId}/SysForm/${dataSpaceId}`, fileName: 'pagedata.json'}
    await api.design.readTextFile(locator)
    const bytes = await api.design.readFileBytes(locator)
    fs.writeFileSync(path.join(folder, 'space-pagedata.before'), new Uint8Array(bytes), {flag: 'wx'})
    report.existing = true
    report.sha256 = createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
    const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))
    report.scenarioId = data.scenarioId
    report.tables = Object.entries(data.tables ?? {}).map(([name, table]) => ({name, modelBinding: table.modelBinding, views: Object.keys(table.views ?? {})}))
  } catch (error) {
    if (error?.code !== 404) throw error
    report.existing = false
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = {name: error?.name ?? 'Error', message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 220)}
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(folder, 'preflight.json'), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), existing: report.existing}))
}
