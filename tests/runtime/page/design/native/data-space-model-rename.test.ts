import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataView, resolveDataViewKey} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowModelRename: true, ...options}); fixtures.push(f); return f
}
const writes = (f: ReturnType<typeof fixture>) => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
function toolFixture() {
  const files = new Map<string, string>(), saves: string[] = [], pages = ['ONE', 'TWO'], targets = new Map<string, string>(), versions = new Map<string, string>()
  let lose = '', denyRead = '', beforeSave: (() => void) | undefined
  for (const id of pages) {
    files.set(`${id}/rule.json`, JSON.stringify({type: 'r-table', props: {dataViewKey: 'A@Orders@shared'}}))
    files.set(`${id}/script.js`, ''); files.set(`${id}/style.css`, '')
  }
  const f = fixture({pageFiles: {
    readPageFile: async command => {const key = `${command.pageId}/${command.versionId ? `${command.versionId}/` : ''}${command.fileName}`; if (denyRead === key || !files.has(key)) throw new Error('file unavailable'); return files.get(key)!},
    saveFileContent: async (id, name, text) => {beforeSave?.(); saves.push(`${id}/${name}`); files.set(`${id}/${name}`, text); if (lose === id) {lose = ''; throw new Error('tool response lost')}},
  }, blueprint: {loadRoot: async () => ({nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: pages.map(id => (
    {nodeId: id, parentNodeId: 'ROOT', projectId: 'APP', kind: 'page', capability: {name: id}, source: {VersionId: versions.get(id)}, navigation: {target: targets.get(id) ?? `cfg:${id}`, title: id, order: 0, publishInMenu: true, showChildren: true, beginGroup: false}}
  ))})}})
  return {f, files, saves, pages, targets, versions, lose(id: string) {lose = id}, deny(key: string) {denyRead = key}, onSave(run: () => void) {beforeSave = run}}
}

