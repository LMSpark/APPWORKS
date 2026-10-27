import {withDefinitionResources} from '../view-design/definition-resource.fixture'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, DataView, RequestState} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, type ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {dataSpacePageFixture} from '../../../page/design/native/data-space-page.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const targetId = 'SPACE'
const viewSave = {views: [{tableName: 'DataViewDefinition', viewId: 'default'}]}
const bindingSave = {views: [{tableName: 'DataTableBindingDefinition', viewId: 'default'}]}
const definitionSave = {views: [...viewSave.views, ...bindingSave.views]}
function editViewDefinition(dataSet: DataSet, configuration: Record<string, unknown>, tableName = 'Parents', viewId = 'shared') {
  const view = dataSet.getView('DataViewDefinition')!
  const row = view.rows.find(item => item['tableName'] === tableName && item['viewId'] === viewId)!
  const key = view.getPkKey(row)!
  for (const [name, value] of Object.entries(configuration)) view.updateEditingValue(key, name, value)
  return {view, key}
}
async function addViewDefinition(dataSet: DataSet, selection: {tableName: string; modelId: string; modelName: string; viewId: string}) {
  const view = dataSet.getView('DataViewDefinition')!
  await view.addRow({dataSetId: targetId, tableName: selection.tableName, dataModelId: selection.modelId,
    dataModelName: selection.modelName, viewId: selection.viewId})
  return view
}
function editTableDefinition(dataSet: DataSet, tableName: string, properties: Record<string, unknown>) {
  const view = dataSet.getView('DataTableBindingDefinition')!
  const row = view.rows.find(item => item['tableName'] === tableName)!
  const key = view.getPkKey(row)!
  const configuration = view.getEditingRow(key)?.['configuration']
  if (!isRecord(configuration)) throw new Error('missing native table definition')
  view.updateEditingValue(key, 'configuration', Object.fromEntries(Object.entries({...configuration, ...properties}).filter(([, value]) => value !== undefined)))
  return {view, key}
}
const legacyLayout = JSON.stringify({graphVersion: 1,
  nodes: [{id: 'ParentModel', x: -25, y: 40}, {id: 'ChildModel', x: 200, y: 60}], edges: []})
const initial = JSON.stringify({scenarioId: targetId, tables: {
  Parents: {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'},
    views: {default: {}, shared: {pageSize: 10}}},
  Children: {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'},
    views: {default: {}, shared: {pageSize: 15}}},
}, viewCascades: []})

function model(id: string): FormalModel {
  return {id, name: id, metaName: id, sourceName: id, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'id', businessMain: false, raw: {}, fields: [{id: `${id}-id`, modelId: id,
      name: 'id', canonicalName: 'id', type: 'string', primaryKey: true, description: '',
      output: true, computed: false, order: 0, orderType: '', raw: {}}]}
}

class QueryHttp extends HttpClientBase {
  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    throw new Error('definition projection must not query rows')
  }
}

function fixture(text: string | null = initial) {
  const stored = new Map<string, string>()
  if (text !== null) stored.set(targetId, text)
  let scope = 'SCOPE'
  let assembleGate: Promise<void> | null = null
  let metadataGate: Promise<void> | null = null
  let metadataFailure: Error | null = null
  let metadataCalls = 0
  let candidateReady: (() => void) | null = null
  let writes = 0
  let failAfterWrite = false
  let assemblyFailure: Error | null = null
  let readGate: Promise<void> | null = null
  let readReady: (() => void) | null = null
  let models = [model('ParentModel'), model('ChildModel')]
  let readLayout = (): Promise<string | null> => Promise.resolve(legacyLayout)
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {},
      scenarioViews: {readScope: () => scope,
        readText: async scenarioId => {readReady?.(); await readGate; return stored.get(scenarioId) ?? null},
        writeText: async (scenarioId, value) => {
          writes++
          stored.set(scenarioId, value)
          if (failAfterWrite) {failAfterWrite = false; throw new Error('response lost after write')}
        }},
    })
    const http = new QueryHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {}})})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const produced: DataSet[] = []
    const metadata: DataSet[] = []
    let assemblyCalls = 0
    const service = new LowcodeDataSpaceViewDesign({workspace,
      readLegacyLayout: async id => {
        if (id !== targetId) throw new Error('wrong layout target')
        return readLayout()
      },
      assertScope: () => {if (scope !== 'SCOPE') throw new Error('STALE_SCOPE')},
      loadMetadata: withDefinitionResources(async id => {
        metadataCalls++
        expect(id).toBe(targetId)
        await metadataGate
        if (metadataFailure) throw metadataFailure
        const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'META', tables: {}})
        metadata.push(dataSet)
        return dataSet
      }),
      readModel: async input => {
        const found = models.find(candidate => candidate.id === input.modelId)
        if (!found) throw new Error('formal model missing')
        return found
      },
      assemble: async ({scenarioId: id, config}) => {
        assemblyCalls++
        if (id !== config.scenarioId) throw new Error('wrong target')
        if (assemblyFailure) {
          const failure = assemblyFailure
          candidateReady?.()
          await assembleGate
          throw failure
        }
        const result = assembler.assemble({config, space: {dataSpaceId: id, name: '正式空间名称'}, models, relations: []})
        produced.push(result.dataSet)
        candidateReady?.()
        await assembleGate
        return result
      },
    })
    return {workspace, service, produced, metadata, get assemblyCalls() {return assemblyCalls}}
  }
  return {stored, openOwner, get metadataCalls() {return metadataCalls}, setScope: (value: string) => {scope = value},
    holdMetadata: (gate: Promise<void> | null) => {metadataGate = gate},
    setMetadataFailure: (failure: Error | null) => {metadataFailure = failure},
    setLayoutReader: (reader: () => Promise<string | null>) => {readLayout = reader},
    setAssemblyFailure: (failure: Error | null) => {assemblyFailure = failure},
    setModels: (next: FormalModel[]) => {models = next},
    setRemote: (value: string | null) => {if (value === null) stored.delete(targetId); else stored.set(targetId, value)},
    holdRead: (gate: Promise<void> | null) => {readGate = gate; return new Promise<void>(resolve => {readReady = resolve})},
    failNextWrite: () => {failAfterWrite = true}, get writes() {return writes},
    holdAssembly: (gate: Promise<void> | null) => {
      assembleGate = gate
      return new Promise<void>(resolve => {candidateReady = resolve})
    }}
}

const parent = {tableName: 'Parents', modelId: 'ParentModel', modelName: 'ParentModel', viewId: 'shared'}

