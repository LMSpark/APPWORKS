import { describe, expect, it, vi } from 'vitest'
import { ScenarioViewFile } from '../../src/scenario/scenario-view-file'
import { ProjectWorkspace } from '../../src/project/project-workspace'

function fixture(pageSize = 20): string {
  return JSON.stringify({ scenarioId: 'UNIT-SCENE', tables: {
    Orders: { modelBinding: { modelId: 'UNIT-ORDERS', modelName: 'OrdersModel' },
      views: { default: {}, list: { pageSize, autoCurrentFirst: false, selectionDelimiter: '',
        filterExpression: { field: 'active', operator: 'eq', value: false } } } },
    Items: { modelBinding: { modelId: 'UNIT-ITEMS', modelName: 'ItemsModel' }, views: { default: {}, detail: {} } },
  }, viewCascades: [{ parentTable: 'Orders', parentViewId: 'list', childTable: 'Items', childViewId: 'detail',
    filterBindings: [{ sourceField: 'id', targetField: 'orderId' }], dependencyType: 'currentRow', autoLoad: false }] })
}

const validProjection = { fieldId: 'MODEL-FIELD-1', source: 'resource', resourceFieldId: 'MODEL-FIELD-1',
  resourceField: 'id', viewField: 'id', type: '', label: '', output: true, sortOrder: 0,
  sortDirection: null, group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: '' }

function projectionFixture(field: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ scenarioId: 'UNIT-SCENE', tables: { Orders: {
    modelBinding: { modelId: 'UNIT-ORDERS', modelName: 'OrdersModel' },
    views: { default: { fieldProjection: [field] } },
  } } })
}

