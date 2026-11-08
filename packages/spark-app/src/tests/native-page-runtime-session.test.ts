import {afterEach, describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '../router/native-page-runtime-session'

const sessions: NativePageRuntimeSession[] = []
afterEach(() => {for (const session of sessions.splice(0)) session.dispose()})

function data(scenarioId: string): DataSet {
  return DataSet.fromJson({scenarioId, dataSetName: scenarioId, tables: {}})
}

function identity(targetId = 'T1') {
  return {pageId: 'native-editor', scenarioIds: ['META', 'LOOKUP'] as const, mainScenarioId: 'META',
    deferredScenarioIds: ['LOOKUP'] as const, targetId, scenarioInputs: {META: {formid: 'A'}}}
}

describe('native PageRuntime session host', () => {
  it('reuses one instance for the same route identity and provides it once', async () => {
    const provided: unknown[] = []
    const session = new NativePageRuntimeSession({
      provide: runtime => {provided.push(runtime)},
      remove: () => {provided.pop()},
    })
    sessions.push(session)
    const first = session.acquire({...identity(), loadScenario: async id => data(id)})
    const second = session.acquire({...identity(), loadScenario: async () => data('OTHER')})
    expect(second).toBe(first)
    expect(provided).toEqual([first])
    expect(session.isCurrent(first)).toBe(true)
    await first.load()
    expect(first.getDataSet('META')?.scenarioId).toBe('META')
    expect(first.getDataSet('LOOKUP')).toBeUndefined()
  })

  it('disposes the previous instance when the target changes so old writes stop', async () => {
    const provided: unknown[] = []
    const session = new NativePageRuntimeSession({
      provide: runtime => {provided.push(runtime)},
      remove: () => {provided.pop()},
    })
    sessions.push(session)
    const first = session.acquire({...identity('T1'), loadScenario: async id => data(id)})
    await first.load()
    const owned = first.getDataSet('META')!
    const next = session.acquire({...identity('T2'), loadScenario: async id => data(id)})
    expect(next).not.toBe(first)
    expect(first.destroyed).toBe(true)
    expect(owned.destroyed).toBe(true)
    expect(session.isCurrent(first)).toBe(false)
    expect(() => first.getDataSet('META')).toThrow('DESTROYED')
    expect(provided).toEqual([next])
    expect(session.isCurrent(next)).toBe(true)
  })

  it('destroys a late dataset after the session is released', async () => {
    let complete: (ds: DataSet) => void = () => undefined
    const pending = new Promise<DataSet>(resolve => {complete = resolve})
    const session = new NativePageRuntimeSession()
    sessions.push(session)
    const runtime = session.acquire({pageId: 'native-editor', scenarioIds: ['META'], loadScenario: async () => pending})
    const loading = runtime.load()
    const rejected = expect(loading).rejects.toThrow('DESTROYED')
    session.dispose()
    const late = data('META')
    complete(late)
    await rejected
    expect(late.destroyed).toBe(true)
    expect(session.runtime).toBeUndefined()
    expect(session.isCurrent(runtime)).toBe(false)
  })
})
