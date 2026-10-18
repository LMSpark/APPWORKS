import { describe, expect, it, vi } from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSet, resolveDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {ProjectWorkspace, ScenarioDefinitionResource} from '@spark-appworks/spark-project-model'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import { ScenarioViewConfig } from '../../../../packages/spark-project-model/src/scenario/scenario-view-config'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewFields} from '../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-fields'

class NoRequest extends HttpClientBase { protected override async executeRequest(): Promise<never> { throw new Error('unexpected request') } }
const formal = { id: 'MODEL', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: 'physical_orders', sourceId: 'DB', sourceType: 'table', primaryKey: 'orderId', businessMain: true,
 fields: [{ id: 'KEY', modelId: 'MODEL', name: 'rowid', canonicalName: 'orderId', type: 'string', primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {} }], raw: {} }
const config = new ScenarioViewConfig('SCENE', JSON.stringify({ scenarioId: 'SCENE', tables: { Orders: { modelBinding: { modelId: 'MODEL', modelName: 'QueryOrders' }, views: { default: {}, detail: { pageSize: 5 } } } } }))
const space = {dataSpaceId: 'SCENE', name: '订单正式空间'}

describe('complete formal model schema and view output', () => {
 const internal = {...formal.fields[0]!, id: 'ORDINAL', name: 'ordIdx', canonicalName: 'ordinal',
  type: 'number', description: '模型排序字段', primaryKey: false, output: false}
 const model = {...formal, fields: [...formal.fields, internal]}
 const create = (definition = config, candidate = model) => {
  const http = new NoRequest(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  return new LowcodeDataSpaceAssembler(runtime, http).assemble({config: definition, space, models: [candidate], relations: []})
 }
 it('retains non-output schema while named and derived array views consume only formal outputs', async () => {
  const stored = JSON.stringify(config.toJSON()), original = JSON.stringify(model)
  const {dataSet} = create(config, {...model, sourceType: '数组', raw: {items: '[{"rowid":"A","ordIdx":7}]'}})
  try {
   expect(dataSet.getTable('Orders')!.columns).toEqual(expect.arrayContaining([
    expect.objectContaining({name: 'ordinal', type: 'number', label: '模型排序字段'}),
   ]))
   const detail = dataSet.getView('Orders', 'detail')!, derived = detail.createQueryView('verification')
   for (const view of [dataSet.getView('Orders')!, detail, derived]) {
    expect(view.columns.map(column => column.name)).not.toContain('ordinal')
    await view.loadFromServer()
    expect(view.rows).toMatchObject([{orderId: 'A'}])
    expect(view.rows[0]).not.toHaveProperty('ordinal')
    await expect(view.queryOptionRows({fields: ['ordinal']})).rejects.toThrow()
   }
   const catalog = LowcodeDataSpaceViewFields.project(model, 'Orders', undefined, 'detail', {})
   expect(catalog.columns.map(column => column.name)).not.toContain('ordinal')
   expect(catalog.selectionColumns.map(column => column.name)).not.toContain('ordinal')
   expect(catalog.outputProjection?.map(field => field.viewField)).toEqual(['orderId'])
   expect(JSON.stringify(config.toJSON())).toBe(stored)
   expect(JSON.stringify(model)).toBe(original)
  } finally {dataSet.destroy()}
 })
 it('does not treat an all-non-output model as a view with every column available', async () => {
  const {dataSet} = create(config, {...model, sourceType: '数组', primaryKey: '', fields: [internal], raw: {items: '[{"ordIdx":7}]'}})
  try {
   expect(dataSet.getTable('Orders')!.columns.map(column => column.name)).toContain('ordinal')
   expect(dataSet.getView('Orders')!.columns.filter(column => column.name !== '_pk')).toEqual([])
   expect(LowcodeDataSpaceViewFields.project({...model, primaryKey: '', fields: [internal]}, 'Orders', undefined, 'default', {}).columns
    .filter(column => column.name !== '_pk')).toEqual([])
  } finally {dataSet.destroy()}
 })
 it('rejects a local computation that shadows a non-output formal field', () => {
  const definition = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {Orders: {
   modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'},
   columns: [{name: 'ordinal', type: 'number', computeExpression: '1'}], views: {default: {}},
  }}}))
  expect(() => create(definition)).toThrow(/本地计算列.*正式/)
 })
 it('deduplicates equivalent non-output schema and rejects a conflicting canonical name without dropping records', () => {
  const repeated = {...model, fields: [...model.fields, {...internal, id: 'REPEAT'}]}
  const {dataSet} = create(config, repeated)
  try {
   expect(dataSet.getTable('Orders')!.columns.filter(column => column.name === 'ordinal')).toHaveLength(1)
   expect(repeated.fields).toHaveLength(3)
  } finally {dataSet.destroy()}
  expect(() => create(config, {...model, fields: [...model.fields, {...internal, id: 'CONFLICT', type: 'string'}]})).toThrow(/字段.*重复/)
 })
 it.each([{valueField: 'ordinal'}, {queryConfig: {fields: ['ordinal']}}, {treeConfig: {parentIdField: 'ordinal'}}])(
  'does not offer non-output schema as a query or selection field: %j', configuration => {
   const definition = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {Orders: {
    modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, views: {default: configuration},
   }}}))
   expect(() => create(definition)).toThrow()
  })
})