describe('ScenarioViewFile', () => {
  it('notifies subscribers after valid edits, saved baselines, undo and reload', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const states: boolean[] = []
    const unsubscribe = file.subscribe(() => states.push(file.isDirty))
    file.setText(fixture(30))
    file.markSaved(file.getText())
    file.undo()
    file.loadText(fixture(50))
    expect(states).toEqual([true, false, true, false])
    unsubscribe()
    file.setText(fixture(60))
    expect(states).toHaveLength(4)
  })
  it('owns one scene with multiple named views and explicit cascades without runtime DataSet serialization', () => {
    const text = fixture()
    const file = new ScenarioViewFile('UNIT-SCENE', text)
    expect(file.getText()).toBe(text)
    expect(file.isDirty).toBe(false)
    expect(file.value.toJSON()).toEqual(JSON.parse(text))
    expect(file.value.toJSON()).toMatchObject({ tables: { Orders: { views: { list: {
      autoCurrentFirst: false, selectionDelimiter: '', filterExpression: { value: false },
    } } } }, viewCascades: [{ autoLoad: false }] })
  })

  it('marks the submitted text saved while keeping edits made during saving dirty', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(fixture(30))
    const submitted = file.getText()
    file.setText(fixture(40))
    file.markSaved(submitted)
    expect(file.isDirty).toBe(true)
    expect(file.undo()).toBe(true)
    expect(file.getText()).toBe(submitted)
    expect(file.isDirty).toBe(false)
    expect(file.redo()).toBe(true)
    expect(file.isDirty).toBe(true)
  })

  it('validates before changing content, history or the saved baseline', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    expect(() => file.setText('{')).toThrow()
    expect(file.canUndo).toBe(false)
    file.setText(fixture(30))
    const current = file.getText()
    expect(() => file.loadText('{}')).toThrow()
    expect(() => file.markSaved('{}')).toThrow()
    expect(file.getText()).toBe(current)
    expect(file.isDirty).toBe(true)
    expect(file.canUndo).toBe(true)
  })

  it('loads a validated saved file and resets history', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(fixture(30))
    file.loadText(fixture(50))
    expect(file.isDirty).toBe(false)
    expect(file.canUndo).toBe(false)
    expect(file.canRedo).toBe(false)
  })

  it('keeps configuration immutable through nested value exits', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const config = file.value.toJSON()
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config['tables'])).toBe(true)
    expect(Reflect.set(config, 'scenarioId', 'OTHER')).toBe(false)
    expect(file.value.scenarioId).toBe('UNIT-SCENE')
  })

  it.each(['', '{}', JSON.stringify({ scenarioId: 'OTHER', tables: {} }),
    JSON.stringify({ scenarioId: 'UNIT-SCENE', dataSetName: 'old', tables: {} }),
    JSON.stringify({ dataSets: { one: { scenarioId: 'UNIT-SCENE' } } })])('rejects missing identity, other scenes and old or multi-scene envelopes: %s', text => {
    expect(() => new ScenarioViewFile('UNIT-SCENE', text)).toThrow()
  })

  it.each(['rows', 'permissionSnapshot', 'resourceType', 'addApi'])('rejects formal definitions and runtime state in a model: %s', key => {
    const input = { scenarioId: 'UNIT-SCENE', tables: { Orders: {
      modelBinding: { modelId: 'UNIT-MODEL', modelName: 'Orders' }, views: { default: {} }, [key]: [],
    } } }
    expect(() => new ScenarioViewFile('UNIT-SCENE', JSON.stringify(input))).toThrow(key)
  })

  it('keeps native column validation values and rejects invalid edits atomically', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const withColumns = (columns: unknown) => JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {
      Orders: {modelBinding: {modelId: 'UNIT-ORDERS', modelName: 'OrdersModel'}, columns, views: {default: {}}},
    }})
    const valid = withColumns([{name: 'title', required: false, minLength: 0, maxLength: 8,
      min: 0, max: 10, pattern: '', patternMessage: ''}])
    file.setText(valid)
    expect(file.value.toJSON()).toMatchObject({tables: {Orders: {columns: [{name: 'title',
      required: false, minLength: 0, min: 0, pattern: '', patternMessage: ''}]}}})
    const invalid = [
      [{name: 'title', type: 'string'}], [{name: 'title', computeExpression: '1'}],
      [{name: ' title'}], [{name: 'title'}, {name: 'title'}],
      [{name: 'title', required: 0}], [{name: 'title', minLength: -1}],
      [{name: 'title', minLength: 4, maxLength: 3}], [{name: 'title', min: 2, max: 1}],
      [{name: 'title', max: null}], [{name: 'title', pattern: '['}],
    ]
    for (const columns of invalid) {
      expect(() => file.setText(withColumns(columns))).toThrow()
      expect(file.getText()).toBe(valid)
    }
    expect(file.undo()).toBe(true)
    expect(file.getText()).toBe(fixture())
    expect(file.canRedo).toBe(true)
  })

  it.each(['rows', 'total', 'dirty', 'permissionSnapshot', 'currentRow', 'scenarioId'])('rejects runtime or identity values inside a view: %s', key => {
    const input = { scenarioId: 'UNIT-SCENE', tables: { Orders: {
      modelBinding: { modelId: 'UNIT-MODEL', modelName: 'Orders' }, views: { default: { [key]: [] } },
    } } }
    expect(() => new ScenarioViewFile('UNIT-SCENE', JSON.stringify(input))).toThrow(key)
  })

  it('rejects old filter dialect and unresolved cascade view references', () => {
    expect(() => new ScenarioViewFile('UNIT-SCENE', fixture().replace('"operator":"eq"', '"op":"eq"'))).toThrow('filterExpression')
    expect(() => new ScenarioViewFile('UNIT-SCENE', fixture().replace('"childViewId":"detail"', '"childViewId":"missing"'))).toThrow('missing')
  })

  it('preserves the complete projection contract including false, zero and empty strings', () => {
    const text = projectionFixture(validProjection)
    expect(new ScenarioViewFile('UNIT-SCENE', text).getText()).toBe(text)
    const derived = projectionFixture({ ...validProjection, source: 'derived', resourceFieldId: null,
      valueFunction: JSON.stringify({ Type: 'GetConstValue', Value: false }) })
    expect(new ScenarioViewFile('UNIT-SCENE', derived).getText()).toBe(derived)
  })

  it.each([{ fieldId: '' }, { resourceField: '' }, { viewField: '' }, { source: 'unknown' },
    { resourceFieldId: null }, { source: 'derived', resourceFieldId: 'FIELD' }, { type: 1 }, { label: null },
    { output: 'false' }, { primaryKey: 1 }, { distinct: null }, { sortOrder: 1.5 }, { group: '0' },
    { sortDirection: 'descending' }, { value: false }, { valueFunction: {} }, { expression: null },
  ])('rejects malformed projections before replacing editable content: %j', change => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    expect(() => file.setText(projectionFixture({ ...validProjection, ...change }))).toThrow('fieldProjection')
    expect(file.getText()).toBe(fixture())
    expect(file.isDirty).toBe(false)
    expect(file.canUndo).toBe(false)
  })
})

function deferred<T>() {
  let complete: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => { complete = resolve })
  return { promise, resolve: (value: T) => {
    if (complete === undefined) throw new Error('promise resolver is missing')
    complete(value)
  } }
}

