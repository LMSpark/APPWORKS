import { describe, expect, it } from 'vitest'
import type { DataSetMetadata } from '@spark-appworks/spark-data'
import {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerTableProjection,
} from '@/services/project-model-artifacts'

function createMetadata(partial?: Partial<DataSetMetadata>): DataSetMetadata {
  return {
    dataSetName: 'sales',
    tables: {
      users: {
        tableName: 'users',
        resourceType: 'database',
        views: { default: { rows: [] } },
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
      },
      orders: {
        tableName: 'orders',
        resourceType: 'database',
        views: { default: { rows: [] } },
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'userId', type: 'string' },
        ],
      },
    },
    resourceRelations: [
      {
        parentTable: 'users',
        childTable: 'orders',
        parentField: 'id',
        childField: 'userId',
      },
    ],
    ...partial,
  }
}

describe('DevDataSetDesigner projection helpers', () => {
  it('publishes separate resource relation and DataView cascade schema contracts', () => {
    const schemaText = JSON.stringify(PAGE_DATA_JSON_SCHEMA)

    expect(schemaText).toContain('dataResourceRelationFieldMapping')
    expect(schemaText).toContain('dataViewCascadeFilterBinding')
    expect(schemaText).toContain('parentViewId')
    expect(schemaText).toContain('childViewId')
    expect(schemaText).toContain('filterBindings')
    expect(schemaText).not.toContain('tableRelation')
    expect(schemaText).not.toContain('viewDependency')
  })

  it('keeps existing table and column ids while assigning layout only to new tables', () => {
    const existingTables: DesignerTableProjection[] = [
      {
        id: 'table-users',
        tableName: 'users',
        resourceType: 'database',
        x: 120,
        y: 180,
        views: { default: { rows: [] } },
        columns: [
          { id: 'col-users-id', name: 'id', type: 'string', isPrimaryKey: true },
          { id: 'col-users-name', name: 'name', type: 'string' },
        ],
      },
    ]
    const metadata = createMetadata({
      layout: {
        tablePositions: {
          users: { x: 120, y: 180 },
        },
      },
    })
    let nextId = 0
    const createId = () => `generated-${++nextId}`

    const nextUiState = reconcileDesignerTableUiState({
      metadata,
      currentTables: existingTables,
      createId,
      layoutForNewTable: (tableName: string, newIndex: number) => ({ x: 500 + newIndex * 100, y: tableName.length * 10 }),
    })
    const projectedTables = projectDesignerTables(metadata, nextUiState, createId)

    expect(nextUiState['users']).toEqual({
      id: 'table-users',
      x: 120,
      y: 180,
      columnIds: {
        id: 'col-users-id',
        name: 'col-users-name',
      },
    })
    expect(nextUiState['orders']).toEqual({
      id: 'generated-1',
      x: 500,
      y: 60,
      columnIds: {
        id: 'generated-2',
        userId: 'generated-3',
      },
    })

    expect(projectedTables[0]?.id).toBe('table-users')
    expect(projectedTables[0]?.columns.map((column) => column.id)).toEqual(['col-users-id', 'col-users-name'])
    expect(projectedTables[1]?.id).toBe('generated-1')
    expect(projectedTables[1]?.columns.map((column) => column.id)).toEqual(['generated-2', 'generated-3'])
  })

  it('compares persisted metadata by normalized projection output', () => {
    const metadata = createMetadata()
    const uiState = {
      users: {
        id: 'table-users',
        x: 120,
        y: 180,
        columnIds: {
          id: 'col-users-id',
          name: 'col-users-name',
        },
      },
      orders: {
        id: 'table-orders',
        x: 420,
        y: 180,
        columnIds: {
          id: 'col-orders-id',
          userId: 'col-orders-userId',
        },
      },
    }
    const createId = () => {
      throw new Error('unexpected createId call')
    }
    const projectedTables = projectDesignerTables(metadata, uiState, createId)
    const projectedRelations = projectDesignerRelations(metadata)

    const persisted = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: projectedTables,
      relations: projectedRelations,
    })
    const changed = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: [
        {
          ...projectedTables[0]!,
          resourceId: 'users-v2',
        },
        projectedTables[1]!,
      ],
      relations: projectedRelations,
    })

    expect(hasDesignerProjectionChanges(persisted, persisted)).toBe(false)
    expect(hasDesignerProjectionChanges(changed, persisted)).toBe(true)
  })

  it('does not treat implicit default layout or preserved pageId as unsaved changes', () => {
    const metadata = createMetadata({
      pageId: 'page-001',
    })
    let nextId = 0
    const projectedTables = projectDesignerTables(metadata, {}, () => `generated-${++nextId}`)
    const projectedRelations = projectDesignerRelations(metadata)

    const current = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: projectedTables,
      relations: projectedRelations,
    })
    const moved = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: [
        {
          ...projectedTables[0]!,
          x: projectedTables[0]!.x + 24,
        },
        projectedTables[1]!,
      ],
      relations: projectedRelations,
    })

    expect(hasDesignerProjectionChanges(current, metadata)).toBe(false)
    expect(hasDesignerProjectionChanges(moved, metadata)).toBe(true)
  })

  it('preserves resource relation identities and composite field mappings through designer projection', () => {
    const metadata = createMetadata({
      resourceRelations: [{
        relationId: 'resource-rel-1',
        sourceRelationId: 'legacy-rel-1',
        parentTable: 'users',
        childTable: 'orders',
        fieldMappings: [
          { parentResourceField: 'id', childResourceField: 'userId' },
        ],
      }],
    })
    let nextId = 0
    const tables = projectDesignerTables(metadata, {}, () => `generated-${++nextId}`)

    const rebuilt = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables,
      relations: projectDesignerRelations(metadata),
    })

    expect(rebuilt.resourceRelations).toEqual(metadata.resourceRelations)
    expect(hasDesignerProjectionChanges(rebuilt, metadata)).toBe(false)
  })

})
