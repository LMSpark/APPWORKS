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

    await expect(api.getDatabaseCatalog('FORM-DBMS')).resolves.toMatchObject({
      servers: [{ id: 'S1', type: 'MYSQL', name: '主库', host: '10.0.0.1', port: '3306' }],
      databases: [{ id: 'D1', serverId: 'S1', name: 'payroll' }],
      tables: [{ id: 'T1', databaseId: 'D1', name: 'employee', multiTenancy: true }],
      fields: [{ id: 'F1', tableId: 'T1', name: 'id', nullable: false, primaryKey: true }],
      sourceErrors: [],
      sourceDataSpaces: {
        Base_serverInfo: 'FORM-DBMS',
        _base_dbInfo: 'FORM-DBMS',
        _Base_TblList: 'FORM-DBMS',
        Base_TblField: 'FORM-DBMS',
      },
    })

    const wire = JSON.stringify(http.requests)
    expect(wire).not.toContain('Password')
    expect(wire).not.toContain('UserName')
    expect(wire).not.toContain('ConnString')
    expect(http.requests).toHaveLength(4)
    expect(http.requests.every((request) => request.headers?.['x-FormKey'] === 'FORM-DBMS')).toBe(true)
  })
})
