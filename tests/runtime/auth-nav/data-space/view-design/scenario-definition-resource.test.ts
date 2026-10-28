import {describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSet, DataViewLocalQuery, RequestState, type DataView} from '@spark-appworks/spark-data'
import {ProjectWorkspace, ScenarioDefinitionResource, ScenarioDefinitionDocument, ScenarioViewConfig,
  ScenarioViewWriteNotAppliedError} from '@spark-appworks/spark-project-model'

const metadataConfig = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
const definitions = Object.fromEntries(Object.entries(metadataConfig.tables).filter(([, table]) => (table as {resourceId?: string}).resourceId?.startsWith('pagedata:')))
const initial = {scenarioId: 'TARGET', schemaVersion: 2, tables: {
  Parents: {modelBinding: {modelId: 'P', modelName: 'Parents'}, views: {default: {}, one: {pageSize: 10}, two: {pageSize: 20}}},
  Children: {modelBinding: {modelId: 'C', modelName: 'Children'}, views: {default: {}}},
}, resourceRelations: [{relationId: 'R', parentTable: 'Parents', childTable: 'Children', filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}],
  viewCascades: [{kind: 'query', cascadeId: 'Q', parentTable: 'Parents', parentViewId: 'default', childTable: 'Children', childViewId: 'default', filterBindings: [{sourceField: 'id', targetField: 'parentId'}]}]}

function fixture(text: string | null = JSON.stringify(initial)) {
  let stored = text, scope = 'scope', loseResponse = false, rejectedWrite: Error | undefined, gate: Promise<void> | undefined
  const writes: string[] = []
  const versions = new Map<number, string>([[1, JSON.stringify({...initial, layout: {modelPositions: {P: {x: 1, y: 2}}}})]])
  const snapshots = vi.fn(async (_id: string, snapshot: string) => {
    const version = versions.size + 1; versions.set(version, snapshot)
    return {version, fileName: `${version}__pagedata.json`, lastModified: null}
  })
  const validate = vi.fn(async () => undefined)
  const open = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {},
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}, scenarioDefinitions: async () => dataSet,
      scenarioViews: {readScope: () => scope, readText: async id => {expect(id).toBe('TARGET'); return stored},
        writeText: async (_id, next) => {
          if (rejectedWrite) {const error = rejectedWrite; rejectedWrite = undefined; throw error}
          writes.push(next); stored = next; await gate
          if (loseResponse) {loseResponse = false; throw new Error('response lost')}
        },
        listVersions: async () => [...versions.keys()].map(version => ({version, fileName: `${version}__pagedata.json`, lastModified: null})),
        readVersion: async (_id, version) => {const value = versions.get(version); if (!value) throw new Error('version missing'); return value},
        createVersion: snapshots}})
    const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: 'META', targetScenarioId: 'TARGET', validate,
      assertCurrent: () => {if (scope !== 'scope') throw new Error('scope changed')}})
    const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'Designer', tables: definitions})
    for (const table of Object.values(dataSet.tables)) for (const view of table.viewList) {
      view.queryContext = {...view.queryContext, dataSpaceId: 'TARGET'}
      view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
    }
    const view = dataSet.getView('DataViewDefinition')!
    return {dataSet, view, workspace, resource}
  }
  return {open, writes, validate, snapshots, versions, get stored() {if (stored === null) throw new Error('file still missing'); return stored}, changeScope: () => {scope = 'other'},
    loseResponse: () => {loseResponse = true}, rejectNextWrite: (error: Error) => {rejectedWrite = error},
    restore: (value: string) => {stored = value}, gate: (value: Promise<void> | undefined) => {gate = value}}
}

const target = (view: DataView) => view.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'one')!

