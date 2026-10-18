import { describe, expect, it } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { DataSpaceRuntimeApi } from '../data-space-runtime-api'
import { DataSpaceQueryContext } from '../query/data-space-query-context'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceDesignApi } from '../../design/data-space-design-api'

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
  it.each(['table', '数组'].flatMap(sourceType => ['scope', 'destroy'].map(change => ({sourceType, change}))))(
    'offers only the bound formal query columns for $sourceType and rejects $change changes', ({sourceType, change}) => {
    const formal = {...model, sourceType, fields: [...model.fields,
      {...model.fields[1]!, id: 'PRIVATE', name: 'private_name', canonicalName: 'privateValue', output: false}]}
    class NoQuery extends HttpClientBase {protected override async executeRequest(): Promise<never> {throw new Error('unexpected query')}}
    let scope = 'original'
    const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {resourceType: sourceType === '数组' ? 'static-data' : 'database-table',
      modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
        {name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'}, {name: 'privateValue', type: 'string'},
        {name: 'display', type: 'string', computeExpression: 'caption + "!"'},
      ], views: {default: {}}}}})
    try {
      const view = ds.getView('Orders')!
      view.primaryKey = 'orderId'
      new DataSpaceRuntimeApi({http: new NoQuery(), readScope: () => ({token: scope, headers: {}})})
        .bindModelView(view, formal, sourceType === '数组' ? [{orderId: 'A', caption: 'value'}] : undefined)
      view.fieldProjection = view.fieldProjection.filter(field => field.viewField === 'orderId')
      const derived = view.createQueryView('derived')
      for (const current of [view, derived]) expect(current.queryColumns.map(column => column.name)).toEqual(['orderId', 'caption'])
      expect(view.dataTable!.columns.map(column => column.name)).toContain('privateValue')
      expect(view.columns.map(column => column.name)).not.toContain('caption')
      if (change === 'scope') scope = 'changed'
      else ds.destroy()
      for (const current of [view, derived]) expect(() => current.queryColumns).toThrow(/SCOPE|失效|destroy|销毁/i)
    } finally {ds.destroy()}
  })

  it.each(['configured', 'cleared'])('binds a dynamic full-schema view with %s projection without adding non-output fields to the query or save contract', async projection => {
    const hidden = {...model.fields[1]!, id: 'PRIVATE', name: 'private_name', canonicalName: 'privateValue', output: false}
    const formal = {...model, fields: [...model.fields, hidden]}
    class QueryHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
          primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'ADD', data: {Count: 1, Items: [
            {orderId: 'A', caption: 'before', lingma_sys_key: 'ROW', lingma_sys_params: {e: ['caption', 'privateValue']}},
          ]},
        }}}
      }
    }
    const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {
      modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
        {name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'}, {name: 'privateValue', type: 'string'},
      ], views: {default: {}},
    }}})
    const http = new QueryHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    try {
      const view = ds.getTable('Orders')!.getOrCreateView('dynamic')
      view.commitMode = 'staged'
      runtime.bindModelView(view, formal)
      expect(view.columns.map(column => column.name)).not.toContain('privateValue')
      if (projection === 'cleared') view.fieldProjection = []
      await view.loadFromServer()
      expect(view.rows).toMatchObject([{orderId: 'A', caption: 'before'}])
      expect(JSON.stringify(http.requests[0]!.data)).not.toContain('private_name')
      if (projection === 'cleared') {
        expect(view.columns.map(column => column.name)).toContain('privateValue')
        expect(() => fixture(formal).buildSaveRequest({changed: [{orderId: 'A', privateValue: 'bad'}]})).toThrow('SPARK_MODEL_SAVE_FIELD')
        await expect(view.loadFromServer({fields: ['privateValue']})).rejects.toThrow('未知输出字段')
        expect(http.requests).toHaveLength(1)
        return
      }
      expect(view.getColumn('privateValue')).toBeUndefined()
      view.updateEditingValue('A', 'privateValue', 'bad')
      await expect(view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 0}})
      view.discardPendingChanges()
      view.updateEditingValue('A', 'caption', 'after')
      expect(view.getEditingRow('A')?.['caption']).toBe('after')
      view.discardPendingChanges()
      expect(view.rows[0]?.['caption']).toBe('before')
      expect(() => fixture(formal).buildSaveRequest({changed: [{orderId: 'A', privateValue: 'bad'}]})).toThrow('SPARK_MODEL_SAVE_FIELD')
      await expect(view.loadFromServer({fields: ['privateValue']})).rejects.toThrow('未知输出字段')
      expect(http.requests).toHaveLength(1)
    } finally {ds.destroy()}
  })
  it('rejects a native computation named after a non-output formal field before binding', () => {
    const formal = {...model, fields: model.fields.map(field => field.name === 'title' ? {...field, output: false} : field)}
    const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string'}, {name: 'caption', type: 'string', computeExpression: '1'}], views: {default: {}},
    }}})
    class EmptyHttp extends HttpClientBase {protected override async executeRequest(): Promise<never> {throw new Error('unexpected request')}}
    try {
      expect(() => new DataSpaceRuntimeApi({http: new EmptyHttp(), readScope: () => ({token: 'scope', headers: {}})})
        .bindModelView(ds.getView('Orders')!, formal)).toThrow('SPARK_MODEL_COMPUTED_COLLISION')
    } finally {ds.destroy()}
  })
  it.each([
    ['Table', true], ['Join', true], ['Table', false], ['Join', false],
  ] as const)('queries %s aggregates (grouped=%s) without adding a source key and keeps results readonly', async (outputType, grouped) => {
    const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: '数据库表',
      MetaName: 'PhysicalOrders', PrimaryKeyFields: 'rowid'}, [
      {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', AsName: 'orderId', FieldType: 'string', IsOutput: 1},
      {rowid: 'DEPT', dataModelId: 'MODEL', Name: 'dept', AsName: 'department', FieldType: 'string', IsOutput: 1, Group: grouped ? 1 : 0},
      {rowid: 'TOTAL', dataModelId: 'MODEL', Name: 'amount', AsName: 'total', FieldType: 'number', IsOutput: 1, Group: 0,
        ValueFun: JSON.stringify({Type: 'GetGroupData', Field: 'amount', ValType: 'SUM'})},
    ], 'rowid')
    class AggregateHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        const body = config.data as {Table: {Fields: {Name: string}[]; OutputType: string; ChildTables?: unknown}[]}
        if (body.Table[0]!.Fields.some(field => field.Name === 'rowid')) throw new Error('Raw primary key must not enter the aggregate projection')
        if (body.Table[0]!.OutputType === 'Join' && !Array.isArray(body.Table[0]!.ChildTables)) {
          return {data: {Code: 500, Message: '[500] Cannot invoke "java.util.List.stream()" because "childTables" is null', Type: 'error'},
            status: 200, statusText: 'OK', headers: {}}
        }
        return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE',
          data: {Items: [{...(grouped ? {department: 'Sales'} : {}), total: 30, lingma_sys_key: 'NOT-A-MUTATION-BASELINE',
            lingma_sys_params: {e: ['department', 'total'], m: ['department'], d: true}}], Count: grouped ? 2 : 1}}},
          status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new AggregateHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {tableName: 'Orders', resourceType: 'database-table',
      modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
        {name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'department', type: 'string'}, {name: 'total', type: 'number'},
      ], views: {default: {}, report: {queryConfig: {outputType, fields: grouped ? ['department', 'total'] : ['total']}}}}}})
    const view = ds.getView('Orders', 'report')!
    runtime.bindModelView(view, formal)
    const definition = JSON.stringify(ds.toJson())
    try {
      await view.loadFromServer({page: 1, pageSize: 1})
      expect(view.primaryKey).toBe('')
      expect(view.getPkKey(view.rows[0]!)).toBeUndefined()
      expect(view.rows[0]!['_pk']).toBeUndefined()
      expect(view.fieldAccess(view.rows[0]!, 'total')).toMatchObject({read: 'visible', write: 'denied'})
      expect(view.fieldAccess(view.rows[0]!, 'department')).toMatchObject({read: 'masked', write: 'denied'})
      expect(view.addActionState()).toBe('hidden')
      expect(view.deleteActionState(view.rows[0]!)).toBe('hidden')
      await expect(view.addRow({total: 90})).rejects.toThrow()
      await expect(view.editRowById('fake', {total: 90})).rejects.toThrow()
      await expect(view.saveChanges()).rejects.toThrow()
      await view.loadFromServer({page: grouped ? 2 : 1, pageSize: 1, ...(grouped ? {sort: 'department:asc'} : {}),
        filter: {field: 'department', operator: 'eq', value: 'Sales'}})
      expect(http.requests).toHaveLength(2)
      expect(http.requests[1]?.data).toMatchObject({PageParam: {index: grouped ? 2 : 1, size: 1},
        Table: [{OutputType: outputType, Filter: {Field: 'dept'}, Fields: expect.arrayContaining([expect.objectContaining({Name: 'amount'})])}]})
      expect(formal.primaryKey).toBe('orderId')
      expect(ds.getView('Orders')!.primaryKey).toBe('orderId')
      expect(JSON.stringify(ds.toJson())).toBe(definition)
      const context = await runtime.executeQuery(view, {fields: grouped ? ['department', 'total'] : ['total'], outputType})
      expect(() => context.prepareSaveChanges({deleted: context.rows})).toThrow('SPARK_MODEL_KEYLESS_READONLY')
    } finally {ds.destroy()}
  })

  it.each(['columns', 'projection', 'params'] as const)('preserves formal grouping through %s, paging and reopening without redefining model value functions', async selection => {
    const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: '数据库视图',
      MetaName: 'OrderSummary'}, [
      {rowid: 'DEPT', dataModelId: 'MODEL', Name: 'dept', AsName: 'department', FieldType: 'string', IsOutput: 1, Group: 3},
      {rowid: 'REGION', dataModelId: 'MODEL', Name: 'region', AsName: 'area', FieldType: 'string', IsOutput: 1, group: '9'},
      {rowid: 'YEAR', dataModelId: 'MODEL', Name: 'year', FieldType: 'number', IsOutput: 0, Group: 1},
      {rowid: 'TOTAL', dataModelId: 'MODEL', Name: 'amount', AsName: 'total', FieldType: 'number', IsOutput: 1,
        ValueFun: JSON.stringify({Type: 'GetGroupData', GroupTableName: 'OrderSummary', GroupField: 'dept', Field: 'amount', ValType: 'SUM'})},
    ], '')
    class GroupHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: '', allowAdd: true, data: {Items: [
          {department: 'Sales', area: 'North', total: 30, lingma_sys_key: 'GROUP-IS-NOT-A-ROW',
            lingma_sys_params: {e: ['department', 'total'], m: ['area']}},
        ], Count: 1}}}, status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new GroupHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {tableName: 'Orders',
      modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'department', type: 'string'}, {name: 'area', type: 'string'}, {name: 'total', type: 'number'}],
      views: {default: {}, report: selection === 'projection' ? {fieldProjection: [
        {fieldId: 'DEPT', source: 'resource', resourceFieldId: 'DEPT', resourceField: 'department', viewField: 'department',
          type: 'string', label: 'Department', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false,
          primaryKey: false, value: '', valueFunction: '', expression: ''},
        {fieldId: 'TOTAL', source: 'resource', resourceFieldId: 'TOTAL', resourceField: 'total', viewField: 'total',
          type: 'number', label: 'Total', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false,
          primaryKey: false, value: '', valueFunction: '', expression: ''},
      ]} : {}},
    }}})
    const view = dataSet.getView('Orders', 'report')!
    view.primaryKey = ''
    runtime.bindModelView(view, formal)
    const originalModel = JSON.stringify(formal)
    const params = selection === 'params' ? {fields: ['department', 'total']} : {}
    let reopened: DataSet | undefined
    try {
      await view.loadFromServer(params)
      await view.loadFromServer({...params, page: 2, pageSize: 1, sort: 'department:desc',
        filter: {field: 'department', operator: 'eq', value: 'Sales'}})
      reopened = DataSet.fromJson(dataSet.toJson())
      const reopenedView = reopened.getView('Orders', 'report')!
      reopenedView.primaryKey = ''
      runtime.bindModelView(reopenedView, formal)
      await reopenedView.loadFromServer(params)
      expect(http.requests).toHaveLength(3)
      for (const request of http.requests) {
        const body = request.data as {Table: {Fields: {Name: string; Group?: number; ValueFun?: unknown}[]}[]; OutputFieldMode: string}
        const fields = body.Table[0]!.Fields
        // mergeFields replaces all model groups once any explicit Group is sent, so omitted
        // grouping dimensions (including non-output fields) must remain query dependencies.
        expect(fields.filter(field => (field.Group ?? 0) > 0).map(field => [field.Name, field.Group]).sort()).toEqual([
          ['dept', 3], ['region', 9], ['year', 1],
        ])
        expect(fields.find(field => field.Name === 'amount')).toBeDefined()
        expect(fields.every(field => !Object.hasOwn(field, 'ValueFun'))).toBe(true)
        expect(new Set(fields.map(field => field.Name)).size).toBe(fields.length)
        expect(body.OutputFieldMode).toBe('REQUEST')
      }
      expect(http.requests[1]?.data).toMatchObject({PageParam: {index: 2, size: 1}, Table: [{
        Filter: {Field: 'dept'}, Fields: expect.arrayContaining([{Name: 'dept', IsOutput: true, Group: 3, Order: 1, OrderType: 'descending'}]),
      }]})
      const row = reopenedView.rows[0]!
      expect(row).toMatchObject({department: 'Sales', total: 30})
      expect(reopenedView.fieldAccess(row, 'department')).toMatchObject({read: 'visible', write: 'denied'})
      expect(reopenedView.fieldAccess(row, 'area')).toMatchObject({read: 'masked', write: 'denied'})
      const context = await runtime.executeQuery(reopenedView, params)
      expect(context.allowAdd).toBe(false)
      expect(context.rowKey(context.rows[0]!)).toBeUndefined()
      expect(() => context.prepareSaveChanges({added: [{department: 'Other'}]})).toThrow()
      expect(() => context.prepareSaveChanges({changed: [{department: 'Other'}]})).toThrow()
      expect(() => context.prepareSaveChanges({deleted: [context.rows[0]!]})).toThrow()
      expect(JSON.stringify(formal)).toBe(originalModel)
    } finally { reopened?.destroy(); dataSet.destroy() }
  })

  it.each([true, false, 1.5, 'invalid', Infinity])('rejects invalid formal grouping %s before sending a query', async group => {
    class NoQueryHttp extends HttpClientBase {
      calls = 0
      protected override async executeRequest(): Promise<HttpResponse<unknown>> {this.calls++; throw new Error('Unexpected request')}
    }
    const http = new NoQueryHttp(), ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string'}, {name: 'caption', type: 'string'}], views: {default: {}},
    }}})
    try {
      const view = ds.getView('Orders', 'default')!
      const formal = {...model, fields: model.fields.map(field => ({...field, raw: {Group: group}}))}
      new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, formal)
      await expect(view.loadFromServer()).rejects.toThrow('SPARK_MODEL_GROUP')
      expect(http.calls).toBe(0)
    } finally {ds.destroy()}
  })

  it.each([
    {override: {group: -1}, error: 'SPARK_QUERY_GROUP'},
    {override: {valueFunction: '{"Type":"GetConstValue","Value":1}'}, error: 'SPARK_QUERY_AGGREGATE'},
    {override: {expression: 'RULE'}, error: 'SPARK_MODEL_PROJECTION'},
  ])('rejects invalid grouping and arbitrary formal output expressions: %j', async ({override, error}) => {
      class NoQueryHttp extends HttpClientBase {
        calls = 0
        protected override async executeRequest(): Promise<HttpResponse<unknown>> {this.calls++; throw new Error('Unexpected request')}
      }
      const http = new NoQueryHttp(), ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {
        tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
        columns: [{name: 'orderId', type: 'string'}, {name: 'caption', type: 'string'}], views: {default: {}},
      }}})
      try {
        const view = ds.getView('Orders', 'default')!
        new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, model)
        await expect(view.loadFromServer({projection: [{fieldId: 'TITLE', source: 'resource', resourceFieldId: 'TITLE',
          resourceField: 'caption', viewField: 'caption', type: 'string', label: 'Caption', output: true,
          sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
          value: '', valueFunction: '', expression: '', ...override}]})).rejects.toThrow(error)
        expect(http.calls).toBe(0)
      } finally {ds.destroy()}
    })

  it.each(['visible', 'masked', 'hidden', 'readonly'] as const)('saves fields with a desensitization rule according to the actual %s query permission', async mode => {
    const fields = [
      {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', AsName: 'orderId', FieldType: 'string', IsOutput: 1},
      {rowid: 'TITLE', dataModelId: 'MODEL', Name: 'title', AsName: 'caption', FieldType: 'string', IsOutput: 1,
        Expression: 'MASK-RULE-ID', ValueFun: ''},
    ]
    const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: '数据库表',
      MetaName: 'PhysicalOrders', PrimaryKeyFields: 'rowid'}, fields, 'rowid')
    class RuleFieldHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        if (mode === 'readonly' && config.url !== '/api/DataOperation/GetData') {
          return {data: {Code: 200, Extras: [{target: '更新失败字段', message: [{title: '不可写'}]}]},
            status: 200, statusText: 'OK', headers: {}}
        }
        const result = config.url === '/api/DataOperation/GetData'
          ? {primaryKeyField: 'rowid', allowAdd: false, data: {Items: [{orderId: 'A',
            caption: mode === 'masked' ? '***' : mode === 'hidden' ? null : 'Before',
            lingma_sys_key: 'ORIGINAL-SIGNED', lingma_sys_params: {e: mode === 'readonly' ? [] : ['caption'],
              m: mode === 'masked' ? ['caption'] : [], h: mode === 'hidden' ? ['caption'] : []}}], Count: 1}}
          : {maplistedit: [{PhysicalOrders: [{rowid: 'A', title: 'Accepted'}]}]}
        return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new RuleFieldHttp(), dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'}], views: {default: {}},
    }}})
    const view = dataSet.getView('Orders')!
    view.primaryKey = formal.primaryKey
    new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, formal)
    try {
      expect((await view.loadFromServer()).success).toBe(true)
      expect(view.fieldAccess(view.rows[0]!, 'caption')).toMatchObject({
        read: mode === 'hidden' ? 'invisible' : mode === 'masked' ? 'masked' : 'visible',
        write: mode === 'readonly' ? 'denied' : 'allowed',
      })
      const original = {...view.rows[0]}
      view.updateEditingValue('A', 'caption', 'Cancelled')
      view.discardEditingRows()
      expect(view.rows[0]).toEqual(original)
      expect(view.hasEditingChanges()).toBe(false)
      expect(http.requests).toHaveLength(1)
      expect(await view.editRowById('A', {caption: 'Changed'})).toBe(true)
      if (mode === 'readonly') {
        await expect(view.saveChanges()).rejects.toThrow('不可写')
        expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
        expect(view.fieldAccess(view.rows[0]!, 'caption').write).toBe('denied')
        expect(http.requests).toHaveLength(2)
      } else {
        await expect(view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
        expect(http.requests.at(-1)?.data).toEqual([{TableName: 'Orders', CrudModel: {Added: [], Deleted: [],
          Changed: [{rowid: 'A', title: 'Changed', lingma_sys_key: 'ORIGINAL-SIGNED'}]}}])
        expect(view.rows[0]).toMatchObject({orderId: 'A', caption: 'Accepted'})
        expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      }
      expect(formal.fields[1]?.raw['Expression']).toBe('MASK-RULE-ID')
      expect(fields[1]?.['Expression']).toBe('MASK-RULE-ID')
    } finally {dataSet.destroy()}
  })

  it.each([{Type: 'GetConstValue', Value: 0}, '{"Type":"GetConstValue","Value":false}',
    {Type: 'GetGroupData', Field: 'title', ValType: 'COUNT'}])('keeps actual ValueFun outputs protected when a rule ID is present: %j', ValueFun => {
    const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: '数据库表',
      MetaName: 'PhysicalOrders', PrimaryKeyFields: 'rowid'}, [
      {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', AsName: 'orderId', FieldType: 'string', IsOutput: 1},
      {rowid: 'TITLE', dataModelId: 'MODEL', Name: 'title', AsName: 'caption', FieldType: 'string', IsOutput: 1,
        Expression: 'MASK-RULE-ID', ValueFun},
    ], 'rowid')
    expect(formal.fields[1]?.computed).toBe(true)
    const context = fixture(formal)
    expect(context.fieldAccess('A', 'caption')).toEqual({read: 'visible', write: 'denied',
      component: 'readonly', required: true, writeMode: 'readonly'})
    expect(() => context.buildSaveRequest({changed: [{orderId: 'A', caption: 'Changed'}]})).toThrow('SPARK_MODEL_SAVE_FIELD')
    expect(context.rows[0]?.['caption']).toBe('before')
  })

  it.each(['visible', 'masked', 'hidden'] as const)('presents derived aliases as readonly in existing and new rows while retaining %s reads', async mode => {
    const formal: FormalModel = {...model, fields: model.fields.map(field => ({...field, computed: field.canonicalName === 'caption'}))}
    const identity = {scenarioId: 'SCENE', metaName: 'Orders'}
    const context = new DataSpaceQueryContext({identity, scope: 'scope', readScope: () => 'scope',
      snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {primaryKeyField: 'rowid', allowAdd: true,
        lingma_sys_key: 'ADD', data: [{orderId: 'A', caption: mode === 'masked' ? '***' : 'Server output',
          lingma_sys_key: 'ROW', lingma_sys_params: {e: ['caption'], r: ['caption'],
            m: mode === 'masked' ? ['caption'] : [], h: mode === 'hidden' ? ['caption'] : []}}]}})})
    context.bindFormalModel(formal)
    const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {tableName: 'Orders',
      modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
        {name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'},
      ], views: {default: {commitMode: 'staged'}}}}})
    try {
      const view = ds.getView('Orders')!
      view.bindQueryExecutor({executeQuery: async () => context})
      await view.loadFromServer()
      const row = view.rows[0]!
      expect(view.fieldAccess(row, 'caption')).toEqual({read: mode === 'hidden' ? 'invisible' : mode,
        write: 'denied', component: mode === 'hidden' ? 'hidden' : 'readonly', required: true, writeMode: 'readonly'})
      expect(view.columns.find(column => column.name === 'caption')?.isComputed).not.toBe(true)
      expect(context.readFieldAccess(context.rows[0]!, 'caption')).toBe(mode === 'hidden' ? 'invisible' : mode)
      await view.addRow({orderId: 'B'})
      expect(view.fieldAccess(view.rows.find(row => row['orderId'] === 'B')!, 'caption')).toMatchObject({read: 'visible', write: 'denied', component: 'readonly'})
      expect(() => context.buildSaveRequest({added: [{orderId: 'B', caption: 'Override'}]})).toThrow('SPARK_MODEL_SAVE_FIELD')
      context.invalidate()
      expect(() => view.fieldAccess(row, 'caption')).toThrow('SPARK_QUERY_CONTEXT_STALE')
    } finally {ds.destroy()}
  })

  it.each(['view', 'call', 'queryConfig', 'queryView'] as const)('narrows %s output while retaining formal identity for permissions and signed saves', async source => {
    const formal: FormalModel = {...model, fields: [...model.fields,
      {id: 'EXTRA', modelId: 'MODEL', name: 'extra', canonicalName: 'extra', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 2, orderType: '', raw: {}}]}
    class ProjectionHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        let result: unknown
        if (config.url === '/api/DataOperation/GetData') {
          const body = config.data
          if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])) throw new Error('invalid query')
          const fields = body['Table'][0]['Fields']
          if (!Array.isArray(fields)) throw new Error('missing fields')
          const requested = new Set(fields.map(field => isRecord(field) ? field['Name'] : undefined))
          const row = {orderId: 'A', caption: 'Before', extra: 'Other view only'}
          const output = Object.fromEntries(Object.entries(row).filter(([name]) => body['OutputFieldMode'] !== 'REQUEST'
            || formal.fields.some(field => field.canonicalName === name && requested.has(field.name))))
          result = {primaryKeyField: 'rowid', allowAdd: false, data: {Items: [{...output,
            lingma_sys_key: 'ORIGINAL-SIGNED', lingma_sys_params: {e: ['caption'], r: ['caption']}}], Count: 1}}
        } else {
          result = {maplistedit: [{PhysicalOrders: [{rowid: 'A', title: 'Accepted'}]}]}
        }
        return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
      }
    }
    const projection = [{fieldId: 'TITLE', source: 'resource' as const, resourceFieldId: 'TITLE',
      resourceField: 'caption', viewField: 'caption', type: 'string', label: 'Caption', output: true,
      sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
      value: '', valueFunction: '', expression: ''}]
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'}, {name: 'extra', type: 'string'}],
        views: {default: {}, detail: source === 'view' ? {fieldProjection: projection} : source === 'queryConfig' || source === 'queryView' ? {queryConfig: {fields: ['caption']}} : {}},
    }}})
    const http = new ProjectionHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    let view = dataSet.getView('Orders', 'detail')!
    const other = dataSet.getView('Orders', 'default')!
    for (const target of [view, other]) { target.primaryKey = formal.primaryKey; runtime.bindModelView(target, formal) }
    if (source === 'queryView') view = view.createQueryView('picker')
    const originalProjection = structuredClone(view.fieldProjection)
    try {
      await other.loadFromServer()
      await view.loadFromServer(source === 'call' ? {fields: ['caption']} : {})
      const row = view.rows[0]!
      expect(row['extra']).toBeUndefined()
      expect(row).toMatchObject({orderId: 'A', caption: 'Before'})
      expect(view.fieldAccess(row, 'caption')).toMatchObject({read: 'visible', write: 'allowed', required: true})
      expect(http.requests[1]?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Fields: [
        expect.objectContaining({Name: 'title'}), expect.objectContaining({Name: 'rowid'}),
      ]}]})
      expect(await view.editRowById('A', {caption: 'Changed'})).toBe(true)
      await expect(view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
      expect(http.requests.at(-1)?.data).toEqual([{TableName: 'Orders', CrudModel: {Added: [], Deleted: [],
        Changed: [{rowid: 'A', title: 'Changed', lingma_sys_key: 'ORIGINAL-SIGNED'}]}}])
      expect(view.rows[0]).toMatchObject({orderId: 'A', caption: 'Accepted'})
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(view.fieldProjection).toEqual(originalProjection)
      if (source === 'view') expect(view.columns.some(column => column.name === 'orderId')).toBe(false)
      expect(other.rows[0]).toMatchObject({caption: 'Before', extra: 'Other view only'})
    } finally { dataSet.destroy() }
  })

  it('keeps a keyless formal projection readable without inventing a row identity', async () => {
    class KeylessHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: '', allowAdd: false,
          data: {Items: [{caption: 'Read only', lingma_sys_params: {e: ['caption']}}], Count: 1}}},
        status: 200, statusText: 'OK', headers: {}}
      }
    }
    const formal: FormalModel = {...model, primaryKey: '', fields: model.fields.map(field => ({...field, primaryKey: false}))}
    const http = new KeylessHttp()
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'caption', type: 'string'}], views: {default: {}},
    }}})
    const view = dataSet.getView('Orders', 'default')!
    view.primaryKey = ''
    new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, formal)
    try {
      await view.loadFromServer()
      expect(http.requests[0]?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Fields: [{Name: 'title', IsOutput: true}]}]})
      const row = view.rows[0]
      if (!row) throw new Error('missing keyless query row')
      expect(view.fieldAccess(row, 'caption')).toMatchObject({read: 'visible', write: 'denied'})
      expect(row['orderId']).toBeUndefined()
    } finally { dataSet.destroy() }
  })

  it('preserves raw query defaults and validates explicit output modes before I/O', async () => {
    class RawHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: '', data: {Items: [], Count: 0}}},
          status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new RawHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const identity = {scenarioId: 'SCENE', metaName: 'Orders'}
    await runtime.query(identity, {fields: ['title']})
    expect(http.requests[0]?.data).not.toHaveProperty('OutputFieldMode')
    for (const outputFieldMode of ['MODEL', 'REQUEST'] as const) {
      await runtime.query(identity, {fields: ['title'], outputFieldMode})
      expect(http.requests.at(-1)?.data).toMatchObject({OutputFieldMode: outputFieldMode})
    }
    // @ts-expect-error Runtime callers can provide an invalid output mode.
    await expect(runtime.query(identity, {outputFieldMode: 'all'})).rejects.toThrow('outputFieldMode')
    expect(http.requests).toHaveLength(3)
  })

  it('queries canonical option aliases with call-time parent input and local calculation', async () => {
    class OptionHttp extends HttpClientBase {
      readonly requests: RequestConfig[] = []
      marker: 'h' | 'm' | undefined
      protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
        this.requests.push(config)
        return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
          data: {Items: [{orderId: 'A', caption: 'Title', lingma_sys_key: 'TOKEN',
            lingma_sys_params: this.marker ? {[this.marker]: ['caption']} : {r: ['orderId', 'caption']}}], Count: 1}}},
        status: 200, statusText: 'OK', headers: {}}
      }
    }
    const http = new OptionHttp()
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'orderId', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'},
        {name: 'localTitle', type: 'string', computeExpression: 'caption + "!"'}],
      views: {default: {filterExpression: {field: 'caption', operator: 'eq',
        value: {Type: 'GetInputParam', ParamName: 'parent'}}}},
    }}})
    const view = dataSet.getView('Orders', 'default')!
    view.queryContext = {parent: 'OLD'}
    new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})}).bindModelView(view, model)
    await view.loadFromServer()
    view.updateEditingValue('A', 'caption', 'draft')
    const originalRows = view.rows
    const options = await view.queryOptionRows({fields: ['caption', 'localTitle'], context: {parent: 'NEW'}})
    expect(options).toEqual([{caption: 'Title', localTitle: 'Title!'}])
    const request = http.requests[1]?.data
    if (!request || typeof request !== 'object' || !('Table' in request) || !Array.isArray(request.Table)) {
      throw new Error('missing option request')
    }
    expect(request.Table[0]).toMatchObject({
      Fields: [{Name: 'rowid'}, {Name: 'title'}],
      Filter: {ValueFun: {Type: 'GetConstValue', Value: 'NEW'}},
      inputParams: [{Name: 'parent', Value: 'NEW'}],
    })
    expect(JSON.stringify(request)).not.toContain('localTitle')
    expect(view.rows).toBe(originalRows)
    expect(view.getEditingPatch('A')).toEqual({caption: 'draft'})
    expect(view.queryContext).toEqual({parent: 'OLD'})
    for (const marker of ['h', 'm'] as const) {
      http.marker = marker
      await expect(view.queryOptionRows({fields: ['localTitle'], context: {parent: marker}}))
        .rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    }
    dataSet.destroy()
  })

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
    expect(table.Fields.every((field: unknown) => typeof field === 'object' && field !== null && !('AsName' in field))).toBe(true)
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
