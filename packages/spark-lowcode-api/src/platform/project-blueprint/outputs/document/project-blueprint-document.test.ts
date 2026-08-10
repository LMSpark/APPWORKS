import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../../lowcode-api.js'
import { ProjectBlueprint, ProjectBlueprintNode } from '../../project-blueprint.js'

class DocumentFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {
      data: { Code: 200, Result: '文档生成任务提交成功' },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('ProjectBlueprint document outputs', () => {
  it('exposes legacy menu coverage instead of claiming full-blueprint generation', async () => {
    const blueprint = new ProjectBlueprint('PROJECT-1', [
      new ProjectBlueprintNode({
        id: 'ROOT', parentId: '', projectId: 'PROJECT-1', title: '项目', kind: 'project', description: '',
        legacyContentId: '', legacyContentType: '', runtimeTarget: '', runtimeNavigationCandidate: true,
        order: 0, source: {},
      }),
      new ProjectBlueprintNode({
        id: 'REQ-1', parentId: 'ROOT', projectId: 'PROJECT-1', title: '需求', kind: 'requirement', description: '',
        legacyContentId: '', legacyContentType: '', runtimeTarget: '', runtimeNavigationCandidate: false,
        order: 1, source: {},
      }),
    ])

    expect(blueprint.outputs.document.source('requirements-specification')).toMatchObject({
      coverage: 'legacy-menu-scope',
      includedNodeIds: ['ROOT'],
      excludedNodeIds: ['REQ-1'],
    })

    const http = new DocumentFixtureHttpClient()
    const task = await new LowcodeApi({ http }).blueprint.submitDocument(
      'PROJECT-1',
      'functional-design',
      { level: 2, includeText: false, includeHtml: true },
    )
    expect(task).toMatchObject({ status: 'submitted', coverage: 'legacy-menu-scope' })
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/File/exportDesignDoc?sysId=PROJECT-1&level=2&isText=false&isHtml=true',
    })
  })
})