describe('single-target data-space design session', () => {
  it.each([false, true])('reopens a clean cached target through the native source before projecting definitions (deferred=%s)', async deferred => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose()
    const remote = initial.replace('"pageSize":10', '"pageSize":47')
    storage.setRemote(remote)
    const before = owner.assemblyCalls
    const reopened = await owner.service.openDesignSession(targetId, {deferDefinition: deferred})
    try {
      expect(reopened.viewState?.text).toBe(remote)
      expect(reopened.metadataDataSet.getView('DataViewDefinition')?.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')?.['pageSize']).toBe(47)
      expect(owner.assemblyCalls - before).toBe(deferred ? 0 : 1)
      if (!deferred) expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(47)
      expect(storage.writes).toBe(0)
    } finally {reopened.dispose()}
  })

  it('reopens a remotely deleted target without reviving its cached file', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose(); storage.setRemote(null)
    const before = owner.assemblyCalls
    const reopened = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      expect(reopened.viewState).toBeNull()
      expect(owner.workspace.getScenarioViews(targetId)).toBeNull()
      expect(reopened.metadataDataSet.getView('DataViewDefinition')?.rows).toEqual([])
      expect(owner.assemblyCalls).toBe(before); expect(storage.writes).toBe(0)
    } finally {reopened.dispose()}
  })

  it('keeps the cached identity and revision when the remote source is unchanged', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose()
    const file = owner.workspace.getScenarioViews(targetId)!, revision = file.revision
    const reopened = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      expect(owner.workspace.getScenarioViews(targetId)).toBe(file)
      expect(file.revision).toBe(revision); expect(reopened.viewState?.text).toBe(initial)
      expect(owner.assemblyCalls).toBe(0); expect(storage.writes).toBe(0)
    } finally {reopened.dispose()}
  })

  it.each(['draft', 'pending', 'unknown'] as const)('preserves a cached %s instead of adopting the remote file', async state => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose()
    const file = owner.workspace.getScenarioViews(targetId)!, draft = initial.replace('"pageSize":10', '"pageSize":33')
    file.setText(draft)
    if (state !== 'draft') file.beginSave(draft, initial)
    if (state === 'unknown') file.markSaveUnknown()
    const revision = file.revision, submission = file.submission
    storage.setRemote(initial.replace('"pageSize":10', '"pageSize":47'))
    if (state !== 'draft') {
      await expect(owner.service.openDesignSession(targetId, {deferDefinition: true})).rejects.toThrow('SCENARIO_DEFINITION_PENDING')
      expect(file.getText()).toBe(draft); expect(file.revision).toBe(revision)
      expect(file.submission).toBe(submission); expect(file.saveStatus).toBe(state)
      expect(owner.metadata.every(dataSet => dataSet.destroyed)).toBe(true); expect(storage.writes).toBe(0)
      return
    }
    const reopened = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      expect(reopened.viewState?.text).toBe(draft); expect(reopened.viewState?.dirty).toBe(true)
      expect(file.revision).toBe(revision); expect(file.submission).toBe(submission)
      expect(file.saveStatus).toBe('idle')
      expect(storage.writes).toBe(0)
    } finally {reopened.dispose()}
  })

  it.each(['read-failed', 'invalid'] as const)('preserves the old source and releases the failed new session when reopening is %s', async failure => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose()
    const file = owner.workspace.getScenarioViews(targetId)!, revision = file.revision
    let rejectRead: ((reason: Error) => void) | undefined
    const entered = failure === 'read-failed' ? storage.holdRead(new Promise<void>((_, reject) => {rejectRead = reject})) : undefined
    if (failure === 'invalid') storage.setRemote('{')
    const rejected = expect(owner.service.openDesignSession(targetId, {deferDefinition: true})).rejects.toThrow()
    if (entered) {await entered; rejectRead?.(new Error('offline'))}
    await rejected
    expect(owner.workspace.getScenarioViews(targetId)).toBe(file); expect(file.getText()).toBe(initial)
    expect(file.revision).toBe(revision); expect(owner.metadata.every(dataSet => dataSet.destroyed)).toBe(true)
    expect(owner.assemblyCalls).toBe(0); expect(storage.writes).toBe(0)
  })

  it.each(['edit', 'edit-and-undo', 'scope'] as const)('rejects %s during cached source refresh without accepting the remote file', async change => {
    const storage = fixture(), owner = storage.openOwner()
    const first = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    first.dispose()
    const file = owner.workspace.getScenarioViews(targetId)!, draft = initial.replace('"pageSize":10', '"pageSize":33')
    storage.setRemote(initial.replace('"pageSize":10', '"pageSize":47'))
    let release: (() => void) | undefined
    const entered = storage.holdRead(new Promise<void>(resolve => {release = resolve}))
    const rejected = expect(owner.service.openDesignSession(targetId, {deferDefinition: true})).rejects.toThrow()
    await entered
    if (change === 'scope') storage.setScope('OTHER')
    else {file.setText(draft); if (change === 'edit-and-undo') file.undo()}
    release?.(); await rejected
    expect(file.getText()).toBe(change === 'edit' ? draft : initial)
    expect(owner.metadata.every(dataSet => dataSet.destroyed)).toBe(true)
    expect(owner.assemblyCalls).toBe(0); expect(storage.writes).toBe(0)
  })

  it.each(['changed', 'read-failed', 'invalid'] as const)('preserves explicitly cancellable native edits when remote adoption is %s', async failure => {
    const storage=fixture(),owner=storage.openOwner(),session=await owner.service.openDesignSession(targetId,{deferDefinition:true})
    try {
      const view=session.metadataDataSet.getView('DataViewDefinition')!,row=view.rows.find(row=>row['viewId']==='shared')!,key=view.getPkKey(row)!
      view.updateEditingValue(key,'pageSize',33)
      const file=owner.workspace.getScenarioViews(targetId)!,revision=file.revision
      let previewText=initial
      if(failure==='changed') storage.setRemote(initial.replace('"pageSize":10','"pageSize":44'))
      if(failure==='invalid') {previewText='{';storage.setRemote(previewText)}
      let fail!: (reason: Error) => void
      const entered=failure==='read-failed' ? storage.holdRead(new Promise<void>((_,reject)=>{fail=reject})) : null
      const rejected=expect(session.adoptViews({expectedRevision:revision,previewText,discardViews:[{tableName:view.tableName,viewId:view.viewId}]})).rejects.toThrow()
      if(entered) {await entered;fail(new Error('offline'))}
      await rejected
      expect(view.getEditingRow(key)?.['pageSize']).toBe(33)
      expect(view.hasEditingChanges()).toBe(true)
      expect(file.getText()).toBe(initial);expect(file.revision).toBe(revision);expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each(['edit','query','dispose'] as const)('rejects %s during native remote adoption without discarding approved edits',async change=>{
    const storage=fixture(),owner=storage.openOwner(),session=await owner.service.openDesignSession(targetId,{deferDefinition:true})
    try {
      const view=session.metadataDataSet.getView('DataViewDefinition')!,row=view.rows.find(row=>row['viewId']==='shared')!,key=view.getPkKey(row)!
      view.updateEditingValue(key,'pageSize',33)
      const file=owner.workspace.getScenarioViews(targetId)!,revision=file.revision
      let release!:()=>void
      const entered=storage.holdRead(new Promise<void>(resolve=>{release=resolve}))
      const rejected=expect(session.adoptViews({expectedRevision:revision,previewText:initial,discardViews:[{tableName:view.tableName,viewId:view.viewId}]})).rejects.toThrow(change === 'dispose' ? 'SCENARIO_DEFINITION_IDENTITY' : 'DATA_VIEW_SOURCE_DIRTY')
      await entered
      if(change==='edit') view.updateEditingValue(key,'pageSize',49)
      else if(change==='query') view.queryContext={...view.queryContext,check:'new'}
      else session.dispose()
      release();await rejected
      if(change!=='dispose') expect(view.getEditingRow(key)?.['pageSize']).toBe(change==='edit'?49:33)
      expect(file.getText()).toBe(initial);expect(file.revision).toBe(revision);expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('protects other definition workspaces and refreshes loaded layout only after scoped remote adoption succeeds',async()=>{
    const storage=dataSpacePageFixture({overviewOnly:true,deferDefinition:true}),session=await storage.open('A')
    const native={...JSON.parse(session.viewState!.text),schemaVersion:2,resourceRelations:[]}
    try {
      const views=session.metadataDataSet.getView('DataViewDefinition')!,row=views.rows.find(row=>row['viewId']==='shared')!,key=views.getPkKey(row)!
      const layout=session.metadataDataSet.getView('DataSpaceLayoutDefinition')!
      await layout.refresh()
      views.updateEditingValue(key,'pageSize',33)
      layout.updateEditingValue('A','tablePositions',{OrdersAlias:{x:1,y:2}})
      const remote=JSON.stringify({...native,layout:{tablePositions:{OrdersAlias:{x:55,y:66}}}})
      storage.stored.set('A',remote)
      const input={expectedRevision:session.viewState!.revision,previewText:remote,discardViews:[{tableName:views.tableName,viewId:views.viewId}]}
      await expect(session.adoptViews(input)).rejects.toThrow('DataSpaceLayoutDefinition')
      expect(views.getEditingRow(key)?.['pageSize']).toBe(33)
      expect(layout.hasEditingChanges()).toBe(true)
      await session.adoptViews({...input,discardViews:[...input.discardViews,{tableName:layout.tableName,viewId:layout.viewId}]})
      expect(views.hasEditingChanges()).toBe(false);expect(layout.hasEditingChanges()).toBe(false)
      expect(layout.rows[0]?.['tablePositions']).toEqual({OrdersAlias:{x:55,y:66}})
      expect(session.viewState?.text).toBe(remote);expect(storage.fileWrites).toHaveLength(0)
    } finally {session.dispose()}
  })

  it('adopts a remote file after an unknown native submission and permits the next native save',async()=>{
    const storage=dataSpacePageFixture({overviewOnly:true,deferDefinition:true}),session=await storage.open('A')
    const native={...JSON.parse(session.viewState!.text),schemaVersion:2,resourceRelations:[]}
    try {
      const view=session.metadataDataSet.getView('DataViewDefinition')!,row=view.rows.find(row=>row['viewId']==='shared')!,key=view.getPkKey(row)!
      view.updateEditingValue(key,'pageSize',33);storage.loseNextFileResponse()
      await expect(session.metadataDataSet.saveChanges()).rejects.toThrow('response lost')
      native.tables.OrdersAlias.views.shared.pageSize=44
      const remote=JSON.stringify(native);storage.stored.set('A',remote)
      await session.adoptViews({expectedRevision:session.viewState!.revision,previewText:remote,discardViews:[{tableName:view.tableName,viewId:view.viewId}]})
      const adopted=view.rows.find(row=>row['tableName']==='OrdersAlias'&&row['viewId']==='shared')!
      expect(adopted['pageSize']).toBe(44)
      view.updateEditingValue(view.getPkKey(adopted)!,'pageSize',45)
      expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored.get('A')!).tables.OrdersAlias.views.shared.pageSize).toBe(45)
      expect(storage.fileWrites).toHaveLength(2)
    } finally {session.dispose()}
  })

  it('preserves database input queries and refreshes loaded named definitions without querying unopened views', async () => {
    const storage = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: [
      {rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource',
        filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})},
    ], sourceFields: [
      {rowid: 'UPSTREAM', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    ]}), session = await storage.open('A')
    try {
      const inputs = await session.loadModelInputFields('M1')
      const context = structuredClone(inputs.queryContext), rows = [...inputs.rows]
      expect(inputs.requestState).toBe(RequestState.Loaded); expect(rows.length).toBeGreaterThan(0)
      const fileModels = session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!
      const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!
      await fileModels.refresh()
      expect(layout.requestState).toBe(RequestState.Idle)
      const remote = JSON.parse(session.viewState!.text)
      remote.tables.Files = {resourceType: 'file', resourceId: 'pagedata:views',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}
      const text = JSON.stringify(remote)
      storage.stored.set('A', text)
      await session.adoptViews({expectedRevision: session.viewState!.revision, previewText: text,
        discardViews: [{tableName: layout.tableName, viewId: layout.viewId}]})
      expect(fileModels.rows.map(row => row['tableName'])).toEqual(['Files'])
      expect(inputs.queryContext).toEqual(context); expect(inputs.rows).toEqual(rows)
      expect(inputs.requestState).toBe(RequestState.Loaded)
      expect(layout.requestState).toBe(RequestState.Idle)
      expect(storage.fileWrites).toHaveLength(0)
    } finally {session.dispose()}
  })

  it('stages a native relation without unrelated models or view queries, releases validation and saves the full file', async () => {
    const config = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [{relationId: 'r', parentTable: 'Parents', childTable: 'Children',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}]}
    config.tables.Unavailable = {modelBinding: {modelId: 'Missing', modelName: 'Missing'}, views: {default: {}}}
    config.tables.Parents.views.shared = {labelField: 'absent'}
    const storage = fixture(JSON.stringify(config)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, row = view.rows[0]!
      view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'scoped relation')
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(session.definitionStatus).toBe('unloaded')
      expect(owner.assemblyCalls).toBe(1)
      expect(owner.produced).toHaveLength(1)
      expect(owner.produced[0]!.destroyed).toBe(true)
      expect(view.hasEditingChanges()).toBe(false)
      expect(JSON.parse(storage.stored.get(targetId)!)).toEqual({...config,
        resourceRelations: [{...config.resourceRelations[0], relationName: 'scoped relation'}]})
      const reopened = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
      expect(reopened.metadataDataSet.getView('DataResourceRelationDefinition')!.rows[0]).toMatchObject({relationName: 'scoped relation'})
      expect(reopened.definitionStatus).toBe('unloaded'); reopened.dispose()
    } finally {session.dispose()}
  })

  it.each(['draft', 'file', 'scope', 'dispose'])('saves captured native relations while protecting %s changes and releases its candidate', async change => {
    const config = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [{relationId: 'r', parentTable: 'Parents', childTable: 'Children',
      filterExpression: {field: 'id', operator: 'eq', value: 1}}]}
    const storage = fixture(JSON.stringify(config)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    view.updateEditingValue(key, 'relationName', 'before validation')
    let release!: () => void
    const ready = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    await ready
    if (change === 'draft') view.updateEditingValue(key, 'relationName', 'newer draft')
    if (change === 'file') owner.workspace.getScenarioViews(targetId)!.setText(JSON.stringify({...config, version: 9}))
    if (change === 'scope') storage.setScope('OTHER')
    if (change === 'dispose') session.dispose()
    release()
    if (change === 'draft') {
      await expect(pending).resolves.toMatchObject({success: true})
      expect(JSON.parse(storage.stored.get(targetId)!).resourceRelations[0].relationName).toBe('before validation')
      expect(view.getEditingRow(key)?.['relationName']).toBe('newer draft')
      expect(storage.writes).toBe(1)
    } else {
      await expect(pending).rejects.toThrow(/STALE|SCENARIO_DEFINITION_IDENTITY/)
      expect(storage.writes).toBe(0)
      expect(storage.stored.get(targetId)).toBe(JSON.stringify(config))
    }
    expect(owner.produced.at(-1)!.destroyed).toBe(true)
    session.dispose()
  })

  it('rejects an invalid changed relation without losing its draft or replacing the complete file', async () => {
    const config = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [{relationId: 'r', parentTable: 'Parents', childTable: 'Children',
      filterExpression: {field: 'id', operator: 'eq', value: 1}}]}
    const storage = fixture(JSON.stringify(config)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
      const invalid = {field: 'missing', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}
      view.updateEditingValue(key, 'filterExpression', invalid)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow(/字段引用不存在或端点不匹配/)
      expect(view.getEditingRow(key)?.['filterExpression']).toEqual(invalid)
      expect(session.viewState!.text).toBe(JSON.stringify(config))
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })
  it('adopts a missing remote file without assembly and can explicitly create it again', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const previous = session.definitionDataSet!, calls = owner.assemblyCalls
    storage.setRemote(null)
    expect(await session.adoptViews({expectedRevision: session.viewState!.revision, previewText: null})).toBeNull()
    expect(session.definitionStatus).toBe('absent'); expect(previous.destroyed).toBe(true)
    expect(owner.assemblyCalls).toBe(calls); expect(storage.writes).toBe(0)
    for (const table of ['DataViewDefinition', 'DataResourceRelationDefinition', 'DataViewCascadeDefinition']) {
      expect(session.metadataDataSet.getView(table)!.rows).toEqual([])
    }
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows).toEqual([])
    await addViewDefinition(session.metadataDataSet, parent)
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet!.getView('Parents', 'shared')).toBeDefined()
    expect(storage.writes).toBe(1)
    reopened.dispose(); session.dispose()
  })

  it('adopts remote definitions without assembling unrelated resources and saves the next scoped edit', async () => {
    const options = {overviewOnly: true, broken: false}, storage = dataSpacePageFixture(options)
    const session = await storage.open('A')
    const previous = session.definitionDataSet!
    const text = session.viewState!.text
    editViewDefinition(session.metadataDataSet, {pageSize: 22}, 'OrdersAlias')
    const remote = text.replace('"pageSize":12', '"pageSize":44')
    storage.stored.set('A', remote); options.broken = true
    try {
      await expect(session.adoptViews({expectedRevision: session.viewState!.revision, previewText: remote, discardViews: viewSave.views})).resolves.toMatchObject({text: remote, dirty: false})
      expect(previous.destroyed).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
      const view = session.metadataDataSet.getView('DataViewDefinition')!
      const row = view.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')!
      expect(row['pageSize']).toBe(44)
      options.broken = false
      view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 45)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(storage.fileWrites).toHaveLength(1)
      const reopened = await storage.open('A')
      expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.pageSize).toBe(45)
      expect(reopened.definitionDataSet!.getView('CustomersAlias', 'shared')!.pageSize).toBe(24)
      reopened.dispose()
    } finally {session.dispose()}
  })

  it.each([{action: 'refresh', staged: false}, {action: 'refresh', staged: true}, {action: 'adopt', staged: false}, {action: 'adopt', staged: true}] as const)(
    'preserves later binding changes between definition reloads %o', async ({action, staged}) => {
      const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId)
      const definitions = session.metadataDataSet.getView('DataViewDefinition')!
      const originalRefresh = definitions.refresh.bind(definitions)
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>(resolve => {release = resolve}), ready = new Promise<void>(resolve => {entered = resolve})
      const refresh = vi.spyOn(definitions, 'refresh').mockImplementationOnce(async () => {await originalRefresh(); entered(); await gate})
      if (action === 'adopt') editViewDefinition(session.metadataDataSet, {pageSize: 22})
      const operation = (action === 'refresh' ? session.refresh({deferDefinition: true})
        : session.adoptViews({expectedRevision: session.viewState!.revision, previewText: initial, discardViews: viewSave.views}))
        .then(() => undefined, (cause: unknown) => cause)
      try {
        await ready
        const {view, key} = editTableDefinition(session.metadataDataSet, 'Parents', {businessCategory: 'later-category'})
        if (staged) await view.applyEditingRows([key])
        release()
        const result = await operation
        expect(view.getEditingRow(key)?.['configuration']).toMatchObject({businessCategory: 'later-category'})
        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toContain('DATA_VIEW_UNSAVED_CHANGES')
        expect(view.hasEditingChanges(key) || view.dirtyTracking.hasPendingChanges(key)).toBe(true)
        expect(storage.writes).toBe(0); expect(storage.stored.get(targetId)).toBe(initial)
        if (action === 'adopt') expect(definitions.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')?.['pageSize']).toBe(10)
        expect((await session.metadataDataSet.saveChanges(bindingSave)).success).toBe(true)
        expect(storage.writes).toBe(1)
        const reopened = await storage.openOwner().service.openDesignSession(targetId)
        try {expect(reopened.definitionDataSet!.getTable('Parents')!.businessCategory).toBe('later-category')}
        finally {reopened.dispose()}
        await session.refresh({deferDefinition: true})
        editTableDefinition(session.metadataDataSet, 'Parents', {businessCategory: 'cancel-me'})
        view.discardPendingChanges([key]); await session.refresh({deferDefinition: true})
        expect(view.getEditingRow(key)?.['configuration']).toMatchObject({businessCategory: 'later-category'})
        expect(storage.writes).toBe(1)
      } finally {release(); await operation; refresh.mockRestore(); session.dispose()}
    })

  it.each(['edit', 'dispose'] as const)('keeps the file intact if %s occurs during remote adoption', async change => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    editViewDefinition(session.metadataDataSet, {pageSize: 22})
    const file = owner.workspace.getScenarioViews(targetId)!, before = file.getText()
    let release!: () => void
    const entered = storage.holdRead(new Promise<void>(resolve => {release = resolve}))
    const pending = session.adoptViews({expectedRevision: file.revision, previewText: initial, discardViews: viewSave.views})
    const rejected = expect(pending).rejects.toThrow(change === 'dispose' ? 'SCENARIO_DEFINITION_IDENTITY' : 'DATA_VIEW_SOURCE_DIRTY')
    await entered
    const view = session.metadataDataSet.getView('DataViewDefinition')!, row = view.rows[0]!, key = view.getPkKey(row)!
    if (change === 'edit') view.updateEditingValue(key, 'pageSize', 49)
    else session.dispose()
    release(); await rejected
    expect(file.getText()).toBe(before); expect(file.isDirty).toBe(false)
    expect(storage.writes).toBe(0)
    if (change === 'edit') expect(view.getEditingRow(key)?.['pageSize']).toBe(49)
    session.dispose()
  })

  it('adds a binding from a deferred session with an unavailable unrelated model, saves and reopens the complete file', async () => {
    const config = JSON.parse(initial); delete config.tables.Parents
    const text = JSON.stringify(config), storage = fixture(text), owner = storage.openOwner()
    storage.setModels([model('ParentModel')])
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      await addViewDefinition(session.metadataDataSet, parent)
      editViewDefinition(session.metadataDataSet, {pageSize: 37})
      expect(session.viewState?.text).toBe(text); expect(storage.writes).toBe(0)
      expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(owner.produced).toHaveLength(1); expect(owner.produced[0]!.destroyed).toBe(true)
      expect(JSON.parse(session.viewState!.text).tables.Parents.views.default).toEqual({})
      expect(JSON.parse(session.viewState!.text).tables.Children).toEqual(config.tables.Children)
      expect(storage.writes).toBe(1)
      storage.setModels([model('ParentModel'), model('ChildModel')])
      const reopened = await storage.openOwner().service.openDesignSession(targetId)
      try {
        expect(reopened.definitionDataSet!.getView('Parents', 'shared')!.pageSize).toBe(37)
        expect(reopened.definitionDataSet!.getView('Children', 'shared')!.pageSize).toBe(15)
      } finally {reopened.dispose()}
    } finally {session.dispose()}
  })
  it('validates the first view before registering its file and permits retry after assembly recovers', async () => {
    const storage = fixture(null), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    try {
      const view = await addViewDefinition(session.metadataDataSet, {...parent, viewId: 'first'})
      storage.setAssemblyFailure(new Error('first view cannot assemble'))
      await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('first view cannot assemble')
      expect(owner.workspace.getScenarioViews(targetId)).toBeNull()
      expect(session.viewState).toBeNull()
      expect(view.rows).toHaveLength(1); expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(storage.writes).toBe(0)
      storage.setAssemblyFailure(null)
      expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      await session.loadDefinition()
      expect(session.definitionDataSet!.getView('Parents', 'first')).toBeDefined()
      expect(session.definitionDataSet!.getView('Parents', 'default')).toBeDefined()
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {expect(reopened.definitionDataSet!.getView('Parents', 'first')).toBeDefined()}
    finally {reopened.dispose()}
  })

  it.each(['add', 'edit'] as const)('releases the single-view %s validation projection and saves without rereading its sources', async operation => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const original = session.definitionDataSet!, before = owner.assemblyCalls
    try {
      const viewId = operation === 'add' ? 'detail' : parent.viewId
      if (operation === 'add') await addViewDefinition(session.metadataDataSet, {...parent, viewId})
      editViewDefinition(session.metadataDataSet, {pageSize: 37}, 'Parents', viewId)
      let release!: () => void
      const ready = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
      const pending = session.metadataDataSet.saveChanges(viewSave)
      await ready
      storage.setAssemblyFailure(new Error('source not readable a second time'))
      release()
      expect((await pending).success).toBe(true)
      expect(owner.assemblyCalls).toBe(before + 1)
      expect(original.destroyed).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(owner.produced.at(-1)!.destroyed).toBe(true)
      expect(JSON.parse(session.viewState!.text).tables.Parents.views[viewId].pageSize).toBe(37)
      expect(JSON.parse(session.viewState!.text).tables.Children.views.shared.pageSize).toBe(15)
      expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
      expect(owner.assemblyCalls).toBe(before + 1); expect(storage.writes).toBe(1)
    } finally {storage.holdAssembly(null); storage.setAssemblyFailure(null); session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {expect(reopened.definitionDataSet!.getView('Parents', operation === 'add' ? 'detail' : parent.viewId)!.pageSize).toBe(37)}
    finally {reopened.dispose()}
  })

  it.each(['scope', 'dispose', 'remote file'] as const)('does not publish a first-view candidate invalidated by %s during validation', async change => {
    const storage = fixture(null), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    let release!: () => void
    try {
      await addViewDefinition(session.metadataDataSet, {...parent, viewId: 'first'})
      const ready = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
      const pending = session.metadataDataSet.saveChanges(viewSave)
      const rejected = expect(pending).rejects.toThrow(/STALE_SCOPE|IDENTITY|SCENARIO_VIEW_EXISTS/)
      await ready
      if (change === 'scope') storage.setScope('EXPIRED')
      else if (change === 'dispose') session.dispose()
      else storage.setRemote(initial)
      release(); await rejected
      expect(owner.workspace.getScenarioViews(targetId)).toBeNull()
      expect(owner.produced).toHaveLength(1); expect(owner.produced[0]!.destroyed).toBe(true)
      expect(storage.writes).toBe(0)
      expect(storage.stored.get(targetId)).toBe(change === 'remote file' ? initial : undefined)
    } finally {release?.(); storage.holdAssembly(null); session.dispose()}
  })

  it('confirms a file save without assembling the unchanged target again and keeps its definition editing usable', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    editViewDefinition(session.metadataDataSet, {pageSize: 23})
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    const calls = owner.assemblyCalls
    expect(session.definitionStatus).toBe('unloaded')
    expect(owner.produced.at(-1)!.destroyed).toBe(true)
    storage.setAssemblyFailure(new Error('assembly unavailable after file write'))
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(session.viewState).toMatchObject({persisted: true, dirty: false, saveStatus: 'idle'})
    expect(storage.stored.get(targetId)).toBe(session.viewState!.text)
    expect(owner.assemblyCalls).toBe(calls); expect(storage.writes).toBe(1)
    storage.setAssemblyFailure(null)
    editViewDefinition(session.metadataDataSet, {pageSize: 24})
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(24)
    reopened.dispose()
  })

  it('confirms an unknown file write without assembly or replay', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    editViewDefinition(session.metadataDataSet, {pageSize: 23})
    storage.failNextWrite()
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('response lost after write')
    const calls = owner.assemblyCalls
    storage.setAssemblyFailure(new Error('assembly unavailable during verification'))
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(session.viewState).toMatchObject({dirty: false, saveStatus: 'idle'})
    expect(owner.assemblyCalls).toBe(calls); expect(storage.writes).toBe(1)
    session.dispose()
  })

  it('delivers deferred metadata and file definitions before assembling the target, then coalesces requests', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    expect(owner.assemblyCalls).toBe(0)
    expect(session.viewState?.text).toBe(initial)
    expect(session.metadataDataSet.getView('DataViewDefinition')?.rows).toHaveLength(4)
    let release!: () => void
    const ready = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const first = session.loadDefinition(), second = session.loadDefinition()
    await ready
    expect(owner.assemblyCalls).toBe(1)
    release(); await Promise.all([first, second])
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    await session.loadDefinition()
    expect(owner.assemblyCalls).toBe(1)
    expect(storage.writes).toBe(0); session.dispose()
  })

  it('retries a deferred assembly failure without reloading or destroying overview records', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    storage.setAssemblyFailure(new Error('target unavailable'))
    await expect(session.loadDefinition()).rejects.toThrow('target unavailable')
    expect(session.metadataDataSet.destroyed).toBe(false)
    expect(session.viewState?.text).toBe(initial)
    storage.setAssemblyFailure(null)
    await session.loadDefinition()
    expect(session.definitionError).toBeNull()
    expect(session.definitionDataSet?.getTable('Parents')).toBeDefined()
    expect(owner.metadata).toHaveLength(1); session.dispose()
  })

  it('allows native relation repair after explicit assembly failure but rejects a later pending view draft', async () => {
    const config = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    const storage = fixture(JSON.stringify(config)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      storage.setAssemblyFailure(new Error('target unavailable'))
      await expect(session.loadDefinition()).rejects.toThrow('target unavailable')
      await expect(session.loadRelationDefinitions()).resolves.toBeUndefined()
      expect(session.definitionError?.message).toBe('target unavailable')
      const view = session.metadataDataSet.getView('DataViewDefinition')!, row = view.rows[0]!
      view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 43)
      await expect(session.loadRelationDefinitions()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
      expect(owner.assemblyCalls).toBe(1)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each(['dispose', 'file'])('rejects legacy relation workspace results after %s changes', async change => {
    const storage = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: [
      {rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource',
        filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})},
    ]}), session = await storage.open('A')
    const definitions = session.metadataDataSet.getView('DataResourceRelationDefinition')!, before = [...definitions.rows]
    const release = storage.holdDefinitionRead()
    try {
      const rejected = expect(session.loadRelationDefinitions()).rejects.toThrow('字段目录读取已过期')
      await vi.waitFor(() => expect(storage.modelReads).toHaveLength(2))
      expect(new Set(storage.modelReads.map(model => model.modelName))).toEqual(new Set(['Orders', 'Customers']))
      const file = storage.workspaces[0]!.getScenarioViews('A')!
      if (change === 'dispose') session.dispose()
      else file.setText(JSON.stringify({...JSON.parse(file.getText()), version: 9}))
      release(); await rejected
      expect(storage.assemblyScopes).toEqual([])
      expect(storage.fileWrites).toEqual([])
      if (change === 'dispose') expect(session.metadataDataSet.destroyed).toBe(true)
      else {expect(definitions.rows).toEqual(before); expect(JSON.parse(file.getText()).version).toBe(9)}
    } finally {release(); storage.dispose()}
  })

  it.each(['file', 'source'] as const)('retains the newer legacy relation conversion after %s changes when an older read fails', async change => {
    const storage = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: [
      {rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource',
        filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})},
    ]}), session = await storage.open('A')
    const definitions = session.metadataDataSet.getView('DataResourceRelationDefinition')!
    const refresh = definitions.refresh.bind(definitions)
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const ready = new Promise<void>(resolve => {entered = resolve})
    const blocked = vi.spyOn(definitions, 'refresh').mockImplementationOnce(async () => {await refresh(); entered(); await gate})
    const pending = session.loadRelationDefinitions().then(() => null, cause => cause)
    try {
      await ready
      const file = storage.workspaces[0]!.getScenarioViews('A')!
      if (change === 'file') file.setText(JSON.stringify({...JSON.parse(file.getText()), version: 9}))
      else storage.setRelationValues({filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'new'}})})
      await session.loadRelationDefinitions()
      const latest = structuredClone(definitions.rows)
      expect(latest[0]?.['relationId']).toBe('R:CustomersAlias:OrdersAlias')
      expect(latest[0]?.['filterExpression']).toBeDefined()
      if (change === 'source') expect(latest[0]?.['filterExpression']).toMatchObject({value: 'new'})
      expect(session.relationDefinitionsReady).toBe(true)
      release()
      expect(await pending).toBeInstanceOf(Error)
      await definitions.refresh()
      expect(definitions.loadingError).toBeNull()
      expect(definitions.rows).toEqual(latest)
      expect(session.relationDefinitionsReady).toBe(true)
      expect(storage.fileWrites).toEqual([])
    } finally {release(); await pending; blocked.mockRestore(); storage.dispose()}
  })

  it.each(['dispose', 'file'])('rejects deferred target results after %s changes', async change => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    let release!: () => void
    const ready = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.loadDefinition()
    await ready
    const candidate = owner.produced.at(-1)!
    if (change === 'dispose') session.dispose()
    else owner.workspace.getScenarioViews(targetId)!.setText(initial.replace('"pageSize":15', '"pageSize":45'))
    release(); await expect(pending).rejects.toThrow(/DISPOSED|STALE/)
    expect(candidate.destroyed).toBe(true)
    expect(storage.writes).toBe(0); session.dispose()
  })

  it('removes only the identified binding and owned layout, then saves and reopens an empty definition', async () => {
    const config: unknown = JSON.parse(initial)
    if (!isRecord(config) || !isRecord(config['tables'])) throw new Error('missing fixture tables')
    config['tables']['OtherParents'] = structuredClone(config['tables']['Parents'])
    config['layout'] = {tablePositions: {Parents: {x: 1, y: 2}, OtherParents: {x: 3, y: 4}, Children: {x: 5, y: 6}}}
    const original = JSON.stringify(config), storage = fixture(original), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const before = session.definitionDataSet!
    await session.removeModelBinding({...parent, expectedText: original})
    expect(before.destroyed).toBe(false)
    expect(session.metadataDataSet.getView('DataTableBindingDefinition')?.rows.map(row => row['tableName'])).toEqual(['Children', 'OtherParents'])
    expect(storage.stored.get(targetId)).toBe(original); expect(storage.writes).toBe(0)
    expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    expect(before.destroyed).toBe(true)
    const again = await storage.openOwner().service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')).toBeUndefined()
    expect(again.definitionDataSet?.getView('OtherParents', 'shared')?.pageSize).toBe(10)
    expect(again.definitionDataSet?.layout?.tablePositions).toEqual({OtherParents: {x: 3, y: 4}, Children: {x: 5, y: 6}})
    for (const [tableName, modelId] of [['Children', 'ChildModel'], ['OtherParents', 'ParentModel']]) {
      await again.removeModelBinding({tableName: tableName!, modelId: modelId!, modelName: modelId!, expectedText: again.viewState!.text})
    }
    expect((await again.metadataDataSet.saveChanges()).success).toBe(true)
    const empty = await storage.openOwner().service.openDesignSession(targetId)
    expect(empty.definitionDataSet?.tables).toEqual({})
    expect(empty.definitionError).toBeNull()
    expect(empty.definitionDataSet?.layout?.tablePositions).toEqual({})
    await addViewDefinition(empty.metadataDataSet, parent)
    expect((await empty.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(empty.definitionStatus).toBe('unloaded')
    await empty.loadDefinition()
    expect(empty.definitionDataSet?.getView('Parents', 'shared')).toBeDefined()
    session.dispose(); again.dispose(); empty.dispose()
  })

  it.each(['identity', 'text', 'view draft', 'unknown'])('rejects an unsafe binding removal: %s', async reason => {
    const storage = fixture(), owner = storage.openOwner(), session = await owner.service.openDesignSession(targetId)
    const command = {...parent, expectedText: initial}
    if (reason === 'identity') command.modelName = 'OtherModel'
    if (reason === 'text') command.expectedText = `${initial} `
    if (reason === 'view draft') {
      const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'pageSize', 30)
    }
    if (reason === 'unknown') {
      editViewDefinition(session.metadataDataSet, {pageSize: 21})
      storage.failNextWrite(); await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow()
      command.expectedText = session.viewState!.text
    }
    const before = session.viewState!.text, writes = storage.writes
    await expect(session.removeModelBinding(command)).rejects.toThrow()
    expect(session.viewState!.text).toBe(before); expect(storage.writes).toBe(writes)
    session.dispose()
  })

  it.each(['relation', 'query', 'field'])('preserves the binding when a %s definition still references it', async kind => {
    const config: unknown = JSON.parse(initial)
    if (!isRecord(config)) throw new Error('missing fixture config')
    if (kind === 'relation') config['resourceRelations'] = [{relationId: 'relation', parentTable: 'Parents', childTable: 'Children', filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Parents.id'}}}]
    else config['viewCascades'] = kind === 'query'
      ? [{parentTable: 'Parents', parentViewId: 'shared', childTable: 'Children', childViewId: 'default', filterBindings: [{sourceField: 'id', targetField: 'id'}]}]
      : [{kind: 'field', cascadeId: 'field', tableName: 'Children', viewId: 'default', targetField: 'parentId', valueFormat: 'native', valuePolicy: {mode: 'retain'}, optionsView: {tableName: 'Parents', viewId: 'default'}, parents: [{tableName: 'Parents', viewId: 'shared', field: 'id', parameter: 'parent'}]}]
    const original = JSON.stringify(config), storage = fixture(original), owner = storage.openOwner()
    if (kind === 'field') {
      const child = model('ChildModel')
      storage.setModels([model('ParentModel'), {...child, fields: [...child.fields, {...child.fields[0]!, id: 'parent-field', name: 'parentId', canonicalName: 'parentId', primaryKey: false}]}])
    }
    const session = await owner.service.openDesignSession(targetId), projection = session.definitionDataSet
    await expect(session.removeModelBinding({...parent, expectedText: original})).rejects.toThrow()
    expect(session.viewState!.text).toBe(original); expect(session.definitionDataSet).toBe(projection)
    expect(storage.writes).toBe(0); session.dispose()
  })

  it('keeps the newer shared file after a removal candidate finishes late', async () => {
    const storage = fixture(), owner = storage.openOwner(), session = await owner.service.openDesignSession(targetId)
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.removeModelBinding({...parent, expectedText: initial})
    await produced
    const candidate = owner.produced.at(-1)!
    const newer = initial.replace('"pageSize":15', '"pageSize":45')
    owner.workspace.getScenarioViews(targetId)!.setText(newer)
    release(); await expect(pending).rejects.toThrow('STALE')
    expect(candidate.destroyed).toBe(true); expect(session.viewState!.text).toBe(newer)
    expect(storage.writes).toBe(0); session.dispose()
  })

  it('verifies an unknown binding removal once without replaying the file write', async () => {
    const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId)
    await session.removeModelBinding({...parent, expectedText: initial})
    storage.failNextWrite(); await expect(session.metadataDataSet.saveChanges()).rejects.toThrow()
    expect(session.viewState!.saveStatus).toBe('unknown'); expect(storage.writes).toBe(1)
    expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    const again = await storage.openOwner().service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')).toBeUndefined()
    expect(storage.writes).toBe(1); session.dispose(); again.dispose()
  })

  it.each(['scope', 'dispose'])('releases a removal candidate after %s changes', async reason => {
    const storage = fixture(), owner = storage.openOwner(), session = await owner.service.openDesignSession(targetId)
    const file = owner.workspace.getScenarioViews(targetId)!
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.removeModelBinding({...parent, expectedText: initial})
    await produced
    const candidate = owner.produced.at(-1)!
    if (reason === 'scope') storage.setScope('OTHER')
    else session.dispose()
    release(); await expect(pending).rejects.toThrow(reason === 'scope' ? 'STALE_SCOPE' : 'DISPOSED')
    expect(candidate.destroyed).toBe(true); expect(file.getText()).toBe(initial)
    expect(storage.writes).toBe(0); session.dispose()
  })

  it('waits for metadata before reading and assembling the initial definition once', async () => {
    const storage = fixture(), owner = storage.openOwner()
    let release!: () => void
    storage.holdMetadata(new Promise<void>(resolve => {release = resolve}))
    const read = vi.spyOn(owner.workspace, 'loadScenarioViews')
    let delivered = false
    const pending = owner.service.openDesignSession(targetId).then(session => {delivered = true; return session})
    try {
      await vi.waitFor(() => expect(storage.metadataCalls).toBe(1), {timeout: 500})
      expect(read).not.toHaveBeenCalled(); expect(owner.assemblyCalls).toBe(0)
      expect(owner.metadata).toHaveLength(0); expect(delivered).toBe(false)
      release()
      const session = await pending
      const accepted = session.definitionDataSet
      expect(accepted).toBe(owner.produced[0]); expect(owner.assemblyCalls).toBe(1)
      await session.refresh()
      expect(owner.assemblyCalls).toBe(2); expect(accepted?.destroyed).toBe(true)
      expect(session.definitionDataSet).toBe(owner.produced[1])
    } finally {release(); (await pending).dispose()}
  })

  it('reads the latest stored definition after metadata becomes ready without a speculative candidate', async () => {
    const storage = fixture(), owner = storage.openOwner()
    let release!: () => void
    storage.holdMetadata(new Promise<void>(resolve => {release = resolve}))
    const read = vi.spyOn(owner.workspace, 'loadScenarioViews')
    const pending = owner.service.openDesignSession(targetId)
    try {
      await vi.waitFor(() => expect(storage.metadataCalls).toBe(1), {timeout: 500})
      expect(read).not.toHaveBeenCalled(); expect(owner.produced).toHaveLength(0)
      const changed = initial.replace('"pageSize":10', '"pageSize":28')
      storage.setRemote(changed)
      release()
      const session = await pending
      expect(owner.assemblyCalls).toBe(1); expect(owner.produced).toHaveLength(1)
      expect(session.viewState).toMatchObject({text: changed, dirty: false})
      expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(28)
      expect(storage.writes).toBe(0)
    } finally {release(); (await pending).dispose()}
  })

  it('propagates metadata failure without reading or assembling a file definition', async () => {
    const storage = fixture(), owner = storage.openOwner(), failure = new Error('metadata query failed')
    storage.setMetadataFailure(failure)
    let release!: () => void, settled = false
    storage.holdMetadata(new Promise<void>(resolve => {release = resolve}))
    const read = vi.spyOn(owner.workspace, 'loadScenarioViews')
    const pending = owner.service.openDesignSession(targetId).then(
      session => {session.dispose(); throw new Error('unexpected session')}, error => {settled = true; return error})
    try {
      await vi.waitFor(() => expect(storage.metadataCalls).toBe(1), {timeout: 500})
      expect(settled).toBe(false); expect(read).not.toHaveBeenCalled()
      release()
      expect(await pending).toBe(failure)
      expect(read).not.toHaveBeenCalled(); expect(owner.assemblyCalls).toBe(0)
      expect(owner.produced).toHaveLength(0); expect(owner.metadata).toHaveLength(0)
    } finally {release(); await pending}
  })

  it('reads an invalid initial file only after metadata is ready and releases the rejected session', async () => {
    const storage = fixture('{broken'), owner = storage.openOwner()
    let release!: () => void, settled = false
    storage.holdMetadata(new Promise<void>(resolve => {release = resolve}))
    const read = vi.spyOn(owner.workspace, 'loadScenarioViews')
    const pending = owner.service.openDesignSession(targetId).then(
      session => {session.dispose(); throw new Error('unexpected session')}, error => {settled = true; return error})
    try {
      await vi.waitFor(() => expect(storage.metadataCalls).toBe(1), {timeout: 500})
      expect(settled).toBe(false); expect(read).not.toHaveBeenCalled()
      release()
      expect(await pending).toBeInstanceOf(Error)
      expect(read).toHaveBeenCalledOnce()
      expect(owner.metadata[0]?.destroyed).toBe(true); expect(owner.produced).toHaveLength(0)
    } finally {release(); await pending}
  })

  it('retains an initial assembly failure without retrying until an explicit refresh', async () => {
    const storage = fixture(), owner = storage.openOwner(), failure = new Error('assembly unavailable')
    storage.setAssemblyFailure(failure)
    const session = await owner.service.openDesignSession(targetId)
    try {
      expect(session.definitionError).toBe(failure); expect(owner.assemblyCalls).toBe(1)
      expect(session.metadataDataSet.destroyed).toBe(false)
      expect(session.viewState?.text).toBe(initial)
      storage.setAssemblyFailure(null)
      await session.refresh()
      expect(session.definitionError).toBeNull(); expect(owner.assemblyCalls).toBe(2)
      expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    } finally {session.dispose()}
  })

  it('releases metadata without file I/O or assembly when scope changes before metadata returns', async () => {
    const storage = fixture(), owner = storage.openOwner()
    let release!: () => void
    storage.holdMetadata(new Promise<void>(resolve => {release = resolve}))
    const read = vi.spyOn(owner.workspace, 'loadScenarioViews')
    const pending = owner.service.openDesignSession(targetId).then(
      session => {session.dispose(); throw new Error('unexpected session')}, error => error)
    try {
      await vi.waitFor(() => expect(storage.metadataCalls).toBe(1), {timeout: 500})
      storage.setScope('OTHER'); release()
      expect(await pending).toMatchObject({message: 'STALE_SCOPE'})
      expect(read).not.toHaveBeenCalled(); expect(owner.assemblyCalls).toBe(0)
      expect(owner.produced).toHaveLength(0); expect(owner.metadata[0]?.destroyed).toBe(true)
    } finally {release(); await pending}
  })

it('persists table categories through native binding and view edits, and clears only the selected table', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    editTableDefinition(session.metadataDataSet, 'Parents', {businessCategory: 'master'})
    editTableDefinition(session.metadataDataSet, 'Children', {businessCategory: '  partner-specific  '})
    editViewDefinition(session.metadataDataSet, {pageSize: 22})
    expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
    await session.loadDefinition()
    expect(session.definitionDataSet?.getTable('Parents')?.businessCategory).toBe('master')
    expect(session.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    const savedText = session.viewState!.text, projection = session.definitionDataSet
    const {view} = editTableDefinition(session.metadataDataSet, 'Parents', {businessCategory: null})
    await expect(session.metadataDataSet.saveChanges(bindingSave)).rejects.toThrow('businessCategory')
    expect(session.viewState!.text).toBe(savedText)
    expect(session.definitionDataSet).toBe(projection)
    expect(storage.stored.get(targetId)).toBe(savedText)
    view.discardPendingChanges(); session.dispose()

    const again = await storage.openOwner().service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')?.businessCategory).toBe('master')
    expect(again.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    again.definitionDataSet!.getTable('Parents')!.businessCategory = 'reference'
    expect((await again.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
    expect(storage.stored.get(targetId)).toBe(savedText)
    expect(storage.writes).toBe(1)
    await again.refresh()
    editTableDefinition(again.metadataDataSet, 'Parents', {businessCategory: undefined})
    expect((await again.metadataDataSet.saveChanges(bindingSave)).success).toBe(true)
    again.dispose()
    const verified = await storage.openOwner().service.openDesignSession(targetId)
    expect(verified.definitionDataSet?.getTable('Parents')?.businessCategory).toBeUndefined()
    expect(verified.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    expect(verified.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(22)
    verified.dispose()
  })

it.each([true, false])('saves local display references but rejects invalid computed references through native definitions (formal output: %s)', async output => {
    const config = JSON.parse(initial)
    config.tables.Parents.columns = [{name: 'display', type: 'string', computeExpression: 'id + "!"'}]
    const storage = fixture(JSON.stringify(config)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const {view} = editViewDefinition(session.metadataDataSet, {labelField: 'display', valueField: 'display',
      aggregates: {displayCount: {type: 'count', field: 'display'}}, treeConfig: {idField: 'id', textField: 'display'}})
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.labelField).toBe('display')
    const before = session.viewState!.text
    for (const properties of [
      {sortExpression: [{field: 'display', direction: 'asc'}]},
      {filterExpression: {field: 'display', operator: 'eq', value: 'x'}},
      {treeConfig: {idField: 'display', textField: 'display'}},
    ]) {
      editViewDefinition(session.metadataDataSet, properties)
      await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('本地计算列不能用于远端查询')
      expect(session.viewState!.text).toBe(before)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
      view.discardPendingChanges()
    }
    const binding = editTableDefinition(session.metadataDataSet, 'Parents', {columns: [{name: 'display', type: 'string', computeExpression: 'id + ('}]})
    await expect(session.metadataDataSet.saveChanges(bindingSave)).rejects.toThrow()
    expect(session.viewState!.text).toBe(before)
    binding.view.discardPendingChanges()
    storage.setModels([{...model('ParentModel'), fields: [...model('ParentModel').fields,
      {id: 'DISPLAY', modelId: 'ParentModel', name: 'display', canonicalName: 'display', type: 'string',
        primaryKey: false, description: '', output, computed: false, order: 1, orderType: '', raw: {}}]}, model('ChildModel')])
    editViewDefinition(session.metadataDataSet, {pageSize: 42})
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('本地计算列与正式字段重名')
    expect(session.viewState!.text).toBe(before)
    expect(storage.writes).toBe(1); session.dispose()
  })

  it("rejects a native save when a retained column loses its formal output and preserves cancellable edits", async () => {
    const configured = JSON.parse(initial)
    configured.tables.Parents.columns = [{name: 'id', required: true}]
    const storage = fixture(JSON.stringify(configured)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const before = session.viewState!.text, projection = session.definitionDataSet
    storage.setModels([{...model('ParentModel'), fields: []}, model('ChildModel')])
    const {view,key} = editViewDefinition(session.metadataDataSet, {pageSize: 42})
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow(/未解析到唯一正式输出字段/)
    expect(session.viewState!.text).toBe(before); expect(storage.writes).toBe(0)
    expect(session.definitionDataSet).toBe(projection)
    expect(view.getEditingRow(key)?.['pageSize']).toBe(42)
    view.discardPendingChanges()
    expect(view.getEditingRow(key)?.['pageSize']).toBe(10)
    session.dispose()
  })
it('saves native table constraints with view edits and keeps rejected candidates out of the file', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const projection = session.definitionDataSet!
    editTableDefinition(session.metadataDataSet, 'Parents', {columns: [{name: 'absent', required: true}]})
    await expect(session.metadataDataSet.saveChanges(bindingSave)).rejects.toThrow('未解析到唯一正式输出字段')
    expect(session.viewState!.text).toBe(initial)
    expect(session.definitionDataSet).toBe(projection)
    editTableDefinition(session.metadataDataSet, 'Parents', {columns: [{name: 'id', required: true, minLength: 2}]})
    editViewDefinition(session.metadataDataSet, {pageSize: 31})
    expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
    await session.loadDefinition()
    expect(session.definitionDataSet?.getTable('Parents')?.columns.find(column => column.name === 'id')?.required).toBe(true)
    expect(session.definitionDataSet?.getTable('Children')?.columns.find(column => column.name === 'id')?.required).toBeUndefined()
    const persistedText = session.viewState!.text
    session.dispose()
    const again = await storage.openOwner().service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')?.columns.find(column => column.name === 'id')?.minLength).toBe(2)
    expect(again.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(31)
    expect(storage.stored.get(targetId)).toBe(persistedText)
    expect(storage.writes).toBe(1); again.dispose()
  })

it('rejects a captured native definition save after the shared file changes and disposes its candidate', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    editViewDefinition(session.metadataDataSet, {pageSize: 40})
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges(viewSave)
    const rejected = expect(pending).rejects.toThrow('STALE')
    await produced
    const candidate = owner.produced.at(-1)!
    const changed = initial.replace('"pageSize":10', '"pageSize":25')
    owner.workspace.getScenarioViews(targetId)!.setText(changed)
    release(); await rejected
    expect(candidate.destroyed).toBe(true)
    expect(owner.workspace.getScenarioViews(targetId)!.getText()).toBe(changed)
    expect(storage.stored.get(targetId)).toBe(initial)
    expect(storage.writes).toBe(0); session.dispose()
  })

it('disposes a native save candidate when scope expires or the session is released', async () => {
    for (const reason of ['scope', 'dispose'] as const) {
      const storage = fixture(), owner = storage.openOwner()
      const session = await owner.service.openDesignSession(targetId)
      const file = owner.workspace.getScenarioViews(targetId)!
      editViewDefinition(session.metadataDataSet, {pageSize: 40})
      let release!: () => void
      const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
      const pending = session.metadataDataSet.saveChanges(viewSave)
      const rejected = expect(pending).rejects.toThrow(reason === 'scope' ? 'STALE_SCOPE' : /IDENTITY|DESTROYED|destroyed|销毁/)
      await produced
      const candidate = owner.produced.at(-1)!
      if (reason === 'scope') storage.setScope('OTHER')
      else session.dispose()
      release(); await rejected
      expect(candidate.destroyed).toBe(true)
      expect(file.getText()).toBe(initial)
      expect(storage.writes).toBe(0); session.dispose()
    }
  })

it('persists only captured native changes and keeps later editing values pending', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const {view, key} = editViewDefinition(session.metadataDataSet, {pageSize: 40})
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges(viewSave)
    await produced
    view.updateEditingValue(key, 'pageSize', 99)
    release()
    expect((await pending).success).toBe(true)
    expect(JSON.parse(storage.stored.get(targetId)!).tables.Parents.views.shared.pageSize).toBe(40)
    expect(view.getEditingRow(key)?.['pageSize']).toBe(99)
    expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
    view.discardPendingChanges()
    expect(view.getEditingRow(key)?.['pageSize']).toBe(40)
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(40)
    expect(storage.writes).toBe(1); reopened.dispose()
  })

  it("edits model-owned native definitions, saves and reopens through DataView and DataSet", async () => {
    const storage = fixture(), first = storage.openOwner()
    const session = await first.service.openDesignSession(targetId)
    expect(session.targetId).toBe(targetId); expect(session.metadataDataSet.scenarioId).toBe('META')
    expect(session.definitionDataSet?.scenarioId).toBe(targetId)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    expect(session.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    expect(session.definitionDataSet?.getTable('Parents')?.columns.map(column => column.name)).toContain('id')
    const oldProjection = session.definitionDataSet!, destroy = vi.spyOn(oldProjection, 'destroy')
    editViewDefinition(session.metadataDataSet, {pageSize: 30, queryContext: {dataSpaceId: 'PARENT'}})
    expect(destroy).not.toHaveBeenCalled(); expect(storage.writes).toBe(0)
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(destroy).toHaveBeenCalledOnce(); expect(session.definitionStatus).toBe('unloaded')
    const saved = session.viewState!
    expect(saved).toMatchObject({persisted: true, dirty: false})
    expect(storage.stored.get(targetId)).toBe(saved.text)
    expect(saved.text).not.toMatch(/"columns"|"rows"|"lingma_sys_/)
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(30)
    session.dispose()
    const again = await storage.openOwner().service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(30)
    expect(again.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    expect(again.definitionDataSet?.getView('Parents', 'shared')?.queryContext).toEqual({dataSpaceId: 'PARENT'})
    again.dispose()
  })

  it('keeps formal metadata available when the file is absent and creates only on explicit command', async () => {
    const storage = fixture(null), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    expect(session.metadataDataSet.scenarioId).toBe('META')
    expect(session.viewState).toBeNull(); expect(session.definitionDataSet).toBeNull()
    const view = await addViewDefinition(session.metadataDataSet, {...parent, viewId: 'first'})
    expect(storage.stored.has(targetId)).toBe(false); expect(session.viewState).toBeNull()
    view.discardPendingChanges()
    expect(view.rows).toEqual([])
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(storage.stored.has(targetId)).toBe(false)
    await addViewDefinition(session.metadataDataSet, {...parent, viewId: 'first'})
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(storage.stored.has(targetId)).toBe(true)
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'first')).toBeDefined()
    expect(reopened.definitionDataSet?.getView('Parents', 'default')).toBeDefined()
    reopened.dispose()
  })

  it('rejects malformed files without treating them as absent', async () => {
    const owner = fixture('{broken').openOwner()
    await expect(owner.service.openDesignSession(targetId)).rejects.toThrow()
    expect(owner.metadata[0]?.destroyed).toBe(true)
  })

it('repairs an invalid native model binding without presenting an empty successful projection', async () => {
    const invalid = initial.replace('"modelId":"ParentModel"', '"modelId":"OTHER"')
    const storage = fixture(invalid), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    expect(session.metadataDataSet.destroyed).toBe(false)
    expect(session.viewState).toMatchObject({persisted: true, dirty: false, text: invalid})
    expect(session.definitionError?.message).toContain('未解析到唯一正式模型')
    expect(() => session.definitionDataSet).toThrow('未解析到唯一正式模型')
    editTableDefinition(session.metadataDataSet, 'Parents', {modelBinding: {modelId: 'STILL_OTHER', modelName: 'ParentModel'}})
    await expect(session.metadataDataSet.saveChanges(bindingSave)).rejects.toThrow('未解析到唯一正式模型')
    expect(storage.writes).toBe(0); expect(session.viewState?.text).toBe(invalid)
    editTableDefinition(session.metadataDataSet, 'Parents', {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'}})
    expect((await session.metadataDataSet.saveChanges(bindingSave)).success).toBe(true)
    expect(session.definitionError).toBeNull()
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.viewState).toMatchObject({persisted: true, dirty: false})
    expect(JSON.parse(reopened.viewState!.text)).toEqual(JSON.parse(initial))
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')).toBeDefined()
    reopened.dispose()
  })

it('repairs native table constraints after formal fields change and reopens the new primary key', async () => {
    const configured = JSON.parse(initial)
    configured.tables.Parents.columns = [{name: 'id', required: true}]
    const text = JSON.stringify(configured), storage = fixture(text), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const previous = session.definitionDataSet!, original = model('ParentModel')
    storage.setModels([{...original, primaryKey: 'key', fields: original.fields.map(field =>
      ({...field, name: 'key', canonicalName: 'key'}))}, model('ChildModel')])
    await expect(session.refresh()).rejects.toThrow('未解析到唯一正式输出字段')
    expect(previous.destroyed).toBe(true)
    expect(session.metadataDataSet.destroyed).toBe(false)
    expect(session.viewState?.text).toBe(text)
    editTableDefinition(session.metadataDataSet, 'Parents', {columns: undefined})
    expect((await session.metadataDataSet.saveChanges(bindingSave)).success).toBe(true)
    expect(session.definitionError).toBeNull()
    await session.loadDefinition()
    expect(session.definitionDataSet?.getTable('Parents')?.columns.map(column => column.name)).toContain('key')
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.primaryKey).toBe('key')
    reopened.dispose()
  })

  it('exposes an assembly transport failure while retaining the file for a validated view edit after recovery', async () => {
    const storage = fixture(), failure = new Error('formal metadata request failed')
    storage.setAssemblyFailure(failure)
    const session = await storage.openOwner().service.openDesignSession(targetId)
    expect(session.definitionError).toBe(failure)
    expect(() => session.definitionDataSet).toThrow(failure)
    expect(session.viewState).toMatchObject({text: initial, persisted: true, dirty: false})
    await expect(session.refresh()).rejects.toBe(failure)
    editViewDefinition(session.metadataDataSet, {pageSize: 42})
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toBe(failure)
    expect(session.viewState?.text).toBe(initial); expect(session.metadataDataSet.destroyed).toBe(false)
    storage.setAssemblyFailure(null)
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(session.definitionError).toBeNull()
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(42)
    session.dispose()
  })

  it.each((['default', 'graph'] as const).flatMap(readback =>
    (['file-change', 'newer-assembly', 'pending-view'] as const).map(change => ({change, readback}))))(
    'rejects $change while accepting an assembled definition after $readback relation readback', async ({change, readback}) => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    const graph = session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!
    const relationView = session.metadataDataSet.getView('DataResourceRelationDefinition', readback)!
    const refresh = relationView.refresh.bind(relationView)
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const ready = new Promise<void>(resolve => {entered = resolve})
    const blocked = vi.spyOn(relationView, 'refresh').mockImplementationOnce(async () => {await refresh(); entered(); await gate})
    const pending = session.loadDefinition().then(() => null, cause => cause)
    try {
      await ready
      const candidate = owner.produced.at(-1)!
      let latest: DataSet | null = null
      if (change === 'pending-view') editViewDefinition(session.metadataDataSet, {pageSize: 31})
      else {
        const next = {...JSON.parse(initial.replace('"pageSize":10', '"pageSize":31')), schemaVersion: 2,
          resourceRelations: [{relationId: 'fresh', parentTable: 'Parents', childTable: 'Children',
            filterExpression: {field: 'id', operator: 'eq', value: 1}}]}
        owner.workspace.getScenarioViews(targetId)!.setText(JSON.stringify(next))
        if (change === 'newer-assembly') {
          await session.refresh()
          latest = session.definitionDataSet
          expect(latest?.getView('Parents', 'shared')?.pageSize).toBe(31)
          expect(graph.rows.map(row => row['relationId'])).toEqual(['fresh'])
        }
      }
      release()
      expect.soft(await pending).toBeInstanceOf(Error)
      expect.soft(candidate.destroyed).toBe(true)
      if (latest) {
        expect.soft(session.definitionDataSet === latest).toBe(true)
        expect.soft(latest.destroyed).toBe(false)
        expect.soft(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(31)
        expect.soft(graph.rows.map(row => row['relationId'])).toEqual(['fresh'])
      } else expect.soft(() => session.definitionDataSet).toThrow('STALE')
      if (change === 'pending-view') {
        const view = session.metadataDataSet.getView('DataViewDefinition')!
        const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
        expect(view.getEditingRow(view.getPkKey(row)!)?.['pageSize']).toBe(31)
        expect(view.hasEditingChanges()).toBe(true)
      }
      expect(storage.writes).toBe(0)
    } finally {release(); await pending; blocked.mockRestore(); session.dispose()}
  })

  it.each(['newer-read', 'dispose'] as const)('rejects a late graph read after %s without clearing the current graph', async change => {
    const storage = dataSpacePageFixture({overviewOnly: true, deferDefinition: true})
    const session = await storage.open('A'), file = storage.workspaces.at(-1)!.getScenarioViews('A')!
    const graph = session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!
    const refresh = graph.refresh.bind(graph)
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const ready = new Promise<void>(resolve => {entered = resolve})
    const blocked = vi.spyOn(graph, 'refresh').mockImplementationOnce(async () => {await refresh(); entered(); await gate})
    const pending = session.loadGraphRelations().then(() => null, cause => cause)
    try {
      await ready
      if (change === 'dispose') session.dispose()
      else {
        file.setText(JSON.stringify({...JSON.parse(file.getText()), schemaVersion: 2,
          resourceRelations: [{relationId: 'fresh', parentTable: 'CustomersAlias', childTable: 'OrdersAlias',
            filterExpression: {field: 'rowid', operator: 'eq', value: 'one'}}]}))
        await session.loadGraphRelations()
        expect(graph.rows.map(row => row['relationId'])).toEqual(['fresh'])
      }
      release()
      expect.soft(await pending).toBeInstanceOf(Error)
      if (change === 'newer-read') expect(graph.rows.map(row => row['relationId'])).toEqual(['fresh'])
      expect(storage.fileWrites).toEqual([])
    } finally {release(); await pending; blocked.mockRestore(); storage.dispose()}
  })

  it('does not replace a newer valid definition with an older failed assembly', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    storage.setAssemblyFailure(new Error('old request failed'))
    let release!: () => void
    const started = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = session.refresh()
    await started
    storage.setAssemblyFailure(null)
    void storage.holdAssembly(null)
    await session.refresh()
    const latest = session.definitionDataSet
    release()
    await expect(pending).rejects.toThrow('STALE')
    expect(session.definitionError).toBeNull()
    expect(session.definitionDataSet).toBe(latest)
    expect(latest?.destroyed).toBe(false)
    session.dispose()
  })

  it('invalidates projections after external edits and undo without losing the shared draft', async () => {
    const owner = fixture().openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const second = await owner.service.openDesignSession(targetId)
    const old = session.definitionDataSet!
    const destroy = vi.spyOn(old, 'destroy')
    const file = owner.workspace.getScenarioViews(targetId)!
    file.setText(initial.replace('"pageSize":10', '"pageSize":25'))
    expect(destroy).toHaveBeenCalledOnce()
    expect(() => session.definitionDataSet).toThrow('STALE')
    expect(() => second.definitionDataSet).toThrow('STALE')
    await session.refresh()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(25)
    file.undo()
    expect(() => session.definitionDataSet).toThrow('STALE')
    await second.refresh()
    expect(second.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
    expect(second.definitionDataSet?.getView('Parents', 'shared')).toBeDefined()
    second.dispose()
  })

  it('rejects stale scope and destroys a late assembly after disposal', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const accepted = session.definitionDataSet!
    storage.setScope('OTHER')
    expect(() => session.definitionDataSet).toThrow('STALE_SCOPE')
    expect(accepted.destroyed).toBe(true)
    expect(session.metadataDataSet.destroyed).toBe(true)

    const late = fixture()
    const lateOwner = late.openOwner()
    const opened = await lateOwner.service.openDesignSession(targetId)
    let release!: () => void
    const produced = late.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const refreshing = opened.refresh()
    await produced
    const candidate = lateOwner.produced.at(-1)!
    opened.dispose()
    release()
    await expect(refreshing).rejects.toThrow('DISPOSED')
    expect(candidate.destroyed).toBe(true)
    expect(() => opened.definitionDataSet).toThrow('DISPOSED')
  })

  it('disposes metadata and the produced candidate when scope expires during assembly', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = owner.service.openDesignSession(targetId)
    await produced
    const candidate = owner.produced.at(-1)!
    storage.setScope('OTHER')
    release()
    await expect(pending).rejects.toThrow('STALE_SCOPE')
    expect(candidate.destroyed).toBe(true)
    expect(owner.metadata[0]?.destroyed).toBe(true)
  })

  it('releases an accepted projection when the shared file owner is removed', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const accepted = session.definitionDataSet!
    const revision = session.viewState!.revision
    storage.setRemote(null)
    await owner.workspace.adoptScenarioViews({scenarioId: targetId, expectedRevision: revision,
      previewText: null})
    expect(() => session.definitionDataSet).toThrow('STALE')
    expect(accepted.destroyed).toBe(true)
    await session.refresh()
    expect(session.definitionDataSet).toBeNull()
    expect(session.metadataDataSet.destroyed).toBe(false)
    session.dispose()
  })

  it('verifies an unknown save in the same target without replaying the write', async () => {
    const storage = fixture(), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    editViewDefinition(session.metadataDataSet, {pageSize: 33})
    storage.failNextWrite()
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('response lost after write')
    expect(session.viewState?.saveStatus).toBe('unknown'); expect(storage.writes).toBe(1)
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(session.viewState).toMatchObject({saveStatus: 'idle', dirty: false})
    expect(storage.writes).toBe(1); expect(session.definitionStatus).toBe('unloaded')
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(33)
    session.dispose()
  })

  it('previews and adopts a conflicting remote file in the same target', async () => {
    const preview = vi.spyOn(DataView.prototype, 'previewSource'), adopt = vi.spyOn(DataView.prototype, 'adoptSource')
    const storage = dataSpacePageFixture({overviewOnly: true})
    const session = await storage.open('A')
    const text = session.viewState!.text
    editViewDefinition(session.metadataDataSet, {pageSize: 22}, 'OrdersAlias')
    const remote = text.replace('"pageSize":12', '"pageSize":44')
    storage.stored.set('A', remote)
    await expect(session.metadataDataSet.saveChanges(viewSave)).rejects.toThrow('CONFLICT')
    expect(storage.fileWrites).toHaveLength(0)
    expect(await session.previewRemoteViews()).toBe(remote)
    const adopted = await session.adoptViews({expectedRevision: session.viewState!.revision, previewText: remote, discardViews: viewSave.views})
    expect(adopted?.text).toBe(remote)
    expect(preview).toHaveBeenCalled(); expect(adopt).toHaveBeenCalledWith({version: expect.any(Number), content: remote}, {discardViews: [expect.any(DataView)]})
    preview.mockRestore(); adopt.mockRestore()
    expect(session.definitionStatus).toBe('unloaded')
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(44)
    session.dispose()
  })

  it("does not persist direct runtime projection edits as definition changes", async () => {
    const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.definitionDataSet!.getView('Parents', 'shared')!
    view.pageSize = 99
    expect((await session.metadataDataSet.saveChanges(viewSave)).success).toBe(true)
    expect(storage.writes).toBe(0); expect(storage.stored.get(targetId)).toBe(initial)
    await expect(session.loadDefinition()).rejects.toThrow('PROJECTION_EDIT')
    await session.refresh()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
  })

  it('rejects direct table-column edits in the native definition projection', async () => {
    const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId)
    const table = session.definitionDataSet!.getTable('Parents')!
    table.columns.push({name: 'injected', type: 'string'})
    expect((await session.metadataDataSet.saveChanges(bindingSave)).success).toBe(true)
    expect(storage.writes).toBe(0); expect(storage.stored.get(targetId)).toBe(initial)
    await expect(session.loadDefinition()).rejects.toThrow('PROJECTION_EDIT')
    await session.refresh()
    expect(session.definitionDataSet?.getTable('Parents')?.columns.map(column => column.name)).not.toContain('injected')
    session.dispose()
  })
})
