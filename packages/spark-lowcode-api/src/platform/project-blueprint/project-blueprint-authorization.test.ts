import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../lowcode-api.js'

class AuthorizationFixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    return {
      data: {
        Code: 200,
        Result: {
          TopMenus: [{
            id: 'MODULE',
            items: [{ id: 'PAGE', NavigationUrl: 'vue:payroll/audit', conId: 'FORM-1', items: [] }],
          }],
          LeftMenus: [],
          Relations: [{ rowid: 'REL-1', prowid: 'PAGE', childrowid: 'CONTEXT-1', title: '期间' }],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('LowcodeProjectBlueprintApi navigation authorization', () => {
  it('returns normalized backend authorization evidence without projecting a runtime menu', async () => {
    const http = new AuthorizationFixtureHttpClient()
    const evidence = await new LowcodeApi({ http }).blueprint
      .readNavigationAuthorization('PROJECT-1', 'ROOT')

    expect(http.requestConfig).toMatchObject({
      method: 'GET',
      url: '/api/FormDesign/GetNavigationMenus/PROJECT-1/ROOT',
    })
    expect(evidence.items).toEqual([{
      id: 'MODULE',
      target: '',
      targetKind: 'empty',
      formKey: null,
      children: [{
        id: 'PAGE',
        target: 'vue:payroll/audit',
        targetKind: 'vue',
        formKey: 'FORM-1',
        children: [],
      }],
    }])
    expect(evidence.contexts).toEqual([expect.objectContaining({ navigationId: 'PAGE' })])
  })
})
