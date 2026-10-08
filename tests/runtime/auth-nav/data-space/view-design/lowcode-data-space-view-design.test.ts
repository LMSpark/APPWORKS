import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { DataSpaceQueryTable } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { LowcodeDataSpaceViewDesign } from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

const selection = { scenarioId: 'SPACE', tableName: 'Orders', modelId: 'MODEL', modelName: 'OrdersModel', viewId: 'summary' }
const formalModel = { id: 'MODEL', metaName: 'OrdersModel', name: 'OrdersModel', sourceName: 'Orders', sourceId: 'DB',
  sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {}, fields: [
    { id: 'F-ID', modelId: 'MODEL', name: 'id', canonicalName: 'id', type: 'string', primaryKey: true,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {} },
    { id: 'F-LABEL', modelId: 'MODEL', name: 'label', canonicalName: 'label', type: 'string', primaryKey: false,
      description: '', output: true, computed: false, order: 1, orderType: '', raw: {} },
  ] }

function fixture(initial: string | null = null) {
  let remote = initial
  let scope = 'current'
  const writeText = vi.fn(async (_id: string, text: string) => { remote = text })
  const workspace = new ProjectWorkspace({ projectId: 'APP',
    pageFiles: { readPageFile: async () => { throw new Error('unexpected page read') } },
    blueprint: { loadRoot: async () => ({ children: [] }) },
    scenarioViews: { readScope: () => scope, readText: async () => remote, writeText },
  })
  const readModel = vi.fn(async () => formalModel)
  const assemble = vi.fn(async (scenarioId: string) => ({ dataSet: DataSet.fromJson({ scenarioId,
    dataSetName: scenarioId, tables: {} }), diagnostics: [] }))
  const service = new LowcodeDataSpaceViewDesign({ workspace, readModel, assemble,
    assertScope: () => { if (scope !== 'current') throw new Error('STALE_SCOPE') } })
  return { service, workspace, writeText, readModel, assemble, setScope: (value: string) => { scope = value },
    getRemote: () => remote }
}

