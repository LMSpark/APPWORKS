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
    versionId: id === 'ROOT' ? '' : 'rule=2;script=1;style=3',
    IsShowAtNav: showAtNavigation,
    FunOrderValue: id === 'ROOT' ? 0 : 1,
  }
}

describe('LowcodeProjectBlueprintApi', () => {
  it('reads the complete flat blueprint without filtering hidden nodes', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { data: { Items: [row('ROOT', '000000', 1), row('REQUIREMENT', 'ROOT', 0)] } },
    })

    const records = await new LowcodeApi({ http }).blueprint.readRecords('P1')

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetData',
      method: 'POST',
      headers: { 'x-FormKey': '7AB874097A1E8711A42FD845939A6E05' },
    })
    expect(JSON.stringify(http.requestConfig?.data)).not.toContain('IsShowAtNav')
    expect(records.map(node => node.id)).toEqual(['ROOT', 'REQUIREMENT'])
    expect(records.map(node => node.formKey)).toEqual(['content-ROOT', 'content-REQUIREMENT'])
    expect(records.map(node => node.fileVersionId)).toEqual(['', 'rule=2;script=1;style=3'])
    expect(records.find(node => node.id === 'REQUIREMENT')?.runtimeNavigationCandidate).toBe(false)
  })

  it('fails closed for duplicate identities', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('ROOT', '000000', 0)] },
    })

    await expect(new LowcodeApi({ http }).blueprint.readRecords('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 id 重复：ROOT'))
  })

  it('preserves multiple top-level records as one flat project blueprint', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT-A', '000000', 1), row('ROOT-B', '0', 0)] },
    })

    const records = await new LowcodeApi({ http }).blueprint.readRecords('P1')

    expect(records.map(node => node.id)).toEqual(['ROOT-A', 'ROOT-B'])
  })

  it('preserves orphan nodes as diagnosed top-level records', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('PAGE', 'MISSING', 1)] },
    })

    const records = await new LowcodeApi({ http }).blueprint.readRecords('P1')

    expect(records.map(node => [node.id, node.parentId])).toEqual([
      ['ROOT', '000000'],
      ['PAGE', 'MISSING'],
    ])
  })

  it('fails closed when a row belongs to another project', async () => {
    const foreign = { ...row('PAGE', 'ROOT', 1), SysId: 'P2' }
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), foreign] },
    })

    await expect(new LowcodeApi({ http }).blueprint.readRecords('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 PAGE 属于其他项目 P2'))
  })

  it('rejects patch fields outside the six-stage contract before writing', async () => {
    const writable = {
      ...row('PAGE', 'ROOT', 1),
      lingma_sys_key: 'key',
      lingma_sys_params: { r: [], e: ['memo'], h: [], m: [], d: false },
    }
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), writable] },
    })
    const patch: Record<string, string | number> = { memo: 'x', FunName: 'renamed' }

    await expect(new LowcodeApi({ http }).blueprint.updateNodeFields('P1', 'PAGE', patch))
      .rejects.toEqual(new Error('导航字段不属于六阶段写入合同：FunName'))
    expect(http.requestConfig?.url).toBe('/api/DataOperation/GetData')
  })
})