const fileTable = {resourceType: 'file', resourceId: 'pagedata.json', columns: [
 {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string', required: true},
], views: {default: {autoLoad: false, commitMode: 'staged'}, detail: {autoLoad: false, commitMode: 'staged'}}}

describe('explicit file resource assembly', () => {
 const text = JSON.stringify({...config.toJSON(), schemaVersion: 2, resourceRelations: [], tables: {
  ...(config.toJSON()['tables'] as object), FileDefinitions: fileTable,
 }})
 const createAssembler = () => {
  const http = new NoRequest()
  return new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})}), http)
 }
 it('refuses an unbound file resource instead of publishing a locally writable or HTTP-backed table', () => {
  expect(() => createAssembler().assemble({config: new ScenarioViewConfig('SCENE', text), space, models: [formal], relations: []}))
   .toThrow(/SCENARIO_FILE_OWNER/)
 })
 it('queries, edits and saves a file alongside formal models, then consumes its persisted configuration in a fresh instance', async () => {
  let stored = text, scope = 'original'
  const writes: string[] = []
  const workspace = new ProjectWorkspace({projectId: 'APP', pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
   blueprint: {loadRoot: async () => ({children: []})}, scenarioViews: {readScope: () => scope,
    readText: async () => stored, writeText: async (_id, next) => {writes.push(next); stored = next}}})
  const file = await workspace.loadScenarioViews({scenarioId: 'SCENE'})
  type Executor = Parameters<DataView['bindQueryExecutor']>[0]
  type Result = Awaited<ReturnType<Executor['executeQuery']>>
  const contexts = new Set<Result>()
  const result = (): Result => {
   const context: Result = {rows: [{id: 'SCENE', text: file.getText()}], total: 1,
    assertIdentity: identity => {
     if (scope !== 'original' || identity.scenarioId !== 'SCENE' || identity.metaName !== 'FileDefinitions'
      || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== 'pagedata.json') throw new Error('FILE_SCOPE_STALE')
    }, rowKey: row => row['id'],
    fieldAccess: (_key, field) => ({read: 'visible', write: field === 'text' ? 'allowed' : 'denied',
     component: field === 'text' ? 'editable' : 'readonly', required: field === 'text', writeMode: field === 'text' ? 'required' : 'readonly'}),
    readFieldAccess: () => 'visible', addActionState: () => 'disabled', editActionState: () => 'enabled',
    deleteActionState: () => 'disabled', createChildActionState: () => 'disabled', viewActionState: () => 'enabled'}
   contexts.add(context); return context
  }
  const executeQuery = vi.fn(async () => result())
  const save: NonNullable<Executor['save']> = async command => {
   const change = command.changes[0]!
   expect(contexts.has(change.context)).toBe(true); change.context.assertIdentity(change.identity)
   const changed = change.changes.changed ?? []
   const next = changed[0]?.['text']; if (typeof next !== 'string') throw new Error('missing text change')
   file.setText(next); await workspace.saveScenarioViews({scenarioId: 'SCENE'})
   return [{metaName: 'FileDefinitions', added: [], changed, deleted: [], changedFields: [['text']], context: result()}]
  }
  const input = {config: new ScenarioViewConfig('SCENE', text), space, models: [formal], relations: [],
   fileExecutors: {FileDefinitions: {executeQuery, save}}}
  const assembled = createAssembler().assemble(input), dataSet = assembled.dataSet
  try {
   const view = dataSet.getView('FileDefinitions')!, detail = dataSet.getView('FileDefinitions', 'detail')!
   expect(resolveDataViewKey('SCENE@FileDefinitions@default', dataSet)).toBe(view)
   expect(dataSet.getTable('FileDefinitions')?.modelBinding).toBeUndefined()
   expect(executeQuery).not.toHaveBeenCalled()
   await view.refresh()
   expect(detail.rows).toEqual([]); expect(dataSet.getView('Orders')!.rows).toEqual([])
   expect(view.fieldAccess(view.rows[0]!, 'id').write).toBe('denied')
   expect(view.addActionState()).toBe('disabled')
   view.updateEditingValue('SCENE', 'text', JSON.stringify({...JSON.parse(text), version: 8}))
   view.discardEditingRows(); expect(file.getText()).toBe(text)
   view.updateEditingValue('SCENE', 'text', JSON.stringify({...JSON.parse(text), version: 9}))
   expect((await dataSet.saveChanges()).success).toBe(true)
   expect(writes).toHaveLength(1); expect(JSON.parse(stored).version).toBe(9)
   const reopened = createAssembler().assemble({...input, config: new ScenarioViewConfig('SCENE', stored)})
   try {expect(reopened.dataSet.toJson().version).toBe(9); expect(reopened.dataSet.getView('FileDefinitions')).not.toBe(view)}
   finally {reopened.dataSet.destroy()}
   scope = 'other'; await expect(view.loadFromServer()).rejects.toThrow('FILE_SCOPE_STALE')
   expect(() => view.fieldAccess(view.rows[0]!, 'text')).toThrow('FILE_SCOPE_STALE')
  } finally {dataSet.destroy()}
 })
 it('validates file query fields and releases the candidate on failure before binding an owner', () => {
  const value = JSON.parse(text); value.tables.FileDefinitions.views.default.queryConfig = {fields: ['missing']}
  const destroy = vi.spyOn(DataSet.prototype, 'destroy')
  try {
  expect(() => createAssembler().assemble({config: new ScenarioViewConfig('SCENE', JSON.stringify(value)), space,
   models: [formal], relations: [], fileExecutors: {FileDefinitions: {executeQuery: async () => {throw new Error('must not query')}}}}))
   .toThrow(/missing/)
   expect(destroy).toHaveBeenCalledOnce()
  } finally {destroy.mockRestore()}
 })
})

