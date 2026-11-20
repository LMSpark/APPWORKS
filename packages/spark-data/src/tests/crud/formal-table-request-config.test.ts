import {describe, expect, it} from 'vitest'
import {FormalTableRequestConfig} from '../../core/formal-table-request-config'

describe('FormalTableRequestConfig', () => {
  it('captures endpoints and JSON parameters independently from later source edits', () => {
    const input = {api: {list: {url: '/api/list', headers: {'X-Profile': 'design'},
      params: {z: [{count: 0, enabled: false}], a: null}}}, crudConfig: {timeout: 1234, retryCount: 0, validateData: true}}
    const captured = FormalTableRequestConfig.parse(input)
    input.api.list.url = '/api/changed'
    input.api.list.headers['X-Profile'] = 'changed'
    input.api.list.params.z[0]!.count = 9
    input.crudConfig.timeout = 9999
    expect(captured.endpoints).toEqual({list: {url: '/api/list', method: 'POST',
      headers: {'x-profile': 'design'}, params: {a: null, z: [{count: 0, enabled: false}]}}})
    expect(captured.timeout).toBe(1234)
  })

  it('canonicalizes equivalent endpoint maps for one-batch conflict comparison', () => {
    const first = FormalTableRequestConfig.parse({api: {update: {url: '/api/save',
      headers: {'X-B': 'b', 'x-a': 'a'}, params: {z: {b: 2, a: 1}, a: []}}}})
    const second = FormalTableRequestConfig.parse({api: {update: {params: {a: [], z: {a: 1, b: 2}},
      headers: {'X-A': 'a', 'x-b': 'b'}, method: 'POST', url: '/api/save'}}})
    expect(JSON.stringify(first.endpoints.update)).toBe(JSON.stringify(second.endpoints.update))
    expect(FormalTableRequestConfig.parse({api: {list: {url: '/api/list', headers: {}, params: {}}}}).endpoints.list)
      .toEqual({url: '/api/list', method: 'POST'})
    expect(FormalTableRequestConfig.parse().endpoints).toEqual({})
    expect(FormalTableRequestConfig.parse().timeout).toBeUndefined()
  })

  it.each([
    {api: {list: {url: 'https://outside.invalid'}}},
    {api: {list: {url: '//outside.invalid'}}},
    {api: {list: {url: '/api/{id}'}}},
    {api: {list: {url: '/api/list#fragment'}}},
    {api: {list: {url: ' /api/list'}}},
    {api: {list: {url: '/api/list', method: 'GET'}}},
    {api: {retrieve: {url: '/api/list'}}},
    {api: {list: {url: '/api/list', body: {}}}},
    {crudConfig: {timeout: 0}}, {crudConfig: {timeout: 1.5}},
    {crudConfig: {retryCount: 1}}, {crudConfig: {validateData: false}},
    {crudConfig: {transformRequest: () => ({})}},
  ])('rejects unsupported request configuration %j', input => {
    expect(() => FormalTableRequestConfig.parse(input)).toThrow('SPARK_SAVE_CONFIG')
  })

  it.each(['Authorization', 'COOKIE', 'x-AppId', 'x-FormKey', 'x-EnterpriseId', 'x-TenantId', 'x-UserId'])
    ('rejects credential or scope header %s before capture', header => {
      expect(() => FormalTableRequestConfig.parse({api: {list: {url: '/api/list', headers: {[header]: 'value'}}}}))
        .toThrow('SPARK_SAVE_CONFIG_HEADERS')
    })

  it('rejects duplicate header names after case folding', () => {
    expect(() => FormalTableRequestConfig.parse({api: {list: {url: '/api/list', headers: {'X-Profile': 'a', 'x-profile': 'b'}}}}))
      .toThrow('SPARK_SAVE_CONFIG_HEADERS')
  })

  it('rejects non-JSON and cyclic parameters without changing the source', () => {
    const cycle: Record<string, unknown> = {}
    cycle['self'] = cycle
    for (const params of [[], null, {value: undefined}, {value: Infinity}, {value: new Date()}, cycle]) {
      expect(() => FormalTableRequestConfig.parse({api: {list: {url: '/api/list', params}}})).toThrow('SPARK_SAVE_CONFIG')
    }
    expect(cycle['self']).toBe(cycle)
  })
})
