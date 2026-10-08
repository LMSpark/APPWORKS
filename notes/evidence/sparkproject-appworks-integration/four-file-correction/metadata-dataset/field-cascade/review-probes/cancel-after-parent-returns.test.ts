import { expect, it, vi } from 'vitest'
import { DataSet } from '../../../../../../../packages/spark-data/src/dataset'
import type { DataRow } from '../../../../../../../packages/spark-data/src/types'

function result(tableName: string, rows: DataRow[]) {
  return {
    rows, total: rows.length,
    assertIdentity(identity: { scenarioId: string; metaName: string }) {
      if (identity.scenarioId !== 'SCENE' || identity.metaName !== tableName) throw new Error('identity mismatch')
    },
    rowKey: (row: DataRow) => row['id'],
    fieldAccess: (_key: unknown, field: string) => ({
      read: 'visible' as const,
      write: field === 'city' ? 'allowed' as const : 'denied' as const,
      component: field === 'city' ? 'editable' as const : 'readonly' as const,
      required: false,
      writeMode: field === 'city' ? 'editable' as const : 'readonly' as const,
    }),
    readFieldAccess: () => 'visible' as const,
    addActionState: () => 'hidden' as const,
    editActionState: () => 'hidden' as const,
    deleteActionState: () => 'hidden' as const,
    createChildActionState: () => 'hidden' as const,
    viewActionState: () => 'hidden' as const,
  }
}

it('cancelled editing must not accept same-parent late options', async () => {
  const dataSet = DataSet.fromJson({ scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {
    Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'country', type: 'string' },
        { name: 'note', type: 'string' }, { name: 'city', type: 'string' }],
      views: { default: {}, edit: {} } },
    Cities: { tableName: 'Cities', modelBinding: { modelId: 'CITY', modelName: 'Cities' },
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'caption', type: 'string' }],
      views: { default: {}, choices: {} } },
  }, viewCascades: [{ kind: 'field', cascadeId: 'city-by-country', tableName: 'Orders', viewId: 'edit',
    rowMode: 'editing-row', targetField: 'city', parents: [{ field: 'country', parameter: 'countryId' }],
    optionsView: { tableName: 'Cities', viewId: 'choices', valueField: 'id', labelField: 'caption' },
    valuePolicy: { mode: 'clear', clearValue: null } }] })
  try {
    const target = dataSet.getView('Orders', 'edit')!
    const options = dataSet.getView('Cities', 'choices')!
    const pending: Array<(value: ReturnType<typeof result>) => void> = []
    let completedOptionQueries = 0
    target.bindQueryExecutor({ executeQuery: async () => result('Orders', [
      { id: 1, country: 'A', note: 'original', city: 'OLD' },
    ]) })
    options.bindQueryExecutor({ executeQuery: async () => new Promise(resolve => pending.push(resolve)) })
    const originalOptionQuery = options.queryOptionRows.bind(options)
    vi.spyOn(options, 'queryOptionRows').mockImplementation(async request => {
      const rows = await originalOptionQuery(request)
      completedOptionQueries++
      return rows
    })
    await target.loadFromServer()
    target.updateEditingValue(1, 'note', 'draft')
    target.updateEditingValue(1, 'country', 'B')
    target.updateEditingValue(1, 'country', 'A')
    expect(pending).toHaveLength(2)
    expect(target.getEditingPatch(1)).toEqual({ note: 'draft' })
    expect(target.discardEditingRows([1])).toBe(1)
    expect(target.getEditingPatch(1)).toBeUndefined()
    pending[1]?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await vi.waitFor(() => expect(completedOptionQueries).toBe(1))
    await Promise.resolve()
    await Promise.resolve()
    expect(dataSet.getFieldCascadeState({ tableName: 'Orders', viewId: 'edit', rowId: 1,
      field: 'city' }).status).toBe('idle')
    expect(target.getEditingPatch(1)).toBeUndefined()
  } finally {
    dataSet.destroy()
  }
})
