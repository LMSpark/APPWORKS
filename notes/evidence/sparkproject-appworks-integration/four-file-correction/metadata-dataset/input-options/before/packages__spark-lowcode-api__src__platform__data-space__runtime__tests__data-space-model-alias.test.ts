import { describe, expect, it } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { DataSpaceRuntimeApi } from '../data-space-runtime-api'
import { DataSpaceQueryContext } from '../query/data-space-query-context'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import type { DataSpaceDesignApi } from '../../design/data-space-design-api'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: FormalModel = {id:'MODEL', metaName:'Orders', name:'Orders', sourceName:'PhysicalOrders', sourceId:'RESOURCE',
  sourceType:'table', primaryKey:'orderId', businessMain:true, raw:{}, fields:[
    {id:'KEY',modelId:'MODEL',name:'rowid',canonicalName:'orderId',type:'string',primaryKey:true,description:'',output:true,computed:false,order:0,orderType:'',raw:{}},
    {id:'TITLE',modelId:'MODEL',name:'title',canonicalName:'caption',type:'string',primaryKey:false,description:'',output:true,computed:false,order:1,orderType:'',raw:{}},
  ]}
function fixture(formalModel: FormalModel = model) {
  const identity = {scenarioId:'SCENE',metaName:'Orders'}
  const context = new DataSpaceQueryContext({identity, scope:'scope',readScope:()=> 'scope',snapshot:new DataSpaceQueryTable(identity).applyResult({Result:{
    primaryKeyField:'rowid',allowAdd:true,lingma_sys_key:'add-signed',data:[{orderId:'A',caption:'before',lingma_sys_key:'original-signed',lingma_sys_params:{e:['caption'],r:['caption']}}],
  }})})
  context.bindFormalModel(formalModel)
  return context
}
describe('formal model alias query ownership', () => {
  it('excludes local computed columns from remote fields and rejects remote use', async () => {
    class QueryHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
          data: {Items: [{orderId: 'A', caption: 'Title', lingma_sys_key: 'TOKEN',
            lingma_sys_params: {r: ['orderId', 'caption']}}], Count: 1}}},
        status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new QueryHttp()
    const ds = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string'}, {name: 'caption', type: 'string'},
        {name: 'localTitle', type: 'string', computeExpression: 'caption + "!"'}],
      views: {default: {}},
    }}})
    const view = ds.getView('Orders', 'default')!
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    runtime.bindModelView(view, model)
    await view.loadFromServer()
    expect(view.rows[0]?.['localTitle']).toBe('Title!')
    expect(JSON.stringify(http.requests[0]?.data)).not.toContain('localTitle')
    await expect(view.loadFromServer({fields: ['localTitle']})).rejects.toThrow('未知输出字段')
    await expect(view.loadFromServer({sort: 'localTitle:asc'})).rejects.toThrow('无效排序')
    await expect(view.loadFromServer({filter: {field: 'localTitle', operator: 'eq', value: 'x'}})).rejects.toThrow('SPARK_MODEL_FIELD_UNRESOLVED')
    expect(http.requests).toHaveLength(1)
    ds.destroy()
  })

  it('rejects a direct native computed column that collides with a formal output', () => {
    const ds = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'caption', type: 'string', computeExpression: '1'}], views: {default: {}},
    }}})
    const view = ds.getView('Orders', 'default')!
    class EmptyHttp extends HttpClientBase {
      protected override async executeRequest(): Promise<HttpResponse<unknown>> { throw new Error('unexpected request') }
    }
    expect(() => new DataSpaceRuntimeApi({http: new EmptyHttp(),
      readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, model)).toThrow('SPARK_MODEL_COMPUTED_COLLISION')
    ds.destroy()
  })
  it('rejects a computed collision hidden by a formal field projection', () => {
    const ds = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string'}, {name: 'caption', type: 'string'},
        {name: 'caption', type: 'string', computeExpression: '1'}],
      views: {default: {fieldProjection: [{fieldId: 'TITLE', source: 'resource', resourceFieldId: 'TITLE',
        resourceField: 'caption', viewField: 'caption', type: 'string', label: 'Caption', output: true,
        sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
        value: '', valueFunction: '', expression: ''}]}},
    }}})
    try {
      const view = ds.getView('Orders', 'default')!
      expect(view.columns.filter(column => column.name === 'caption' && column.computeExpression)).toHaveLength(0)
      class EmptyHttp extends HttpClientBase {
        protected override async executeRequest(): Promise<HttpResponse<unknown>> { throw new Error('unexpected request') }
      }
      expect(() => new DataSpaceRuntimeApi({http: new EmptyHttp(),
        readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, model)).toThrow('SPARK_MODEL_COMPUTED_COLLISION')
    } finally { ds.destroy() }
  })
  it('requests formal Name fields without an extra AsName and reads canonical outputs', async () => {
    class AliasHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
          data: {Items: [{orderId: 'A', caption: 'Title', items: 'Reserved',
            lingma_sys_key: 'ROW-KEY', lingma_sys_params: {r: ['caption', 'items']}}], Count: 1}}},
        status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new AliasHttp()
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string', isPrimaryKey: true},
        {name: 'caption', type: 'string'}, {name: 'items', type: 'string'}],
      views: {default: {}},
    }}})
    const view = dataSet.getView('Orders', 'default')
    if (!view) throw new Error('missing formal view fixture')
    const formal: FormalModel = {...model, fields: [...model.fields,
      {id: 'ITEMS', modelId: 'MODEL', name: 'items', canonicalName: 'items', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 2, orderType: '', raw: {}}]}
    new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, formal)
    await view.loadFromServer()
    const request = http.requests[0]?.data
    if (!request || typeof request !== 'object' || !('Table' in request) || !Array.isArray(request.Table)) {
      throw new Error('missing formal request')
    }
    const table = request.Table[0]
    if (!table || typeof table !== 'object' || !('Fields' in table) || !Array.isArray(table.Fields)) {
      throw new Error('missing formal Fields')
    }
    expect(table.Fields).toEqual([
      expect.objectContaining({Name: 'rowid'}),
      expect.objectContaining({Name: 'title'}),
      expect.objectContaining({Name: 'items'}),
    ])
    expect(table.Fields.every(field => typeof field === 'object' && field !== null && !('AsName' in field))).toBe(true)
    expect(view.rows).toMatchObject([{orderId: 'A', caption: 'Title', items: 'Reserved'}])
    dataSet.destroy()
  })
  it('addresses output identities and retains original signed token while mapping save fields to Name', () => {
    const context = fixture()
    expect(context.rowKey(context.rows[0] ?? {})).toBe('A')
    expect(context.fieldAccess('A','caption')).toMatchObject({write:'allowed',required:true})
    const changes = context.prepareSaveChanges({changed:[{orderId:'A',caption:'after',_pk:'local',lingma_sys_key:'forged'}]})
    expect(context.buildSaveRequest(changes)[0]?.CrudModel.Changed).toEqual([{rowid:'A',title:'after',lingma_sys_key:'original-signed'}])
    expect(context.rows).toEqual([{orderId:'A',caption:'before'}])
    const accepted = context.acceptSaveReceipt({requested:changes,receipt:{metaName:'Orders',added:[],changed:[{rowid:'A',title:'accepted'}],deleted:[]}})
    expect(accepted.changed).toEqual([{orderId:'A',caption:'accepted'}])
    expect(accepted.context.fieldAccess('A','caption').write).toBe('allowed')
    expect(accepted.context.rows).toEqual([{orderId:'A',caption:'accepted'}])
    expect(accepted.changedFields).toEqual([['orderId','caption']])
  })
  it('generates the formal output key and never submits a guessed business field or local _pk', () => {
    const context = fixture()
    const row = context.prepareNewRow({_pk:'local',caption:'new'})
    expect(row['orderId']).toMatch(/^[A-F0-9]{32}$/)
    expect(context.buildSaveRequest({added:[row]})[0]?.CrudModel.Added).toEqual([{rowid:row['orderId'],title:'new',lingma_sys_key:'add-signed'}])
    expect(()=>context.buildSaveRequest({added:[{orderId:'B',physicalGuess:1}]})).toThrow('MODEL_SAVE_FIELD')
  })

  it('saves and canonicalizes receipts through an equivalent repeated output record', () => {
    const caption = model.fields.find(field => field.canonicalName === 'caption')
    if (!caption) throw new Error('missing caption fixture')
    const repeated: FormalModel = { ...model, fields: [...model.fields, { ...caption, id: 'TITLE-DUP' }] }
    const context = fixture(repeated)
    const changes = context.prepareSaveChanges({ changed: [{ orderId: 'A', caption: 'after' }] })
    expect(context.buildSaveRequest(changes)[0]?.CrudModel.Changed)
      .toEqual([{ rowid: 'A', title: 'after', lingma_sys_key: 'original-signed' }])
    expect(context.resolveSaveReceipt({ requested: changes,
      receipt: { metaName: 'Orders', added: [], changed: [{ rowid: 'A', title: 'accepted' }], deleted: [] } }).changed)
      .toEqual([{ orderId: 'A', caption: 'accepted' }])
  })

  it('rejects receipt and ParentField source names that map to multiple output aliases', () => {
    const conflicting: FormalModel = { ...model, raw: { ParentField: 'parentId' }, fields: [...model.fields,
      { id: 'PARENT-A', modelId: 'MODEL', name: 'parentId', canonicalName: 'parentA', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 2, orderType: '', raw: {} },
      { id: 'PARENT-B', modelId: 'MODEL', name: 'parentId', canonicalName: 'parentB', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 3, orderType: '', raw: {} },
    ] }
    const context = fixture(conflicting)
    expect(() => context.buildSaveRequest({ added: [{ orderId: 'B', parentA: 'A' }] }))
      .toThrow('SPARK_CHILD_ADD_PARENT')
    expect(() => context.resolveSaveReceipt({ requested: { changed: [{ orderId: 'A', caption: 'after' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ rowid: 'A', title: 'accepted', parentId: 'P' }], deleted: [] } }))
      .toThrow('SPARK_MODEL_RECEIPT_FIELD')
  })
})
