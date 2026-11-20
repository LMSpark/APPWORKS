import {describe, expect, it} from 'vitest'

import {LowcodeApiError} from '../core/lowcode-api-error.js'
import {LowcodeApplicationStore} from './lowcode-application-store.js'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {return this.values.get(key) ?? null}
  public setItem(key: string, value: string): void {this.values.set(key, value)}
  public removeItem(key: string): void {this.values.delete(key)}
}

const applicationKey = 'spark_lowcode_application'

describe('LowcodeApplicationStore application metadata', () => {
  it('accepts and reopens an id/name-only directory application without filling unknown metadata', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({application: {id: 'APP-2', name: 'Beta'}, navigationRootId: 'ROOT-2'})
    storage.setItem(applicationKey, raw)
    const store = new LowcodeApplicationStore({storage})

    expect(store.get()).toEqual({application: {id: 'APP-2', name: 'Beta'}, navigationRootId: 'ROOT-2'})
    expect(storage.getItem(applicationKey)).toBe(raw)
  })

  it('preserves an older complete application snapshot when it is reopened', () => {
    const storage = new MemoryStorage()
    const previous = {application: {id: 'APP-1', code: 'alpha', name: 'Alpha', description: '',
      enterpriseId: 'ENT-1', enterpriseShortName: 'Lingma', isDefault: false}, navigationRootId: 'ROOT-1'}
    storage.setItem(applicationKey, JSON.stringify(previous))

    expect(new LowcodeApplicationStore({storage}).get()).toEqual(previous)
  })

  it.each([
    ['code', null], ['code', 1],
    ['description', null], ['description', 1],
    ['enterpriseId', null], ['enterpriseId', 1],
    ['enterpriseShortName', null], ['enterpriseShortName', 1],
    ['isDefault', null], ['isDefault', 0],
  ] as const)('rejects explicitly invalid %s metadata value %s instead of treating it as absent', (field, value) => {
    const storage = new MemoryStorage()
    const store = new LowcodeApplicationStore({storage})
    const application: Record<string, unknown> = {id: 'APP-2', name: 'Beta', code: '', description: '',
      enterpriseId: '', enterpriseShortName: '', isDefault: false}
    application[field] = value
    const invalid = {application, navigationRootId: 'ROOT-2'}

    expect(() => store.save(invalid as never)).toThrow(LowcodeApiError)
    expect(storage.getItem(applicationKey)).toBeNull()
  })

  it('preserves explicit false and empty optional metadata values', () => {
    const storage = new MemoryStorage()
    const store = new LowcodeApplicationStore({storage})
    const context = {application: {id: 'APP-2', name: 'Beta', code: '', description: '',
      enterpriseId: '', enterpriseShortName: '', isDefault: false}, navigationRootId: 'ROOT-2'}

    store.save(context as never)

    expect(store.get()).toEqual(context)
  })
})
