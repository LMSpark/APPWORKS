import {afterEach, describe, expect, it, vi} from 'vitest'
import {ScenarioViewWriteNotAppliedError} from '@spark-appworks/spark-project-model'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {readRepositoryScenarioFromHost, writeRepositoryScenarioToHost} from '@/lowcode/resources/shared/repository-scenarios/repository-scenario-host-client'

const resource = resolveBuiltinScenarioResource('8D1AB14DD8277F3E7017CD38F77B09FD')!

describe('repository scenario host response contract', () => {
  it('creates a typed not-applied error only for a matching resource response', async () => {
    stubResponse({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT', message: 'changed'}, 409)
    await expect(writeRepositoryScenarioToHost(resource, 'next', 'before'))
      .rejects.toMatchObject({name: 'ScenarioViewWriteNotAppliedError', resourceId: resource.resourceId})
  })

  it.each([
    {resourceId: null, outcome: 'not-applied', code: 'CONFLICT', message: 'rejected'},
    {resourceId: 'other-resource', outcome: 'not-applied', code: 'CONFLICT', message: 'rejected'},
    {resourceId: resource.resourceId, outcome: 'unknown', code: 'CONFLICT', message: 'rejected'},
    {resourceId: resource.resourceId, outcome: 'not-applied', message: 'missing code'},
  ])('keeps malformed, unknown or mismatched write errors unknown: %j', async payload => {
    stubResponse(payload, 409)
    await expect(writeRepositoryScenarioToHost(resource, 'next', 'before'))
      .rejects.not.toBeInstanceOf(ScenarioViewWriteNotAppliedError)
  })

  it('never converts a read error into a not-applied write result', async () => {
    stubResponse({resourceId: resource.resourceId, outcome: 'not-applied', code: 'CONFLICT', message: 'changed'}, 409)
    await expect(readRepositoryScenarioFromHost(resource)).rejects.toThrow('READ_FAILED')
  })

  it('rejects a successful response whose text or source revision does not match', async () => {
    stubResponse({resourceId: resource.resourceId, scenarioId: resource.scenarioId,
      text: 'different', sourceRevision: '0'.repeat(64)}, 200)
    await expect(writeRepositoryScenarioToHost(resource, 'next', 'before')).rejects.toThrow('WRITE_UNKNOWN')
  })

  it.each(['read', 'write'] as const)('aborts a stalled %s request after the deadline without retrying or classifying timeout as not-applied', async operation => {
    vi.useFakeTimers()
    const host = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('request aborted', 'AbortError')), {once: true})
    }))
    vi.stubGlobal('fetch', host)
    const pending = operation === 'read'
      ? readRepositoryScenarioFromHost(resource)
      : writeRepositoryScenarioToHost(resource, 'next', 'before')
    const assertion = expect(pending).rejects.not.toBeInstanceOf(ScenarioViewWriteNotAppliedError)

    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(host).toHaveBeenCalledOnce()
    expect(host.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals()})

function stubResponse(payload: unknown, status: number): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
    status, headers: {'Content-Type': 'application/json'},
  })))
}
