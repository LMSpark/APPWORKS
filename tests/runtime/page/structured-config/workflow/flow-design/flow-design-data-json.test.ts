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