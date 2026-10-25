import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFile, writeFile} from 'node:fs/promises'
import {createServer} from 'vite'
const origin = 'http://127.0.0.1:5273', tenant = 'NewApp', app = 'D99A1DCE9894698799101EFD70F8FC76'
const targetName = 'SPARK通用AI批量录入'
const promptHash = 'ecc85af5171a4300a9d2e037f582407cb67a018876ced98dfff68e5c8d7f5a09'
const values = new Map()
const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)}
globalThis.window = {sessionStorage: storage, location: {pathname: '/'}}
globalThis.sessionStorage = storage
globalThis.localStorage = storage
const sourceEnv = await readFile('D:/SPARK_AppWorks/.env.local', 'utf8')
const gateway = sourceEnv.split(/\r?\n/).find(line => line.startsWith('LOWCODE_GATEWAY_URL='))
if (!gateway) throw new Error('GATEWAY_MISSING')
process.env.LOWCODE_GATEWAY_URL = gateway.slice('LOWCODE_GATEWAY_URL='.length).replace(/^['"]|['"]$/g, '')
const server = await createServer({root: process.cwd(), mode: 'development', server: {middlewareMode: true}, appType: 'custom'})
let dataSet
const requests = [], candidates = []
try {
  const {lowcodeApi, lowcodeHttp} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {LowcodeDictionary} = await server.ssrLoadModule('/src/lowcode/resources/dictionary/lowcode-dictionary.ts')
  const {AiTurnResource, AiAgentConfigResource} = await server.ssrLoadModule('/packages/spark-lowcode-api/src/index.ts')
  lowcodeHttp.interceptors.request.use({name: 'ai-entry-formal-config-readonly', onRequest: config => {
    const url = new URL(config.url, origin), method = String(config.method ?? 'GET').toUpperCase()
    const allowed = method === 'POST' && ['/api/LoginAuthority/UserLoginByEnt', '/api/DataOperation/GetData'].includes(url.pathname)
      || method === 'GET' && ['/api/ai/v1/agents', '/api/ai-agent/get'].includes(url.pathname)
    if (!allowed || url.origin !== origin || config.baseURL && new URL(config.baseURL, origin).origin !== origin) throw new Error('REQUEST_BLOCKED')
    requests.push({method, path: url.pathname})
    return {...config, baseURL: config.baseURL || origin}
  }})
  const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
  const login = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8', windowsHide: true}))
  if (login.TenantName !== tenant) throw new Error('TENANT_MISMATCH')
  await lowcodeApi.platform.login({enterpriseName: tenant, account: login.UserName, password: login.Password})
  await lowcodeApi.platform.activateApplication(app)
  dataSet = (await LowcodeDictionary.loadEditor()).dataSet
  const scope = lowcodeApi.readRequestScope()
  const guard = () => {if (scope.token !== lowcodeApi.readRequestScope().token) throw new Error('SCOPE_CHANGED')}
  const turns = new AiTurnResource({dataSet, http: lowcodeHttp, guard})
  const configurations = new AiAgentConfigResource({dataSet, http: lowcodeHttp, guard})
  await turns.agents.refresh()
  if (turns.agents.loadingError) throw turns.agents.loadingError
  const matching = turns.agents.rows.filter(row => row.agentName === targetName)
  if (matching.length > 3) throw new Error('AMBIGUOUS_CANDIDATES_NO_BULK_CONFIG_READ')
  for (const row of matching) {
    if (typeof row.id !== 'string') throw new Error('FORMAL_ID_INVALID')
    configurations.configuration.queryContext = {agentId: row.id}
    await configurations.configuration.refresh()
    if (configurations.configuration.loadingError) throw configurations.configuration.loadingError
    const config = configurations.configuration.rows[0]
    if (config?.id !== row.id) throw new Error('FORMAL_ID_MISMATCH')
    const {agentPrompt, ...safeConfig} = config
    const actualHash = createHash('sha256').update(agentPrompt).digest('hex')
    candidates.push({...safeConfig, systemPromptSha256: actualHash, matchesExpectedPrompt: actualHash === promptHash})
  }
  const proof = {kind: 'existing-formal-configuration-readonly', createdAt: new Date().toISOString(),
    tenant, app, requests, candidates, creationOutcomeResolved: false, configurationAdopted: false,
    explanation: 'Directory and exact ID GET prove current records only; not evidence of the earlier create command result.'}
  await writeFile('node_modules/.cache/metadata-integration-20261024/g2a-existing-config-read.json', JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify({status: 'read-complete', candidates, creationOutcomeResolved: false}, null, 2))
} catch (error) {
  console.log(JSON.stringify({status: 'blocked', name: error.name, message: String(error.message).slice(0, 180)}))
  process.exitCode = 1
} finally {dataSet?.destroy(); await server.close()}
