import { describe, expect, it } from 'vitest'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import { ScenarioViewConfig } from '../../../../packages/spark-project-model/src/scenario/scenario-view-config'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'

class NoRequest extends HttpClientBase { protected override async executeRequest(): Promise<never> { throw new Error('unexpected request') } }
const formal = { id: 'MODEL', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: 'physical_orders', sourceId: 'DB', sourceType: 'table', primaryKey: 'orderId', businessMain: true,
 fields: [{ id: 'KEY', modelId: 'MODEL', name: 'rowid', canonicalName: 'orderId', type: 'string', primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {} }], raw: {} }
const config = new ScenarioViewConfig('SCENE', JSON.stringify({ scenarioId: 'SCENE', tables: { Orders: { modelBinding: { modelId: 'MODEL', modelName: 'QueryOrders' }, views: { default: {}, detail: { pageSize: 5 } } } } }))
const space = {dataSpaceId: 'SCENE', name: '订单正式空间'}

describe('formal scenario assembly', () => {
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
