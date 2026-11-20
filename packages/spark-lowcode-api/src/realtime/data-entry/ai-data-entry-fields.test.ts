import {DataSet, type DataViewFieldProjection} from '@spark-appworks/spark-data'
import type {AiDataEntryField} from './ai-data-entry-fields'
import {afterEach, describe, expect, it} from 'vitest'

const instances: DataSet[] = []
afterEach(() => {instances.splice(0).forEach(instance => instance.destroy())})

function projection(field: string, type: string, output = true, primaryKey = false, label = field): DataViewFieldProjection {
  return {
    fieldId: field, source: 'resource', resourceFieldId: field, resourceField: field, viewField: field,
    type, label, output, sortOrder: 0, sortDirection: null, group: 0, distinct: false,
    primaryKey, value: '', valueFunction: '', expression: '',
  }
}

async function setup(options: {readonly?: readonly string[]; addEnabled?: boolean; tinyint?: boolean} = {}) {
  const dataSet = DataSet.fromJson({scenarioId: 'AI-ENTRY-FIELDS', tables: {Items: {
    tableName: 'Items', modelBinding: {modelId: 'MODEL-ITEMS', modelName: 'Items'},
    columns: [
      {name: 'id', type: 'string', isPrimaryKey: true, allowAIAdd: true},
      {name: 'name', type: 'varchar', label: '名称', allowAIAdd: true},
      {name: 'candidateKey', type: 'string', allowAIAdd: true},
      ...(options.tinyint ? [{name: 'ordIdx', type: 'tinyint', label: '排序', min: 0, max: 10, allowAIAdd: true}] : []),
      {name: 'amount', type: 'number', allowAIAdd: true},
      {name: 'count', type: 'integer', allowAIAdd: true},
      {name: 'active', type: 'boolean', allowAIAdd: true},
      {name: 'startDate', type: 'date', allowAIAdd: true},
      {name: 'disabled', type: 'string', allowAIAdd: false},
      {name: 'unconfigured', type: 'string'},
      {name: 'restricted', type: 'string', allowAIAdd: true},
      {name: 'hidden', type: 'string', allowAIAdd: true},
      {name: 'calculated', type: 'string', isComputed: true, allowAIAdd: true},
      {name: 'generated', type: 'number', autoIncrement: true, allowAIAdd: true},
      {name: 'unknownType', type: 'json', allowAIAdd: true},
    ],
    views: {default: {commitMode: 'staged'}},
  }}})
  instances.push(dataSet)
  const view = dataSet.getView('Items', 'default')
  if (view === undefined) throw new Error('AI entry fields DataView fixture was not created')
  view.fieldProjection = [
    projection('id', 'string', true, true), projection('name', 'varchar', true, false, '名称'), projection('candidateKey', 'string'),
    ...(options.tinyint ? [projection('ordIdx', 'tinyint', true, false, '排序')] : []), projection('amount', 'number'),
    projection('count', 'integer'), projection('active', 'boolean'), projection('startDate', 'date'),
    projection('disabled', 'string'), projection('unconfigured', 'string'), projection('restricted', 'string'),
    projection('hidden', 'string', false), projection('calculated', 'string'), projection('generated', 'number'),
    projection('unknownType', 'json'),
  ]
  view.bindQueryExecutor({executeQuery: async (_target, _params) => ({
    rows: [{id: 'existing'}], total: 1,
    assertIdentity: identity => {
      if (identity.scenarioId !== 'AI-ENTRY-FIELDS' || identity.metaName !== 'Items') throw new Error('query identity mismatch')
    },
    rowKey: row => row['id'],
    prepareNewRow: row => ({...row, id: 'new-row'}),
    isFieldReadOnly: field => options.readonly?.includes(field) ?? false,
    fieldAccess: () => ({read: 'visible', write: 'allowed', required: false, component: 'editable', writeMode: 'editable'}),
    readFieldAccess: () => 'visible',
    addActionState: available => options.addEnabled === false || !available ? 'disabled' : 'enabled',
    editActionState: () => 'enabled', deleteActionState: () => 'enabled',
    createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
  })})
  await view.loadFromServer()
  return {dataSet, view}
}

describe('AI data-entry field derivation from a real DataView', () => {
  it('uses only enabled writable output columns and their canonical DataColumn names/types', async () => {
    const {view} = await setup({readonly: ['restricted']})
    const {deriveAiDataEntryFields} = await import('./ai-data-entry-fields')

    const fields = deriveAiDataEntryFields(view)
    expect(fields.map(field => field.name)).toEqual(['name', 'candidateKey', 'amount', 'count', 'active', 'startDate'])
    expect(fields.map(field => field.type)).toEqual(['varchar', 'string', 'number', 'integer', 'boolean', 'date'])
    expect(fields.find(field => field.name === 'name')).toMatchObject({label: '名称'})
  })

  it('returns no eligible fields when the current formal query denies all writes or table add', async () => {
    const deniedFields = await setup({readonly: ['name', 'candidateKey', 'amount', 'count', 'active', 'startDate', 'restricted']})
    const {deriveAiDataEntryFields} = await import('./ai-data-entry-fields')
    expect(deriveAiDataEntryFields(deniedFields.view)).toEqual([])

    const deniedTable = await setup({addEnabled: false})
    expect(deriveAiDataEntryFields(deniedTable.view)).toEqual([])
  })

  it('returns no fields when the formal query is stale instead of using model flags alone', async () => {
    const {view} = await setup()
    const {deriveAiDataEntryFields} = await import('./ai-data-entry-fields')
    view.queryContext = {scope: 'changed-after-query'}
    expect(deriveAiDataEntryFields(view)).toEqual([])
  })

  it('includes an enabled tinyint output column and preserves its formal type and bounds', async () => {
    const {view} = await setup({tinyint: true})
    const {deriveAiDataEntryFields} = await import('./ai-data-entry-fields')

    const field = deriveAiDataEntryFields(view).find(candidate => candidate.name === 'ordIdx')
    expect(field).toMatchObject({name: 'ordIdx', type: 'tinyint', label: '排序', min: 0, max: 10})
  })

  it('accepts tinyint safe integers and rejects fractional or string values', async () => {
    const {validateAiDataEntryValue} = await import('./ai-data-entry-fields')
    const field: AiDataEntryField = {name: 'ordIdx', type: 'tinyint', label: '排序', required: false, nullable: true, min: 0, max: 10}

    expect(() => validateAiDataEntryValue(field, 4)).not.toThrow()
    expect(() => validateAiDataEntryValue(field, 1.5)).toThrow()
    expect(() => validateAiDataEntryValue(field, '4')).toThrow()
  })

  it('continues to enforce tinyint min and max through the target DataView validator', async () => {
    const {view} = await setup({tinyint: true})
    const validator = view.validator
    if (validator === undefined) throw new Error('formal target DataView validator is unavailable')

    const fields = new Set(['ordIdx'])
    expect(validator.validateColumns({ordIdx: 0}, fields).valid).toBe(true)
    expect(validator.validateColumns({ordIdx: -1}, fields).errors).toContainEqual(
      expect.objectContaining({field: 'ordIdx', code: 'MIN_VALUE'}),
    )
    expect(validator.validateColumns({ordIdx: 11}, fields).errors).toContainEqual(
      expect.objectContaining({field: 'ordIdx', code: 'MAX_VALUE'}),
    )
  })
})