describe('formal definition resources through SPARK data', () => {
  it('keeps the original DataView dirty after an explicit not-applied write and allows retry', async () => {
    const storage = fixture(), {dataSet, view, workspace} = storage.open()
    try {
      await view.refresh()
      const key = view.getPkKey(target(view))!
      const original = storage.stored
      view.updateEditingValue(key, 'pageSize', 43)
      storage.rejectNextWrite(new ScenarioViewWriteNotAppliedError('repository:scenario-view:TARGET', 'CONFLICT', 'preimage changed'))

      await expect(dataSet.saveChanges()).rejects.toThrow('preimage changed')

      const file = workspace.getScenarioViews('TARGET')!
      expect(file.saveStatus).toBe('idle')
      expect(file.savedText).toBe(original)
      expect(file.getText()).toBe(original)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(storage.writes).toEqual([])
      expect(storage.stored).toBe(original)

      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(43)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {dataSet.destroy()}
  })

  it.each(['same-model', 'same-name', 'same-id', 'binding-record', 'rebind'])('rejects a conflicting model binding through DataSet (%s) without writing or dropping the draft', async mode => {
    const storage = fixture(), {dataSet, view} = storage.open()
    const bindings = dataSet.getView('DataTableBindingDefinition')!
    try {
      await view.loadFromServer({filter: {field: 'dataModelId', operator: 'eq', value: 'P'}})
      if (mode === 'binding-record' || mode === 'rebind') {
        await bindings.refresh()
        const configuration = {modelBinding: {modelId: 'P', modelName: 'Parents'}}
        if (mode === 'binding-record') await bindings.addRow({tableName: 'OtherParents', configuration})
        else {
          const row = bindings.rows.find(row => row['tableName'] === 'Children')!
          bindings.updateEditingValue(bindings.getPkKey(row)!, 'configuration', configuration)
        }
      } else await view.addRow({tableName: 'OtherParents', dataModelId: mode === 'same-name' ? 'OTHER' : 'P', dataModelName: mode === 'same-id' ? 'OtherParents' : 'Parents', viewId: 'review'})
      await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_DUPLICATE')
      expect(storage.writes).toEqual([]); expect(JSON.parse(storage.stored)).toEqual(initial)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges() || bindings.hasEditingChanges() || bindings.dirtyTracking.hasPendingChanges()).toBe(true)
      view.discardPendingChanges()
      if (mode === 'binding-record' || mode === 'rebind') bindings.discardPendingChanges()
      expect(view.rows.map(row => row['tableName'])).toEqual(['Parents', 'Parents', 'Parents'])
    } finally {dataSet.destroy()}
  })

  it.each(['file', 'formal'])('rejects a new %s model that collides with the other resource public name', async mode => {
    const original = {...initial, tables: {...initial.tables,
      Parents: {...initial.tables.Parents, modelBinding: {modelId: 'P', modelName: 'PublicParents'}},
      Files: {resourceType: 'file', resourceId: 'pagedata:views', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}},
    }}
    const storage = fixture(JSON.stringify(original)), {dataSet, view} = storage.open()
    try {
      if (mode === 'file') {
        const bindings = dataSet.getView('DataTableBindingDefinition')!
        await bindings.refresh()
        const configuration = {resourceType: 'file', resourceId: 'pagedata:views', columns: original.tables.Files.columns}
        await bindings.addRow({tableName: 'PublicParents', configuration})
      } else {
        await view.refresh()
        await view.addRow({tableName: 'OtherFiles', dataModelId: 'OTHER', dataModelName: 'Files', viewId: 'review'})
      }
      await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_DUPLICATE')
      expect(storage.writes).toEqual([]); expect(JSON.parse(storage.stored)).toEqual(original)
    } finally {dataSet.destroy()}
  })

  it('rejects duplicate model bindings from the definition document without replacing its original drafts', async () => {
    const storage = fixture(), {dataSet} = storage.open()
    const document = await ScenarioDefinitionDocument.open(dataSet, 'TARGET')
    try {
      const before = document.getText(), candidate = JSON.parse(before)
      candidate.tables.OtherParents = structuredClone(candidate.tables.Parents)
      await expect(document.setText(JSON.stringify(candidate))).rejects.toThrow('SCENARIO_DEFINITION_DUPLICATE')
      expect(document.getText()).toBe(before); expect(document.isDirty).toBe(false)
      expect(storage.writes).toEqual([])
    } finally {document.dispose(); dataSet.destroy()}
  })

  it('repairs historical duplicate bindings explicitly while retaining their readable definitions and unrelated edits', async () => {
    const original = {...initial, tables: {...initial.tables, OtherParents: structuredClone(initial.tables.Parents)}}
    const storage = fixture(JSON.stringify(original)), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      expect(view.rows.filter(row => row['dataModelId'] === 'P')).toHaveLength(6)
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 31)
      expect((await dataSet.saveChanges()).success).toBe(true)
      const bindings = dataSet.getView('DataTableBindingDefinition')!
      await bindings.loadFromServer({filter: {field: 'tableName', operator: 'eq', value: 'OtherParents'}})
      await bindings.removeRow(bindings.getPkKey(bindings.rows[0]!)!)
      expect((await dataSet.saveChanges()).success).toBe(true)
      const reopened = storage.open()
      try {
        await reopened.view.refresh()
        expect(reopened.view.rows.filter(row => row['dataModelId'] === 'P')).toHaveLength(3)
        expect(target(reopened.view)['pageSize']).toBe(31)
        expect(JSON.parse(storage.stored).tables.Children).toEqual(initial.tables.Children)
        expect(JSON.parse(storage.stored).resourceRelations).toEqual(initial.resourceRelations)
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('queries binding identity from the file without persisting a second model identity', async () => {
    const storage = fixture(), {dataSet} = storage.open()
    const bindings = dataSet.getView('DataTableBindingDefinition')!
    try {
      const loaded = await bindings.loadFromServer({filter: {field: 'dataModelId', operator: 'eq', value: 'P'}})
      expect(loaded.success, loaded.message).toBe(true)
      expect(bindings.rows).toHaveLength(1)
      const row = bindings.rows[0]!, key = bindings.getPkKey(row)!
      expect(row).toMatchObject({tableName: 'Parents', dataModelId: 'P', dataModelName: 'Parents'})
      expect(bindings.fieldAccess(row, 'dataModelId').write).toBe('denied')
      expect(bindings.fieldAccess(row, 'dataModelName').write).toBe('denied')
      const configuration = structuredClone(row['configuration']) as Record<string, unknown>
      configuration['crudConfig'] = {timeout: 4500}
      bindings.updateEditingValue(key, 'configuration', configuration)
      expect((await dataSet.saveChanges({views: [{tableName: bindings.tableName, viewId: bindings.viewId}]})).success).toBe(true)
      const persisted = JSON.parse(storage.stored)
      expect(persisted.tables.Parents.crudConfig).toEqual({timeout: 4500})
      expect(persisted.tables.Parents.modelBinding).toEqual({modelId: 'P', modelName: 'Parents'})
      expect(persisted.tables.Parents).not.toHaveProperty('dataModelId')
      expect(persisted.tables.Parents).not.toHaveProperty('dataModelName')
      expect(persisted.tables.Children).toEqual(initial.tables.Children)
      const reopened = storage.open()
      try {
        const view = reopened.dataSet.getView('DataTableBindingDefinition')!
        expect((await view.loadFromServer({filter: {field: 'dataModelId', operator: 'eq', value: 'P'}})).success).toBe(true)
        expect(view.rows[0]).toMatchObject({tableName: 'Parents', dataModelId: 'P', dataModelName: 'Parents', configuration: {crudConfig: {timeout: 4500}}})
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })
  it('does not overwrite an external consumer edit with local undo and invalidates after a definition requery', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      const document = await ScenarioDefinitionDocument.open(dataSet, 'TARGET')
      const next = JSON.parse(document.getText()); next.tables.Parents.views.one.pageSize = 42
      await document.setText(JSON.stringify(next))
      expect(document.canUndo).toBe(true)
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 73)
      expect(document.canUndo).toBe(false); expect(await document.undo()).toBe(false)
      expect(JSON.parse(document.getText()).tables.Parents.views.one.pageSize).toBe(73)
      view.discardPendingChanges(); await view.refresh()
      expect(() => document.getText()).toThrow('IDENTITY')
      await expect(document.setText(JSON.stringify(next))).rejects.toThrow('IDENTITY')
      expect(storage.writes).toEqual([])
      document.dispose()
      expect(dataSet.destroyed).toBe(false)
    } finally {dataSet.destroy()}
  })

  it('keeps a newly created document unconfirmed after a lost receipt until the original DataSet verifies it', async () => {
    const storage = fixture(null), {dataSet, view} = storage.open()
    try {
      const document = await ScenarioDefinitionDocument.open(dataSet, 'TARGET')
      expect(document.isPersisted).toBe(false)
      await document.setText(JSON.stringify({scenarioId: 'TARGET', tables: initial.tables, viewCascades: []}))
      expect(document.isPersisted).toBe(false)
      storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow()
      expect(document.isPersisted).toBe(false); expect(document.isDirty).toBe(true)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(document.isPersisted).toBe(true); expect(document.isDirty).toBe(false)
      expect(view.rows).toHaveLength(4)
      document.dispose()
    } finally {dataSet.destroy()}
  })

  it('saves workspace definition changes through DataSet and preserves independent reopen results', async () => {
    const storage = fixture(), {dataSet, workspace, view} = storage.open()
    try {
      expect(await workspace.loadScenarioDefinitions({scenarioId: 'TARGET'})).toBe(dataSet)
      await view.refresh()
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 61)
      expect(workspace.dirtyScenarioIds).toEqual(['TARGET'])
      await workspace.saveDirtyScenarioDefinitions()
      expect(storage.writes).toHaveLength(1)
      expect(workspace.dirtyScenarioIds).toEqual([])
      const reopened = storage.open()
      try {await reopened.view.refresh(); expect(target(reopened.view)['pageSize']).toBe(61)} finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('rejects an already loaded filtered definition view instead of treating unseen records as deletions', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.loadFromServer({filter: {field: 'tableName', operator: 'eq', value: 'Children'}, allPages: true})
      expect(view.rows).toHaveLength(1)
      await expect(ScenarioDefinitionDocument.open(dataSet, 'TARGET')).rejects.toThrow('INCOMPLETE')
      expect(view.hasEditingChanges()).toBe(false)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(storage.writes).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('projects a complete configuration from definition views and undoes text edits without a second file draft', async () => {
    const storage = fixture(), {dataSet, workspace, view} = storage.open()
    try {
      const document = await ScenarioDefinitionDocument.open(dataSet, 'TARGET')
      const next = JSON.parse(document.getText()); next.tables.Parents.views.one.pageSize = 42
      await document.setText(JSON.stringify(next))
      expect(view.getEditingRow(view.getPkKey(target(view))!)?.['pageSize']).toBe(42)
      expect(document.isDirty).toBe(true)
      expect(workspace.getScenarioViews('TARGET')?.isDirty).toBe(false)
      expect(storage.writes).toEqual([])
      expect(await document.undo()).toBe(true)
      expect(document.isDirty).toBe(false)
      expect(await document.redo()).toBe(true)
      expect((await dataSet.saveChanges({views: document.viewSelectors})).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(42)
      expect(document.isDirty).toBe(false)
      const reopened = storage.open()
      try {expect(JSON.parse((await ScenarioDefinitionDocument.open(reopened.dataSet, 'TARGET')).getText()).tables.Parents.views.one.pageSize).toBe(42)}
      finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('stages explicit historical definitions through DataView and preserves root metadata and other views', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      const document = await ScenarioDefinitionDocument.open(dataSet, 'TARGET')
      const previous = document.getText(), next = JSON.parse(previous)
      next.tables.Parents.views.extra = {pageSize: 5}
      delete next.tables.Parents.views.two
      await document.setText(JSON.stringify(next))
      expect(view.dirtyTracking.pendingCreateIds.size).toBe(1)
      expect(view.dirtyTracking.pendingDeleteIds.size).toBe(1)
      expect(await document.undo()).toBe(true)
      expect(document.getText()).toBe(previous)
      expect(document.isDirty).toBe(false)
      const invalid = JSON.parse(previous); invalid.schemaVersion = 3
      await expect(document.setText(JSON.stringify(invalid))).rejects.toThrow('ROOT')
      expect(document.getText()).toBe(previous)
      const preview = await view.previewSourceVersion(1)
      await document.setText(preview)
      expect(storage.writes).toEqual([])
      expect((await dataSet.saveChanges({views: document.viewSelectors})).success).toBe(true)
      expect(JSON.parse(storage.stored).layout).toEqual({modelPositions: {P: {x: 1, y: 2}}})
      expect(JSON.parse(storage.stored).tables).toEqual(initial.tables)
    } finally {dataSet.destroy()}
  })

  it('reads and creates source history through the bound definition view, preserving drafts and the working file', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      expect(await view.listSourceVersions()).toEqual([{version: 1, label: '1__pagedata.json', lastModified: null}])
      const original = storage.stored
      const preview = await view.previewSourceVersion(1)
      expect(preview).toBe(storage.versions.get(1))
      expect(storage.stored).toBe(original)
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 42)
      await expect(view.createSourceVersion()).rejects.toThrow('DIRTY')
      expect(storage.snapshots).not.toHaveBeenCalled()
      view.discardPendingChanges()
      await view.createSourceVersion()
      expect(storage.snapshots).toHaveBeenCalledWith('TARGET', original, expect.any(Function))
      expect(storage.versions.get(2)).toBe(original)
      expect(storage.writes).toEqual([])
      expect(target(view)['pageSize']).toBe(10)
    } finally {dataSet.destroy()}
  })

  it('edits, cancels, saves and reopens native view cache policy without changing the other view', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'queryConfig', {cacheType: 'page'})
      view.discardEditingRows([key])
      expect(target(view)['queryConfig']).toBeUndefined()
      view.updateEditingValue(key, 'queryConfig', {cacheType: 'browser'})
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.queryConfig).toEqual({cacheType: 'browser'})
      expect(JSON.parse(storage.stored).tables.Parents.views.two).toEqual(initial.tables.Parents.views.two)
      const reopened = storage.open()
      try {
        await reopened.view.refresh()
        expect(target(reopened.view)['queryConfig']).toEqual({cacheType: 'browser'})
        reopened.view.updateEditingValue(reopened.view.getPkKey(target(reopened.view))!, 'queryConfig', {cacheType: 'persistent'})
        await expect(reopened.dataSet.saveChanges()).rejects.toThrow('cacheType')
        expect(storage.writes).toHaveLength(1)
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })
  it('persists completion configuration per view and restores it through an independent reopen', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      view.updateEditingValue(view.getPkKey(target(view))!, 'onRequestComplete', 'ordersLoaded')
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.onRequestComplete).toBe('ordersLoaded')
      expect(JSON.parse(storage.stored).tables.Parents.views.two).toEqual(initial.tables.Parents.views.two)
      const reopened = storage.open()
      try {
        await reopened.view.refresh()
        expect(target(reopened.view)['onRequestComplete']).toBe('ordersLoaded')
        reopened.view.updateEditingValue(reopened.view.getPkKey(target(reopened.view))!, 'onRequestComplete', 'ordersLoaded()')
        await expect(reopened.dataSet.saveChanges()).rejects.toThrow('onRequestComplete')
        expect(storage.writes).toHaveLength(1)
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })
  it('rejects disposal during validation before writing the captured definitions', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    storage.validate.mockImplementationOnce(async () => {await gate; return undefined})
    await view.refresh()
    view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 33)
    const saving = dataSet.saveChanges()
    await vi.waitFor(() => expect(storage.validate).toHaveBeenCalledOnce())
    dataSet.destroy(); release()
    await expect(saving).rejects.toThrow(/IDENTITY|destroyed/)
    expect(storage.writes).toEqual([])
    expect(storage.stored).toBe(JSON.stringify(initial))
  })

  it.each(['delete-reference', 'delete-native', 'edit', 'add'] as const)('keeps unresolved legacy sources intact during %s', async operation => {
    const reference = {sourceRelationId: 'MISSING', parentTable: 'Parents', childTable: 'Children'}
    const config = {...initial, schemaVersion: 1, resourceRelations: [initial.resourceRelations[0], reference]}
    const text = JSON.stringify(config), storage = fixture(text), {dataSet} = storage.open()
    const view = dataSet.getView('DataResourceRelationDefinition')!
    try {
      await view.refresh()
      const row = view.rows.find(item => item['sourceRelationId'] === 'MISSING')!
      if (operation === 'delete-reference') await view.removeRow(view.getPkKey(row)!)
      else if (operation === 'delete-native') await view.removeRow(view.getPkKey(view.rows[0]!)!)
      else if (operation === 'edit') view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'changed')
      else await view.addRow({dataSetId: 'TARGET', ...initial.resourceRelations[0], relationId: 'NEW'})
      if (operation === 'delete-reference') {
        expect((await dataSet.saveChanges()).success).toBe(true)
        expect(JSON.parse(storage.stored)).toEqual({...config, resourceRelations: [initial.resourceRelations[0]]})
        expect(storage.writes).toHaveLength(1)
      } else {
        await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_LEGACY')
        expect(storage.stored).toBe(text)
        expect(storage.writes).toEqual([])
        expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
      }
    } finally {dataSet.destroy()}
  })

  it('adopts through the native source protocol and saves after unknown recovery', async () => {
    const storage = fixture(), {dataSet, view, resource} = storage.open()
    try {
      expect(resource).not.toHaveProperty('adoptSource')
      await view.refresh()
      const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 31); storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow()
      const remote = JSON.stringify({...initial, tables: {...initial.tables, Parents: {...initial.tables.Parents,
        views: {...initial.tables.Parents.views, one: {pageSize: 44}}}}})
      storage.restore(remote)
      const snapshot = await view.previewSource()
      expect(snapshot.content).toBe(remote)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      await view.adoptSource(snapshot, {discardViews: [view]})
      await view.refresh(); expect(target(view)['pageSize']).toBe(44)
      view.updateEditingValue(key, 'pageSize', 45)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(2)
      const reopened = storage.open()
      try {await reopened.view.refresh(); expect(target(reopened.view)['pageSize']).toBe(45)}
      finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it.each([false, true])('accepts derived read-only model names when binding and view edits save together (lost=%s)', async lost => {
    const storage = fixture(), {dataSet, view} = storage.open()
    const bindings = dataSet.getView('DataTableBindingDefinition')!
    try {
      await bindings.refresh(); await view.refresh()
      const binding = bindings.rows.find(row => row['tableName'] === 'Parents')!
      bindings.updateEditingValue(bindings.getPkKey(binding)!, 'configuration', {modelBinding: {modelId: 'P', modelName: 'Renamed'}})
      const id = view.getPkKey(target(view))!
      view.updateEditingValue(id, 'pageSize', 25)
      if (lost) {storage.loseResponse(); await expect(dataSet.saveChanges()).rejects.toThrow('response lost')}
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(view.getEditingRow(id)).toMatchObject({dataModelName: 'Renamed', pageSize: 25})
      expect(view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()).toBe(false)
      expect(view.fieldAccess(target(view), 'dataModelName').write).toBe('denied')
      view.updateEditingValue(id, 'pageSize', 26)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(2)
      const reopened = storage.open()
      try {await reopened.view.refresh(); expect(target(reopened.view)).toMatchObject({dataModelName: 'Renamed', pageSize: 26})}
      finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('declares required file query input only for registered resources', () => {
    expect(ScenarioDefinitionResource.queryParameters('pagedata:views')).toEqual([
      {name: 'dataSpaceId', type: 'string', label: '目标数据空间ID', required: true},
    ])
    expect(() => ScenarioDefinitionResource.queryParameters('unknown')).toThrow('SCENARIO_DEFINITION_IDENTITY')
  })

  it.each(DataViewLocalQuery.outputTypes)('keeps $value mode and query inputs through filtering, sorting and pagination', async ({value}) => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      view.configure({pageSize: 1, queryConfig: {outputType: value, allPages: false}})
      await view.executeFilter({field: 'tableName', operator: 'eq', value: 'Parents'})
      await view.setSort([{field: 'viewId', direction: 'desc'}])
      await view.setPage(2)
      expect(view.requestState).toBe(RequestState.Loaded)
      expect(view.total).toBe(3)
      expect(view.rows.map(row => row['viewId'])).toEqual(value === 'Table' ? ['one'] : ['two', 'one', 'default'])
      expect(view.queryContext).toMatchObject({dataSpaceId: 'TARGET'})
      expect(view.queryConfig.outputType).toBe(value)
      expect(storage.writes).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('rejects server joins and node queries without silently coercing file configuration', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      view.queryConfig = {outputType: 'Join'}
      await view.refresh()
      expect(view.requestState).toBe(RequestState.Failed)
      expect(view.loadingError?.message).toContain('本地资源支持')
      expect(view.queryConfig.outputType).toBe('Join')
      view.queryConfig = {outputType: 'SelfRefData', tree: {keyField: 'viewId', parentField: 'tableName', nodeId: 'Parents'}}
      await view.refresh()
      expect(view.loadingError?.message).toContain('本地资源支持')
      expect(view.queryConfig.tree?.nodeId).toBe('Parents')
      expect(storage.writes).toEqual([])
    } finally {dataSet.destroy()}
  })

  it.each(['relation', 'cascade', 'lookup', 'function', 'pending-edge'] as const)('rejects file model deletion with a surviving %s reference without writing or losing its draft', async kind => {
    const original = {...initial, resourceRelations: [], viewCascades: [], tables: {...initial.tables,
      Files: {resourceType: 'file', resourceId: 'pagedata:views', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}}}
    const config: Record<string, unknown> = structuredClone(original)
    if (kind === 'relation') config['resourceRelations'] = [{relationId: 'R', parentTable: 'Files', childTable: 'Parents', filterExpression: {field: 'id', operator: 'eq', value: 1}}]
    if (kind === 'cascade') config['viewCascades'] = [{kind: 'query', parentTable: 'Files', parentViewId: 'default', childTable: 'Parents', childViewId: 'default', filterBindings: [{sourceField: 'id', targetField: 'id'}]}]
    const parentView = (config['tables'] as typeof original.tables).Parents.views.default as Record<string, unknown>
    if (kind === 'lookup') parentView['queryConfig'] = {filterLookups: [{field: 'id', sourceViewKey: 'TARGET@Files@default', valueField: 'id', matchField: 'id'}]}
    if (kind === 'function') parentView['filterExpression'] = {field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Files', RefFieldName: 'id', FkFieldName: 'id'}}
    if (kind === 'pending-edge') config['layout'] = {unboundEdges: {edge: {source: 'TARGET+Files', target: 'P'}}}
    const storage = fixture(JSON.stringify(config)), {dataSet} = storage.open()
    try {
      const view = dataSet.getView('DataTableBindingDefinition')!
      view.filterExpression = {field: 'tableName', operator: 'eq', value: 'Files'}
      await view.refresh()
      const key = view.getPkKey(view.rows[0]!)!
      await view.removeRow(key)
      await expect(dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})).rejects.toThrow(/REFERENCES/)
      expect(storage.writes).toEqual([])
      expect(view.dirtyTracking.isPendingDelete(key)).toBe(true)
      view.discardPendingChanges()
      expect(view.rows[0]?.['tableName']).toBe('Files')
    } finally {dataSet.destroy()}
  })
  it('saves a filtered file binding deletion, preserves unloaded models and literal values, and reopens independently', async () => {
    const original = {...initial, resourceRelations: [], viewCascades: [], layout: {tablePositions: {Files: {x: 1, y: 2}}},
      tables: {...initial.tables, Parents: {...initial.tables.Parents, views: {default: {filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetConstValue', Value: {Type: 'GetRefData', RefTableName: 'Files'}}}}}},
        Files: {resourceType: 'file', resourceId: 'pagedata:views', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, compact: {pageSize: 5}}}}}
    const storage = fixture(JSON.stringify(original)), {dataSet} = storage.open()
    try {
      const view = dataSet.getView('DataTableBindingDefinition')!
      view.filterExpression = {field: 'tableName', operator: 'eq', value: 'Files'}
      await view.refresh(); expect(view.rows).toHaveLength(1)
      await view.removeRow(view.getPkKey(view.rows[0]!)!)
      expect((await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})).success).toBe(true)
      const saved = JSON.parse(storage.stored)
      expect(saved.tables).toEqual({Parents: original.tables.Parents, Children: original.tables.Children})
      expect(saved.layout.tablePositions).toEqual({}); expect(storage.writes).toHaveLength(1)
      expect(storage.validate).toHaveBeenLastCalledWith(expect.any(ScenarioViewConfig), expect.any(ScenarioViewConfig), ['pagedata:tables'])
      const independent = storage.open()
      try {const bindings = independent.dataSet.getView('DataTableBindingDefinition')!; await bindings.refresh(); expect(bindings.rows.map(row => row['tableName'])).toEqual(['Parents', 'Children'])}
      finally {independent.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })
  it('queries file model bindings through the configured filter and denies editing the graph projection', async () => {
    const original = {...initial, tables: {...initial.tables,
      Files: {resourceType: 'file', resourceId: 'pagedata:views', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}}}
    const storage = fixture(JSON.stringify(original)), {dataSet} = storage.open()
    try {
      const graph = dataSet.getView('DataTableBindingDefinition', 'fileModels')!, bindings = dataSet.getView('DataTableBindingDefinition')!
      await graph.refresh(); await bindings.refresh()
      expect(graph.rows.map(row => row['tableName'])).toEqual(['Files'])
      expect(graph.getPkKey(graph.rows[0]!)).toBe(new ScenarioViewConfig('TARGET', JSON.stringify(original)).getLayoutNodeKey('Files'))
      expect(graph.fieldAccess(graph.rows[0]!, 'configuration').write).toBe('denied')
      expect(bindings.fieldAccess(bindings.rows[0]!, 'resourceType').write).toBe('denied')
      expect(storage.writes).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('consumes a pending file model connection when its native relation is saved and reopens it', async () => {
    const original = {...initial, resourceRelations: [], layout: {unboundEdges: {R: {source: 'TARGET+Files', target: 'P'}}}, tables: {...initial.tables,
      Files: {resourceType: 'file', resourceId: 'pagedata:views', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}}}
    const storage = fixture(JSON.stringify(original)), {dataSet} = storage.open()
    try {
      const relations = dataSet.getView('DataResourceRelationDefinition')!
      await relations.refresh()
      await relations.addRow({relationId: 'R', parentTable: 'Files', childTable: 'Parents', filterExpression: {field: 'id', operator: 'eq', value: 1}})
      expect((await dataSet.saveChanges()).success).toBe(true)
      const saved = JSON.parse(storage.stored)
      expect(saved.layout.unboundEdges).toEqual({}); expect(saved.tables).toEqual(original.tables)
      const after = new ScenarioViewConfig('TARGET', storage.stored)
      expect(after.selectRelationValidationScope(new ScenarioViewConfig('TARGET', JSON.stringify(original)))).not.toBeNull()
      const reopened = storage.open()
      try {
        await reopened.dataSet.getView('DataResourceRelationDefinition')!.refresh()
        expect(reopened.dataSet.getView('DataResourceRelationDefinition')!.rows).toMatchObject([{parentTable: 'Files', childTable: 'Parents'}])
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('retains unapplied layout changes after verification and writes again only on explicit save', async () => {
    const storage = fixture(), {dataSet} = storage.open()
    try {
      const layout = dataSet.getView('DataSpaceLayoutDefinition')!
      await layout.refresh()
      layout.updateEditingValue(layout.getPkKey(layout.rows[0]!)!, 'modelPositions', {P: {x: 1, y: 2}})
      storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      storage.restore(JSON.stringify(initial))
      await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_NOT_APPLIED:')
      expect(storage.writes).toHaveLength(1)
      expect(layout.hasEditingChanges() || layout.dirtyTracking.hasPendingChanges()).toBe(true)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(2)
    } finally {dataSet.destroy()}
  })
  it('validates layout shape, clears optional positions and preserves unedited definitions', async () => {
    const storage = fixture(JSON.stringify({...initial, layout: {modelPositions: {P: {x: 1, y: 2}}, unboundNodes: {N: {label: '待配置', x: 3, y: 4}}}}))
    const {dataSet} = storage.open()
    try {
      const layout = dataSet.getView('DataSpaceLayoutDefinition')!
      await layout.refresh()
      const key = layout.getPkKey(layout.rows[0]!)!
      layout.updateEditingValue(key, 'modelPositions', {P: {x: 'bad', y: 3}})
      await expect(dataSet.saveChanges()).rejects.toThrow('有限数值')
      expect(storage.writes).toHaveLength(0)
      layout.discardPendingChanges()
      layout.updateEditingValue(key, 'modelPositions', undefined)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored)).toEqual({...initial, layout: {unboundNodes: {N: {label: '待配置', x: 3, y: 4}}}})
    } finally {dataSet.destroy()}
  })
  it('queries and edits layout in its native DataView, cancels and saves without assembling unchanged models', async () => {
    const storage = fixture(), {dataSet} = storage.open()
    try {
      const layout = dataSet.getView('DataSpaceLayoutDefinition')!
      expect(layout, 'C must declare the layout file resource').toBeDefined()
      await layout.refresh()
      expect(layout.rows).toHaveLength(1)
      const key = layout.getPkKey(layout.rows[0]!)!
      layout.updateEditingValue(key, 'modelPositions', {P: {x: 8, y: 9}})
      layout.discardPendingChanges()
      expect(layout.getEditingRow(key)?.['modelPositions']).toBeUndefined()
      expect(storage.writes).toEqual([])
      layout.updateEditingValue(key, 'modelPositions', {P: {x: 8, y: 9}})
      expect((await dataSet.saveChanges()).success).toBe(true)
      const after = JSON.parse(storage.stored)
      expect(after).toEqual({...initial, layout: {modelPositions: {P: {x: 8, y: 9}}}})
      const reopened = storage.open()
      try {
        const read = reopened.dataSet.getView('DataSpaceLayoutDefinition')!
        await read.refresh()
        expect(read.rows[0]?.['modelPositions']).toEqual({P: {x: 8, y: 9}})
      } finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })
  it('denies a container placeholder without a row identity while retaining real row access', async () => {
    const {dataSet, view} = fixture().open()
    try {
      await view.refresh()
      expect(view.fieldAccess({}, 'viewId')).toMatchObject({read: 'invisible', write: 'denied'})
      expect(view.fieldAccess(target(view), 'pageSize')).toMatchObject({read: 'visible', write: 'allowed'})
    } finally {dataSet.destroy()}
  })
  it('creates file models with their named views in one native batch for self-description', async () => {
    const storage = fixture(), {dataSet, view, workspace} = storage.open()
    try {
      const bindings = dataSet.getView('DataTableBindingDefinition')!
      await bindings.refresh(); await view.refresh()
      for (const [tableName, declaration] of Object.entries(definitions)) {
        const {views, ...configuration} = declaration as {views: Record<string, Record<string, unknown>>}
        await bindings.addRow({tableName, configuration})
        for (const [viewId, properties] of Object.entries(views)) await view.addRow({tableName, viewId, ...properties})
      }
      expect(workspace.getScenarioViews('TARGET')!.isDirty).toBe(false)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(JSON.parse(storage.stored).tables).toEqual({...initial.tables, ...definitions})
    } finally {dataSet.destroy()}
  })

  it('keeps relation query identity across explicit legacy conversion and a second save', async () => {
    const relation = {...initial.resourceRelations[0]!, sourceRelationId: 'OLD', filterExpression: {field: 'id', operator: 'eq' as const, value: 1}}
    const storage = fixture(JSON.stringify({...initial, schemaVersion: 1, resourceRelations: [{sourceRelationId: 'OLD', parentTable: 'Parents', childTable: 'Children'}]}))
    const {dataSet, workspace, resource} = storage.open()
    try {
      const file = await workspace.loadScenarioViews({scenarioId: 'TARGET'})
      resource.useResolvedRelations(file, [relation])
      const view = dataSet.getView('DataResourceRelationDefinition')!
      await view.refresh()
      const key = view.getPkKey(view.rows[0]!)!
      view.updateEditingValue(key, 'relationName', 'first')
      expect((await dataSet.saveChanges()).success).toBe(true)
      view.updateEditingValue(key, 'relationName', 'second')
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored)).toMatchObject({schemaVersion: 2, resourceRelations: [{relationName: 'second'}]})
    } finally {dataSet.destroy()}
  })

  it('routes real query input to its target, retains receipts and rejects mixed-target submissions', async () => {
    const stored = new Map(['T1', 'T2'].map(id => [id, JSON.stringify({...initial, scenarioId: id})]))
    const writes: string[] = []
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {},
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      scenarioViews: {readScope: () => 'scope', readText: async id => stored.get(id) ?? null,
        writeText: async (id, text) => {stored.set(id, text); writes.push(id)}}})
    const executor = ScenarioDefinitionResource.forQueries({workspace, metadataScenarioId: 'META', assertCurrent: () => {}, validate: async () => {}})
    const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'Designer', tables: definitions})
    try {
      const table = dataSet.getTable('DataViewDefinition')!
      const one = table.getView('default')!, two = table.getOrCreateView('second')
      for (const [view, id] of [[one, 'T1'], [two, 'T2']] as const) {
        view.commitMode = 'staged'
        view.queryContext = {dataSpaceId: id}
        view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
        await view.refresh()
        expect(view.loadingError).toBeNull()
      }
      one.updateEditingValue(one.getPkKey(target(one))!, 'pageSize', 32)
      expect((await dataSet.saveChanges({views: [{tableName: table.tableName, viewId: one.viewId}]})).success).toBe(true)
      one.updateEditingValue(one.getPkKey(target(one))!, 'pageSize', 33)
      expect((await dataSet.saveChanges({views: [{tableName: table.tableName, viewId: one.viewId}]})).success).toBe(true)
      one.updateEditingValue(one.getPkKey(target(one))!, 'pageSize', 34)
      two.updateEditingValue(two.getPkKey(target(two))!, 'pageSize', 99)
      await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_TARGET')
      expect(writes).toEqual(['T1', 'T1'])
      expect(JSON.parse(stored.get('T1')!).tables.Parents.views.one.pageSize).toBe(33)
      expect(JSON.parse(stored.get('T2')!).tables.Parents.views.one.pageSize).toBe(10)
      const snapshot = await one.previewSource()
      await expect(one.adoptSource(snapshot, {discardViews: [two]})).rejects.toThrow('IDENTITY')
      await one.adoptSource(snapshot, {discardViews: [one]})
      await one.refresh()
      expect(target(one)['pageSize']).toBe(33)
      expect(two.getEditingRow(two.getPkKey(target(two))!)?.['pageSize']).toBe(99)
      expect(writes).toEqual(['T1', 'T1'])
    } finally {dataSet.destroy()}
  })

  it('deletes an explicit table binding through its own DataView and preserves other model definitions', async () => {
    const storage = fixture(JSON.stringify({...initial, resourceRelations: [], viewCascades: []})), {dataSet, workspace} = storage.open()
    try {
      const view = dataSet.getView('DataTableBindingDefinition')!
      await view.refresh()
      const row = view.rows.find(item => item['tableName'] === 'Parents')!
      expect(row['configuration']).toEqual({modelBinding: initial.tables.Parents.modelBinding})
      await view.removeRow(view.getPkKey(row)!)
      expect(workspace.getScenarioViews('TARGET')!.isDirty).toBe(false)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables).toEqual({Children: initial.tables.Children})
      const reopened = storage.open()
      try {await reopened.view.refresh(); expect(reopened.view.rows.map(item => item['tableName'])).toEqual(['Children'])}
      finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('keeps edits made during a save and submits them in the next native save', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    let release!: () => void
    storage.gate(new Promise<void>(resolve => {release = resolve}))
    try {
      await view.refresh()
      const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 21)
      const saving = dataSet.saveChanges()
      await vi.waitFor(() => expect(storage.writes).toHaveLength(1))
      view.updateEditingValue(key, 'pageSize', 35)
      release(); expect((await saving).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(21)
      expect(view.getEditingRow(key)?.['pageSize']).toBe(35)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(35)
      expect(storage.writes).toHaveLength(2)
    } finally {release(); dataSet.destroy()}
  })

  it('cancels first-file creation before submission and creates only on native save', async () => {
    const storage = fixture(null), {dataSet, view, workspace} = storage.open()
    try {
      await view.refresh(); expect(view.loadingError).toBeNull()
      await view.addRow({tableName: 'Parents', dataModelId: 'P', dataModelName: 'Parents', viewId: 'one'})
      expect(workspace.getScenarioViews('TARGET')).toBeNull(); expect(storage.writes).toEqual([])
      await view.removeRow(view.getPkKey(view.rows[0]!)!)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toEqual([]); expect(workspace.getScenarioViews('TARGET')).toBeNull()
      await view.addRow({tableName: 'Parents', dataModelId: 'P', dataModelName: 'Parents', viewId: 'one'})
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(workspace.getScenarioViews('TARGET')?.isPersisted).toBe(true)
      expect(storage.writes).toHaveLength(1)
    } finally {dataSet.destroy()}
  })

  it('keeps surviving cascade identity after deletion and supports a second save without reloading', async () => {
    const config = {...initial, viewCascades: [initial.viewCascades[0], {...initial.viewCascades[0], cascadeId: 'Q2'}]}
    const storage = fixture(JSON.stringify(config)), {dataSet} = storage.open()
    try {
      const view = dataSet.getView('DataViewCascadeDefinition')!
      await view.refresh()
      const remaining = view.getPkKey(view.rows[1]!)!
      await view.removeRow(view.getPkKey(view.rows[0]!)!)
      expect((await dataSet.saveChanges()).success).toBe(true)
      view.updateEditingValue(remaining, 'autoLoad', false)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).viewCascades).toMatchObject([{cascadeId: 'Q2', autoLoad: false}])
    } finally {dataSet.destroy()}
  })

  it('deletes an unnamed cascade after confirmed unknown save and native cancellation without reloading', async () => {
    const {kind: _kind, cascadeId: _id, ...query} = initial.viewCascades[0]!
    const storage = fixture(JSON.stringify({...initial, viewCascades: [query]})), {dataSet} = storage.open()
    try {
      const view = dataSet.getView('DataViewCascadeDefinition')!
      await view.refresh()
      const key = view.getPkKey(view.rows[0]!)!
      view.updateEditingValue(key, 'autoLoad', false)
      storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      await view.removeRow(key); view.discardPendingChanges()
      expect(view.rows).toMatchObject([{autoLoad: false}])
      await view.removeRow(key)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).viewCascades).toEqual([])
      expect(storage.writes).toHaveLength(2)
    } finally {dataSet.destroy()}
  })

  it('adds the first view for an unbound formal model without staging another file draft', async () => {
    const storage = fixture(), {dataSet, view, workspace} = storage.open()
    try {
      await view.refresh()
      await view.addRow({tableName: 'Review', dataModelId: 'R', dataModelName: 'ReviewModel', viewId: 'pending', pageSize: 17})
      expect(workspace.getScenarioViews('TARGET')!.isDirty).toBe(false)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.Review).toEqual({modelBinding: {modelId: 'R', modelName: 'ReviewModel'}, views: {pending: {pageSize: 17}, default: {}}})
      const reopened = storage.open()
      try {await reopened.view.refresh(); expect(reopened.view.rows.filter(row => row['tableName'] === 'Review')).toHaveLength(2)}
      finally {reopened.dataSet.destroy()}
    } finally {dataSet.destroy()}
  })

  it('rejects new bindings without an explicit formal model name and retains the original file', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      await view.addRow({tableName: 'Review', dataModelId: 'R', viewId: 'pending'})
      await expect(dataSet.saveChanges()).rejects.toThrow('SCENARIO_DEFINITION_IDENTITY')
      expect(storage.writes).toEqual([])
      expect(JSON.parse(storage.stored)).toEqual(initial)
    } finally {dataSet.destroy()}
  })

  it.each(['edit', 'clear', 'add', 'delete'])('queries and %s through DataSet, then independently reopens without another business save API', async operation => {
    const storage = fixture(), owner = storage.open()
    try {
      await owner.view.refresh()
      const row = target(owner.view), key = owner.view.getPkKey(row)!
      if (operation === 'add') await owner.view.addRow({dataSetId: 'TARGET', dataModelId: 'P', tableName: 'Parents', viewId: 'extra', pageSize: 31})
      else if (operation === 'delete') await owner.view.removeRow(key)
      else owner.view.updateEditingValue(key, 'pageSize', operation === 'clear' ? undefined : 31)
      expect((await owner.dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(owner.view.hasEditingChanges() || owner.view.dirtyTracking.hasPendingChanges()).toBe(false)
      const reopened = storage.open()
      try {
        await reopened.view.refresh()
        const views = JSON.parse(storage.stored).tables.Parents.views
        if (operation === 'delete') expect(views).not.toHaveProperty('one')
        else if (operation === 'clear') expect(views.one).not.toHaveProperty('pageSize')
        else expect(views[operation === 'add' ? 'extra' : 'one'].pageSize).toBe(31)
        expect(views.two.pageSize).toBe(20)
        expect(JSON.parse(storage.stored).resourceRelations).toEqual(initial.resourceRelations)
      } finally {reopened.dataSet.destroy()}
    } finally {owner.dataSet.destroy()}
  })

  it('preserves definitions outside the filtered page and uses the same query configuration after save', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      view.configure({pageSize: 1, queryConfig: {allPages: false},
        filterExpression: {field: 'tableName', operator: 'eq', value: 'Parents'}, sortExpression: [{field: 'viewId', direction: 'asc'}], page: 2})
      await view.refresh()
      expect(view.rows).toHaveLength(1); expect(view.total).toBe(3)
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'pageSize', 71)
      expect((await dataSet.saveChanges()).success).toBe(true)
      await view.refresh()
      expect(target(view)['pageSize']).toBe(71)
      expect(JSON.parse(storage.stored).tables.Children).toEqual(initial.tables.Children)
      expect(JSON.parse(storage.stored).tables.Parents.views.two).toEqual(initial.tables.Parents.views.two)
    } finally {dataSet.destroy()}
  })

  it('submits view, relation and cascade changes as one file resource batch while leaving unloaded views alone', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      const relation = dataSet.getView('DataResourceRelationDefinition')!, cascade = dataSet.getView('DataViewCascadeDefinition')!
      await Promise.all([view.refresh(), relation.refresh(), cascade.refresh()])
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 32)
      relation.updateEditingValue(relation.getPkKey(relation.rows[0]!)!, 'relationName', 'changed')
      cascade.updateEditingValue(cascade.getPkKey(cascade.rows[0]!)!, 'autoLoad', false)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(JSON.parse(storage.stored)).toMatchObject({resourceRelations: [{relationName: 'changed'}], viewCascades: [{autoLoad: false}]})
      expect(dataSet.getView('DataResourceRelationDefinition', 'graph')!.rows).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('cancels using DataView without file mutation, and rejects a stale application before saving', async () => {
    const storage = fixture(), {dataSet, view, workspace} = storage.open()
    try {
      await view.refresh()
      const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 99); view.discardEditingRows()
      expect(workspace.getScenarioViews('TARGET')!.isDirty).toBe(false)
      expect((await dataSet.saveChanges()).success).toBe(true); expect(storage.writes).toEqual([])
      view.updateEditingValue(key, 'pageSize', 99); storage.changeScope()
      await expect(dataSet.saveChanges()).rejects.toThrow('scope changed')
      expect(storage.writes).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('verifies an unknown file write when the same DataSet submission is retried, without writing twice', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh(); view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 43)
      storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1); expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {dataSet.destroy()}
  })

  it('verifies an unknown save before applying edits made while its receipt was pending', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    let release!: () => void
    storage.gate(new Promise<void>(resolve => {release = resolve}))
    try {
      await view.refresh()
      const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 43); storage.loseResponse()
      const saving = dataSet.saveChanges(), rejected = expect(saving).rejects.toThrow('response lost')
      await vi.waitFor(() => expect(storage.writes).toHaveLength(1))
      view.updateEditingValue(key, 'pageSize', 58)
      release(); await rejected
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(43)
      expect(view.getEditingRow(key)?.['pageSize']).toBe(58)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(2)
      expect(JSON.parse(storage.stored).tables.Parents.views.one.pageSize).toBe(58)
    } finally {release(); dataSet.destroy()}
  })

  it('keeps the original unknown submission recoverable after an explicit local discard', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    try {
      await view.refresh(); const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 43); storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      view.discardPendingChanges()
      expect(view.hasUnconfirmedSave).toBe(true)
      expect((await dataSet.saveChanges()).data?.savedCount).toBe(1)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(storage.writes).toHaveLength(1)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(view.rows.find(row=>view.getPkKey(row)===key)?.['pageSize']).toBe(10)
    } finally {dataSet.destroy()}
  })

  it.each(['refresh', 'clear', 'reset', 'cascade-error'] as const)('preserves the original unknown query after local discard and %s', async action => {
    const storage = fixture(), {dataSet, view, resource} = storage.open()
    const query = vi.spyOn(resource, 'executeQuery')
    try {
      await view.refresh(); const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 43); storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      view.discardPendingChanges()
      const rows = structuredClone(view.rows)
      if (action === 'refresh') await expect(view.refresh()).rejects.toThrow('未确认提交')
      else if (action === 'cascade-error') view.rejectCascade(new Error('parent input unavailable'))
      else expect(() => action === 'clear' ? view.clearAll() : view.resetState()).toThrow('未确认提交')
      expect(view.rows).toEqual(rows)
      expect(view.requestState).toBe(RequestState.Loaded)
      expect(query).toHaveBeenCalledTimes(1)
      expect(view.hasUnconfirmedSave).toBe(true)
      expect((await dataSet.saveChanges()).data?.savedCount).toBe(1)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(storage.writes).toHaveLength(1)
      expect(view.rows.find(row => view.getPkKey(row) === key)?.['pageSize']).toBe(10)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally {dataSet.destroy()}
  })

  it.each(['before', 'after'] as const)('defers refresh registered %s local discard until unknown recovery and remaining draft handling', async timing => {
    const storage = fixture(), {dataSet, view, resource} = storage.open()
    const query = vi.spyOn(resource, 'executeQuery')
    try {
      await view.refresh(); const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 43); storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      if (timing === 'before') expect((await view.requestRefresh()).success).toBe(true)
      view.discardPendingChanges()
      if (timing === 'after') expect((await view.requestRefresh()).success).toBe(true)
      await Promise.resolve(); await Promise.resolve()
      expect(view.refreshPending).toBe(true)
      expect(query).toHaveBeenCalledTimes(1)
      expect(view.requestState).toBe(RequestState.Loaded)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(view.refreshPending).toBe(true)
      expect(query).toHaveBeenCalledTimes(1)
      view.discardPendingChanges()
      await vi.waitFor(() => expect(view.refreshPending).toBe(false))
      await vi.waitFor(() => expect(view.requestState).toBe(RequestState.Loaded))
      expect(query).toHaveBeenCalledTimes(2)
      expect(storage.writes).toHaveLength(1)
      expect(view.rows.find(row => view.getPkKey(row) === key)?.['pageSize']).toBe(43)
    } finally {dataSet.destroy()}
  })

  it('runs one deferred refresh after the unknown submission is confirmed without later edits', async () => {
    const storage = fixture(), {dataSet, view, resource} = storage.open()
    const query = vi.spyOn(resource, 'executeQuery')
    try {
      await view.refresh(); const key = view.getPkKey(target(view))!
      view.updateEditingValue(key, 'pageSize', 43); storage.loseResponse()
      await expect(dataSet.saveChanges()).rejects.toThrow('response lost')
      await view.requestRefresh(); await view.requestRefresh()
      expect(view.refreshPending).toBe(true)
      expect((await dataSet.saveChanges()).success).toBe(true)
      await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(view.requestState).toBe(RequestState.Loaded))
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(view.refreshPending).toBe(false)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(storage.writes).toHaveLength(1)
      expect(target(view)['pageSize']).toBe(43)
    } finally {dataSet.destroy()}
  })

  it('does not classify a different rejected draft as part of the original unknown submission', async () => {
    const storage = fixture(), {dataSet, view} = storage.open()
    const other = view.createQueryView('other')
    try {
      await view.refresh(); await other.refresh()
      view.updateEditingValue(view.getPkKey(target(view))!, 'pageSize', 43); storage.loseResponse()
      await expect(dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})).rejects.toThrow('response lost')
      const row = other.rows.find(item=>item['tableName']==='Children')!
      other.updateEditingValue(other.getPkKey(row)!, 'pageSize', 23)
      await expect(dataSet.saveChanges({views: [{tableName: other.tableName, viewId: other.viewId}]})).rejects.toThrow('先核验原提交')
      expect(other.hasUnconfirmedSave).toBe(false)
      other.discardPendingChanges()
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(storage.writes).toHaveLength(1)
    } finally {dataSet.destroy()}
  })

  it('describes file model views without fabricating database model IDs', async () => {
    const config = {scenarioId: 'TARGET', schemaVersion: 2, tables: definitions}
    new ScenarioViewConfig('TARGET', JSON.stringify(config))
    const storage = fixture(JSON.stringify(config)), {dataSet, view} = storage.open()
    try {
      await view.refresh()
      const row = view.rows.find(item => item['tableName'] === 'DataViewDefinition')!
      expect(row).not.toHaveProperty('dataModelId')
      view.updateEditingValue(view.getPkKey(row)!, 'autoLoad', false)
      view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 15)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored).tables.DataViewDefinition.views.default.pageSize).toBe(15)
    } finally {dataSet.destroy()}
  })
})
