import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase, isRecord } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../lowcode-api.js'
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import { LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS } from './project-blueprint-api.js'

function activeApi(http: HttpClientBase): LowcodeApi {
  const values = new Map<string,string>()
  const api = new LowcodeApi({http,sessionStorage:{getItem:key=>values.get(key) ?? null,setItem:(key,value)=>{values.set(key,value)},removeItem:key=>{values.delete(key)}}})
  api.session.save({accessToken:'access',refreshToken:'refresh',accessExpiresAt:Date.now()+60_000,refreshExpiresAt:Date.now()+120_000,
    identity:{userId:'USER',account:'test',displayName:'test',enterpriseId:'TENANT',enterpriseShortName:'test',role:null,raw:{}},
    enterprise:{id:'TENANT',name:'test',code:'test',shortName:'test',shortCode:'test',raw:{}}})
  api.application.save({application:{id:'P1',code:'test',name:'test',description:'',enterpriseId:'TENANT',enterpriseShortName:'test',isDefault:false},navigationRootId:'ROOT'})
  return api
}

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null

  public constructor(private readonly fixture: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    if (!isRecord(this.fixture) || !isRecord(this.fixture['Result'])) throw new Error('fixture result required')
    const result = this.fixture['Result']
    const source = isRecord(result['data']) ? result['data'] : result
    const rows = source['Items']
    if (!Array.isArray(rows)) throw new Error('fixture rows required')
    return { data: {Code:200,Result:{primaryKeyField:'rowid',allowAdd:true,lingma_sys_key:'table-signed',data:{Items:rows,Count:rows.length}}}, status: 200, statusText: 'OK', headers: {} }
  }
}

