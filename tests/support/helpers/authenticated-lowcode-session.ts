import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {vi} from 'vitest'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'

const priorSession = lowcodeApi.session.get()
const priorApplication = lowcodeApi.application.get()

/** Install a valid, role-neutral login identity for tests that construct real lowcode hosts. */
export function installAuthenticatedLowcodeTestSession(): void {
  lowcodeApi.session.save({accessToken: 'test-access-token', refreshToken: 'test-refresh-token',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {userId: 'test-user', account: 'test', displayName: 'Test User', enterpriseId: 'test-enterprise',
      enterpriseShortName: 'Test Enterprise', role: null, raw: {}},
    enterprise: {id: 'test-enterprise', name: 'Test Enterprise', code: 'TEST', shortName: 'Test Enterprise', shortCode: 'TEST', raw: {}},
  })
  lowcodeApi.application.save({application: {id: 'test-app', name: 'Test App'}, navigationRootId: 'test-root'})
}

/** Serve registered repository scenarios when Node's fetch receives the browser-relative host URL. */
export function installRepositoryScenarioTestFetch(): void {
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost')
    if (url.pathname !== '/__spark/repository-scenarios' || (init?.method ?? 'GET') !== 'GET') {
      return originalFetch(input, init)
    }
    const resourceId = url.searchParams.get('resourceId') ?? ''
    const resource = resolveBuiltinScenarioResource(resourceId.replace('repository:scenario-view:', ''))
    if (!resource || resource.resourceId !== resourceId) return new Response(null, {status: 404})
    const text = readFileSync(resolve(process.cwd(), resource.path), 'utf8')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const sourceRevision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
    return new Response(JSON.stringify({resourceId, scenarioId: resource.scenarioId, text, sourceRevision}),
      {status: 200, headers: {'content-type': 'application/json'}})
  })
}

/** Restore the worker's prior auth state so these tests do not affect other suites. */
export function restoreLowcodeTestSession(): void {
  lowcodeApi.session.clear()
  if (priorSession) lowcodeApi.session.save(priorSession)
  lowcodeApi.application.clear()
  if (priorApplication) lowcodeApi.application.save(priorApplication)
  vi.unstubAllGlobals()
}
