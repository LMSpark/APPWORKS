import { describe, expect, it } from 'vitest'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase, isRecord } from '@spark-appworks/spark-utils'

import { DataSet } from '../../dataset'
import { DataTable } from '../../data-table'

class RuntimeSnapshotHttp extends HttpClientBase {
  public requestConfig: RequestConfig | null = null

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    return {
      data: {
        snapshot: {
          formKey: 'FORM-1',
          dataSpaceId: 'SPACE-1',
          modelId: 'MODEL-1',
          rows: [{
            rowid: 'ROW-1',
            salaryAmount: 100,
            lingma_sys_key: 'ROW-KEY',
            lingma_sys_params: { r: [], e: ['salary'], h: [], m: [], d: true },
          }],
          originalRows: [{ rowid: 'ROW-1', salaryAmount: 100, lingma_sys_key: 'ROW-KEY' }],
          total: 1,
          allowAdd: true,
          systemKey: 'TABLE-KEY',
          authorizedFeatureTags: ['salary.export'],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('DataTable backend permission snapshot', () => {
  it('registers rows, original rows, identities and five sparse sets as one baseline', () => {
    const table = new DataTable(
      'PayrollSalary',
      [
        { name: 'rowid', type: 'string', isPrimaryKey: true },
        { name: 'salary', type: 'decimal' },
      ],
    )

    table.ingestPermissionSnapshot({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      rows: [{
        rowid: 'ROW-1',
        salary: 100,
        lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: { r: [], e: ['salary'], h: [], m: [], d: true },
      }],
      originalRows: [{ rowid: 'ROW-1', salary: 100, lingma_sys_key: 'ROW-KEY' }],
      total: 1,
      allowAdd: true,
      systemKey: 'TABLE-KEY',
      authorizedFeatureTags: ['salary.export'],
    })

    const view = table.getView('default')
    expect(view?.rows[0]?.lingma_sys_params).toEqual({ r: [], e: ['salary'], h: [], m: [], d: true })
    expect(view?.permissionSnapshot).toEqual({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      allowAdd: true,
      systemKey: 'TABLE-KEY',
      originalRows: [{ rowid: 'ROW-1', salary: 100, lingma_sys_key: 'ROW-KEY' }],
      authorizedFeatureTags: ['salary.export'],
    })
    expect(view?.total).toBe(1)
  })

  it('fails before replacing the current baseline when a row has no backend permission result', () => {
    const table = new DataTable(
      'PayrollSalary',
      [{ name: 'rowid', type: 'string', isPrimaryKey: true }],
    )
    const view = table.getView('default')
    view?.replaceRows([{ rowid: 'OLD' }])

    expect(() => table.ingestPermissionSnapshot({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      rows: [{ rowid: 'NEW' }],
      originalRows: [{ rowid: 'NEW' }],
      total: 1,
      allowAdd: false,
      systemKey: '',
      authorizedFeatureTags: [],
    })).toThrow('缺少 lingma_sys_params')
    expect(view?.rows).toEqual([{ rowid: 'OLD', _pk: 'OLD' }])
    expect(view?.permissionSnapshot).toBeNull()
  })

  it('submits DataView model context through shared CrudService transforms and atomically ingests the result', async () => {
    const dataSet = DataSet.fromJson({
      dataSetName: 'SPACE-1',
      tables: {
        'RESOURCE-1': {
          tableName: 'RESOURCE-1',
          resourceId: 'RESOURCE-1',
          resourceType: 'database-table',
          columns: [
            { name: 'rowid', type: 'string', isPrimaryKey: true },
            { name: 'salary', type: 'decimal' },
          ],
          api: { list: { url: '/runtime/query', method: 'POST' } },
          views: {
            default: {},
            'MODEL-1': {
              fieldProjection: [{
                fieldId: 'MODEL-FIELD-1',
                source: 'resource',
                resourceFieldId: 'RESOURCE-FIELD-1',
                resourceField: 'salary',
                viewField: 'salaryAmount',
                type: 'decimal',
                label: '薪资',
                output: true,
                sortOrder: 1,
                sortDirection: 'desc',
                group: 0,
                distinct: false,
                primaryKey: false,
                value: '',
                valueFunction: '',
                expression: '',
              }],
              queryContext: {
                formKey: 'FORM-1',
                dataSpaceId: 'SPACE-1',
                modelId: 'MODEL-1',
              },
            },
          },
        },
      },
    })
    const http = new RuntimeSnapshotHttp()
    dataSet.setSharedHttpClient(http)
    const table = dataSet.getTable('RESOURCE-1')
    if (table === undefined) throw new Error('测试数据资源缺失')
    table.setCrudConfig({
      transformRequest(data) {
        if (!isRecord(data)) throw new Error('查询参数必须是对象')
        return { runtimeQuery: data }
      },
      transformResponse(data) {
        if (!isRecord(data)) throw new Error('运行响应必须是对象')
        return data['snapshot']
      },
    })
    const view = table.getView('MODEL-1')
    if (view === undefined) throw new Error('测试模型视图缺失')

    const result = await view.loadFromServer({ filter: { field: 'salary', op: '>', value: 0 } })

    expect(result.success).toBe(true)
    expect(http.requestConfig?.data).toEqual({
      runtimeQuery: expect.objectContaining({
        viewId: 'MODEL-1',
        context: { formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1' },
        projection: [expect.objectContaining({ fieldId: 'MODEL-FIELD-1', viewField: 'salaryAmount' })],
        filter: { field: 'salary', op: '>', value: 0 },
      }),
    })
    expect(view.rows[0]).toMatchObject({
      rowid: 'ROW-1',
      salaryAmount: 100,
      lingma_sys_params: { r: [], e: ['salary'], h: [], m: [], d: true },
    })
    expect(view.permissionSnapshot).toMatchObject({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      allowAdd: true,
      systemKey: 'TABLE-KEY',
    })
    expect(view.total).toBe(1)
  })
})
