import {describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'

describe('option row prototype-key probe', () => {
  it('returns a requested and visible __proto__ output as an own scalar field', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: '__proto__', type: 'string'}],
      views: {default: {}},
    }}})
    try {
      const view = dataSet.getView('Orders', 'default')!
      const row = JSON.parse('{"id":"A","__proto__":"CHOICE"}') as Record<string, unknown>
      view.bindQueryExecutor({executeQuery: async () => ({
        rows: [row], total: 1,
        assertIdentity: () => undefined,
        rowKey: (value: Record<string, unknown>) => value['id'],
        fieldAccess: () => ({read: 'visible', write: 'denied', component: 'readonly',
          required: false, writeMode: 'readonly'}),
        readFieldAccess: () => 'visible',
        addActionState: () => 'hidden', editActionState: () => 'hidden',
        deleteActionState: () => 'hidden', createChildActionState: () => 'hidden',
        viewActionState: () => 'hidden',
      })})
      const rows = await view.queryOptionRows({fields: ['__proto__']})
      expect(Object.hasOwn(rows[0], '__proto__')).toBe(true)
      expect(rows[0]?.['__proto__']).toBe('CHOICE')
    } finally { dataSet.destroy() }
  })
})
