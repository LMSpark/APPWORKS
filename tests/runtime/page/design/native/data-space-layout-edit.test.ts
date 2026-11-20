import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {DataSpaceLayoutEdit} from '@/views/features/data-platform/data-set-management/design/graph/data-space-layout-edit'
import definitionConfig from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'
import {RequestState} from '@spark-appworks/spark-data'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const editors: DataSpaceLayoutEdit[] = []
afterEach(() => {editors.splice(0).forEach(editor => editor.dispose()); fixtures.splice(0).forEach(f => f.dispose())})
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture(options); fixtures.push(f)
  const session = await f.open('A'), editor = new DataSpaceLayoutEdit(session); editors.push(editor)
  if (!options.readLegacyLayout) await editor.initialize()
  editor.state()
  return {f, session, editor}
}

const referencePositions = {M1: {x: 170, y: 110}, M2: {x: 998, y: 406}}
const referenceText = JSON.stringify({graphVersion: 1, nodes: Object.entries(referencePositions).map(([id, position]) => ({id, ...position})), edges: []})

describe('existing reference layout', () => {
  it('queries the reference file through its declared read-only DataView and saves only native layout', async () => {
    const read = vi.fn(async () => referenceText)
    const {f, session, editor} = await setup({readLegacyLayout: read})
    const view = session.metadataDataSet.getView('DataSpaceReferenceLayout')
    expect(view, 'reference layout must be declared by the metadata space').toBeDefined()
    expect(view!.rows).toHaveLength(0)
    const refresh = vi.spyOn(view!, 'refresh')
    await editor.initialize()
    expect(refresh).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith('A')
    expect(view!.rows[0]).toMatchObject({dataSetId: 'A', content: referenceText})
    expect(view!.editActionState(view!.rows[0]!)).toBe('disabled')
    expect(view!.fieldAccess(view!.rows[0]!, 'content').write).toBe('denied')
    editor.move({id: 'M1', x: 300, y: 400})
    await editor.save()
    expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).layout.modelPositions.M1).toEqual({x: 300, y: 400})
    expect(f.stored.get('A')).not.toContain('graphVersion')
    expect(view!.rows[0]?.['content']).toBe(referenceText)
  })

  it('includes file model view identities in a complete rebuild and persists them as table positions', async () => {
    const f = dataSpacePageFixture({overviewOnly: true}); fixtures.push(f)
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2,
      tables: {DataViewDefinition: definitionConfig.tables.DataViewDefinition}, resourceRelations: []}))
    const session = await f.open('A', {deferDefinition: true}), editor = new DataSpaceLayoutEdit(session); editors.push(editor)
    await editor.initialize()
    const files = session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!
    const key = String(files.getPkKey(files.rows[0]!))
    const preview = await editor.prepareRebuild()
    expect(preview.modelCount).toBe(3); expect(preview.positions[key]).toBeDefined()
    await editor.confirmRebuild(preview)
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.layout.tablePositions.DataViewDefinition).toEqual(preview.positions[key])
    expect(Object.keys(saved.layout.modelPositions).sort()).toEqual(['M1', 'M2'])
    expect(f.fileWrites).toHaveLength(1)
  })

  it('rejects invalid model identities through direct native layout edits without loading fields', async () => {
    const {f, session} = await setup({overviewOnly: true})
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!, key = layout.getPkKey(layout.rows[0]!)!
    const before = f.requests.length
    layout.updateEditingValue(key, 'modelPositions', {OTHER: {x: 2, y: 3}})
    await expect(session.metadataDataSet.saveChanges()).rejects.toThrow('DATA_SPACE_LAYOUT_MODEL')
    expect(f.fileWrites).toHaveLength(0)
    expect(f.requests).toHaveLength(before)
    layout.discardPendingChanges()
  })
  it('tracks layout changes in the formal DataView and submits only that view through DataSet', async () => {
    const {f, session, editor} = await setup()
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!
    expect('stageLayoutDefinition' in session).toBe(false)
    expect('stageLegacyTablePositions' in session).toBe(false)
    expect('saveViews' in session).toBe(false)
    const save = vi.spyOn(session.metadataDataSet, 'saveChanges')
    editor.move({id: 'M1', x: 3, y: 7})
    expect(layout.hasEditingChanges()).toBe(true)
    editor.cancel()
    expect(layout.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    editor.move({id: 'M1', x: 5, y: 8}); await editor.save()
    expect(save).toHaveBeenCalledWith({views: [{tableName: 'DataSpaceLayoutDefinition', viewId: 'default'}]})
    expect(layout.hasEditingChanges()).toBe(false)
    expect(JSON.parse(f.stored.get('A')!).layout.modelPositions).toEqual({M1: {x: 5, y: 8}})
  })
  it('retains persisted layout after metadata save invalidates the runtime projection', async () => {
    const {f, session, editor} = await setup({allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, description: ''},
    ]})
    editor.move({id: 'M1', x: 8, y: 9}); await editor.save()
    const fields = await session.loadModelFields('M1'), field = session.getFieldEdit('F1', 'modelFields')
    fields.updateEditingValue('F1', 'description', '字段描述')
    await field.save()
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    const value = editor.state()
    expect(value.positions).toEqual({M1: {x: 8, y: 9}})
    expect(value.rebuildAvailable).toBe(false)
    expect(value.messages).toEqual([])
    expect(f.fileWrites).toHaveLength(1)
  })

  it('prechecks an entire alignment before editing and preserves omitted coordinates and existing drafts', async () => {
    const {f, editor} = await setup({readLegacyLayout: async () => referenceText})
    await editor.initialize()
    editor.move({id: 'M1', x: 4, y: 5})
    const before = editor.state().positions
    for (const invalid of [{id: 'UNKNOWN', x: 3, y: 4}, {id: 'M2', x: NaN, y: 4}, {id: 'M1', x: 3, y: 4}]) {
      expect(() => editor.arrange([{id: 'M1', x: 10, y: 20}, invalid])).toThrow()
      expect(editor.state().positions).toEqual(before)
    }
    editor.arrange([{id: 'M2', x: 11, y: 22}])
    expect(editor.state().positions).toEqual({M1: {x: 4, y: 5}, M2: {x: 11, y: 22}})
    editor.cancel()
    expect(editor.state().positions).toEqual(referencePositions)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('loads coordinates without staging, cancels edits and preserves every position on save/reopen', async () => {
    const {f, session, editor} = await setup({readLegacyLayout: async () => referenceText})
    await editor.initialize()
    const before = session.viewState!.config
    expect(editor.state().positions).toEqual(referencePositions)
    expect(editor.state().rebuildAvailable).toBe(false)
    expect(editor.pending).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    editor.move({id: 'M1', x: 4, y: 5}); editor.cancel()
    expect(editor.state().positions).toEqual(referencePositions)
    editor.move({id: 'M1', x: 4, y: 5}); await editor.save()
    const reopened = await f.open('A'), next = new DataSpaceLayoutEdit(reopened); editors.push(next)
    await next.initialize()
    expect(next.state().positions).toEqual({...referencePositions, M1: {x: 4, y: 5}})
    const {layout: _layout, ...rest} = reopened.viewState!.config
    expect(rest).toEqual(before)
    expect(f.fileWrites).toHaveLength(1)
    expect(f.requests.some(request => request.url?.includes('BatchTable'))).toBe(false)
  })

  it.each([false, true])('preserves later layout edits after a captured save and can save or cancel them (unknown=%s)', async unknown => {
    const {f, session, editor} = await setup()
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!
    const key = layout.getPkKey(layout.rows[0]!)!
    editor.move({id: 'M1', x: 4, y: 5})
    const release = f.holdFileResponse()
    if (unknown) f.loseNextFileResponse()
    const saving = editor.save().then(() => undefined, (cause: unknown) => cause)
    try {
      await vi.waitFor(() => expect(f.fileWrites).toHaveLength(1))
      layout.updateEditingValue(key, 'modelPositions', {M1: {x: 14, y: 15}})
      release()
      const result = await saving
      if (unknown) {
        expect(result).toBeInstanceOf(Error)
        expect(await editor.verify()).toBe('confirmed')
      } else expect(result).toBeUndefined()
      expect(f.fileWrites).toHaveLength(1)
      expect(layout.getEditingRow(key)?.['modelPositions']).toEqual({M1: {x: 14, y: 15}})
      expect(editor.pending).toBe(true); expect(editor.staged).toBe(false)
      expect(editor.state()).toMatchObject({editable: true, error: '', positions: {M1: {x: 14, y: 15}}})
      expect((await f.open('A')).viewState!.config['layout']).toMatchObject({modelPositions: {M1: {x: 4, y: 5}}})
      await editor.save()
      expect(f.fileWrites).toHaveLength(2); expect(editor.pending).toBe(false)
      expect((await f.open('A')).viewState!.config['layout']).toMatchObject({modelPositions: {M1: {x: 14, y: 15}}})
      editor.move({id: 'M1', x: 24, y: 25}); editor.cancel()
      expect(editor.pending).toBe(false)
      expect(editor.state().positions['M1']).toEqual({x: 14, y: 15})
      expect(f.fileWrites).toHaveLength(2)
    } finally {release(); await saving}
  })

  it('rejects changed reference text before writing and retains the local draft', async () => {
    let source = referenceText
    const {f, editor} = await setup({readLegacyLayout: async () => source})
    await editor.initialize(); editor.move({id: 'M1', x: 4, y: 5})
    source = `${source} `
    await expect(editor.save()).rejects.toThrow('参考布局已变化')
    expect(f.fileWrites).toHaveLength(0)
    expect(editor.pending).toBe(true)
  })

  it.each(['broken', '{"graphVersion":2,"nodes":[],"edges":[]}',
    '{"graphVersion":1,"nodes":[{"id":"M1","x":"1","y":2}],"edges":[]}',
    '{"graphVersion":1,"nodes":[{"id":"M1","x":1e309,"y":2}],"edges":[]}',
    '{"graphVersion":1,"nodes":[{"id":"M1","x":1,"y":2},{"id":"M1","x":1,"y":2}],"edges":[]}',
    JSON.stringify({graphVersion: 1, nodes: [{id: 'UNKNOWN', x: 1, y: 2}], edges: []})])('rejects invalid or unreadable reference identities without offering rebuild: %s', async text => {
    const {f, editor} = await setup({readLegacyLayout: async () => text})
    await expect(editor.initialize()).rejects.toThrow()
    expect(editor.state().editable).toBe(false)
    expect(editor.state().rebuildAvailable).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('rejects an unavailable reader and stale completion after disposal', async () => {
    const denied = await setup({readLegacyLayout: async () => {throw new Error('layout denied')}})
    await expect(denied.editor.initialize()).rejects.toThrow('layout denied')
    expect(denied.editor.state().editable).toBe(false)
    let release!: (text: string) => void
    const held = await setup({readLegacyLayout: () => new Promise(resolve => {release = resolve})})
    const loading = held.editor.initialize()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    held.editor.dispose(); release(referenceText)
    await expect(loading).rejects.toThrow('释放')
    expect(held.f.fileWrites).toHaveLength(0)
  })

  it.each(['revision', 'scope', 'model'] as const)('rejects a late reference read after %s changes without creating a layout draft', async reason => {
    let release!: (text: string) => void
    const {f, session, editor} = await setup({readLegacyLayout: () => new Promise(resolve => {release = resolve})})
    const pending = editor.initialize()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    if (reason === 'revision') {
      const file = f.workspaces[0]!.getScenarioViews('A')!, before = file.getText()
      file.setText(`${before} `); file.undo()
    } else if (reason === 'scope') f.invalidate()
    else {
      const models = session.metadataDataSet.getView('Base_DataModel')!
      models.replaceRows(models.rows.filter(row => row['rowid'] !== 'M2'))
    }
    release(referenceText)
    await expect(pending).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
    expect(editor.pending).toBe(false)
  })

  it('supports formal models without runtime view bindings', async () => {
    const {f, editor} = await setup({missing: true, readLegacyLayout: async () => referenceText})
    await editor.initialize()
    expect(editor.state().positions).toEqual(referencePositions)
    editor.move({id: 'M1', x: 4, y: 5}); await editor.save()
    const config = (await f.open('A')).viewState!.config
    expect(config['tables']).toEqual({})
    expect(config['layout']).toEqual({modelPositions: {...referencePositions, M1: {x: 4, y: 5}}})
  })

  it('does not overwrite native layout or read an irrelevant legacy source', async () => {
    const read = vi.fn(async () => referenceText)
    const {f, session} = await setup({readLegacyLayout: read})
    f.stored.set('A', JSON.stringify({...session.viewState!.config, layout: {modelPositions: {M1: {x: 8, y: 9}}}}))
    const editor = new DataSpaceLayoutEdit(await f.open('A')); editors.push(editor)
    await editor.initialize()
    expect(editor.state().positions).toEqual({M1: {x: 8, y: 9}})
    expect(read).not.toHaveBeenCalled()
  })

  it('honors an explicitly empty native layout after removing its last connection', async () => {
    const read = vi.fn(async () => referenceText)
    const {f, session} = await setup({readLegacyLayout: read})
    f.stored.set('A', JSON.stringify({...session.viewState!.config, layout: {unboundEdges: {}}}))
    const editor = new DataSpaceLayoutEdit(await f.open('A')); editors.push(editor)
    await editor.initialize()
    expect(editor.state().positions).toEqual({})
    expect(editor.state().rebuildAvailable).toBe(true)
    expect(read).not.toHaveBeenCalled()
  })

  it('checks the absent legacy source again before rebuild confirmation', async () => {
    let source: string | null = null
    const {f, editor} = await setup({readLegacyLayout: async () => source})
    await editor.initialize(); const preview = await editor.prepareRebuild()
    source = referenceText
    await expect(editor.confirmRebuild(preview)).rejects.toThrow('参考布局已变化')
    expect(f.fileWrites).toHaveLength(0)
  })
})

describe('missing layout rebuild', () => {
  it.each(['legacy', 'native', 'missing'] as const)('rebuilds %s layout from endpoints while target assembly and field reads are unavailable', async format => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, broken: true,
      missing: format === 'missing', relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', filter: ''}]})
    fixtures.push(f)
    if (format === 'native') {
      f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {
        OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
        CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
      }, resourceRelations: [{relationId: 'native', parentTable: 'OrdersAlias', childTable: 'CustomersAlias', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}}]}))
    }
    const session = await f.open('A'), editor = new DataSpaceLayoutEdit(session); editors.push(editor)
    await editor.initialize()
    f.failNextFieldRead()
    const fieldView = session.metadataDataSet.getView('Base_DataModel_Field')!
    const fieldRead = vi.spyOn(fieldView, 'loadFromServer'), save = vi.spyOn(session.metadataDataSet, 'saveChanges')
    const baseline = session.viewState?.config ?? {scenarioId: 'A', schemaVersion: 2, tables: {}}
    const preview = await editor.prepareRebuild()
    expect(preview.relationCount).toBe(1)
    expect(editor.rebuildEdges.rows).toEqual([expect.objectContaining(format === 'native'
      ? {source: 'M1', target: 'M2'} : {source: 'M2', target: 'M1'})])
    expect(fieldRead).not.toHaveBeenCalled()
    expect(fieldView.requestState).toBe(RequestState.Idle)
    expect(f.assemblyScopes).toEqual([])
    editor.cancelRebuild()
    expect(f.fileWrites).toHaveLength(0)
    const next = await editor.prepareRebuild()
    f.loseNextFileResponse()
    await expect(editor.confirmRebuild(next)).rejects.toThrow()
    expect(editor.staged).toBe(true)
    expect(await editor.verify()).toBe('confirmed')
    expect(save).toHaveBeenCalledWith({views: [{tableName: 'DataSpaceLayoutDefinition', viewId: 'default'}]})
    expect(f.fileWrites).toHaveLength(1)
    expect(fieldRead).not.toHaveBeenCalled()
    expect(f.assemblyScopes).toEqual([])
    if (format === 'native') expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Idle)
    const reopened = await f.open('A'), fresh = new DataSpaceLayoutEdit(reopened); editors.push(fresh)
    await fresh.initialize()
    const {layout, ...unchanged} = reopened.viewState!.config
    expect(layout).toEqual({modelPositions: next.positions})
    expect(unchanged).toEqual(baseline)
  })

  it('preserves native relation and cascade definitions alongside named views', async () => {
    const {f, session} = await setup()
    const config = {...session.viewState!.config,
      resourceRelations: [{relationId: 'N', parentTable: 'OrdersAlias', childTable: 'CustomersAlias', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}}],
      viewCascades: [{parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [],
        inputBindings: [{sourceField: 'rowid', target: 'queryContext', format: 'json', omitEmpty: true}]}]}
    f.stored.set('A', JSON.stringify(config))
    const editor = new DataSpaceLayoutEdit(await f.open('A')); editors.push(editor); await editor.initialize(); editor.state()
    const preview = await editor.prepareRebuild()
    expect(preview.relationCount).toBe(1)
    await editor.confirmRebuild(preview)
    const reopened = (await f.open('A')).viewState!.config
    const {layout: _layout, ...rest} = reopened
    expect(rest).toEqual(config)
  })

  it('rejects row changes during the remote check before staging positions', async () => {
    const {f, session, editor} = await setup()
    const preview = await editor.prepareRebuild(), remote = session.previewRemoteViews.bind(session)
    vi.spyOn(session, 'previewRemoteViews').mockImplementationOnce(async () => {
      const result = await remote()
      const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
      models.replaceRows(models.rows.map(row => ({...row, Name: `${String(row['Name'])} changed`})))
      return result
    })
    await expect(editor.confirmRebuild(preview)).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
    expect(editor.pending).toBe(false)
  })

  it.each([false, true])('previews all models without writes, cancels and saves only coordinates: missing=%s', async missing => {
    const {f, session, editor} = await setup({missing, readOnly: true})
    const before = session.viewState?.config ?? {scenarioId: 'A', schemaVersion: 2, tables: {}}
    const preview = await editor.prepareRebuild()
    expect(preview.positions).toEqual({M1: {x: 250, y: 150}, M2: {x: 250, y: 356}})
    expect(editor.pending).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    editor.cancelRebuild()
    await expect(editor.confirmRebuild(preview)).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
    const next = await editor.prepareRebuild()
    await editor.confirmRebuild(next)
    const reopened = await f.open('A'), config = reopened.viewState!.config
    expect(config['layout']).toEqual({modelPositions: next.positions})
    const {layout: _layout, ...rest} = config
    expect(rest).toEqual(before)
    expect(f.fileWrites).toHaveLength(1)
    expect(f.requests.some(request => request.url?.includes('BatchTable'))).toBe(false)
    await expect(editor.prepareRebuild()).rejects.toThrow('已有布局')
  })

  it('uses verified backend relations for ordering without converting or persisting them', async () => {
    const {f, session, editor} = await setup({relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"rowid","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":"x"}}'}]})
    const preview = await editor.prepareRebuild()
    expect(preview.positions).toEqual({M1: {x: 584, y: 150}, M2: {x: 250, y: 150}})
    expect(editor.rebuildEdges.rows).toEqual([expect.objectContaining({source: 'M2', target: 'M1'})])
    await editor.confirmRebuild(preview)
    expect(session.viewState?.config['resourceRelations']).toBeUndefined()
    expect(f.requests.some(request => request.url?.includes('BatchTable'))).toBe(false)
  })

  it('rejects changed definitions and remote files before any write', async () => {
    const {f, editor} = await setup()
    const preview = await editor.prepareRebuild()
    f.setModelValues({Name: 'Renamed'})
    await expect(editor.confirmRebuild(preview)).rejects.toThrow('定义已变化')
    editor.cancelRebuild()
    const next = await editor.prepareRebuild()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}}))
    await expect(editor.confirmRebuild(next)).rejects.toThrow('远端')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps unknown receipt in the original verification path without replaying', async () => {
    const {f, editor} = await setup()
    const preview = await editor.prepareRebuild()
    f.loseNextFileResponse()
    await expect(editor.confirmRebuild(preview)).rejects.toThrow()
    await expect(editor.confirmRebuild(preview)).rejects.toThrow()
    expect(editor.staged).toBe(true)
    expect(await editor.verify()).toBe('confirmed')
    expect(f.fileWrites).toHaveLength(1)
  })

  it.each([{hiddenFieldOwner: true}, {unmatchedFieldOwner: true}, {broken: true}])('keeps layout independent of unavailable field or runtime definitions %o', async options => {
    const {f, session, editor} = await setup({...options, overviewOnly: true})
    f.assemblyScopes.length = 0
    const preview = await editor.prepareRebuild()
    await editor.confirmRebuild(preview)
    expect(f.fileWrites).toHaveLength(1)
    expect(f.assemblyScopes).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
  })

  it.each([{hiddenModelProperties: ['rowid']},
    {relationRows: [{rowid: 'R', parentModId: 'MISSING', childModId: 'M1'}]}])('rejects incomplete formal definitions %o', async options => {
    const {f, editor} = await setup(options)
    await expect(editor.prepareRebuild()).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
  })

  it('rejects failed reads and released previews', async () => {
    const {f, editor} = await setup()
    f.failNextModelRead()
    await expect(editor.prepareRebuild()).rejects.toThrow()
    const preview = await editor.prepareRebuild()
    editor.dispose()
    await expect(editor.confirmRebuild(preview)).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
  })
})

