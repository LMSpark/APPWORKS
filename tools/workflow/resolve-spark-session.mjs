/**
 * 在缺少 SPARK_TOKEN 时，用本机 DPAPI 凭据登录 gateway（不落盘 token）。
 * 与 notes/evidence 中 live probe 相同合同：NewApp + D99 应用。
 */
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_APP_ID = 'D99A1DCE9894698799101EFD70F8FC76'
const DEFAULT_TENANT = 'NewApp'
const DEFAULT_CLIXML = join(
  process.env.USERPROFILE ?? '',
  'AppData',
  'Local',
  'SPARK_AppWorks',
  'credentials',
  'newapp-test-admin.clixml',
)

function stripBearer(value) {
  const text = String(value ?? '').trim()
  return text.replace(/^Bearer\s+/i, '')
}

export function readLoginCredentialFromClixml(file = process.env.SPARK_CREDENTIAL_CLIXML?.trim() || DEFAULT_CLIXML) {
  if (!file || !existsSync(file)) {
    throw new Error(`credential file missing: ${file || DEFAULT_CLIXML}`)
  }
  const escaped = file.replace(/'/g, "''")
  const ps = `$x=Import-Clixml '${escaped}'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress`
  const value = JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  )
  const tenant = String(value.TenantName ?? '').trim()
  const account = String(value.UserName ?? '').trim()
  const password = String(value.Password ?? '')
  if (!tenant || !account || !password) throw new Error('credential clixml incomplete')
  return {enterpriseName: tenant, account, password}
}

function readLoginCredentialFromEnv() {
  const account = String(process.env.SPARK_LOGIN_USER ?? '').trim()
  const password = String(process.env.SPARK_LOGIN_PASSWORD ?? '')
  const enterpriseName = String(process.env.SPARK_LOGIN_ENT ?? '').trim()
  if (!account || !password || !enterpriseName) return null
  return {enterpriseName, account, password}
}

function resolveLoginCredentials() {
  const fromEnv = readLoginCredentialFromEnv()
  if (fromEnv) return {credentials: fromEnv, source: 'env-login'}
  return {credentials: readLoginCredentialFromClixml(), source: 'clixml'}
}

export async function loginSparkSession(baseUrl, credentials) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/api/LoginAuthority/UserLoginByEnt`
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      strUser: credentials.account,
      strPwd: credentials.password,
      entName: credentials.enterpriseName,
    }),
  })
  const json = await response.json()
  const result = json?.Result ?? json?.result
  const code = json?.Code ?? json?.code
  if (!response.ok || (typeof code === 'number' && code !== 200) || !result || typeof result !== 'object') {
    const message = typeof json?.Message === 'string' ? json.Message : `HTTP ${response.status}`
    throw new Error(`login failed: ${message.slice(0, 200)}`)
  }
  const token = stripBearer(result.token ?? result.Token)
  if (!token) throw new Error('login response missing token')
  return {token, tenant: credentials.enterpriseName}
}

/**
 * 注入 process.env.SPARK_TOKEN / SPARK_APP_ID（不覆盖已有值）。
 * @returns {{source: 'env'|'login', appId: string, tokenLength: number}}
 */
export async function ensureSparkEnvFromSession() {
  const baseUrl = String(process.env.SPARK_BASE_URL ?? '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('SPARK_BASE_URL missing (set LOWCODE_GATEWAY_URL in .env.local)')

  if (!process.env.SPARK_APP_ID?.trim()) {
    process.env.SPARK_APP_ID = process.env.WORKFLOW_SMOKE_APP_ID?.trim() || DEFAULT_APP_ID
  }

  if (process.env.SPARK_TOKEN?.trim()) {
    return {
      source: 'env',
      appId: process.env.SPARK_APP_ID,
      tokenLength: process.env.SPARK_TOKEN.trim().length,
    }
  }

  const {credentials, source: credSource} = resolveLoginCredentials()
  const entCandidates = [
    credentials.enterpriseName,
    '领码科技',
    process.env.SPARK_LOGIN_ENT_FALLBACK?.trim(),
    DEFAULT_TENANT,
  ].filter((name, index, all) => name && all.indexOf(name) === index)

  let lastError
  for (const enterpriseName of entCandidates) {
    try {
      const session = await loginSparkSession(baseUrl, {...credentials, enterpriseName})
      process.env.SPARK_TOKEN = session.token
      process.env.SPARK_TENANT_NAME = session.tenant
      return {
        source: credSource === 'env-login' ? 'env-login' : 'login',
        appId: process.env.SPARK_APP_ID,
        tokenLength: session.token.length,
        tenant: session.tenant,
      }
    } catch (cause) {
      lastError = cause
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}