describe('shared data-space view design owner', () => {
  it('previews real DataView query rows with visible, masked and hidden fields and destroys the instance', async () => {
    const { service, assemble } = fixture()
    await service.create(selection)
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'},
        {name: 'secret', type: 'string'}, {name: 'masked', type: 'string'}],
      views: {default: {}, summary: {}},
    }}})
    const view = dataSet.getView('Orders', 'summary')
    if (!view) throw new Error('summary view missing')
    const table = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'OrdersModel'})
    const context = new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
      snapshot: table.applyResult({Result: {primaryKeyField: 'id', allowAdd: false, data: {Items: [
        {id: '1', label: 'visible', secret: 'hidden-value', masked: 'masked-value',
          lingma_sys_params: {e: [], r: [], h: ['secret'], m: ['masked'], d: false}},
      ], Count: 1}}})})
    view.bindQueryExecutor({executeQuery: async () => context})
    const destroy = vi.spyOn(dataSet, 'destroy')
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await service.preview(selection)
    expect(preview).toMatchObject({total: 1, rows: [{id: '1', label: 'visible', masked: '••••'}]})
    expect(preview.rows[0]).not.toHaveProperty('secret')
    expect(destroy).toHaveBeenCalledOnce()
  })
  it('destroys a failed preview DataSet without returning unverified rows', async () => {
    const {service, assemble} = fixture()
    await service.create(selection)
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {}},
    }}})
    const view = dataSet.getView('Orders', 'summary')
    if (!view) throw new Error('summary view missing')
    view.bindQueryExecutor({executeQuery: async () => { throw new Error('formal query denied') }})
    const destroy = vi.spyOn(dataSet, 'destroy')
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    await expect(service.preview(selection)).rejects.toThrow('formal query denied')
    expect(destroy).toHaveBeenCalledOnce()
  })
  it('does not create a shared draft after the calling page expires during formal model read', async () => {
    const { service, workspace, readModel } = fixture()
    let finish: ((value: typeof formalModel) => void) | undefined
    readModel.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let active = true
    const creating = service.create(selection, () => { if (!active) throw new Error('PAGE_RUNTIME_STALE') })
    active = false
    finish?.(formalModel)
    await expect(creating).rejects.toThrow('PAGE_RUNTIME_STALE')
    expect(workspace.getScenarioViews('SPACE')).toBeNull()
  })
  it('creates a missing file explicitly, stages a second view and confirms exact save', async () => {
    const { service, workspace, writeText, getRemote } = fixture()
    await expect(service.open('SPACE')).rejects.toThrow('SCENARIO_VIEW_FILE_MISSING')
    const created = await service.create(selection)
    expect(created.state).toMatchObject({ persisted: false, dirty: true })
    expect(created.dirtySource).toBe(workspace.getScenarioViews('SPACE'))
    expect(writeText).not.toHaveBeenCalled()
    const staged = await service.stage({ ...selection, expectedText: created.state.text,
      configuration: { pageSize: 30, autoLoad: false, valueField: 'id', labelField: 'label' } })
    expect(staged.config).toMatchObject({ tables: { Orders: { views: { default: {}, summary: {
      pageSize: 30, autoLoad: false, valueField: 'id', labelField: 'label',
    } } } } })
    await expect(service.stage({ ...selection, expectedText: created.state.text, configuration: { pageSize: 40 } }))
      .rejects.toThrow('DRAFT_STALE')
    await expect(service.stage({ ...selection, expectedText: staged.text, configuration: { valueField: 'missing' } }))
      .rejects.toThrow('SCENARIO_VIEW_FIELD')
    const saved = await service.save('SPACE')
    expect(saved.dirty).toBe(false)
    expect(getRemote()).toBe(saved.text)
    expect(writeText).toHaveBeenCalledOnce()
    expect((await service.open('SPACE')).state.text).toBe(saved.text)
  })

  it('preserves unrelated views and properties during one targeted edit', async () => {
    const text = JSON.stringify({ scenarioId: 'SPACE', tables: {
      Orders: { modelBinding: { modelId: 'MODEL', modelName: 'OrdersModel' }, views: {
        default: { queryContext: { mode: 'keep' } }, summary: { sortExpression: [{ field: 'id', direction: 'desc' }] },
      } }, Other: { modelBinding: { modelId: 'OTHER', modelName: 'OtherModel' }, views: { default: {} } },
    }, viewCascades: [] })
    const { service } = fixture(text)
    const opened = await service.open('SPACE')
    const staged = await service.stage({ ...selection, expectedText: opened.state.text, configuration: { pageSize: 25 } })
    expect(staged.config).toMatchObject({ tables: { Orders: { views: {
      default: { queryContext: { mode: 'keep' } },
      summary: { sortExpression: [{ field: 'id', direction: 'desc' }], pageSize: 25 },
    } }, Other: { views: { default: {} } } }, viewCascades: [] })
  })
  it('round-trips native view configuration on one model without copying model columns or rows', async () => {
    const {service, getRemote} = fixture()
    const created = await service.create(selection)
    const filterExpression = {field: 'id', operator: 'eq', value: '1'} as const
    const configuration = {valueField: ['id', 'label'], labelField: 'label',
      filterExpression, sortExpression: [{field: 'label', direction: 'asc' as const}],
      treeConfig: {idField: 'id', textField: 'label', treeMode: 'flat' as const},
      aggregates: {recordCount: {type: 'count' as const, field: 'id'}},
      selectionDelimiter: '|', commitMode: 'staged' as const}
    const staged = await service.stage({...selection, expectedText: created.state.text, configuration})
    const second = await service.stage({...selection, viewId: 'detail', expectedText: staged.text,
      configuration: {pageSize: 12, valueField: 'id'}})
    await service.save('SPACE')
    const persisted = JSON.parse(getRemote() ?? '')
    expect(persisted.tables.Orders).toEqual({modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      views: {default: {}, summary: configuration, detail: {pageSize: 12, valueField: 'id'}}})
    expect(persisted.tables.Orders).not.toHaveProperty('columns')
    expect(persisted.tables.Orders.views.summary).not.toHaveProperty('rows')
    expect((await service.open('SPACE')).state.config).toEqual(persisted)
    expect(second.config['tables']).toBeDefined()
  })
  it('rejects runtime rows and identity edits, and checks native field references', async () => {
    const {service} = fixture()
    const created = await service.create(selection)
    const stage = (configuration: Record<string, unknown>, clear?: string[]) => Reflect.apply(service.stage, service, [{
      ...selection, expectedText: created.state.text, configuration, clear,
    }])
    await expect(stage({rows: [{id: '1'}]})).rejects.toThrow('SCENARIO_VIEW_CONFIGURATION')
    await expect(stage({viewId: 'other'})).rejects.toThrow('SCENARIO_VIEW_CONFIGURATION')
    await expect(stage({}, ['rows'])).rejects.toThrow('SCENARIO_VIEW_CLEAR')
    await expect(stage({valueField: ['id', 'missing']})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    await expect(stage({sortExpression: [{field: 'missing', direction: 'asc'}]})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    await expect(stage({treeConfig: {idField: 'missing'}})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    await expect(stage({aggregates: {bad: {type: 'count', field: 'missing'}}})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    await expect(stage({aggregates: {unknownTotal: {type: 'sum'}}})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    const validFallback = await service.stage({...selection, expectedText: created.state.text,
      configuration: {aggregates: {id: {type: 'count'}}}})
    expect(validFallback.config).toMatchObject({tables: {Orders: {views: {summary: {
      aggregates: {id: {type: 'count'}},
    }}}}})
  })
  it('clears explicit view overrides and rejects a preview bound to another model', async () => {
    const text = JSON.stringify({scenarioId: 'SPACE', tables: {Orders: {
      modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      views: {default: {}, summary: {pageSize: 25, autoLoad: true, valueField: 'id'}},
    }}, viewCascades: []})
    const {service, assemble} = fixture(text)
    const opened = await service.open('SPACE')
    await expect(service.preview({...selection, modelId: 'OTHER'})).rejects.toThrow('MODEL_BINDING')
    expect(assemble).not.toHaveBeenCalled()
    const staged = await service.stage({...selection, expectedText: opened.state.text,
      configuration: {}, clear: ['pageSize', 'autoLoad', 'valueField']})
    const summary = staged.config['tables']
    expect(JSON.stringify(summary)).not.toContain('pageSize')
    expect(JSON.stringify(summary)).not.toContain('autoLoad')
    expect(JSON.stringify(summary)).not.toContain('valueField')
  })
})
