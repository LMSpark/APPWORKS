import {describe, expect, it} from 'vitest'
import {readCanAutoSubmitAfter} from '@/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-auto-submit'

describe('readCanAutoSubmitAfter', () => {
  it('reads boolean and common payload shapes', () => {
    expect(readCanAutoSubmitAfter(true)).toBe(true)
    expect(readCanAutoSubmitAfter({canAutoSubmit: true})).toBe(true)
    expect(readCanAutoSubmitAfter({CanAutoSubmit: false})).toBe(false)
    expect(readCanAutoSubmitAfter('1')).toBe(true)
  })
})