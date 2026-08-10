import { describe, expect, it } from 'vitest'
import { resolveCrossProjectRefPageId, resolveNavRoutePageId } from '../router/route-helpers'

describe('router route helpers', () => {
  it('resolves config page ids from stable paths', () => {
    expect(resolveNavRoutePageId({
      id: 'orders-node',
      title: 'Orders',
      itemKind: 'page',
      path: '/orders',
    }, '/orders')).toBe('orders')

    expect(resolveNavRoutePageId({
      id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
      title: 'Tree',
      itemKind: 'page',
      path: '/homepage/tree-demo',
    }, '/homepage/tree-demo')).toBe('tree-demo')
  })

  it('resolves ref page ids from local and cross-project ref paths', () => {
    expect(resolveCrossProjectRefPageId('/dataset-demo')).toBe('dataset-demo')
    expect(resolveCrossProjectRefPageId('@app:analytics/dataset-demo?tab=1')).toBe('dataset-demo')
    expect(resolveNavRoutePageId({
      id: 'ref-node',
      title: 'Ref',
      itemKind: 'ref',
      refId: 'fallback-page',
      refPath: '@app:analytics/reporting',
    }, '/__ref/ref-node')).toBe('reporting')
  })
})
