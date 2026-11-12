import {describe, expect, it} from 'vitest'
import {
  formatBlueprintNodeVerifyFailure,
  verifyBlueprintNodeTree,
  type BlueprintVerifyNode,
} from '@/views/features/application/application-function-management/ui/blueprint-navigation/blueprint-node-verify'

function node(row: Record<string, unknown>, hidden: string[] = []): BlueprintVerifyNode {
  return {row: {name: row['rowid'], conType: 'Model', IsShowAtNav: 0, hasChild: 0, ...row}, hidden}
}

function page(rowid: string, prowid: string, NavigationUrl?: string): BlueprintVerifyNode {
  return node({rowid, prowid, conType: 'Navitem', IsShowAtNav: 1, NavigationUrl})
}

function codes(rootNodeId: string, nodes: BlueprintVerifyNode[], deliveryResources: string[] = []) {
  return verifyBlueprintNodeTree({rootNodeId, nodes, deliveryResources}).issues.map(issue => issue.code)
}

describe('verifyBlueprintNodeTree', () => {
  it('passes a module directory without data space or vue address', () => {
    expect(verifyBlueprintNodeTree({rootNodeId: 'mod', nodes: [node({rowid: 'mod'})], deliveryResources: ['vue:/orders']}))
      .toMatchObject({ok: true, visitedNodeIds: ['mod'], issues: []})
  })

  it('fails a page published to the menu without a vue address', () => {
    expect(codes('page', [page('page', '')], ['vue:/orders'])).toEqual(['PAGE_TARGET_REQUIRED'])
  })

  it('fails when the hung vue address is missing from delivery', () => {
    expect(codes('page', [page('page', '', 'vue:/missing')], ['vue:/orders'])).toEqual(['TARGET_NOT_IN_DELIVERY'])
  })

  it('bubbles a child failure to the current-node verify', () => {
    const result = verifyBlueprintNodeTree({rootNodeId: 'mod', nodes: [node({rowid: 'mod', hasChild: 1}), page('page', 'mod', 'vue:/orders')], deliveryResources: []})
    expect(result.visitedNodeIds).toEqual(['mod', 'page'])
    expect(result.issues.map(issue => issue.code)).toEqual(['TARGET_NOT_IN_DELIVERY'])
    expect(formatBlueprintNodeVerifyFailure(result)).toContain('vue:/orders')
  })

  it('fails a declared data space whose scenarioId is blank', () => {
    expect(codes('mod', [node({rowid: 'mod', conid: '  '})])).toEqual(['DATA_SPACE_ID_REQUIRED'])
  })

  it('allows many nodes to reuse the same delivered vue resource', () => {
    const result = verifyBlueprintNodeTree({rootNodeId: 'mod', deliveryResources: ['vue:/shared'],
      nodes: [node({rowid: 'mod', hasChild: 1}), page('a', 'mod', 'vue:/shared'), page('b', 'mod', 'vue:/shared')]})
    expect(result.ok).toBe(true)
    expect(result.visitedNodeIds).toEqual(['mod', 'a', 'b'])
  })

  it('fails when declared children are not in the readback set', () => {
    expect(codes('mod', [node({rowid: 'mod', hasChild: 1})])).toEqual(['CHILDREN_UNREAD'])
  })

  it('reports a cyclic parent chain instead of looping', () => {
    expect(codes('a', [node({rowid: 'a', prowid: 'b', hasChild: 1}), node({rowid: 'b', prowid: 'a', hasChild: 1})])).toEqual(['NODE_CYCLE'])
  })

  it('refuses to pass nodes whose verified fields were not readable or that are absent', () => {
    expect(codes('mod', [node({rowid: 'mod'}, ['NavigationUrl'])])).toEqual(['FIELD_UNREADABLE'])
    expect(codes('gone', [node({rowid: 'mod'})])).toEqual(['NODE_MISSING'])
  })

  it('rejects non-canonical addresses and duplicated delivery entries', () => {
    expect(codes('p', [page('p', '', 'vue:/Orders')], ['vue:/Orders'])).toEqual(['TARGET_INVALID'])
    expect(codes('p', [page('p', '', 'vue:/orders')], ['vue:/orders', 'vue:/orders'])).toEqual(['TARGET_NOT_UNIQUE'])
  })
})
