import {execFileSync} from 'node:child_process'
import {readFile, writeFile} from 'node:fs/promises'
import {createServer} from 'vite'

const origin = 'http://127.0.0.1:5273'
const tenant = 'NewApp', app = 'D99A1DCE9894698799101EFD70F8FC76'
const dictionaryId = '327D74EC0ABC4196AA75C56D944B8201'
const agentId = '2114051153246425088'
const prefix = 'node_modules/.cache/metadata-integration-20261024/g2b-native-generation-live'
const marker = 'notes/evidence/metadata-integration-20261025/ai-entry-native-generation-attempt.json'
const values = new Map()
const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)}
globalThis.window = {sessionStorage: storage, location: {pathname: '/'}}
globalThis.sessionStorage = storage
globalThis.localStorage = storage
const sourceEnv = await readFile('.env.local', 'utf8')
const gateway = sourceEnv.split(/\r?\n/).find(line => line.startsWith('LOWCODE_GATEWAY_URL='))
if (!gateway) throw new Error('GATEWAY_MISSING')
process.env.LOWCODE_GATEWAY_URL = gateway.slice('LOWCODE_GATEWAY_URL='.length).replace(/^['"]|['"]$/g, '')
const server = await createServer({root: process.cwd(), mode: 'development', server: {middlewareMode: true}, appType: 'custom'})
let dataSet, session
const requests = [], observations = []
let createCount = 0
const proof = {kind: 'native-SPARK-data-generation-no-business-write', tenant, app, dictionaryId, agentId,
  createdAt: new Date().toISOString(), requests, observations, businessWrites: 0, candidateConfirmed: false, state: 'preparing'}
async function record() {await writeFile(`${prefix}.json`, JSON.stringify(proof, null, 2) + '\n')}
try {
  const {lowcodeApi, lowcodeHttp} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {LowcodeDictionary} = await server.ssrLoadModule('/src/lowcode/resources/dictionary/lowcode-dictionary.ts')
  const {AiTurnResource, AiDataEntrySession, DictionaryWorkspace} = await server.ssrLoadModule('/packages/spark-lowcode-api/src/index.ts')
  lowcodeHttp.interceptors.request.use({name: 'native-ai-entry-generation-boundary', onRequest: config => {
    const url = new URL(config.url, origin), method = String(config.method ?? 'GET').toUpperCase()
    const creating = method === 'POST' && url.pathname === '/api/ai/v1/turns'
    const allowed = method === 'POST' && ['/api/LoginAuthority/UserLoginByEnt', '/api/DataOperation/GetData'].includes(url.pathname)
      || method === 'GET' && (url.pathname === '/api/ai/v1/agents' || /^\/api\/ai\/v1\/turns\/[^/]+$/.test(url.pathname))
      || creating
    if (!allowed || url.origin !== origin || config.baseURL && new URL(config.baseURL, origin).origin !== origin) throw new Error('REQUEST_BLOCKED')
    if (creating && ++createCount > 1) throw new Error('DUPLICATE_AI_CREATE_BLOCKED')
    const item = {method, path: url.pathname}
    if (creating) item.data = config.data
    requests.push(item)
    return {...config, baseURL: config.baseURL || origin}
  }})
  const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
  const login = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8', windowsHide: true}))
  if (login.TenantName !== tenant) throw new Error('TENANT_MISMATCH')
  await lowcodeApi.platform.login({enterpriseName: tenant, account: login.UserName, password: login.Password})
  await lowcodeApi.platform.activateApplication(app)
  dataSet = (await LowcodeDictionary.loadEditor()).dataSet
  const workspace = new DictionaryWorkspace({dataSet, dictionaryId})
  await workspace.load()
  const scope = lowcodeApi.readRequestScope()
  const guard = () => {if (scope.token !== lowcodeApi.readRequestScope().token) throw new Error('SCOPE_CHANGED')}
  const turns = new AiTurnResource({dataSet, http: lowcodeHttp, guard})
  session = new AiDataEntrySession({dataSet, targetView: workspace.entries, turnResource: turns, agentId})
  proof.initialRowIds = workspace.entries.rows.map(row => row.rowid)
  proof.columns = workspace.entries.columns.map(column => ({name: column.name, type: column.type, allowAIAdd: column.allowAIAdd, isPrimaryKey: column.isPrimaryKey}))
  session.input.updateEditingValue('input', 'businessPrompt', '生成两条仅供预览的样例：编码 G2B_20261025_X 和 G2B_20261025_Y，显示文本分别为通用录入预览X、通用录入预览Y；排序分别为101、102。其它可选字段不填写。')
  if (!session.canStart) throw new Error('NATIVE_SESSION_CANNOT_START')
  await writeFile(marker, JSON.stringify({state: 'prepared-no-repost', createdAt: new Date().toISOString(), dictionaryId, agentId}, null, 2), {flag: 'wx'})
  proof.state = 'starting'
  await record()
  await session.start()
  proof.turnId = session.turnId
  proof.state = 'polling'
  await record()
  for (let index = 0; index < 60; index++) {
    await session.refresh()
    observations.push({at: new Date().toISOString(), status: session.status, pending: session.pending,
      blocksWorkspace: session.blocksWorkspace, candidateCount: session.candidates.rows.length, canConfirm: session.canConfirm})
    await record()
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(session.status)) break
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  if (session.status !== 'COMPLETED') throw new Error(`GENERATION_NOT_COMPLETED:${session.status}`)
  proof.candidates = session.candidates.readSnapshot().rows
  proof.canConfirm = session.canConfirm
  proof.confirmationError = session.confirmationError
  if (!session.canConfirm || session.candidates.rows.length !== 2) throw new Error('EXPECTED_TWO_VALID_CANDIDATES')
  if (workspace.pending) throw new Error('BUSINESS_DRAFT_UNEXPECTED')
  await session.discard()
  proof.afterDiscard = {pending: session.pending, count: session.candidates.rows.length, total: session.candidates.total,
    businessPending: workspace.pending, rowIds: workspace.entries.rows.map(row => row.rowid)}
  session.dispose()
  session = undefined
  proof.state = 'passed'
  await record()
  console.log(JSON.stringify({state: proof.state, turnId: proof.turnId, candidateCount: proof.candidates.length, businessWrites: 0}))
} catch (error) {
  proof.state = 'blocked'
  proof.error = {name: error.name, message: String(error.message).slice(0, 300)}
  proof.pending = session?.pending ?? false
  proof.turnId = session?.turnId ?? proof.turnId
  await record()
  console.log(JSON.stringify({state: proof.state, error: proof.error, pending: proof.pending, turnId: proof.turnId}))
  process.exitCode = 1
} finally {
  if (session?.pending) {
    console.log('PRESERVED_PENDING_DATAVIEW_OWNER_DO_NOT_REPOST_OR_TERMINATE')
    await new Promise(() => setInterval(() => {}, 60000))
  }
  dataSet?.destroy()
  await server.close()
}