describe('formal scenario assembly', () => {
 it.each(['_pk', 'missingOutput', 'rowid'])('rejects a saved filter on non-output %s before binding a query executor', field => {
  const http = new NoRequest(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  const stored = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {
   Orders: {modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, views: {default: {
    filterExpression: {logic: 'or', filters: [{field: 'orderId', operator: 'eq', value: 'A'},
     {logic: 'and', filters: [{field, operator: 'eq', value: 'B'}]}]},
   }}},
  }}))
  const original = stored.toJSON()
  let result: ReturnType<LowcodeDataSpaceAssembler['assemble']> | undefined
  try {
   expect(() => {result = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: stored, space, models: [formal], relations: []})})
    .toThrow(field === '_pk' ? /filterExpression.*本地计算列.*_pk/ : /过滤表达式引用了不存在的字段/)
   expect(stored.toJSON()).toEqual(original)
  } finally {result?.dataSet.destroy()}
 })

 it('retains a valid output alias filter and binds its input value during a named array query', async () => {
  const http = new NoRequest(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  const filterExpression = {field: 'orderId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'selected'}}
  const stored = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {
   Orders: {modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, views: {default: {}, detail: {filterExpression}}},
  }}))
  const result = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: stored, space,
   models: [{...formal, sourceType: '数组', raw: {items: '[{"rowid":"A"},{"rowid":"B"}]'}}], relations: []})
  try {
   const view = result.dataSet.getView('Orders', 'detail')!
   view.queryContext = {selected: 'B'}
   await view.refresh()
   expect(view.rows).toMatchObject([{orderId: 'B'}])
   expect(view.rows).toHaveLength(1)
   expect(view.filterExpression).toEqual(filterExpression)
   expect(result.dataSet.getView('Orders', 'default')!.rows).toEqual([])
  } finally {result.dataSet.destroy()}
 })

 it('queries formal array items locally through each named view without granting database writes', async () => {
  const http=new NoRequest();let token='scope'
  const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token,headers:{}})})
  const model={...formal,sourceType:'数组',raw:{items:'[{"rowid":"B","hidden":false},{"rowid":"A","hidden":{"keep":true}}]'}}
  const result=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space,models:[model],relations:[]})
  const view=result.dataSet.getView('Orders','detail')!
  expect((await view.loadFromServer({sort:'orderId:asc',page:1,pageSize:1})).success).toBe(true)
  expect(view.rows).toMatchObject([{orderId:'A'}]);expect(view.total).toBe(2)
  expect(view.rows[0]).not.toHaveProperty('hidden')
  expect(view.fieldAccess(view.rows[0]!, 'orderId').read).toBe('visible')
  expect(view.editActionState(view.rows[0]!)).not.toBe('enabled');expect(view.addActionState()).not.toBe('enabled')
  expect((await view.loadFromServer({filter:{field:'orderId',operator:'eq',value:{Type:'GetInputParam',ParamName:'selected'}},context:{selected:'B'}})).success).toBe(true)
  expect(view.rows).toMatchObject([{orderId:'B'}]);expect(result.dataSet.getView('Orders')!.rows).toEqual([])
  expect(result.dataSet.toJson().tables['Orders']?.views['detail']?.rows).toEqual([])
  expect(await view.queryOptionRows({fields:['orderId']})).toEqual([{orderId:'B'},{orderId:'A'}])
  token='other';await expect(view.loadFromServer()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  expect(()=>view.fieldAccess(view.rows[0]!, 'orderId')).toThrow('SPARK_EXECUTION_SCOPE_STALE')
  result.dataSet.destroy()
 })
 it('keeps declared native values and keyless arrays readable, with complete SelfRef and option-query isolation', async()=>{
  const http=new NoRequest(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'s',headers:{}})})
  const field={...formal.fields[0]!,id:'DATA',name:'value',canonicalName:'value',primaryKey:false}
  const model={...formal,primaryKey:'',sourceType:'数组',fields:[field],raw:{items:'[{"value":false},{"value":0},{"value":{"n":1}}]'}}
  const result=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space,models:[model],relations:[]})
  const view=result.dataSet.getView('Orders')!
  await view.loadFromServer({outputType:'SelfRefData',pageSize:1})
  expect(view.rows.map(row=>row['value'])).toEqual([false,0,{n:1}])
  expect(view.rows.every(row=>view.fieldAccess(row,'value').read==='visible')).toBe(true)
  expect(view.rows.every(row=>view.fieldAccess(row,'value').write==='denied')).toBe(true)
  await expect(view.queryOptionRows({fields:['value']})).rejects.toThrow('DATA_VIEW_OPTIONS_VALUE')
  await expect(view.loadFromServer({outputType:'Join'})).rejects.toThrow('本地资源')
  await expect(view.loadFromServer({allPages:true,maxRows:1})).rejects.toThrow('完整集合超过配置上限')
  result.dataSet.destroy()
 })
 it.each(['[broken','[null]','{}'])('refuses malformed formal array %s without publishing empty data', text=>{
  const http=new NoRequest(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'s',headers:{}})})
  expect(()=>new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space,models:[{...formal,sourceType:'数组',raw:{items:text}}],relations:[]})).toThrow()
 })
 it('keeps business category separate from the formal business-main flag and preserves named views', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  const configured = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {
   Orders: {modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, businessCategory: 'reference',
    views: {default: {}, detail: {pageSize: 5}}},
  }}))
  const assembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: configured, space,
   models: [formal], relations: []})
  expect(formal.businessMain).toBe(true)
  expect(assembly.dataSet.getTable('Orders')?.businessCategory).toBe('reference')
  expect(assembly.dataSet.toJson().tables['Orders']?.businessCategory).toBe('reference')
  expect(assembly.dataSet.getView('Orders', 'detail')?.pageSize).toBe(5)
  assembly.dataSet.destroy()
  const omitted = new LowcodeDataSpaceAssembler(runtime, http).assemble({config, space, models: [formal], relations: []})
  expect(omitted.dataSet.getTable('Orders')?.businessCategory).toBeUndefined()
  omitted.dataSet.destroy()
 })
 it('keeps local table name and every view with formal model output identity', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({ token: 'scope', headers: {} })})
  const result = new LowcodeDataSpaceAssembler(runtime, http).assemble({ config, space, models: [formal], relations: [] })
  expect(result.dataSet.scenarioId).toBe('SCENE')
  expect(result.dataSet.dataSetName).toBe('订单正式空间')
  expect(result.dataSet.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL', modelName: 'QueryOrders' })
  expect(result.dataSet.getTable('Orders')).toMatchObject({resourceType: 'database-table', resourceId: 'physical_orders'})
  expect(result.dataSet.toJson().tables['Orders']).toMatchObject({resourceType: 'database-table', resourceId: 'physical_orders'})
  expect(result.dataSet.getView('Orders', 'default')?.primaryKey).toBe('orderId')
  expect(result.dataSet.getView('Orders', 'detail')?.pageSize).toBe(5)
  expect(result.dataSet.getTable('MODEL')).toBeUndefined()
  result.dataSet.destroy()
 })
 it('rejects model identity mismatch rather than skipping the table', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({ token: 'scope', headers: {} })})
  expect(() => new LowcodeDataSpaceAssembler(runtime, http).assemble({ config, space, models: [{...formal,id:'OTHER'}], relations: [] })).toThrow(/模型/)
 })
 it('keeps separate model bindings when two tables share a source name and rejects unknown formal types', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  const other = {...formal, id: 'MODEL-2', name: 'QueryOther', metaName: 'QueryOther',
   fields: formal.fields.map(field => ({...field, modelId: 'MODEL-2'}))}
  const twoTables = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {
   Orders: {modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, views: {default: {}, detail: {}}},
   Other: {modelBinding: {modelId: 'MODEL-2', modelName: 'QueryOther'}, views: {default: {}, detail: {}}},
  }}))
  const assembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: twoTables, space,
   models: [formal, other], relations: []})
  expect(assembly.dataSet.getTable('Orders')?.resourceId).toBe('physical_orders')
  expect(assembly.dataSet.getTable('Other')?.resourceId).toBe('physical_orders')
  expect(assembly.dataSet.getTable('Other')?.modelBinding).toEqual({modelId: 'MODEL-2', modelName: 'QueryOther'})
  expect(assembly.dataSet.getView('Orders', 'detail')).not.toBe(assembly.dataSet.getView('Other', 'detail'))
  assembly.dataSet.destroy()
  expect(() => new LowcodeDataSpaceAssembler(runtime, http).assemble({config, space,
   models: [{...formal, sourceType: 'database-table'}], relations: []})).toThrow('未知正式模型资源类型')
 })
 it('requires a matching formal space identity and nonempty legal Name', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  for (const invalid of [{...space, dataSpaceId: 'OTHER'}, {...space, name: ''}, {...space, name: '@reserved'}]) {
   expect(() => new LowcodeDataSpaceAssembler(runtime, http).assemble({config, space: invalid,
    models: [formal], relations: []})).toThrow()
  }
 })
})


