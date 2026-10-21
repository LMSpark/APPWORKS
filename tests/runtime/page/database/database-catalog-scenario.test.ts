import {getNavTree} from '@spark-appworks/spark-app'
import {describe, expect, it, vi} from 'vitest'
import {
  collectBlueprintDatabaseCatalogScenarioIds,
  collectDatabaseCatalogScenarioCandidates,
} from '@/lowcode/resources/database/database-catalog-scenario'

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => ({
    items: [
      {
        id: 'table-nav',
        title: '表和视图',
        path: '/features/data-platform/database-management/table-and-view/ui/table-and-view-page',
        itemKind: 'system-page',
        blueprintScenarioId: 'NAV-TABLE',
      },
      {
        id: 'server-nav',
        title: '服务器',
        path: '/features/data-platform/database-management/ui/service-management-page',
        itemKind: 'system-page',
        blueprintScenarioId: 'FORM-DBMS',
      },
    ],
  })),
}))

describe('database-catalog-scenario', () => {
  it('prefers route FormKey then merges database-management nav scenario ids', () => {
    expect(collectDatabaseCatalogScenarioCandidates('NAV-TABLE')).toEqual(['NAV-TABLE', 'FORM-DBMS'])
  })

  it('ignores nav blueprintScenarioId when it equals navigation nodeId', () => {
    vi.mocked(getNavTree).mockReturnValueOnce({
      items: [{
        id: 'NAV-TABLE',
        title: '表和视图',
        path: '/features/data-platform/database-management/table-and-view/ui/table-and-view-page',
        itemKind: 'system-page',
        blueprintScenarioId: 'NAV-TABLE',
      }],
    } as never)
    expect(collectDatabaseCatalogScenarioCandidates('NAV-TABLE')).toEqual(['NAV-TABLE'])
  })

  it('collects blueprint scenario ids for catalog navigation titles', () => {
    const ids = collectBlueprintDatabaseCatalogScenarioIds([
      {
        nodeId: 'n1',
        parentNodeId: '',
        projectId: 'P1',
        kind: 'page',
        capability: {name: '结构化配置'},
        source: {},
        dataSpace: {scenarioId: 'FORM-CATALOG'},
      },
      {
        nodeId: 'n2',
        parentNodeId: '',
        projectId: 'P1',
        kind: 'page',
        capability: {name: '无关'},
        navigation: {title: '仪表盘', target: '/dash'},
        source: {},
        dataSpace: {scenarioId: 'OTHER'},
      },
    ] as never)
    expect(ids).toEqual(['FORM-CATALOG'])
  })
})
