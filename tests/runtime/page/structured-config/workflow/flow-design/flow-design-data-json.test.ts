import {describe, expect, it, vi} from 'vitest'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {readDesignJsonFromModelRow, readFlowDesignDataJsonText} from '@/lowcode/resources/system/workflow/manage'

describe('readFlowDesignDataJsonText', () => {
  it('prefers platform file content when present', async () => {
    const readTextFile = vi.fn(async () => '{"nodes":[],"edges":[]}')
    const text = await readFlowDesignDataJsonText({flowId: 'FM-1', modelRow: {DesignJson: '{"nodes":[]}'}, api: {readTextFile}})
    expect(text).toBe('{"nodes":[],"edges":[]}')
    expect(readTextFile).toHaveBeenCalledWith({appType: 'designfile', customPath: 'SysForm', fileName: 'FM-1EJ2.json'})
  })

  it('falls back to model row when platform file is missing', async () => {
    const readTextFile = vi.fn(async () => { throw new LowcodeApiError(404, 'not found') })
    const text = await readFlowDesignDataJsonText({flowId: 'FM-2', modelRow: {DESIGNJSON: '{"edges":[]}'}, api: {readTextFile}})
    expect(text).toBe('{"edges":[]}')
  })

  it.each([new LowcodeApiError(403, 'denied'), new Error('network lost')])('propagates a file failure instead of using old model text: %s', async failure => {
    const readTextFile = vi.fn(async () => {throw failure})
    await expect(readFlowDesignDataJsonText({flowId: 'FM-1', modelRow: {DesignJson: 'old'}, api: {readTextFile}})).rejects.toBe(failure)
  })

  it.each(['before', 'success', 'missing'])('keeps the original request guard through %s', async phase => {
    let current = phase !== 'before'
    const readTextFile = vi.fn(async () => {current = false; if (phase === 'missing') throw new LowcodeApiError(404, 'missing'); return 'new'})
    await expect(readFlowDesignDataJsonText({flowId: 'FM-1', modelRow: {DesignJson: 'old'}, api: {readTextFile}, assertCurrent: () => {if (!current) throw Error('original request expired')}})).rejects.toThrow('original request expired')
    expect(readTextFile).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1)
  })

  it('rejects a missing file target before reading or accepting fallback text', async () => {
    const readTextFile = vi.fn(async () => 'file')
    await expect(readFlowDesignDataJsonText({flowId: ' ', modelRow: {DesignJson: 'old'}, api: {readTextFile}})).rejects.toThrow(/flowId/)
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('falls back when platform file is empty', async () => {
    const readTextFile = vi.fn(async () => '   ')
    const text = await readFlowDesignDataJsonText({flowId: 'FM-3', modelRow: {designJson: 'from-row'}, api: {readTextFile}})
    expect(text).toBe('from-row')
  })
})

describe('readDesignJsonFromModelRow', () => {
  it('reads known design json field aliases', () => {
    expect(readDesignJsonFromModelRow({DesignJSON: 'alias'})).toBe('alias')
    expect(readDesignJsonFromModelRow({other: 'x'})).toBe('')
  })
})