const projection = {fieldId:'KEY',source:'resource',resourceFieldId:'KEY',resourceField:'orderId',viewField:'orderId',type:'string',label:'order key',output:true,sortOrder:0,sortDirection:null,group:0,distinct:false,primaryKey:true,value:'',valueFunction:'',expression:''}
it('permits a view output selection only when it matches its formal field identity',()=>{
 const config = new ScenarioViewConfig('SCENE',JSON.stringify({scenarioId:'SCENE',tables:{Orders:{modelBinding:{modelId:'MODEL',modelName:'QueryOrders'},views:{default:{fieldProjection:[projection]}}}}}))
 const http = new NoRequest(); const runtime = new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 const result = new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space,models:[formal],relations:[]})
 expect(result.dataSet.getView('Orders','default')?.fieldProjection[0]?.viewField).toBe('orderId')
 result.dataSet.destroy()
})
it('rejects a projection that invents a new output alias or computed definition',()=>{
 const http = new NoRequest(); const runtime = new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 for(const field of [{...projection,viewField:'renamed'}, {...projection,expression:'arbitrary()'}]) {
  const config = new ScenarioViewConfig('SCENE',JSON.stringify({scenarioId:'SCENE',tables:{Orders:{modelBinding:{modelId:'MODEL',modelName:'QueryOrders'},views:{default:{fieldProjection:[field]}}}}}))
  expect(()=>new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space,models:[formal],relations:[]})).toThrow(/正式模型/)
 }
})

