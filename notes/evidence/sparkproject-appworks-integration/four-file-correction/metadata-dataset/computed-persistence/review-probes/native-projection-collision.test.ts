import {describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse} from '@spark-appworks/spark-utils'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

class NoHttp extends HttpClientBase {
  protected override async executeRequest(): Promise<HttpResponse<unknown>> {
    throw new Error('unexpected request')
  }
}

describe('review probe for native projection collision', () => {
  it('rejects a duplicate local computed column that collides with a projected formal output', () => {
    const model: FormalModel = {id: 'MODEL', name: 'Orders', metaName: 'Orders', sourceName: 'Orders',
      sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {}, fields: [
        {id: 'ID', modelId: 'MODEL', name: 'id', canonicalName: 'id', type: 'string', primaryKey: true,
          description: '', output: true, computed: false, order: 0, orderType: '', raw: {}},
        {id: 'TITLE', modelId: 'MODEL', name: 'title', canonicalName: 'title', type: 'string', primaryKey: false,
          description: '', output: true, computed: false, order: 1, orderType: '', raw: {}},
      ]}
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
      columns: [{name: 'id', type: 'string'}, {name: 'title', type: 'string'},
        {name: 'title', type: 'string', computeExpression: '1'}],
      views: {default: {fieldProjection: [{fieldId: 'TITLE', source: 'resource', resourceFieldId: 'TITLE',
        resourceField: 'title', viewField: 'title', type: 'string', label: 'Title', output: true,
        sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
        value: '', valueFunction: '', expression: ''}]}},
    }}})
    try {
      const view = dataSet.getView('Orders', 'default')!
      const runtime = new DataSpaceRuntimeApi({http: new NoHttp(),
        readScope: () => ({token: 'SCOPE', headers: {}})})
      expect(() => runtime.bindModelView(view, model)).toThrow('SPARK_MODEL_COMPUTED_COLLISION')
    } finally { dataSet.destroy() }
  })
})