function workspaceFixture() {
  let scope = 'request-a'
  let remoteText: string | null = fixture()
  const readText = vi.fn(async (_scenarioId: string) => remoteText)
  const writeText = vi.fn(async (_scenarioId: string, text: string) => { remoteText = text })
  const snapshots = new Map<number, string>([[0, fixture(10)]])
  const listVersions = vi.fn(async () => [...snapshots.keys()].map(version => ({ version, fileName: `${version}__pagedata.json`, lastModified: null })))
  const readVersion = vi.fn(async (_scenarioId: string, version: number) => { const text = snapshots.get(version); if (text === undefined) throw new Error('snapshot missing'); return text })
  const createVersion = vi.fn(async (_scenarioId: string, text: string) => { snapshots.set(8, text); return { version: 8, fileName: '8__pagedata.json', lastModified: null } })
  const restoreVersion = vi.fn(async (_scenarioId: string, version: number) => { remoteText = await readVersion(_scenarioId, version) })
  const workspace = new ProjectWorkspace({ projectId: 'UNIT-PROJECT',
    pageFiles: { readPageFile: vi.fn(async () => { throw new Error('must not read a page file') }) },
    blueprint: { loadRoot: async () => ({ children: [] }) },
    scenarioViews: { readScope: () => scope, readText, writeText, listVersions, readVersion, createVersion, restoreVersion },
  })
  return { workspace, readText, writeText, listVersions, readVersion, createVersion, restoreVersion,
    setScope: (value: string) => { scope = value },
    setRemote: (value: string | null) => { remoteText = value },
  }
}