it('saves a named aggregate through the definition DataView, reopens and consumes it through formal GetData', async () => {
 let stored = JSON.stringify({scenarioId: 'SCENE', schemaVersion: 2, resourceRelations: [], tables: {
  Orders: {modelBinding: {modelId: 'MODEL', modelName: 'QueryOrders'}, views: {default: {}, statistics: {}}},
 }})
 const writes: string[] = [], modelBefore = JSON.stringify(formal)
 class AggregateHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
   this.requests.push(request)
   return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
    primaryKeyField: 'orderId', data: {Items: [{orderId: 64}], Count: 1},
   }}}
  }
 }
 const http = new AggregateHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
 const assembler = new LowcodeDataSpaceAssembler(runtime, http)
 const metadata: unknown = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
 if (!isRecord(metadata) || !isRecord(metadata['tables'])) throw new Error('Missing metadata tables')
 const definitionTable = metadata['tables']['DataViewDefinition']
 const open = () => {
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {loadRoot: async () => ({children: []})},
   pageFiles: {readPageFile: async () => {throw new Error('Unexpected page read')}},
   scenarioViews: {readScope: () => 'scope', readText: async () => stored,
    writeText: async (_id, next) => {stored = next; writes.push(next)}}})
  const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: 'META', targetScenarioId: 'SCENE',
   assertCurrent: () => undefined, validate: async config => {
    assembler.assemble({config, space, models: [formal], relations: []}).dataSet.destroy()
   }})
  const dataSet = DataSet.fromJson({scenarioId: 'META', tables: {DataViewDefinition: definitionTable}})
  const view = dataSet.getView('DataViewDefinition')!
  view.queryContext = {...view.queryContext, dataSpaceId: 'SCENE'}
  view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: view.dataTable!.resourceId!}})
  return {dataSet, view}
 }
 const editing = open()
 try {
  await editing.view.refresh()
  const row = editing.view.rows.find(row => row['viewId'] === 'statistics')!, key = editing.view.getPkKey(row)!
  editing.view.updateEditingValue(key, 'fieldProjection', [{...projection, valueFunction: '{"Type":"Count"}'}])
  expect((await editing.dataSet.saveChanges()).success).toBe(true)
  expect(writes).toHaveLength(1)
  expect(http.requests).toHaveLength(0)
  const reopened = open()
  try {
   await reopened.view.refresh()
   expect(reopened.view.rows.find(row => row['viewId'] === 'statistics')?.['fieldProjection'])
    .toEqual([{...projection, valueFunction: '{"Type":"Count"}'}])
   const assembled = assembler.assemble({config: new ScenarioViewConfig('SCENE', stored), space, models: [formal], relations: []})
   try {
    const statistics = assembled.dataSet.getView('Orders', 'statistics')!
    await statistics.loadFromServer()
    expect(statistics.rows[0]?.['orderId']).toBe(64)
    expect(statistics.primaryKey).toBe('')
    expect(http.requests[0]?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Name: 'QueryOrders',
     Fields: [{Name: 'rowid', ValueFun: {Type: 'GetGroupData', ValType: 'COUNT'}}]}]})
    expect(assembled.dataSet.getView('Orders')!.fieldProjection).toEqual([
     expect.objectContaining({viewField: 'orderId', output: true, valueFunction: '', group: 0}),
    ])
    expect(JSON.parse(stored).tables.Orders.views.default).not.toHaveProperty('fieldProjection')
   } finally {assembled.dataSet.destroy()}
  } finally {reopened.dataSet.destroy()}
  editing.view.updateEditingValue(key, 'fieldProjection', [{...projection, valueFunction: '{"Type":"GetConstValue","Value":1}'}])
  await expect(editing.dataSet.saveChanges()).rejects.toThrow('SPARK_QUERY_AGGREGATE')
  expect(writes).toHaveLength(1)
  expect(editing.view.hasEditingChanges() || editing.view.dirtyTracking.hasPendingChanges()).toBe(true)
  expect(editing.view.getEditingRow(key)?.['fieldProjection']).toEqual([{...projection, valueFunction: '{"Type":"GetConstValue","Value":1}'}])
  expect(JSON.stringify(formal)).toBe(modelBefore)
 } finally {editing.dataSet.destroy()}
})
