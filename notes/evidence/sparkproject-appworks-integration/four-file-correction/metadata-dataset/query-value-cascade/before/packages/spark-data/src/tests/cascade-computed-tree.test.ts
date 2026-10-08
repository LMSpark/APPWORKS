import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'
import { requireArray, requireRecord } from './test-type-helpers'

describe('Cascade with computed parent field on tree data', () => {
  it('should apply computed columns to nested children after updateFromServer', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'test',
      resourceRelations: [{
        parentTable: 'Parent',
        childTable: 'Child',
        filterExpression: {logic: 'and', filters: [{field: 'refKey', operator: 'eq', value: {Type: 'GetTableField', Field: 'computedKey'}}]},
        relationName: 'testRel',
      }],
      viewCascades: [{
        parentTable: 'Parent',
        parentViewId: 'default',
        childTable: 'Child',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'computedKey', targetField: 'refKey' }],
      }],
      tables: {
        Parent: {
          tableName: 'Parent',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'kind', type: 'string' },
            { name: 'computedKey', type: 'string', computeExpression: "if (kind === 'a') return 'typeA'; return 'typeB'" },
          ],
          views: { default: { autoLoad: false, rows: [] } }
        },
        Child: {
          tableName: 'Child',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'refKey', type: 'string' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, refKey: 'typeA' },
                { id: 2, refKey: 'typeB' },
              ]
            }
          }
        }
      }
    })

    const parentView = ds.getView('Parent', 'default')!

    // Simulate tree data load with nested children
    const treeData: DataRow[] = [
      { id: 1, kind: 'a', children: [
        { id: 2, kind: 'b', children: [] }
      ]}
    ]

    // updateFromServer triggers postMutation → _applyComputedColumns via the delegate
    parentView.updateFromServer(treeData)

    // Verify computed column on root row
    const rootRow = parentView.rows[0]
    expect(rootRow).toBeDefined()
    expect('computedKey' in rootRow!).toBe(true)
    expect(rootRow!['computedKey']).toBe('typeA')

    // Verify computed column on nested child (this is what the tree-traversal fix ensures)
    const nestedChild = requireRecord(requireArray(rootRow?.['children'], 'Expected root children')[0], 'Expected nested child')
    expect(nestedChild).toBeDefined()
    expect('computedKey' in nestedChild!).toBe(true)
    expect(nestedChild!['computedKey']).toBe('typeB')
  })

  it('resolveCascadeFilter should handle missing computed field gracefully', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'test2',
      resourceRelations: [{
        parentTable: 'Parent',
        childTable: 'Child',
        filterExpression: {logic: 'and', filters: [{field: 'refKey', operator: 'eq', value: {Type: 'GetTableField', Field: 'computedKey'}}]},
        relationName: 'testRel',
      }],
      viewCascades: [{
        parentTable: 'Parent',
        parentViewId: 'default',
        childTable: 'Child',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'computedKey', targetField: 'refKey' }],
      }],
      tables: {
        Parent: {
          tableName: 'Parent',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'kind', type: 'string' },
            { name: 'computedKey', type: 'string', computeExpression: "if (kind === 'a') return 'typeA'; return 'typeB'" },
          ],
          views: { default: { autoLoad: false, rows: [
            // Row WITHOUT computedKey applied (simulating timing gap)
            { id: 1, kind: 'a' },
          ]}}
        },
        Child: {
          tableName: 'Child',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'refKey', type: 'string' },
          ],
          views: { default: { rows: [] } }
        }
      }
    })

    const parentView = ds.getView('Parent', 'default')!
    // Force requestState to Loaded so resolveCascadeFilter doesn't return null early
    parentView.requestState = 2 // RequestState.Loaded

    // Should NOT throw — missing computed field is handled gracefully
    const rel = ds.viewCascades?.[0]
    if (!rel) throw new Error('Expected a DataView cascade')
    const filter = ds.resolveCascadeFilter(rel)
    // Returns null when computed field can't be resolved
    expect(filter).toBeNull()
  })
})