describe('pending design connections', () => {
  it('saves and reopens pending connections, deduplicates a gesture, and cancels node/edge deletion', async () => {
    const {f, session, editor} = await setup()
    const node = editor.addNode(), edge = editor.connect('M1', node)
    expect(editor.connect('M1', node)).toBe(edge)
    expect(editor.edges.rows).toHaveLength(1)
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')?.rows).toHaveLength(0)
    await editor.save()
    const reopened = new DataSpaceLayoutEdit(await f.open('A')); editors.push(reopened)
    await reopened.initialize(); reopened.state()
    expect(reopened.connection(edge)).toEqual({source: 'M1', target: node})
    reopened.removeNode(node)
    expect(reopened.edges.rows).toHaveLength(0)
    reopened.cancel(); reopened.state()
    expect(reopened.connection(edge)).toEqual({source: 'M1', target: node})
    reopened.removeEdge(edge); await reopened.save()
    expect((await f.open('A')).definitionDataSet?.layout?.unboundEdges).toEqual({})
    expect(f.requests.filter(request => request.url?.includes('batch'))).toHaveLength(0)
  })

  it('rejects unknown endpoints and edits after the formal query identity changes', async () => {
    const {session, editor} = await setup()
    const node = editor.addNode()
    expect(() => editor.connect('OTHER', node)).toThrow()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.queryContext = {dataSpaceId: 'OTHER'}
    expect(() => editor.connect('M1', node)).toThrow()
    expect(editor.edges.rows).toHaveLength(0)
  })

  it('validates pending endpoints in the file owner and rejects relation identity collisions', async () => {
    const {f, session} = await setup()
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!, key = layout.getPkKey(layout.rows[0]!)!
    for (const edges of [{E: {source: 'OTHER', target: 'M1'}}, {E: {source: ' M1', target: 'M2'}}, {E: {source: 'M1', target: 1}}]) {
      layout.updateEditingValue(key, 'unboundEdges', edges)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: layout.tableName, viewId: layout.viewId}]})).rejects.toThrow()
      expect(layout.hasEditingChanges() || layout.dirtyTracking.hasPendingChanges()).toBe(true)
      layout.discardPendingChanges()
    }
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each([false, true])('consumes a configured connection in the same native relation save and preserves it on discard: lost=%s', async lost => {
    const {f, session, editor} = await setup()
    const edge = editor.connect('M1', 'M2'); await editor.save()
    const relations = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
    await session.loadRelationDefinitions()
    const draft = {dataSetId: 'A', relationId: edge, parentTable: 'OrdersAlias', childTable: 'CustomersAlias',
      filterExpression: {field: 'rowid', operator: 'eq', value: {Type: 'GetRelatedField', Field: 'OrdersAlias.rowid'}}}
    await relations.addRow(draft); relations.discardPendingChanges()
    expect(session.viewState?.config['layout']).toMatchObject({unboundEdges: {[edge]: {source: 'M1', target: 'M2'}}})
    await relations.addRow(draft)
    if (lost) {
      f.loseNextFileResponse(); await expect(session.metadataDataSet.saveChanges()).rejects.toThrow()
      expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    } else expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.layout?.unboundEdges).toEqual({})
    expect(reopened.definitionDataSet?.resourceRelations).toEqual([expect.objectContaining({relationId: edge, parentTable: 'OrdersAlias', childTable: 'CustomersAlias'})])
    expect(f.fileWrites).toHaveLength(2)
  })

  it('rejects changing the endpoints while consuming a pending connection', async () => {
    const {session, editor} = await setup()
    const id = editor.connect('M1', 'M2'); await editor.save()
    const relations = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
    await session.loadRelationDefinitions()
    await relations.addRow({dataSetId: 'A', relationId: id,
      parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}})
    await expect(session.metadataDataSet.saveChanges()).rejects.toThrow('端点不一致')
    expect(session.viewState?.dirty).toBe(false)
    expect(session.viewState?.config['layout']).toMatchObject({unboundEdges: {[id]: {source: 'M1', target: 'M2'}}})
  })
})
