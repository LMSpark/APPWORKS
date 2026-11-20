import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeCatalogApi } from './lowcode-catalog-api.js'

class CatalogFixtureHttp extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const table = (config.data as { Table: Array<{ Name: string }> }).Table[0]?.Name
    const fixtures: Record<string, unknown> = {
      Base_serverInfo: { Code: 200, Result: { Items: [{ rowid: 'S1', Type: 'MYSQL', ServerName: '主库', ip_address: '10.0.0.1', Port: '3306' }] } },
      _base_dbInfo: { Code: 200, Result: { Items: [{ Id: 'D1', serverId: 'S1', Name: 'payroll', Type: 'MYSQL', State: 1 }] } },
      _Base_TblList: { Code: 200, Result: { Items: [{ rowid: 'T1', dbid: 'D1', tblname: 'employee', tbldesc: '员工', multiTenancy: 1 }] } },
      _Base_ViewList: { Code: 200, Result: { Items: [{ rowid: 'V1', dbid: 'D1', vewname: 'employee_summary', vewdesc: '员工汇总', SchemaName: 'dbo', status: 1 }] } },
      Base_TblField: { Code: 200, Result: { Items: [{ rowid: 'F1', tblid: 'T1', tblname: 'employee', enname: 'id', DataTypeName: '字符串型', IsNill: 0, IsPKey: 1 }] } },
    }
    return {
      data: fixtures[table ?? ''],
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('LowcodeCatalogApi', () => {
  it('reads normalized metadata while requesting only safe fields', async () => {
    const http = new CatalogFixtureHttp()
    const api = new LowcodeCatalogApi(http)

    const catalog = await api.getDatabaseCatalog('FORM-DBMS')
    expect(catalog).toMatchObject({
      servers: [{ id: 'S1', type: 'MYSQL', name: '主库', host: '10.0.0.1', port: '3306' }],
      databases: [{ id: 'D1', serverId: 'S1', name: 'payroll' }],
      tables: [{ id: 'T1', databaseId: 'D1', name: 'employee', multiTenancy: true }],
      views: [{ id: 'V1', databaseId: 'D1', name: 'employee_summary', description: '员工汇总' }],
      fields: [{ id: 'F1', tableId: 'T1', name: 'id', nullable: false, primaryKey: true }],
      sourceErrors: [],
      sourceDataSpaces: {
        Base_serverInfo: 'FORM-DBMS',
        _base_dbInfo: 'FORM-DBMS',
        _Base_TblList: 'FORM-DBMS',
        _Base_ViewList: 'FORM-DBMS',
        Base_TblField: 'FORM-DBMS',
      },
    })
    expect(api.resolveDatabaseResource(catalog, {
      databaseId: 'D1',
      resourceName: 'employee',
      resourceType: 'table',
    })).toMatchObject({
      id: 'T1',
      databaseId: 'D1',
      name: 'employee',
      resourceType: 'table',
      fields: [{ id: 'F1', name: 'id', dataTypeName: '字符串型' }],
    })

    const wire = JSON.stringify(http.requests)
    expect(wire).not.toContain('Password')
    expect(wire).not.toContain('UserName')
    expect(wire).not.toContain('ConnString')
    expect(http.requests).toHaveLength(5)
    expect(http.requests.every((request) => request.headers?.['x-FormKey'] === 'FORM-DBMS')).toBe(true)
  })

  it('fails closed when a database resource is missing or ambiguous', async () => {
    const api = new LowcodeCatalogApi(new CatalogFixtureHttp())
    const catalog = await api.getDatabaseCatalog('FORM-DBMS')
    expect(() => api.resolveDatabaseResource(catalog, {
      databaseId: 'D1',
      resourceName: 'missing',
      resourceType: 'table',
    })).toThrow('数据资源未解析')
    const table = catalog.tables[0]
    if (table === undefined) throw new Error('测试目录缺少表')
    expect(() => api.resolveDatabaseResource({
      ...catalog,
      tables: [...catalog.tables, table],
    }, {
      databaseId: 'D1',
      resourceName: 'employee',
      resourceType: 'table',
    })).toThrow('数据资源目录存在歧义')
  })
})
