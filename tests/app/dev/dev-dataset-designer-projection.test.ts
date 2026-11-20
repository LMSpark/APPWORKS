import { describe, expect, it } from 'vitest'
import { ScenarioViewFile } from '@spark-appworks/spark-project-model'
describe('scenario design contract', () => {
  it('retains named views and frontend column rules while rejecting formal field overrides', () => {
    const definition = {
      scenarioId: 's',
      tables: {
        Orders: {
          modelBinding: { modelId: 'model', modelName: 'OrdersModel' },
          views: { default: {}, list: { pageSize: 20 } },
        },
      },
      viewCascades: [],
    }
    const text = JSON.stringify(definition)
    const file = new ScenarioViewFile('s', text)
    expect(file.value.toJSON()).toEqual(definition)

    const emptyExtensions = { ...definition, tables: { Orders: { ...definition.tables.Orders, columns: [] } } }
    file.setText(JSON.stringify(emptyExtensions))
    expect(file.value.toJSON()).toEqual(emptyExtensions)

    const frontendRules = { ...definition, tables: { Orders: {
      ...definition.tables.Orders, columns: [{ name: 'amount', required: true, min: 0 }],
    } } }
    const draft = JSON.stringify(frontendRules)
    file.setText(draft)
    expect(file.value.toJSON()).toEqual(frontendRules)
    const revision = file.revision
    for (const column of [
      { name: 'amount', type: 'number' },
      { name: 'amount', isPrimaryKey: true },
    ]) {
      const invalid = { ...definition, tables: { Orders: { ...definition.tables.Orders, columns: [column] } } }
      expect(() => file.setText(JSON.stringify(invalid))).toThrow('columns')
      expect(file.getText()).toBe(draft)
      expect(file.revision).toBe(revision)
    }
    expect(file.savedText).toBe(text)
    expect(file.isDirty).toBe(true)
  })
})
