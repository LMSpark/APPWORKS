import {describe, expect, it} from 'vitest'
// @ts-expect-error -- workflow smoke .mjs helper
import {parseGetDataResponse} from '../../../tools/workflow/get-data-page.mjs'

describe('workflow get-data-page', () => {
  it('parses Result.data Items and Count', () => {
    const page = parseGetDataResponse({
      Code: 200,
      Message: 'ok',
      Result: {
        data: {
          Count: 2,
          Items: [{rowid: 'A', Name: 'Orders'}, {rowid: 'B', Name: 'Lines'}],
        },
      },
    })
    expect(page.count).toBe(2)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({Name: 'Orders'})
  })

  it('falls back to legacy Result.Items', () => {
    const page = parseGetDataResponse({
      Code: 200,
      Result: {Items: [{rowid: '1'}], Count: 1},
    })
    expect(page.items).toHaveLength(1)
    expect(page.count).toBe(1)
  })

  it('throws on non-200 Code', () => {
    expect(() => parseGetDataResponse({Code: 500, Message: 'fail'})).toThrow('fail')
  })
})