describe('ProjectWorkspace scenario files', () => {
  it('retains an unknown first write across later edits and confirms its exact remote submission', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture(30) })
    writeText.mockImplementationOnce(async (_id, text) => { setRemote(text); throw new Error('network after dispatch') })
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('network after dispatch')
    expect(file.saveStatus).toBe('unknown')
    expect(file.submittedText).toBe(fixture(30))
    file.setText(fixture(40))
    expect(await workspace.verifyScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe('confirmed')
    expect(file.isPersisted).toBe(true)
    expect(file.isDirty).toBe(true)
    expect(file.getText()).toBe(fixture(40))
    expect(file.savedText).toBe(fixture(30))
  })

  it('keeps pre-dispatch failures out of unknown and can explicitly adopt remote content', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    setRemote(fixture(40))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('SCENARIO_VIEW_CONFLICT')
    expect(file.saveStatus).toBe('idle')
    expect(writeText).not.toHaveBeenCalled()
    const revision = file.revision
    const remote = await workspace.previewScenarioViewsRemote({ scenarioId: 'UNIT-SCENE' })
    await workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: revision, previewText: remote })
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(false)
  })

  it('invalidates a discarded missing-file draft so old consumers cannot edit it', async () => {
    const { workspace, setRemote } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture(30) })
    await workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: file.revision, previewText: null })
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    expect(() => file.setText(fixture(40))).toThrow('SCENARIO_VIEW_FILE_INVALID')
  })
  it('rejects an old remote adoption when the same file receives a save receipt while reading', async () => {
    const { workspace, readText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const revision = file.revision
    const waiting = deferred<string | null>()
    readText.mockImplementationOnce(async () => waiting.promise)
    const adopting = workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: revision, previewText: fixture() })
    await vi.waitFor(() => expect(readText).toHaveBeenCalledTimes(2))
    file.beginSave(fixture(30), fixture())
    file.confirmSubmitted()
    waiting.resolve(fixture())
    await expect(adopting).rejects.toThrow('DRAFT_STALE')
    expect(file.savedText).toBe(fixture(30))
  })
  it('does not dispatch a shared file save when the calling page expires during pre-read', async () => {
    const {workspace, readText, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))
    const waiting = deferred<string | null>()
    readText.mockImplementationOnce(async () => waiting.promise)
    let active = true
    const saving = workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE',
      assertCurrent: () => {if (!active) throw new Error('PAGE_RUNTIME_STALE')}})
    active = false
    waiting.resolve(fixture())
    await expect(saving).rejects.toThrow('PAGE_RUNTIME_STALE')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.saveStatus).toBe('idle')
  })
  it('requires explicit creation after verified absence and confirms its real first write', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    setRemote(null)
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('FILE_MISSING')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    expect(file.isDirty).toBe(true)
    expect(file.isPersisted).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(file.isPersisted).toBe(true)
    expect(file.isDirty).toBe(false)
  })

  it('cannot create over an existing file or save over an externally created file', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    await expect(workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })).rejects.toThrow('EXISTS')
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    setRemote(fixture(90))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('CONFLICT')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.isDirty).toBe(true)
  })

  it('rechecks a cached load before returning it to an asynchronous caller', async () => {
    const { workspace, setScope } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const cached = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    setScope('request-b')
    await expect(cached).rejects.toThrow('STALE')
  })

  it('rejects missing IO and invalid scope without reading an old page file', async () => {
    const workspace = new ProjectWorkspace({ projectId: 'UNIT-PROJECT',
      pageFiles: { readPageFile: async () => { throw new Error('old page path') } },
      blueprint: { loadRoot: async () => ({ children: [] }) },
    })
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('IO')
    const configured = workspaceFixture()
    configured.setScope('')
    await expect(configured.workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
    expect(configured.readText).not.toHaveBeenCalled()
  })

  it('releases a failed load so a corrected scene can be read again', async () => {
    const { workspace, readText } = workspaceFixture()
    readText.mockResolvedValueOnce('{}')
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow()
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).resolves.toBeInstanceOf(ScenarioViewFile)
  })

  it('coalesces concurrent loads of the same scene into one shared file', async () => {
    const { workspace, readText } = workspaceFixture()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const first = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const second = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    waiting.resolve(fixture())
    const files = await Promise.all([first, second])
    expect(files[0]).toBe(files[1])
    expect(readText).toHaveBeenCalledTimes(1)
  })

  it('shares one owner per explicit scene and never reads a page file', async () => {
    const { workspace, readText } = workspaceFixture()
    const first = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe(first)
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBe(first)
    expect(readText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE')
    await expect(workspace.loadScenarioViews({ scenarioId: '' })).rejects.toThrow('scenarioId')
  })

  it('rejects dirty reloads including edits made while a reload is waiting', async () => {
    const { workspace, readText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })).rejects.toThrow('UNSAVED')
    expect(readText).toHaveBeenCalledTimes(1)
    file.undo()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const reload = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })
    file.setText(fixture(40))
    waiting.resolve(fixture(50))
    await expect(reload).rejects.toThrow('UNSAVED')
    expect(file.getText()).toBe(fixture(40))
  })

  it('rejects late loads and never publishes another request scope into the cache', async () => {
    const { workspace, readText, setScope } = workspaceFixture()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const loading = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    setScope('request-b')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    waiting.resolve(fixture())
    await expect(loading).rejects.toThrow('STALE')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    expect(await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBeInstanceOf(ScenarioViewFile)
  })

  it('checks the remote baseline and marks only submitted text saved after readback', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    const writing = deferred<void>()
    writeText.mockImplementationOnce(async () => { await writing.promise })
    const saving = workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', fixture(30)))
    file.setText(fixture(40))
    setRemote(fixture(30))
    writing.resolve()
    await saving
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(true)
    file.undo()
    expect(file.isDirty).toBe(false)
  })

  it('refuses a remote conflict before writing', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    setRemote(fixture(50))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('CONFLICT')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.isDirty).toBe(true)
  })

  it('saves and validates exact text without normalizing it', async () => {
    const { workspace, readText, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const submitted = ` \n${fixture(30)}\n`
    file.setText(submitted)
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', submitted)
    expect(readText).toHaveBeenCalledTimes(3)
    expect(file.isDirty).toBe(false)
  })

  it('retains the submitted baseline when remote readback cannot confirm a write', async () => {
    const { workspace, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    writeText.mockImplementationOnce(async () => {})
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNCONFIRMED')
    expect(file.isDirty).toBe(true)
    file.undo()
    expect(file.isDirty).toBe(true)
    expect(await workspace.verifyScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe('not-applied')
    expect(file.isDirty).toBe(false)
  })

  it('rejects another save or forced reload while a save is pending', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    const waiting = deferred<void>()
    writeText.mockImplementationOnce(async () => { await waiting.promise })
    const saving = workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    file.undo()
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('PENDING')
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })).rejects.toThrow('PENDING')
    setRemote(fixture(30))
    waiting.resolve()
    await saving
    expect(file.getText()).toBe(fixture())
    expect(file.isDirty).toBe(true)
  })

  it('does not mark a file saved after its request scope changes during writing', async () => {
    const { workspace, writeText, setScope } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    writeText.mockImplementationOnce(async () => { setScope('request-b') })
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
    expect(file.isDirty).toBe(true)
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
  })
  it('includes dirty shared scene configuration in the workspace save-all flow',async()=>{
    const {workspace,writeText}=workspaceFixture();const file=await workspace.loadScenarioViews({scenarioId:'UNIT-SCENE'});file.setText(fixture(55))
    expect(workspace.dirtyScenarioIds).toEqual(['UNIT-SCENE']);await workspace.saveAll();expect(writeText).toHaveBeenCalledWith('UNIT-SCENE',fixture(55));expect(workspace.dirtyScenarioIds).toEqual([])
  })

})


