import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataSet } from '@spark-appworks/spark-data'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import appConfig from '../../../../config/pages/application/project-blueprint/pagedata.json'
import { createPageFileResourceView } from '../../../../src/services/project/page-tool-file-dataview'
import * as runtime from '../../../../src/platform-adapters/lowcode-runtime'

const { hasLowcodeSession, lowcodeApi, readLowcodePrincipal } = runtime

describe('lowcode session guard', () => {
  beforeEach(() => {
    lowcodeApi.application.clear()
    lowcodeApi.session.clear()
  })

  it('returns false when the persisted session is absent', () => {
    expect(hasLowcodeSession()).toBe(false)
  })

  it('returns false when the persisted session is malformed', () => {
    localStorage.setItem('spark_lowcode_session', '{malformed')
    expect(hasLowcodeSession()).toBe(false)
  })

  it('returns true only for a complete lowcode token and identity session', () => {
    lowcodeApi.session.save({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1', account: 'demo', displayName: 'Demo', enterpriseId: 'E1',
        enterpriseShortName: 'ENT', role: 'USER', raw: {},
      },
      enterprise: {
        id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {},
      },
    })
    expect(hasLowcodeSession()).toBe(true)
  })

  it('exposes the login identity without a frontend role model', () => {
    lowcodeApi.session.save({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1', account: 'demo', displayName: 'Demo', enterpriseId: 'E1',
        enterpriseShortName: 'ENT', role: 'SUPER_ADMIN', raw: {},
      },
      enterprise: {
        id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {},
      },
    })
    const principal = readLowcodePrincipal()
    expect(principal).toEqual({
      userId: 'U1', username: 'demo', displayName: 'Demo', enterpriseName: 'ENT', applicationId: null,
    })
    expect(Object.keys(runtime)).not.toContain('isLowcodePlatformAdministrator')
  })

  it('keeps role fields out of app and shell user contracts', () => {
    const root = resolve(__dirname, '../../../..')
    for (const file of ['src/platform-adapters/lowcode-runtime.ts', 'src/main.ts', 'packages/spark-app/src/types.ts',
      'packages/spark-app/src/app/bootstrap.ts']) {
      const source = readFileSync(resolve(root, file), 'utf8')
      expect(source, file).not.toMatch(/\broles\b|SUPER_ADMIN/)
    }
  })
})

const transport = vi.hoisted(() => vi.fn<(config: RequestConfig) => Promise<HttpResponse<unknown>>>())
vi.mock('@spark-appworks/spark-utils', async importOriginal => {
  const original = await importOriginal<typeof import('@spark-appworks/spark-utils')>()
  class FixtureRequest extends original.Request {
    protected override executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
      return transport(config)
    }
  }
  return { ...original, createRequest: (defaults?: Partial<RequestConfig>) => new FixtureRequest(defaults) }
})

function sessionFixture() {
  return {
    accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {
      userId: 'U1', account: 'fixture', displayName: 'Fixture', enterpriseId: 'E1',
      enterpriseShortName: 'ENT', role: null, raw: {},
    },
    enterprise: { id: 'E1', name: 'Enterprise', code: 'enterprise', shortName: 'ENT', shortCode: 'ent', raw: {} },
  }
}

function selectApplicationFixture(id: string): void {
  lowcodeApi.application.save({
    application: { id, code: id, name: id, description: '', enterpriseId: 'E1', enterpriseShortName: 'ENT', isDefault: false },
    navigationRootId: 'ROOT',
  })
}

function deferredFixture<T>() {
  let resolveValue: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolve => { resolveValue = resolve })
  return { promise, resolve: resolveValue }
}

function pauseTransport() {
  let resolveStarted: (config: RequestConfig) => void = () => undefined
  let settleResponse: ((result: HttpResponse<unknown>) => void) | undefined
  let rejectResponse: ((error: Error) => void) | undefined
  const started = new Promise<RequestConfig>(resolve => { resolveStarted = resolve })
  transport.mockImplementationOnce(config => new Promise((resolve, reject) => {
    resolveStarted(config)
    settleResponse = resolve
    rejectResponse = reject
  }))
  return {
    started,
    respond(data: unknown) {
      settleResponse?.({status: 200, statusText: 'OK', headers: {}, data})
    },
    unauthorized(config: RequestConfig) {
      const wireConfig = { url: config.url, method: config.method, headers: config.headers }
      rejectResponse?.(Object.assign(new Error('fixture unauthorized'), {
        isAxiosError: true,
        config: wireConfig,
        response: { status: 401, data: { Code: 401, Message: 'fixture unauthorized', Result: null } },
      }))
    },
    refreshed() {
      settleResponse?.({
        status: 200, statusText: 'OK', headers: {},
        data: { Code: 200, Result: {
          token: 'renewed-access', refreshToken: 'renewed-refresh',
          expire: Date.now() + 60_000, refreshExpire: Date.now() + 120_000,
        } },
      })
    },
  }
}

