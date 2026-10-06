import { describe, expect, it } from 'vitest'
import { resolveNavRoutePageId } from '../router/route-helpers'

describe('explicit tool identity', () => {
  it.each(['orders-node', '06c56d10-4ff6-4c4d-a6ce-772536592c75'])('takes tool identity from the formal target for %s', id => {
    expect(resolveNavRoutePageId({ id, title: 'Orders', itemKind: 'page', path: '/__page/node?scenarioId=S',
      tool: { projectId: 'APP', pageId: 'orders-tool' } }, '/__page/node?scenarioId=S')).toBe('orders-tool')
  })
  it('rejects guessing a missing config target from path shape', () => {
    expect(() => resolveNavRoutePageId({ id: 'node', title: 'Orders', itemKind: 'page', path: '/orders' }, '/orders')).toThrow('缺少明确工具目标')
    expect(resolveNavRoutePageId({ id: 'native-node', title: 'Native', itemKind: 'system-page' }, '/orders')).toBe('native-node')
  })
})