describe('ProjectWorkspace shared scenario versions', () => {
  it('lists and previews actual zero-numbered snapshots without modifying a dirty working file', async () => {
    const { workspace, restoreVersion } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(50))
    expect(await workspace.listScenarioVersions({ scenarioId: 'UNIT-SCENE' })).toEqual([{ version: 0, fileName: '0__pagedata.json', lastModified: null }])
    expect(await workspace.previewScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0 })).toBe(fixture(10))
    expect(file.getText()).toBe(fixture(50)); expect(file.isDirty).toBe(true)
    expect(restoreVersion).not.toHaveBeenCalled()
  })
  it('creates and verifies a snapshot only from the clean persisted working file', async () => {
    const { workspace, createVersion, readVersion } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })
    expect(createVersion).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', fixture())
    expect(readVersion).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', 8)
  })
  it('rejects snapshots and restores for dirty or not-yet-persisted drafts', async () => {
    const { workspace, createVersion, restoreVersion, setRemote } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNSAVED')
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })).rejects.toThrow('UNSAVED')
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' }); file.setText(fixture(30))
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNSAVED')
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })).rejects.toThrow('UNSAVED')
    expect(createVersion).not.toHaveBeenCalled(); expect(restoreVersion).not.toHaveBeenCalled()
  })
  it('rejects stale previews and cross-scene snapshots before changing the working file', async () => {
    const { workspace, readVersion, restoreVersion } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(11) })).rejects.toThrow('PREVIEW_CHANGED')
    readVersion.mockResolvedValueOnce(fixture(10).replace('UNIT-SCENE', 'OTHER'))
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })).rejects.toThrow('当前场景')
    expect(restoreVersion).not.toHaveBeenCalled()
  })
  it('confirms restored exact text before resetting the shared file baseline and history', async () => {
    const { workspace } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: await workspace.previewScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0 }) })
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBe(file)
    expect(file.getText()).toBe(fixture(10)); expect(file.isDirty).toBe(false); expect(file.canUndo).toBe(false)
  })
  it('preserves edits made while the remote restore is waiting and blocks another write', async () => {
    const { workspace, restoreVersion, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const waiting = deferred<void>()
    restoreVersion.mockImplementationOnce(async () => { await waiting.promise; setRemote(fixture(10)) })
    const restoring = workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })
    await vi.waitFor(() => expect(restoreVersion).toHaveBeenCalledTimes(1))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('PENDING')
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })).rejects.toThrow('PENDING')
    file.setText(fixture(70)); waiting.resolve()
    await expect(restoring).rejects.toThrow('EDIT_DURING_VERSION')
    expect(file.getText()).toBe(fixture(70)); expect(file.isDirty).toBe(true)
  })
  it('rejects remote work conflicts and unconfirmed restore readback without resetting local state', async () => {
    const { workspace, setRemote, restoreVersion } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    setRemote(fixture(40))
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('CONFLICT')
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })).rejects.toThrow('CONFLICT')
    setRemote(fixture()); restoreVersion.mockImplementationOnce(async () => {})
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0, previewText: fixture(10) })).rejects.toThrow('UNCONFIRMED')
    expect(file.getText()).toBe(fixture()); expect(file.isDirty).toBe(false)
  })
  it('rejects an invalid snapshot receipt or stale request scope after a snapshot write', async () => {
    const { workspace, createVersion, setScope } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    createVersion.mockResolvedValueOnce({ version: 8, fileName: '8__rule.json', lastModified: null })
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNCONFIRMED')
    createVersion.mockImplementationOnce(async () => { setScope('request-b'); return { version: 8, fileName: '8__pagedata.json', lastModified: null } })
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
  })
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid version %s before IO', async version => {
    const { workspace, readVersion, restoreVersion } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await expect(workspace.previewScenarioVersion({ scenarioId: 'UNIT-SCENE', version })).rejects.toThrow('安全整数')
    await expect(workspace.restoreScenarioVersion({ scenarioId: 'UNIT-SCENE', version, previewText: fixture(10) })).rejects.toThrow('安全整数')
    expect(readVersion).not.toHaveBeenCalled(); expect(restoreVersion).not.toHaveBeenCalled()
  })
})