describe('formal model registration rename', () => {
  it('does not adopt editing started in a tool command DataView during submission as part of the rename', async () => {
    const t = toolFixture(), session = await t.f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    t.onSave(() => {
      const view = session.metadataDataSet.getTable('ProjectToolFile')!.viewList.find(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())!
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'text', '{"type":"r-text","props":{"label":"external edit"}}')
    })
    await expect(operation.save()).rejects.toThrow()
    t.onSave(() => {})
    await expect(operation.verify()).rejects.toThrow(/其他编辑/)
    expect(t.saves).toEqual(['ONE/rule.json']); expect(writes(t.f)).toHaveLength(1)
    const view = session.metadataDataSet.getTable('ProjectToolFile')!.viewList.find(item => item.hasEditingChanges())!
    expect(view.getEditingRow(view.getPkKey(view.rows[0]!)!)?.['text']).toContain('external edit')
  })
  it('queries tool inventory and files through formal DataViews and saves only the captured tool file views', async () => {
    const t = toolFixture(), session = await t.f.open('A'), operation = session.getModelRename('M1')
    const queries = vi.spyOn(DataView.prototype, 'loadFromServer'), saves = vi.spyOn(session.metadataDataSet, 'saveChanges')
    try {
      operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
      await operation.preview()
      expect(queries.mock.contexts.map(view => (view as DataView).tableName)).toContain('ProjectToolCatalog')
      expect(queries.mock.contexts.map(view => (view as DataView).tableName)).toContain('ProjectToolFile')
      expect(t.saves).toEqual([])
      await operation.save()
      expect(saves.mock.calls.filter(([options]) => options?.views?.some(view => view.tableName === 'ProjectToolFile'))).toHaveLength(2)
      expect(t.saves).toEqual(['ONE/rule.json', 'TWO/rule.json'])
      expect(session.metadataDataSet.getTable('ProjectToolFile')?.viewList.map(view => view.viewId)).toEqual(['default'])
    } finally {queries.mockRestore(); saves.mockRestore()}
  })
  it.each([false, true])('saves a renamed model binding through a native definition DataView (lost=%s)', async lost => {
    const f = fixture({overviewOnly: true}), session = await f.open('A', {deferDefinition: true})
    const data = session.metadataDataSet, operation = session.getModelRename('M1')
    const native = data.saveChanges.bind(data), captured: unknown[] = []
    vi.spyOn(data, 'saveChanges').mockImplementation(async options => {
      for (const selected of options?.views ?? []) if (selected.tableName === 'DataTableBindingDefinition') {
        const view = data.getView(selected.tableName, selected.viewId)!
        const row = view.rows.find(value => value['tableName'] === 'OrdersAlias')!, id = view.getPkKey(row)
        if (id === undefined) throw new Error('binding identity missing')
        captured.push(view.getEditingRow(id)?.['configuration'])
      }
      return native(options)
    })
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    if (lost) {f.loseNextFileResponse(); await expect(operation.save()).rejects.toThrow(); expect(await operation.verify()).toBe(true)}
    else await operation.save()
    expect(captured).toHaveLength(lost ? 2 : 1)
    expect(captured[0]).toMatchObject({modelBinding: {modelId: 'M1', modelName: 'SalesOrders'}})
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(12)
    expect(fresh.metadataDataSet.getView('Base_DataModel')?.rows.find(row => row['rowid'] === 'M1')?.['Name']).toBe('SalesOrders')
    expect(data.getTable('DataTableBindingDefinition')?.viewList.some(view => view.viewId.startsWith('modelDefinition:'))).toBe(false)
  })

  it('rejects a changed dependency filter before it can hide a new reference', async () => {
    const f = fixture({overviewOnly: true}), session = await f.open('A', {deferDefinition: true}), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    f.created.set('Base_DataModel_Field', [{rowid: 'LATE', dataSetId: 'A', dataModelId: 'M2', Name: 'input', type: 'inputParams',
      ValueFun: JSON.stringify({Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'rowid', FkFieldName: 'rowid'})}])
    session.metadataDataSet.getView('Base_DataModel_Field', 'modelrename:M1:expressions')!.filterExpression = {field: 'rowid', operator: 'eq', value: 'NO-MATCH'}
    await expect(operation.save()).rejects.toThrow(/查询|变化/)
    expect(writes(f)).toHaveLength(0)
  })

  it.each(['field', 'filter'])('reads the explicitly referenced model to preserve a dotted local field in a %s function', async location => {
    const value = {Type: 'GetRefData', RefTableName: 'Customers', RefFieldName: 'Orders.rowid', FkFieldName: 'rowid'}
    const raw = JSON.stringify(value), filter = JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: value})
    const f = fixture({overviewOnly: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F2', dataModelId: 'M1', Name: 'argument', type: 'inputParams', ValueFun: location === 'field' ? raw : ''},
      {rowid: 'F3', dataModelId: 'M2', Name: 'Orders.rowid', type: 'dataModel'},
    ]})
    if (location === 'filter') f.setModelValues({Filter: filter})
    const session = await f.open('A', {deferDefinition: true}), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview()
    expect(operation.getState().changes).toEqual([{table: 'Base_DataModel', id: 'M1', property: 'Name', before: 'Orders', after: 'SalesOrders'}])
    await operation.save()
    const reopened = await f.open('A', {deferDefinition: true})
    await reopened.loadMetadataViews(['Base_DataModel_Field'])
    if (location === 'field') expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === 'F2')?.['ValueFun']).toBe(raw)
    else expect(f.modelRow().Filter).toBe(filter)
  })

  it.each([false, true])('renames from overview through scoped command views and reopens both named views (lost=%s)', async lost => {
    const f = fixture({overviewOnly: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', IsPKey: 1, IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', IsOutput: 1},
      {rowid: 'F3', dataModelId: 'M2', Name: 'unrelated', type: 'dataModel'},
    ]})
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    const fields = data.getView('Base_DataModel_Field')!, relations = data.getView('Base_DataModel_Relation')!
    const initial = [fields.requestState, relations.requestState]
    const operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview(); operation.cancel()
    expect(writes(f)).toHaveLength(0)
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview()
    if (lost) {
      f.loseNextResponse()
      await expect(operation.save()).rejects.toThrow()
      await expect(operation.save()).rejects.toThrow(/预览/)
      expect(await operation.verify()).toBe(true)
    } else await operation.save()
    expect(writes(f)).toHaveLength(1)
    expect([fields.requestState, relations.requestState]).toEqual(initial)
    const commandFields = Object.values(fields.dataTable!.views).filter(view => view.rows.length)
    expect(commandFields.length).toBeGreaterThan(0)
    expect(commandFields.flatMap(view => view.rows).every(row => row['dataModelId'] === 'M1')).toBe(true)
    const reopened = await f.open('A')
    expect(resolveDataViewKey('A@SalesOrders@default', reopened.definitionDataSet!)).toBeDefined()
    expect(resolveDataViewKey('A@SalesOrders@shared', reopened.definitionDataSet!)).toBeDefined()
    expect(resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)).toBeUndefined()
    await reopened.loadMetadataViews(['Base_DataModel_Field'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')?.['Name']).toBe('unrelated')
  })

  it.each([
    {sourceName: 'Orders', writableReference: true},
    {sourceName: 'Orders', writableReference: false},
    {sourceName: 'OrderSource', writableReference: true},
    {sourceName: 'OrderSource', writableReference: false},
  ])('preserves physical output references when renaming a registered model: %j', async ({sourceName, writableReference}) => {
    const reference = ' { "Type": "GetRefData", "RefTableName": "Orders", "RefFieldName": "rowid", "FkFieldName": "rowid", "Extra": false } '
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', IsPKey: 1, IsOutput: 1, FieldType: 'string'},
      {rowid: 'F2', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', IsPKey: 1, IsOutput: 1, FieldType: 'string'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'orderId', type: 'dataModel', IsPKey: 0, IsOutput: 1, FieldType: 'string', ValueFun: reference},
    ]})
    f.setModelValues({MetaName: sourceName})
    if (!writableReference) f.denyFieldProperty('ValueFun')
    const session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview()
    expect(operation.getState().changes).toEqual([{table: 'Base_DataModel', id: 'M1', property: 'Name', before: 'Orders', after: 'SalesOrders'}])
    operation.cancel()
    expect(writes(f)).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(reference)
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview(); await operation.save()
    expect(writes(f)).toHaveLength(1)
    expect(JSON.stringify(writes(f)[0]?.data)).not.toContain('ValueFun')
    expect(operation.getState().pending).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.find(row => row['rowid'] === 'M1')).toMatchObject({Name: 'SalesOrders', MetaName: sourceName})
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(reference)
    expect(resolveDataViewKey('A@SalesOrders@shared', reopened.definitionDataSet!)).toBeDefined()
    expect(resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)).toBeUndefined()
  })

  it('refuses to guess the semantics of an unreadable field kind before renaming a reference', async () => {
    const f = fixture({hiddenFieldProperties: ['type'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F2', dataModelId: 'M2', Name: 'orderId', type: 'dataModel', ValueFun: '{"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"rowid","FkFieldName":"rowid"}'},
    ]})
    const operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await expect(operation.preview()).rejects.toThrow(/type.*不可读/)
    expect(writes(f)).toHaveLength(0)
  })

  it('preserves desensitization rule IDs matching the old model name through rename and reopening', async () => {
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', IsOutput: 1, Expression: 'Orders'},
      {rowid: 'F2', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', IsOutput: 1},
      {rowid: 'F3', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', IsOutput: 1, Expression: '  Orders.rowid  '},
    ]})
    const operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview(); await operation.save()
    const reopened = await f.open('A'), fields = reopened.metadataDataSet.getView('Base_DataModel_Field')!
    expect(fields.rows.find(row => row['rowid'] === 'F1')).toHaveProperty('Expression', 'Orders')
    expect(fields.rows.find(row => row['rowid'] === 'F3')).toHaveProperty('Expression', '  Orders.rowid  ')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.find(row => row['rowid'] === 'M1')).toHaveProperty('Name', 'SalesOrders')
    expect(writes(f)).toHaveLength(1)
  })

  it('uses the formal name as the input baseline and restores it on cancel and confirmed save', async () => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    expect(operation.input.getEditingRow('rename')?.['name']).toBe('Orders')
    expect(operation.getState().pending).toBe(false)
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    expect(operation.getState().pending).toBe(true)
    operation.cancel()
    expect(operation.input.getEditingRow('rename')?.['name']).toBe('Orders')
    expect(operation.getState().pending).toBe(false)
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview(); await operation.save()
    expect(operation.input.getEditingRow('rename')?.['name']).toBe('SalesOrders')
    expect(operation.getState().pending).toBe(false)
    expect(writes(f)).toHaveLength(1)
  })

  it.each([true, false])('checks published tool snapshots before allowing the DB rename (affected=%s)', async affected => {
    const t = toolFixture(), version = 'rule=3;script=2;style=1'; t.versions.set('ONE', version)
    t.files.set(`ONE/${version}/rule.json`, JSON.stringify({type: 'r-table', props: {dataViewKey: affected ? 'A@Orders@shared' : 'B@Orders@shared'}}))
    t.files.set(`ONE/${version}/script.js`, '')
    const operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    if (affected) await expect(operation.preview()).rejects.toThrow(/发布/)
    else {await operation.preview(); await operation.save(); expect(writes(t.f)).toHaveLength(1)}
    expect(t.versions.get('ONE')).toBe(version)
    expect(t.files.get(`ONE/${version}/rule.json`)).toContain(affected ? 'A@Orders@shared' : 'B@Orders@shared')
    if (affected) expect(writes(t.f)).toHaveLength(0)
  })

  it('uses the formal delivery surface so a business page delivered as Vue is not loaded as tool files', async () => {
    const t = toolFixture(); t.pages.push('NATIVE'); t.targets.set('NATIVE', 'vue:features/example/ui/page')
    const operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    expect(operation.getState().tools).toEqual(['ONE', 'TWO']); operation.cancel()
    expect(writes(t.f)).toHaveLength(0); expect(t.saves).toEqual([])
  })

  it('locks the operation before asynchronous tool checks to prevent duplicate DB dispatch', async () => {
    const t = toolFixture(), operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    const first = operation.save()
    await expect(operation.save()).rejects.toThrow(/预览|核验/)
    await first
    expect(writes(t.f)).toHaveLength(1)
  })

  it('diagnoses tool inventory added during file saving instead of reporting a complete rename', async () => {
    const t = toolFixture(), operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    t.onSave(() => {if (!t.pages.includes('LATE')) t.pages.push('LATE')})
    await expect(operation.save()).rejects.toThrow(/清单/)
    expect(operation.getState().status).toBe('configuration'); expect(writes(t.f)).toHaveLength(1)
  })

  it('accepts a genuinely empty rule file without treating it as a broken tool', async () => {
    const t = toolFixture(); t.files.set('ONE/rule.json', '')
    const operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview(); await operation.save()
    expect(t.files.get('ONE/rule.json')).toBe(''); expect(t.saves).toEqual(['TWO/rule.json'])
  })

  it('recovers a partial tool save and lost reply without replaying confirmed files or DB', async () => {
    const t = toolFixture(), operation = (await t.f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    t.lose('ONE'); await expect(operation.save()).rejects.toThrow('tool response lost')
    expect(operation.getState().status).toBe('configuration'); expect(t.saves).toEqual(['ONE/rule.json'])
    expect(await operation.verify()).toBe(true)
    expect(t.saves).toEqual(['ONE/rule.json', 'TWO/rule.json']); expect(writes(t.f)).toHaveLength(1)
    for (const id of t.pages) expect(JSON.parse(t.files.get(`${id}/rule.json`)!).props.dataViewKey).toBe('A@SalesOrders@shared')
  })

  it('preserves concurrent remote properties when explicitly reconciling a loaded clean tool', async () => {
    const t = toolFixture(), session = await t.f.open('A'), workspace = t.f.workspaces[0]!
    const loaded = await workspace.loadPageTool('ONE'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    const release = t.f.holdModelResponse(), saving = operation.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    t.files.set('ONE/rule.json', JSON.stringify({type: 'r-table', props: {dataViewKey: 'A@Orders@shared', label: 'Concurrent'}})); release()
    await expect(saving).rejects.toThrow(/远端/)
    expect(await operation.verify()).toBe(true)
    expect(JSON.parse(t.files.get('ONE/rule.json')!).props).toEqual({dataViewKey: 'A@SalesOrders@shared', label: 'Concurrent'})
    expect(loaded.rule.children[0]?.props?.['label']).toBe('Concurrent'); expect(loaded.isDirty()).toBe(false)
    expect(writes(t.f)).toHaveLength(1)
  })

  it.each(['script', 'missing', 'dirty', 'inventory'])('rejects unverified tool scope before DB dispatch (%s)', async kind => {
    const t = toolFixture(), session = await t.f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    if (kind === 'script') t.files.set('ONE/script.js', 'const model = "Orders";')
    if (kind === 'missing') t.deny('TWO/rule.json')
    if (kind === 'dirty') {const page = await t.f.workspaces[0]!.loadPageTool('ONE'); page.setFileText('rule.json', '{"type":"r-text"}')}
    if (kind === 'inventory') {await operation.preview(); t.pages.pop(); await expect(operation.save()).rejects.toThrow(/清单/)}
    else await expect(operation.preview()).rejects.toThrow()
    expect(t.saves).toEqual([]); expect(writes(t.f)).toHaveLength(0)
    operation.cancel()
  })

  it('preserves local editing started during a file write and resumes after the edit is resolved', async () => {
    const t = toolFixture(), session = await t.f.open('A'), page = await t.f.workspaces[0]!.loadPageTool('ONE')
    const operation = session.getModelRename('M1'); operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    t.onSave(() => {page.setFileText('rule.json', '{"type":"r-text","props":{"label":"Local draft"}}')})
    await expect(operation.save()).rejects.toThrow(/本地编辑/)
    expect(page.rule.children[0]?.props?.['label']).toBe('Local draft')
    expect(await operation.verify().catch(() => false)).toBe(false)
    expect(t.saves).toEqual(['ONE/rule.json']); expect(writes(t.f)).toHaveLength(1)
    t.onSave(() => {}); expect(page.undoFile('rule.json')).toBe(true)
    expect(await operation.verify()).toBe(true)
    expect(t.saves).toEqual(['ONE/rule.json', 'TWO/rule.json'])
  })

  it('migrates mounted tool bindings through file owners and reopens the same business view', async () => {
    const rule = {type: 'r-table', props: {dataViewKey: 'A@Orders@shared', label: 'A@Orders@shared',
      filter: {dataViewKey: '#A@Orders@shared'}, additionalNodeSources: [{dataViewKey: 'A@Orders@shared', labelField: 'Name'}, {dataViewKey: 'B@Orders@shared'}], toolbar: {children: [{type: 'r-button', props: {dataViewKey: 'A@Orders@default', then: {action: 'refresh', dataViewKey: 'A@Orders@shared'}}}]}},
      children: [{type: 'r-select', props: {optionDataViewKey: 'A@Orders@shared', dataViewKey: 'B@Orders@shared'}},
        {type: 'r-text', props: {dataViewKey: 'OrdersAlias@shared', modelValue: {dataViewKey: 'A@Orders@shared'}}}]}
    const files = new Map([['rule.json', JSON.stringify(rule)], ['script.js', ''], ['style.css', '.Orders { color: red; }']])
    const saved: string[] = []
    const f = fixture({businessRows: {SalesOrders: [{rowid: 'O1', parentId: null}]},
      pageFiles: {readPageFile: async command => {if (command.pageId !== 'TOOL') throw new Error('wrong tool'); return files.get(command.fileName)!},
        saveFileContent: async (id, name, text) => {expect(id).toBe('TOOL'); saved.push(name); files.set(name, text)}},
      blueprint: {loadRoot: async () => ({nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: [
        {nodeId: 'PAGE', parentNodeId: 'ROOT', projectId: 'APP', kind: 'page', capability: {name: 'Orders tool'}, source: {}, navigation: {target: 'cfg:TOOL', title: 'Orders tool', order: 0, publishInMenu: true, showChildren: true, beginGroup: false}},
      ]})}})
    const session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview(); await operation.save()
    const persisted = JSON.parse(files.get('rule.json')!)
    expect(persisted.props.dataViewKey).toBe('A@SalesOrders@shared')
    expect(persisted.props.filter.dataViewKey).toBe('A@SalesOrders@shared')
    expect(persisted.props.additionalNodeSources).toEqual([{dataViewKey: 'A@SalesOrders@shared', labelField: 'Name'}, {dataViewKey: 'B@Orders@shared'}])
    expect(persisted.props.toolbar.children[0].props.dataViewKey).toBe('A@SalesOrders@default')
    expect(persisted.props.toolbar.children[0].props.then.dataViewKey).toBe('A@SalesOrders@shared')
    expect(persisted.children[0].props).toEqual({optionDataViewKey: 'A@SalesOrders@shared', dataViewKey: 'B@Orders@shared'})
    expect(persisted.children[1].props).toEqual(rule.children[1]!.props)
    expect(persisted.props.label).toBe('A@Orders@shared')
    expect(saved).toEqual(['rule.json']); expect(writes(f)).toHaveLength(1)
    const reopened = await f.open('A'), tool = await f.workspaces.at(-1)!.loadPageTool('TOOL')
    const view = resolveDataViewKey(String(tool.toDefinition().rule[0]?.props?.['dataViewKey']), reopened.definitionDataSet!)!
    await view.refresh(); expect(view.rows).toMatchObject([{rowid: 'O1'}])
    expect(f.workspaces[0]!.getActivePageTool()).toBeNull()
  })

  it.each([false, true])('resolves overlapping dotted model names by formal field identity (ambiguous=%s)', async ambiguous => {
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: ambiguous ? 'History.rowid' : 'rowid', type: 'dataModel'},
      {rowid: 'F2', dataModelId: 'M2', Name: 'rowid', type: 'dataModel'},
    ]})
    f.setModelValues({Name: 'Orders.History'}, 'A', 'M2')
    f.setModelValues({Filter: JSON.stringify({Type: 'cond', Field: 'Orders.History.rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 1}})})
    const operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    if (ambiguous) await expect(operation.preview()).rejects.toThrow(/不唯一/)
    else {await operation.preview(); expect(operation.getState().changes).toHaveLength(1)}
    expect(writes(f)).toHaveLength(0)
  })

  it('rewrites structured model and field references but preserves constants, parameters and physical relation qualifiers', async () => {
    const expression = JSON.stringify({Type: 'cond', Field: 'Orders.rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: {Type: 'GetTableField', Field: 'Orders.rowid'}}})
    const fieldFunction = JSON.stringify({Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'rowid', FkFieldName: 'customerId', Extra: false})
    const parameter = ' { "Type": "GetInputParam", "ParamName": "Orders" } '
    const physical = JSON.stringify({Type: 'cond', Field: 'CustomerSource.rowid', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'OrderSource.rowid'}})
    const f = fixture({allowRelationEdit: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', IsPKey: 1, IsOutput: 1, FieldType: 'string', ValueFun: ''},
      {rowid: 'F2', dataModelId: 'M2', Name: 'lookup', type: 'inputParams', ValueFun: fieldFunction},
      {rowid: 'F3', dataModelId: 'M2', Name: 'input', type: 'inputParams', ValueFun: parameter},
    ], relationRows: [{rowid: 'R', parentModId: 'M1', childModId: 'M2', parentTable: 'OrderSource', childTable: 'CustomerSource', filter: physical}]})
    f.setModelValues({Filter: expression}, 'A', 'M2')
    const session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    expect(operation.getState().changes.map(change => `${change.table}:${change.id}:${change.property}`)).toEqual([
      'Base_DataModel:M1:Name', 'Base_DataModel:M2:Filter', 'Base_DataModel_Field:F2:ValueFun',
    ])
    await operation.save()
    expect(JSON.parse(String(f.modelRow('M2').Filter))).toMatchObject({Field: 'SalesOrders.rowid', ValueFun: {Value: {Field: 'Orders.rowid'}}})
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toHaveLength(0)
    await session.loadMetadataViews(['Base_DataModel_Field'])
    const fields = session.metadataDataSet.getView('Base_DataModel_Field')!.rows
    expect(JSON.parse(String(fields.find(row => row['rowid'] === 'F2')?.['ValueFun'])).RefTableName).toBe('SalesOrders')
    expect(fields.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(parameter)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.rows[0]?.['filter']).toBe(physical)
    expect(writes(f)).toHaveLength(1)
  })

  it('keeps partial DB results unresolved and does not update the file or replay writes', async () => {
    const f = fixture({omitModelProperties: ['Name']}), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    await expect(operation.save()).rejects.toThrow(/回读/)
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().status).toBe('different')
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(1)
    operation.acceptCurrent(); expect(operation.getState().pending).toBe(false)
    expect(f.modelRow().Name).toBe('Orders')
  })

  it('reports a concurrent new old-name reference on readback instead of declaring a completed rename', async () => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    const release = f.holdModelResponse(), saving = operation.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    f.created.set('Base_DataModel_Field', [{rowid: 'LATE', dataSetId: 'A', dataModelId: 'M2', Name: 'late', type: 'inputParams',
      ValueFun: JSON.stringify({Type: 'GetTableField', Field: 'Orders.rowid'})}])
    release()
    await expect(saving).rejects.toThrow(/回读/)
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().verification.some(item => item.id === 'LATE')).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    operation.acceptCurrent()
  })

  it('reconciles a concurrently changed scene after DB confirmation and preserves its unrelated edits', async () => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    const release = f.holdModelResponse(), saving = operation.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    const remote = JSON.parse(f.stored.get('A')!)
    remote.tables.CustomersAlias.views.shared.pageSize = 71
    f.stored.set('A', JSON.stringify(remote)); release()
    await expect(saving).rejects.toThrow(/远端/)
    expect(operation.getState().status).toBe('configuration')
    expect(await operation.verify()).toBe(true)
    expect(JSON.parse(f.stored.get('A')!).tables.CustomersAlias.views.shared.pageSize).toBe(71)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('rejects stale definitions, opaque old-name expressions and wrong scene bindings before writing', async () => {
    const f = fixture(), session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    f.setModelValues({description: 'Concurrent edit'})
    await session.metadataDataSet.getView('Base_DataModel')!.refresh()
    await expect(operation.save()).rejects.toThrow(/变化/)
    f.setModelValues({RequestComplete: 'use(Orders)'})
    await session.metadataDataSet.getView('Base_DataModel')!.refresh()
    await expect(operation.preview()).rejects.toThrow(/可靠改写/)
    expect(writes(f)).toHaveLength(0)
    const mismatch = fixture()
    mismatch.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {X: {modelBinding: {modelId: 'M1', modelName: 'Wrong'}, views: {default: {}}}}}))
    const other = (await mismatch.open('A')).getModelRename('M1')
    other.input.updateEditingValue('rename', 'name', 'New')
    await expect(other.preview()).rejects.toThrow(/身份/)
    expect(writes(mismatch)).toHaveLength(0)
  })

  it('saves Name and scene bindings while preserving model, source, internal table and named view identities', async () => {
    const f = fixture({businessRows: {SalesOrders: [{rowid: 'O1', parentId: null}]}}), session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview()
    expect(operation.getState().changes).toContainEqual(expect.objectContaining({table: 'Base_DataModel', id: 'M1', property: 'Name', before: 'Orders', after: 'SalesOrders'}))
    expect(writes(f)).toHaveLength(0)
    await operation.save()
    expect(writes(f)).toHaveLength(1)
    expect(f.modelRow()).toMatchObject({rowid: 'M1', Name: 'SalesOrders', MetaName: 'OrderSource'})
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias).toMatchObject({modelBinding: {modelId: 'M1', modelName: 'SalesOrders'}, views: {shared: {pageSize: 12}}})
    expect(operation.getState().pending).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.modelBinding?.modelName).toBe('SalesOrders')
    const consumingView = resolveDataViewKey('A@SalesOrders@shared', reopened.definitionDataSet!)!
    expect(consumingView.viewId).toBe('shared')
    await consumingView.refresh()
    expect(consumingView.rows).toMatchObject([{rowid: 'O1', parentId: null}])
    expect(consumingView.fieldAccess(consumingView.rows[0]!, 'rowid').read).toBe('visible')
    expect(resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)).toBeUndefined()
  })

  it.each(['', ' Orders ', 'Customers', 'Bad@Name', '#Bad'])('rejects invalid or occupied registration %s before any write', async name => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', name)
    await expect(operation.preview()).rejects.toThrow(/注册名/)
    expect(writes(f)).toHaveLength(0)
  })

  it('does not use local input permissions as authority to change formal Name', async () => {
    const f = fixture(), session = await f.open('A'), operation = session.getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders')
    await operation.preview()
    f.denyModelField('Name')
    await session.metadataDataSet.getView('Base_DataModel')!.refresh()
    await expect(operation.save()).rejects.toThrow()
    expect(writes(f)).toHaveLength(0)
  })

  it.each(['database', 'file'])('recovers a lost %s reply by readback without replaying the database change', async kind => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview()
    if (kind === 'database') f.loseNextResponse(); else f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    expect(operation.getState().pending).toBe(true)
    await operation.verify()
    expect(operation.getState().pending).toBe(false)
    expect(writes(f)).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.modelBinding.modelName).toBe('SalesOrders')
  })

  it('cancels only local input and preview; no formal row or file changes', async () => {
    const f = fixture(), operation = (await f.open('A')).getModelRename('M1')
    operation.input.updateEditingValue('rename', 'name', 'SalesOrders'); await operation.preview(); operation.cancel()
    expect(operation.getState().pending).toBe(false)
    expect(f.modelRow().Name).toBe('Orders'); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })
})
