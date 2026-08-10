import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../lowcode-api.js'
import { LowcodeApiError } from '../../core/lowcode-api-error.js'

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null

  public constructor(private readonly fixture: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    return { data: this.fixture, status: 200, statusText: 'OK', headers: {} }
  }
}

function row(id: string, parentId: string, showAtNavigation: number): Readonly<Record<string, unknown>> {
  return {
    rowid: id,
    prowId: parentId,
    SysId: 'P1',
    FunName: id,
    conid: `content-${id}`,
    conType: 'legacy',
    IsShowAtNav: showAtNavigation,
    FunOrderValue: id === 'ROOT' ? 0 : 1,
  }
}

describe('ProjectBlueprintApi', () => {
  it('reads the complete flat blueprint without filtering hidden nodes', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { data: { Items: [row('ROOT', '000000', 1), row('REQUIREMENT', 'ROOT', 0)] } },
    })

    const blueprint = await new LowcodeApi({ http }).blueprint.read('P1')

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetData',
      method: 'POST',
      headers: { 'x-FormKey': '7AB874097A1E8711A42FD845939A6E05' },
    })
    expect(JSON.stringify(http.requestConfig?.data)).not.toContain('IsShowAtNav')
    expect(blueprint.nodes.map(node => node.id)).toEqual(['ROOT', 'REQUIREMENT'])
    expect(blueprint.findNode('REQUIREMENT')?.runtimeNavigationCandidate).toBe(false)
    expect(blueprint.outputs.structure.snapshot().hierarchy[0]?.children[0]?.node.id).toBe('REQUIREMENT')
  })

  it('fails closed for duplicate identities', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('ROOT', '000000', 0)] },
    })

    await expect(new LowcodeApi({ http }).blueprint.read('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 id 重复：ROOT'))
  })

  it('preserves multiple top-level records as one flat project blueprint', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT-A', '000000', 1), row('ROOT-B', '0', 0)] },
    })

    const blueprint = await new LowcodeApi({ http }).blueprint.read('P1')

    expect(blueprint.nodes.map(node => node.id)).toEqual(['ROOT-A', 'ROOT-B'])
    expect(blueprint.outputs.structure.snapshot().hierarchy.map(item => item.node.id))
      .toEqual(['ROOT-A', 'ROOT-B'])
  })

  it('preserves orphan nodes as diagnosed top-level records', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('PAGE', 'MISSING', 1)] },
    })

    const blueprint = await new LowcodeApi({ http }).blueprint.read('P1')

    expect(blueprint.outputs.structure.snapshot().hierarchy.map(item => item.node.id))
      .toEqual(['ROOT', 'PAGE'])
    expect(blueprint.outputs.structure.snapshot().diagnostics).toContainEqual({
      code: 'missing-parent',
      nodeId: 'PAGE',
      message: '蓝图节点 PAGE 的父节点不存在：MISSING',
    })
  })

  it('fails closed when a row belongs to another project', async () => {
    const foreign = { ...row('PAGE', 'ROOT', 1), SysId: 'P2' }
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), foreign] },
    })

    await expect(new LowcodeApi({ http }).blueprint.read('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 PAGE 属于其他项目 P2'))
  })
})