class BlueprintMutationHttp extends HttpClientBase {
  readonly rows = new Map<string, Record<string, unknown>>()
  readonly writes: RequestConfig[] = []
  ignoreWrites = false
  onQuery?: () => void
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.url === '/api/DataOperation/GetData') this.onQuery?.()
    if (config.url === '/api/DataOperation/GetData') return { data: { Code: 200, Result: { primaryKeyField:'rowid',allowAdd:true,lingma_sys_key:'table-signed',data:{Items:[...this.rows.values()],Count:this.rows.size} } }, status: 200, statusText: 'OK', headers: {} }
    this.writes.push(config)
    if (!Array.isArray(config.data) || !isRecord(config.data[0]) || !isRecord(config.data[0]['CrudModel'])) throw new Error('invalid mutation')
    const crud = config.data[0]['CrudModel']
    const receipt: Record<string,unknown> = {}
    for (const [action,bucket] of [['Added','maplistadd'],['Changed','maplistedit'],['Deleted','maplistdelete']] as const) {
      const items = crud[action]
      if (!Array.isArray(items)) throw new Error('invalid rows')
      if (!items.length) continue
      const returned = items.map(item=>{
        if (!isRecord(item) || typeof item['rowid'] !== 'string') throw new Error('missing identity')
        const updated = {...this.rows.get(item['rowid']),...item}
        if (!this.ignoreWrites) {
          if (action === 'Deleted') this.rows.delete(item['rowid'])
          else this.rows.set(item['rowid'],{...updated,lingma_sys_key:'server-snapshot',lingma_sys_params:{e:[...LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS],d:true,c:true}})
        }
        return updated
      })
      receipt[bucket] = [{physical:returned}]
    }
    return { data: { Code: 200, Result: receipt }, status: 200, statusText: 'OK', headers: {} }
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
  it('keeps capability, navigation, scenario and prototype in their formal groups', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [{
        ...row('TOOL-1', '000000', 1),
        conType: 'Navitem', name: 'Orders.Query', FunName: '订单查询',
        memo: '订单查询能力', funCode: 'ORDERS', personCharge: 'OWNER', status: 'ready',
        conid: 'SCENE-1', NavigationUrl: 'cfg:shared/orders',
        NavigationImageWxz: 'Search', MobileUrl: 'vue:/orders/mobile',
        NavigationType: '3', ChildItemLocation: 'Left', NavigationShowType: 'tree',
        HorizontalAlignment: 'Center', IsShowAtNav: 'y', IsShowChildItem: 1, BeginGroup: 1,
        htmlDesc: '<main>订单</main>',
      }] },
    })

    const [record] = await activeApi(http).blueprint.readRecords('P1')

    expect(record).toMatchObject({
      nodeId: 'TOOL-1', parentNodeId: '', projectId: 'P1', kind: 'page',
      capability: { name: 'Orders.Query', description: '订单查询能力', code: 'ORDERS', ownerId: 'OWNER', deliveryStatus: 'ready' },
      navigation: { title: '订单查询', target: 'cfg:shared/orders', icon: 'Search',
        mobileTarget: 'vue:/orders/mobile', order: 1, placement: 'left', openMode: 'current',
        displayMode: 'tree', horizontalAlignment: 'center', publishInMenu: true, showChildren: true, beginGroup: true },
      dataSpace: { scenarioId: 'SCENE-1', models: [] },
      prototype: { htmlDescription: '<main>订单</main>' },
    })
    for (const key of ['id', 'title', 'formKey', 'runtimeTarget', 'planningContent', 'prototypeHtml']) {
      expect(record).not.toHaveProperty(key)
    }
    expect(Object.isFrozen(record?.capability)).toBe(true)
    expect(Object.isFrozen(record?.navigation)).toBe(true)
    expect(Object.isFrozen(record?.dataSpace?.models)).toBe(true)
  })

  it('does not manufacture navigation, scenario or prototype for a capability-only node', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { Items: [{
      rowid: 'SERVICE', SysId: 'P1', prowId: '000000', conType: 'service', name: 'Orders.Import',
      FunName: '', conid: '', htmlDesc: '', IsShowAtNav: 0,
    }] } })
    const [record] = await activeApi(http).blueprint.readRecords('P1')
    expect(record?.capability.name).toBe('Orders.Import')
    expect(record?.navigation).toBeUndefined()
    expect(record?.dataSpace).toBeUndefined()
    expect(record?.prototype).toBeUndefined()
  })

  it.each([
    ['Model', 'module'],
    ['Navitem', 'page'],
    ['embedded', 'embedded'],
    ['service', 'service'],
    ['content', 'content'],
  ])('reads SPARK conType %s as formal kind %s', async (conType, kind) => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [{ ...row('NODE', '000000', 1), conType }] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records[0]?.kind).toBe(kind)
  })

  it.each(['', 'unsupported'])('preserves unknown conType %s without guessing from placement', async (conType) => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [{ ...row('NODE', '000000', 1), conType, BlueprintNodeKind: 'page' }] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records[0]?.kind).toBe('unknown')
  })

  it('reads capability description from memo rather than the retired description field', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [{
        ...row('NODE', '000000', 1),
        conType: 'Navitem',
        memo: '按订单场景展示查询视图',
        description: '过时描述',
      }] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records[0]?.capability.description).toBe('按订单场景展示查询视图')
  })

  it('preserves an explicitly empty capability description without falling back to retired fields', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [{ ...row('NODE', '000000', 1), memo: '', description: '过时描述' }] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records[0]?.capability.description).toBeUndefined()
  })

  it('reads the complete flat blueprint without filtering hidden nodes', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { data: { Items: [row('ROOT', '000000', 1), row('REQUIREMENT', 'ROOT', 0)] } },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetData',
      method: 'POST',
      headers: { 'x-FormKey': '7AB874097A1E8711A42FD845939A6E05' },
    })
    expect(JSON.stringify(http.requestConfig?.data)).not.toContain('IsShowAtNav')
    expect(records.map(node => node.nodeId)).toEqual(['ROOT', 'REQUIREMENT'])
    expect(records.map(node => node.dataSpace?.scenarioId)).toEqual(['content-ROOT', 'content-REQUIREMENT'])
    expect(records.map(node => node.source['versionId'])).toEqual(['', 'rule=2;script=1;style=3'])
    expect(records.find(node => node.nodeId === 'REQUIREMENT')?.navigation?.publishInMenu).toBe(false)
  })

  it('fails closed for duplicate identities', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('ROOT', '000000', 0)] },
    })

    await expect(activeApi(http).blueprint.readRecords('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 id 重复：ROOT'))
  })

  it('preserves multiple top-level records as one flat project blueprint', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT-A', '000000', 1), row('ROOT-B', '0', 0)] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records.map(node => node.nodeId)).toEqual(['ROOT-A', 'ROOT-B'])
  })

  it('preserves orphan nodes as diagnosed top-level records', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), row('PAGE', 'MISSING', 1)] },
    })

    const records = await activeApi(http).blueprint.readRecords('P1')

    expect(records.map(node => [node.nodeId, node.parentNodeId])).toEqual([
      ['ROOT', ''],
      ['PAGE', 'MISSING'],
    ])
  })

  it('fails closed when a row belongs to another project', async () => {
    const foreign = { ...row('PAGE', 'ROOT', 1), SysId: 'P2' }
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), foreign] },
    })

    await expect(activeApi(http).blueprint.readRecords('P1'))
      .rejects.toEqual(new LowcodeApiError(0, '蓝图节点 PAGE 属于其他项目 P2'))
  })

  it('rejects internal locator fields before writing', async () => {
    const writable = {
      ...row('PAGE', 'ROOT', 1),
      lingma_sys_key: 'key',
      lingma_sys_params: { r: [], e: ['memo'], h: [], m: [], d: false },
    }
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { Items: [row('ROOT', '000000', 1), writable] },
    })
    const patch: Record<string, string | number> = { memo: 'x', _pk: 'forged' }

    await expect(activeApi(http).blueprint.updateNodeFields('P1', 'PAGE', patch))
      .rejects.toEqual(new Error('导航字段不属于蓝图写入合同：_pk'))
    expect(http.requestConfig?.url).toBe('/api/DataOperation/GetData')
  })

  it('creates, updates, moves and deletes through registered model requests and confirms readback', async () => {
    const http = new BlueprintMutationHttp()
    const api = activeApi(http).blueprint
    const node = { nodeId: 'N', parentNodeId: '', projectId: 'P1', kind: 'page' as const,
      capability: { name: 'Orders.Query' }, navigation: { title: 'Orders', order: 1, target: 'cfg:orders', publishInMenu: true, showChildren: false, beginGroup: false }, source: {} }
    const created = await api.createNode('P1', node)
    const updated = await api.updateNode('P1', { ...created, capability: { ...created.capability, description: 'new' } })
    expect(updated.capability.description).toBe('new')
    await api.updateNodeFields('P1', 'N', { prowid: '000000', FunOrderValue: 2 })
    await api.deleteNode('P1', 'N')
    expect(await api.readRecords('P1')).toEqual([])
    expect(http.writes).toHaveLength(4)
    for (const request of http.writes) {
      expect(request.headers).toMatchObject({ 'x-FormKey': '7AB874097A1E8711A42FD845939A6E05', 'X-AppId':'P1' })
      expect(request.data).toEqual(expect.arrayContaining([expect.objectContaining({ TableName: 'Base_NavigationInfo' })]))
      expect(JSON.stringify(request.data)).not.toContain('_pk')
    }
  })

  it('does not accept an unconfirmed creation or silently retry it', async () => {
    const http = new BlueprintMutationHttp()
    http.ignoreWrites = true
    await expect(activeApi(http).blueprint.createNode('P1', { nodeId: 'N', parentNodeId: '', projectId: 'P1', kind: 'service', capability: { name: 'Import' }, source: {} })).rejects.toThrow('未确认')
    expect(http.writes).toHaveLength(1)
  })
  it('does not expose signed query fields and ignores forged source credentials on update', async () => {
    const http = new BlueprintMutationHttp()
    http.rows.set('N',{...row('N','000000',0),conType:'service',name:'Import',memo:'before',lingma_sys_key:'original-signed',lingma_sys_params:{e:['memo'],d:true}})
    const api = activeApi(http)
    const before = (await api.blueprint.readRecords('P1'))[0]
    if (!before) throw new Error('missing record')
    expect(before.source).not.toHaveProperty('lingma_sys_key')
    expect(before.source).not.toHaveProperty('lingma_sys_params')
    await api.blueprint.updateNode('P1',{...before,capability:{...before.capability,description:'after'},source:{...before.source,lingma_sys_key:'forged',lingma_sys_params:{e:['memo']}}})
    expect(http.writes[0]?.data).toEqual([{TableName:'Base_NavigationInfo',CrudModel:{Added:[],Changed:[{rowid:'N',memo:'after',lingma_sys_key:'original-signed'}],Deleted:[]}}])
  })

  it('rejects a stale application scope after query before mutation transport', async () => {
    const http = new BlueprintMutationHttp()
    const api = activeApi(http)
    http.onQuery = () => api.application.clear()
    await expect(api.blueprint.createNode('P1',{nodeId:'N',parentNodeId:'',projectId:'P1',kind:'service',capability:{name:'Import'},source:{}})).rejects.toThrow(/SCOPE/)
    expect(http.writes).toHaveLength(0)
  })

})
