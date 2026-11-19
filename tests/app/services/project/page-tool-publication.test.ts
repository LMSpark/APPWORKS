import {afterEach, describe, expect, it, vi} from 'vitest'
import {withPageToolPublication} from '@/services/project/page-tool-publication'

const owner = ['enterprise', 'tenant', 'actor', 'app', 'node']
const call = 'a'.repeat(64), digest = 'b'.repeat(64)

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
})

describe('browser publication recovery', () => {
  it('refuses a node held by another tab without opening its journal', async () => {
    const run = vi.fn(async () => {})
    const request = vi.fn(async (_name: string, _options: LockOptions, enter: LockGrantedCallback<void>) => enter(null))
    vi.stubGlobal('navigator', {locks: {request}})
    await expect(withPageToolPublication(owner, run)).rejects.toThrow('另一标签页')
    expect(request).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('keeps the original actor’s pending pointer isolated across workspace instances', async () => {
    const request = vi.fn(async (name: string, _options: LockOptions, enter: LockGrantedCallback<void>) => enter({name, mode: 'exclusive'}))
    vi.stubGlobal('navigator', {locks: {request}})
    await withPageToolPublication(owner, async journal => {
      const intent = journal.open(call, digest, '')
      intent.snapshots = {'rule.json': {state:'confirmed',version:1}, 'script.js': {state:'confirmed',version:2}, 'style.css': {state:'confirmed',version:3}}
      intent.pointer = {state:'pending', value:'rule=1;script=2;style=3'}
      journal.write(intent)
    })
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
    await withPageToolPublication(['enterprise','tenant','other','app','node'], async journal => {
      expect(journal.confirmedPointer(call)).toBeUndefined()
    })
    await expect(withPageToolPublication(owner, async journal => { journal.confirmedPointer(call) })).rejects.toThrow('尚无权威回执')
    expect(request).toHaveBeenCalledTimes(3)
  })
})