describe('actual host request ownership', () => {
  beforeEach(() => {
    transport.mockReset()
    transport.mockRejectedValue(new Error('unexpected offline transport request'))
    lowcodeApi.session.clear()
    lowcodeApi.application.clear()
  })

  it.each(['current', 'new-login', 'renewed', 'new-app', 'public', 'logout', 'current-logout', 'refresh', 'current-refresh'] as const)('settles unauthorized response for %s',async mode=>{
    const session = sessionFixture()
    lowcodeApi.session.save(session)
    selectApplicationFixture('APP-A')
    const wire = pauseTransport()
    const task = mode === 'logout' || mode === 'current-logout'
      ? lowcodeApi.platform.logout()
      : mode === 'refresh' || mode === 'current-refresh'
        ? lowcodeApi.platform.refreshSession()
        : runtime.lowcodeHttp.get('/api/fixture', undefined, mode === 'public'
          ? { meta: { lowcodeSkipAuth: true } }
          : { headers: lowcodeApi.readRequestScope().headers })
    const settled = task.then(() => null, (error: unknown) => error)
    const config = await wire.started
    if (mode === 'new-login' || mode === 'logout' || mode === 'refresh') {
      lowcodeApi.session.save({ ...sessionFixture(), accessToken: 'another-login' })
    }
    if (mode === 'renewed') lowcodeApi.session.save({ ...session, accessToken: 'renewed-access' })
    if (mode === 'new-app') selectApplicationFixture('APP-B')
    const current = lowcodeApi.session.get()
    const application = lowcodeApi.application.get()
    wire.unauthorized(config)
    expect(await settled).toMatchObject({ message: 'fixture unauthorized' })
    const mustClear = mode === 'current' || mode === 'current-logout' || mode === 'current-refresh'
    expect(lowcodeApi.session.get()).toBe(mustClear ? null : current)
    expect(lowcodeApi.application.get()).toEqual(mustClear ? null : application)
    expect(transport).toHaveBeenCalledOnce()
  })

  it.each(['current', 'new-app', 'catalog'] as const)('checks execution scope after renewal: %s', async mode => {
    const session = sessionFixture()
    lowcodeApi.session.save({ ...session, accessExpiresAt: 0 })
    selectApplicationFixture('APP-A')
    const wire = pauseTransport()
    transport.mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, data: 'file' })
    const read = runtime.lowcodeHttp.get('/api/fixture', undefined, { headers: lowcodeApi.readRequestScope().headers })
    const settled = read.then(value => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }))
    expect(await wire.started).toMatchObject({ url: '/api/LoginAuthority/refresh' })
    if (mode === 'new-app') selectApplicationFixture('APP-B')
    if (mode === 'catalog') lowcodeApi.application.clear()
    wire.refreshed()
    expect(await settled).toMatchObject(mode === 'current' ? { ok: true, value: 'file' } : { ok: false })
    expect(transport).toHaveBeenCalledTimes(mode === 'current' ? 2 : 1)
    if (mode === 'current') {
      expect(transport).toHaveBeenNthCalledWith(2, expect.objectContaining({
        url: '/api/fixture',
        headers: expect.objectContaining({ Authorization: 'Bearer renewed-access', 'X-AppId': 'APP-A' }),
      }))
    }
  })
})

