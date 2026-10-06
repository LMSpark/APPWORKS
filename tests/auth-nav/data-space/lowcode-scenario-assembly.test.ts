import { describe, expect, it } from 'vitest'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import { ScenarioViewConfig } from '../../../packages/spark-project-model/src/scenario/scenario-view-config'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { LowcodeDataSpaceAssembler } from '../../../src/lowcode/data-space/lowcode-data-space-assembler'

class NoRequest extends HttpClientBase { protected override async executeRequest(): Promise<never> { throw new Error('unexpected request') } }
const formal = { id: 'MODEL', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: 'physical_orders', sourceId: 'DB', sourceType: 'table', primaryKey: 'orderId', businessMain: true,
 fields: [{ id: 'KEY', modelId: 'MODEL', name: 'rowid', canonicalName: 'orderId', type: 'string', primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {} }], raw: {} }
const config = new ScenarioViewConfig('SCENE', JSON.stringify({ scenarioId: 'SCENE', tables: { Orders: { modelBinding: { modelId: 'MODEL', modelName: 'QueryOrders' }, views: { default: {}, detail: { pageSize: 5 } } } } }))

describe('formal scenario assembly', () => {
 it('keeps local table name and every view with formal model output identity', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({ token: 'scope', headers: {} })})
  const result = new LowcodeDataSpaceAssembler(runtime, http).assemble({ config, models: [formal], relations: [] })
  expect(result.dataSet.scenarioId).toBe('SCENE')
  expect(result.dataSet.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL', modelName: 'QueryOrders' })
  expect(result.dataSet.getView('Orders', 'default')?.primaryKey).toBe('orderId')
  expect(result.dataSet.getView('Orders', 'detail')?.pageSize).toBe(5)
  expect(result.dataSet.getTable('MODEL')).toBeUndefined()
  result.dataSet.destroy()
 })
 it('rejects model identity mismatch rather than skipping the table', () => {
  const http = new NoRequest()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({ token: 'scope', headers: {} })})
  expect(() => new LowcodeDataSpaceAssembler(runtime, http).assemble({ config, models: [{...formal,id:'OTHER'}], relations: [] })).toThrow(/模型/)
 })
})


const projection = {fieldId:'KEY',source:'resource',resourceFieldId:'KEY',resourceField:'orderId',viewField:'orderId',type:'string',label:'order key',output:true,sortOrder:0,sortDirection:null,group:0,distinct:false,primaryKey:true,value:'',valueFunction:'',expression:''}
it('permits a view output selection only when it matches its formal field identity',()=>{
 const config = new ScenarioViewConfig('SCENE',JSON.stringify({scenarioId:'SCENE',tables:{Orders:{modelBinding:{modelId:'MODEL',modelName:'QueryOrders'},views:{default:{fieldProjection:[projection]}}}}}))
 const http = new NoRequest(); const runtime = new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 const result = new LowcodeDataSpaceAssembler(runtime,http).assemble({config,models:[formal],relations:[]})
 expect(result.dataSet.getView('Orders','default')?.fieldProjection[0]?.viewField).toBe('orderId')
 result.dataSet.destroy()
})
it('rejects a projection that invents a new output alias or computed definition',()=>{
 const http = new NoRequest(); const runtime = new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 for(const field of [{...projection,viewField:'renamed'}, {...projection,expression:'arbitrary()'}]) {
  const config = new ScenarioViewConfig('SCENE',JSON.stringify({scenarioId:'SCENE',tables:{Orders:{modelBinding:{modelId:'MODEL',modelName:'QueryOrders'},views:{default:{fieldProjection:[field]}}}}}))
  expect(()=>new LowcodeDataSpaceAssembler(runtime,http).assemble({config,models:[formal],relations:[]})).toThrow(/正式模型/)
 }
})
