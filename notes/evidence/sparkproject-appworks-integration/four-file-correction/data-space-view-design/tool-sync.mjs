import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath, pathToFileURL} from 'node:url'

for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = () => {}

const mode = process.argv[2]
if (!['inspect', 'sync'].includes(mode)) throw new Error('Usage: node tool-sync.mjs <inspect|sync>')
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const toolId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const fileNames = ['rule.json', 'script.js', 'style.css']
const localFolder = 'config/pages/data-platform/data-space-design'
const folder = path.dirname(fileURLToPath(import.meta.url))
const backupFolder = path.join(folder, 'tool-remote')
const manifestPath = path.join(folder, 'tool-sync-manifest.json')
const reportPath = path.join(folder, 'tool-sync-result.json')
const entries = fileNames.map(fileName => ({fileName, customPath: `${appId}/${toolId}`,
  local: path.join(localFolder, fileName), backup: path.join(backupFolder, `${fileName}.before`)}))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const load = file => import(pathToFileURL(path.resolve(file)).href)
const report = {at: new Date().toISOString(), mode, appId, toolId, files: fileNames, stage: 'initialize', outcomes: []}

try {
  fs.mkdirSync(backupFolder, {recursive: true})
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  const {LowcodeApi} = await load('packages/spark-lowcode-api/src/lowcode-api.ts')
  const {LowcodeDesignFileUpload} = await load('packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts')
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
  if (enterprises.length !== 1) throw new Error('Enterprise identity is not unique')
  auth.enterpriseName = enterprises[0].shortName
  await api.platform.login(auth)
  auth.password = ''
  await api.platform.activateApplication(appId)

  const read = entry => api.design.readFileBytes({appType: 'designfile', customPath: entry.customPath, fileName: entry.fileName})
  if (mode === 'inspect') {
    if (fs.existsSync(manifestPath)) throw new Error('Existing inspect manifest found; refusing to replace retained baseline')
    const manifest = []
    for (const entry of entries) {
      report.stage = `inspect:${entry.fileName}`
      const remote = new Uint8Array(await read(entry))
      const local = fs.readFileSync(entry.local)
      fs.writeFileSync(entry.backup, remote, {flag: 'wx'})
      manifest.push({...entry, remoteSha256: digest(remote), localSha256: digest(local),
        remoteBytes: remote.byteLength, localBytes: local.byteLength})
      report.outcomes.push({fileName: entry.fileName, remoteSha256: digest(remote), localSha256: digest(local),
        remoteBytes: remote.byteLength, localBytes: local.byteLength, changed: digest(remote) !== digest(local)})
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'})
  } else {
    if (!fs.existsSync(manifestPath)) throw new Error('Run inspect first; no retained remote baseline')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const uploader = new LowcodeDesignFileUpload({http, readScope: () => api.readRequestScope()})
    for (const entry of entries) {
      report.stage = `compare:${entry.fileName}`
      const saved = manifest.find(item => item.fileName === entry.fileName && item.customPath === entry.customPath)
      if (!saved) throw new Error(`Missing baseline entry: ${entry.fileName}`)
      const local = fs.readFileSync(entry.local)
      const backup = new Uint8Array(fs.readFileSync(entry.backup))
      if (digest(local) !== saved.localSha256 || digest(backup) !== saved.remoteSha256) {
        throw new Error(`Local candidate or retained remote backup changed: ${entry.fileName}`)
      }
      const remote = new Uint8Array(await read(entry))
      if (digest(remote) === saved.localSha256) {
        report.outcomes.push({fileName: entry.fileName, status: 'already-matches', sha256: saved.localSha256})
        continue
      }
      if (digest(remote) !== saved.remoteSha256) throw new Error(`Remote changed since inspect: ${entry.fileName}`)
      report.stage = `upload:${entry.fileName}`
      const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(local)
      await uploader.uploadWorkingText({customPath: entry.customPath, fileName: entry.fileName, text})
      const finalBytes = new Uint8Array(await read(entry))
      if (digest(finalBytes) !== saved.localSha256) throw new Error(`Remote byte readback mismatch: ${entry.fileName}`)
      report.outcomes.push({fileName: entry.fileName, status: 'uploaded-and-byte-verified', sha256: saved.localSha256})
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    }
  }
  report.stage = 'complete'
} catch (error) {
  report.failed = true
  report.error = {name: error?.name ?? 'Error', code: typeof error?.code === 'number' ? error.code : null,
    message: String(error?.message ?? '').replace(/Bearer\s+\S+/gi, '[redacted]')
      .replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 220)}
  process.exitCode = 1
} finally {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(JSON.stringify({stage: report.stage, failed: Boolean(report.failed), reportPath}))
}