describe('ProjectToolFile saves through the host transport', () => {
  beforeEach(() => {
    transport.mockReset()
    lowcodeApi.session.clear()
    lowcodeApi.application.clear()
  })

  it.each(['before-dispatch', 'after-dispatch'] as const)('preserves the original draft and upload outcome: %s', async stage => {
    const session = sessionFixture()
    lowcodeApi.session.save(session)
    selectApplicationFixture('APP-A')
    const token = lowcodeApi.readRequestScope().token
    const assertCurrent = () => {
      if (lowcodeApi.readRequestScope().token !== token) throw new Error('fixture scope changed')
    }
    let fileText = 'baseline'
    let uploads = 0
    let saving = false
    const response = (data: unknown): HttpResponse<unknown> => ({ data, status: 200, statusText: 'OK', headers: {} })
    transport.mockImplementation(async ({ url }) => {
      switch (url) {
        case '/api/File/lastModifiedTime':
          if (saving && stage === 'before-dispatch') lowcodeApi.session.save({ ...session, accessExpiresAt: 0 })
          return response({ Code: 200, Result: uploads === 0 ? '2026-11-25 09:00:00 000' : '2026-11-25 09:00:01 000' })
        case '/api/File/content/text':
          return response({ Code: 200, Result: fileText })
        case '/api/LoginAuthority/refresh':
          return response({ Code: 503, Message: 'fixture renewal unavailable', Result: null })
        case '/api/File/v2/UploadFile':
          uploads += 1
          fileText = 'edited'
          throw new Error('fixture upload acknowledgment lost')
        default:
          throw new Error(`unexpected offline request ${url}`)
      }
    })
    const dataSet = DataSet.fromJson({
      scenarioId: appConfig.scenarioId, tables: { ProjectToolFile: appConfig.tables.ProjectToolFile },
    })
    const target = { dataSet, appId: 'APP-A', pageId: `page-${stage}`, fileName: 'script.js' as const, assertCurrent }
    try {
      const view = createPageFileResourceView(target)
      await view.refresh()
      const [row] = view.rows
      if (row === undefined) throw new Error('fixture file missing')
      const id = view.getPkKey(row)
      if (id === undefined) throw new Error('fixture file identity missing')
      await view.editRowById(id, { text: 'edited' })
      transport.mockClear()
      saving = true
      const save = { views: [{ tableName: 'ProjectToolFile', viewId: view.viewId, ids: [id] }] }
      await expect(dataSet.saveChanges(save)).rejects.toThrow(stage === 'before-dispatch'
        ? 'fixture renewal unavailable'
        : 'fixture upload acknowledgment lost')

      if (stage === 'before-dispatch') {
        expect(transport.mock.calls.map(([config]) => config.url)).toEqual(['/api/File/lastModifiedTime', '/api/LoginAuthority/refresh'])
        expect(uploads).toBe(0)
        expect(dataSet.saveJournal.views).toMatchObject([{ state: 'not-applied', ids: [id] }])
        expect(view.hasUnconfirmedSave).toBe(false)
        expect(view.dirtyTracking.hasPendingChanges(id)).toBe(true)
        await view.editRowById(id, { text: 'another draft' })
        view.discardPendingChanges([id])
        expect(view.rows[0]?.['text']).toBe('baseline')
      } else {
        expect(transport.mock.calls.map(([config]) => config.url)).toEqual(['/api/File/lastModifiedTime', '/api/File/v2/UploadFile'])
        expect(view.hasUnconfirmedSave).toBe(true)
        expect(dataSet.saveJournal.views).toMatchObject([{ state: 'unknown', ids: [id] }])
        expect(await dataSet.verifySaveJournal()).toMatchObject({ completed: true, views: [{ state: 'applied', ids: [id] }] })
        expect(view.hasUnconfirmedSave).toBe(false)
        expect(view.rows[0]?.['text']).toBe('edited')
        expect(uploads).toBe(1)
      }
    } finally {
      dataSet.destroy()
    }
  })
})

it('rejects an old application request when another renewal consumer enters the catalog before transport', async () => {
  transport.mockReset()
  lowcodeApi.session.clear()
  lowcodeApi.application.clear()
  lowcodeApi.session.save({ ...sessionFixture(), accessExpiresAt: 0 })
  selectApplicationFixture('APP-A')
  const wire = pauseTransport()
  transport.mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, data: 'too late' })
  const reading = runtime.lowcodeHttp.get('/api/fixture', undefined, { headers: lowcodeApi.readRequestScope().headers })
  const readState = reading.then(value => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }))
  expect(await wire.started).toMatchObject({ url: '/api/LoginAuthority/refresh' })
  const followingRenewal = lowcodeApi.platform.refreshSession().then(() => {
    runtime.enterLowcodeApplicationCatalog()
  })
  wire.refreshed()
  await followingRenewal
  expect(await readState).toMatchObject({ ok: false })
  expect(transport).toHaveBeenCalledOnce()
})

it('lets an explicit renewal finish when only the selected application changes before transport', async () => {
  transport.mockReset()
  lowcodeApi.session.clear()
  lowcodeApi.application.clear()
  lowcodeApi.session.save(sessionFixture())
  selectApplicationFixture('APP-A')
  const wire = pauseTransport()
  const renewal = lowcodeApi.platform.refreshSession()
  selectApplicationFixture('APP-B')
  expect(await wire.started).toMatchObject({ url: '/api/LoginAuthority/refresh' })
  wire.refreshed()
  await expect(renewal).resolves.toMatchObject({ accessToken: 'renewed-access' })
  expect(lowcodeApi.application.get()?.application.id).toBe('APP-B')
  expect(transport).toHaveBeenCalledOnce()
})
