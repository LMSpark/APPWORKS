import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'

class RuntimeNavigationFixtureHttpClient extends HttpClientBase {
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    const result = config.url === '/api/DataOperation/GetData'
      ? {
          data: {
            Items: [
              blueprintRow('ROOT', '000000', '', '', 0),
              blueprintRow('MODULE', 'ROOT', '', '', 1),
              blueprintRow('PAGE', 'MODULE', 'FORM-1', 'vue:payroll/audit', 1),
              blueprintRow('LEGACY', 'MODULE', 'FORM-LEGACY', '/DataCenter/DataBaseList.html', 1),
              blueprintRow('EXTERNAL', 'MODULE', 'MUST-NOT-BE-FORMKEY', 'https://example.com', 1),
              blueprintRow('UNAUTHORIZED', 'MODULE', 'FORM-X', 'vue:payroll/secret', 1),
              blueprintRow('REQUIREMENT', 'ROOT', '', '', 0),
            ],
          },
        }
      : {
          TopMenus: [{
            id: 'MODULE',
            items: [
              { id: 'PAGE', NavigationUrl: 'vue:payroll/audit', conId: 'FORM-1', items: [] },
              { id: 'LEGACY', NavigationUrl: '/DataCenter/DataBaseList.html', conId: 'FORM-LEGACY', items: [] },
              { id: 'EXTERNAL', NavigationUrl: 'https://example.com', conId: 'IGNORED', items: [] },
            ],
          }],
          LeftMenus: [],
          Relations: [{ rowid: 'REL-1', prowid: 'PAGE', childrowid: 'CONTEXT-1', title: '期间' }],
        }
    return {
      data: { Code: 200, Result: result },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

function blueprintRow(
  id: string,
  parentId: string,
  formKey: string,
  target: string,
  show: number,
): Readonly<Record<string, unknown>> {
  return {
    rowid: id,
    prowId: parentId,
    SysId: 'PROJECT-1',
    FunName: id,
    conid: formKey,
    NavigationUrl: target,
    IsShowAtNav: show,
    FunOrderValue: 1,
  }
}

describe('ProjectBlueprint runtime-navigation output', () => {
  it('intersects backend authorization and keeps scene FormKey on Vue and legacy routes', async () => {
    const navigation = await new LowcodeApi({ http: new RuntimeNavigationFixtureHttpClient() })
      .blueprint.readRuntimeNavigation('PROJECT-1', 'ROOT')

    expect(navigation.projectId).toBe('PROJECT-1')
    expect(navigation.items).toEqual([
      expect.objectContaining({
        id: 'MODULE',
        itemKind: 'module',
        formKey: null,
        children: [
          expect.objectContaining({
            id: 'EXTERNAL',
            itemKind: 'external',
            formKey: null,
          }),
          expect.objectContaining({
            id: 'LEGACY',
            itemKind: 'page',
            targetKind: 'route',
            formKey: 'FORM-LEGACY',
          }),
          expect.objectContaining({
            id: 'PAGE',
            itemKind: 'page',
            targetKind: 'vue',
            componentKey: 'vue:payroll/audit',
            formKey: 'FORM-1',
          }),
        ],
      }),
    ])
    expect(JSON.stringify(navigation.items)).not.toContain('UNAUTHORIZED')
    expect(JSON.stringify(navigation.items)).not.toContain('REQUIREMENT')
    expect(navigation.contexts).toEqual([expect.objectContaining({ navigationId: 'PAGE' })])
  })
})
