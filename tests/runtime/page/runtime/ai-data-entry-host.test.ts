import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, type DataView} from '@spark-appworks/spark-data'
import {AiDataEntryHost} from '@/lowcode/resources/shared/ai-data-entry-host'

const runtimeState = vi.hoisted(() => ({
  scope: {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-A'}},
  requests: [] as Array<{method: string; url: string; data: unknown}>,
  failUrl: null as string | null,
  heldUrl: null as string | null,
  releaseHeld: undefined as (() => void) | undefined,
  turnStatus: 'RUNNING',
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {readRequestScope: () => runtimeState.scope},
  lowcodeHttp: {
    request: async (config: {method?: string; url?: string; data?: unknown}) => {
      const request = {method: config.method ?? 'GET', url: config.url ?? '', data: config.data}
      runtimeState.requests.push(request)
      if (runtimeState.failUrl === request.url) {
        runtimeState.failUrl = null
        throw new Error('simulated request failure')
      }
      if (runtimeState.heldUrl === request.url) {
        await new Promise<void>(resolve => {runtimeState.releaseHeld = resolve})
        runtimeState.heldUrl = null
        runtimeState.releaseHeld = undefined
      }
      const result = request.url === '/api/ai/v1/agents'
        ? [{id: 'AGENT-TENANT-A', agentName: 'AI录入', description: null}]
        : request.method === 'POST' && request.url === '/api/ai/v1/turns'
          ? {conversationId: 'CONVERSATION-A', turnId: 'TURN-A', status: 'QUEUED', acceptedAt: null}
          : request.url.endsWith('/turns/TURN-A')
            ? {id: 'TURN-A', conversationId: 'CONVERSATION-A', agentId: 'AGENT-TENANT-A', status: runtimeState.turnStatus,
              assistantDraft: null, errorCode: null, errorMessage: null}
            : true
      return {Code: 200, Result: result}
    },
  },
}))

const dataSets: DataSet[] = []
const hosts: AiDataEntryHost[] = []
beforeEach(() => {
  runtimeState.scope = {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-A'}}
  runtimeState.requests.splice(0)
  runtimeState.failUrl = null
  runtimeState.heldUrl = null
  runtimeState.releaseHeld = undefined
  runtimeState.turnStatus = 'RUNNING'
  vi.stubEnv('VITE_AI_DATA_ENTRY_AGENTS', JSON.stringify({'tenant-a': 'AGENT-TENANT-A', 'tenant-b': 'AGENT-TENANT-B'}))
})
afterEach(() => {
  hosts.splice(0).forEach(host => {
    try {host.releaseClean()} catch { /* preserve the test's primary assertion */ }
  })
  dataSets.splice(0).forEach(dataSet => {if (!dataSet.destroyed) dataSet.destroy()})
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function createDataSet(scenarioId: string) {
  const dataSet = DataSet.fromJson({scenarioId, tables: {Rows: {
    modelBinding: {modelId: `MODEL-${scenarioId}`, modelName: 'Items'},
    columns: [
      {name: 'rowid', type: 'string', isPrimaryKey: true},
      {name: 'ordIdx', type: 'tinyint', label: '排序', min: 0, max: 10, allowAIAdd: true},
      {name: 'name', type: 'varchar', label: '名称', allowAIAdd: true},
    ],
    views: {default: {commitMode: 'staged'}, alternate: {commitMode: 'staged'}},
  }}})
  dataSets.push(dataSet)
  const target = dataSet.getView('Rows', 'default')
  if (target === undefined) throw new Error('target DataView fixture is missing')
  target.bindQueryExecutor({executeQuery: async () => ({
    rows: [{rowid: `EXISTING-${scenarioId}`, ordIdx: 1, name: 'existing'}], total: 1,
    assertIdentity: identity => {
        if (identity.scenarioId !== scenarioId || identity.metaName !== 'Items') throw new Error('target scope mismatch')
    },
    rowKey: row => row['rowid'],
    prepareNewRow: row => ({...row, rowid: `DRAFT-${scenarioId}`}),
    isFieldReadOnly: () => false,
    fieldAccess: () => ({read: 'visible', write: 'allowed', required: false, component: 'editable', writeMode: 'editable'}),
    readFieldAccess: () => 'visible',
    addActionState: available => available ? 'enabled' : 'disabled',
    editActionState: () => 'enabled', deleteActionState: () => 'enabled', createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
  })})
  await target.loadFromServer()
  return {dataSet, target}
}

function createHost(dataSet: DataSet) {
  const host = new AiDataEntryHost({dataSet})
  hosts.push(host)
  return host
}

async function enterPrompt(view: DataView, prompt: string): Promise<void> {
  const row = view.currentRow
  if (row === null) throw new Error('host session input row is missing')
  const key = view.getPkKey(row)
  if (key === undefined) throw new Error('host session input row has no local key')
  view.updateEditingValue(key, 'businessPrompt', prompt)
}

describe('AiDataEntryHost persistent owner and attachments', () => {
  it('reuses one same-target session after detach and rejects a second simultaneous attachment', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const first = host.openSession(f.target)
    expect(first.session.targetView).toBe(f.target)
    expect(() => host.openSession(f.target)).toThrow(/attachment|已挂载|附着|活动附件/i)
    await enterPrompt(first.session.input, 'detach后仍保留的提示')
    first.detach()
    expect(host.isDirty).toBe(true)

    const second = host.openSession(f.target)
    expect(second.session).toBe(first.session)
    expect(second.session.turn).toBe(f.dataSet.getView('AiTurnStatus', 'default'))
    expect(second.session.input.getEditingRow('input')?.['businessPrompt']).toBe('detach后仍保留的提示')
    expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(0)
  })

  it('isolates independent DataSets and refuses a pending target change without disposing the original session', async () => {
    const firstData = await createDataSet('SPACE-A')
    const secondData = await createDataSet('SPACE-B')
    const firstHost = createHost(firstData.dataSet)
    const secondHost = createHost(secondData.dataSet)
    const original = firstHost.openSession(firstData.target)
    const independent = secondHost.openSession(secondData.target)
    expect(independent.session).not.toBe(original.session)
    expect(independent.session.turn).toBe(secondData.dataSet.getView('AiTurnStatus', 'default'))

    original.detach()
    await enterPrompt(original.session.input, '保留在原目标的提示')
    const otherTarget = firstData.dataSet.getView('Rows', 'alternate')
    if (otherTarget === undefined) throw new Error('alternate target view is missing')
    expect(() => firstHost.openSession(otherTarget)).toThrow(/未解决|pending|输入|会话/i)
    expect(firstData.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(original.session.targetView).toBe(firstData.target)
    expect(original.session.input.getEditingRow('input')?.['businessPrompt']).toBe('保留在原目标的提示')
  })

  it('maps the exact tenant shortName to the configured Agent and rejects missing or malformed maps', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    await attachment.session.start()

    expect(runtimeState.requests).toHaveLength(2)
    expect(runtimeState.requests[0]).toMatchObject({method: 'GET', url: '/api/ai/v1/agents'})
    expect(runtimeState.requests[1]).toMatchObject({method: 'POST', url: '/api/ai/v1/turns', data: expect.objectContaining({agentId: 'AGENT-TENANT-A'})})

    vi.stubEnv('VITE_AI_DATA_ENTRY_AGENTS', '{}')
    const missing = await createDataSet('SPACE-MISSING')
    const missingHost = createHost(missing.dataSet)
    expect(() => missingHost.openSession(missing.target)).toThrow(/tenant-a|Agent|映射/i)
    vi.stubEnv('VITE_AI_DATA_ENTRY_AGENTS', '{')
    const malformed = await createDataSet('SPACE-MALFORMED')
    const malformedHost = createHost(malformed.dataSet)
    expect(() => malformedHost.openSession(malformed.target)).toThrow(/配置|JSON|映射/i)
  })

  it.each([
    ['tenant', {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-b', 'X-AppId': 'APP-A'}}],
    ['token', {token: 'TOKEN-B', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-A'}}],
    ['application', {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-B'}}],
  ])('rejects a changed %s before creating a turn', async (_label, nextScope) => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    runtimeState.scope = nextScope

    await expect(attachment.session.start()).rejects.toThrow(/范围|租户|身份|scope/i)
    expect(runtimeState.requests).toHaveLength(0)
    expect(attachment.session.targetView).toBe(f.target)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
  })

  it.each([
    ['tenant', {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-b', 'X-AppId': 'APP-A'}}],
    ['token', {token: 'TOKEN-B', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-A'}}],
    ['application', {token: 'TOKEN-A', headers: {'tenant-id': 'tenant-a', 'X-AppId': 'APP-B'}}],
  ])('rejects a changed %s before querying a known turn', async (_label, nextScope) => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    await attachment.session.start()
    const requestCount = runtimeState.requests.length
    runtimeState.scope = nextScope

    await expect(attachment.session.refresh()).rejects.toThrow(/没有返回当前turnId/i)
    expect(runtimeState.requests).toHaveLength(requestCount)
    expect(attachment.session.turn.loadingError?.message).toMatch(/租户、应用或登录身份已变化/i)
    expect(f.dataSet.getView('AiTurnStatus', 'default')).toBe(attachment.session.turn)
    expect(attachment.session.turn.rows).toHaveLength(0)
  })

  it('keeps a known nonterminal turn and its owner when release or target change is requested', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    await attachment.session.start()
    await attachment.session.refresh()
    const alternate = f.dataSet.getView('Rows', 'alternate')
    if (alternate === undefined) throw new Error('alternate target view is missing')

    expect(attachment.session.status).toBe('RUNNING')
    expect(() => host.releaseClean()).toThrow(/待处理|未完成|会话|释放/i)
    attachment.detach()
    expect(() => host.openSession(alternate)).toThrow(/未解决|pending|输入|活动或未终结轮次|会话/i)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
    expect(attachment.session.turn).toBe(f.dataSet.getView('AiTurnStatus', 'default'))
    expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(1)
  })

  it('keeps an unknown create capture when release or target change is requested and never reposts it', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    runtimeState.failUrl = '/api/ai/v1/turns'
    await expect(attachment.session.start()).rejects.toThrow(/未知|核验|待核/i)
    const postCount = runtimeState.requests.filter(request => request.method === 'POST').length
    const alternate = f.dataSet.getView('Rows', 'alternate')
    if (alternate === undefined) throw new Error('alternate target view is missing')

    expect(postCount).toBe(1)
    expect(() => host.releaseClean()).toThrow(/未知|核验|待核/i)
    attachment.detach()
    expect(() => host.openSession(alternate)).toThrow(/未知|核验|待核|结果未知/i)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
    await expect(attachment.session.refresh()).rejects.toThrow(/未知|核验|待核/i)
    expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
  })

  it('refuses release and target change while a command is busy, then reuses the same captured request', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    await enterPrompt(attachment.session.input, '按当前字段生成')
    runtimeState.heldUrl = '/api/ai/v1/turns'
    const start = attachment.session.start()
    await vi.waitFor(() => expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(1))
    const alternate = f.dataSet.getView('Rows', 'alternate')
    if (alternate === undefined) throw new Error('alternate target view is missing')

    expect(attachment.session.busy).toBe(true)
    expect(() => host.releaseClean()).toThrow(/忙|待处理|会话|释放/i)
    attachment.detach()
    expect(() => host.openSession(alternate)).toThrow(/忙|detach|未解决|pending|会话/i)
    expect(f.dataSet.getView('AiTurnRequest', 'default')).toBeDefined()
    expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(1)

    const release = runtimeState.releaseHeld
    if (release === undefined) throw new Error('held request release callback was not registered')
    release()
    await start
    expect(runtimeState.requests.filter(request => request.method === 'POST')).toHaveLength(1)
  })

  it('switches a clean target by removing only temporary views and preserving the shared four turn views', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const original = host.openSession(f.target)
    const turnViews = [
      f.dataSet.getView('AiTurnAgents', 'default'), f.dataSet.getView('AiTurnRequest', 'default'),
      f.dataSet.getView('AiTurnStatus', 'default'), f.dataSet.getView('AiTurnCancel', 'default'),
    ]
    original.detach()
    const alternate = f.dataSet.getView('Rows', 'alternate')
    if (alternate === undefined) throw new Error('alternate target view is missing')

    const next = host.openSession(alternate)

    expect(next.session).not.toBe(original.session)
    expect(next.session.targetView).toBe(alternate)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
    expect([
      f.dataSet.getView('AiTurnAgents', 'default'), f.dataSet.getView('AiTurnRequest', 'default'),
      f.dataSet.getView('AiTurnStatus', 'default'), f.dataSet.getView('AiTurnCancel', 'default'),
    ]).toEqual(turnViews)
  })

  it('allows detach after releaseClean without a second cleanup or session disposal', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    const detach = vi.spyOn(attachment, 'detach')
    let abortCount = 0
    attachment.signal.addEventListener('abort', () => {abortCount++})
    host.releaseClean()
    expect(attachment.signal.aborted).toBe(true)
    expect(() => attachment.detach()).not.toThrow()
    expect(detach).toHaveBeenCalledTimes(2)
    expect(abortCount).toBe(1)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeUndefined()
  })

  it('synchronously revokes attachment cleanup before safely disposing the session', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    const order: string[] = []
    attachment.signal.addEventListener('abort', () => {
      order.push(f.dataSet.getTable('AiDataEntryInput') === undefined ? 'abort-after-dispose' : 'abort-before-dispose')
    })
    const removeTable = f.dataSet.removeTable.bind(f.dataSet)
    vi.spyOn(f.dataSet, 'removeTable').mockImplementation(tableName => {
      order.push(`remove:${tableName}`)
      removeTable(tableName)
    })

    host.releaseClean()

    expect(attachment.signal.aborted).toBe(true)
    expect(order[0]).toBe('abort-before-dispose')
    expect(order.slice(1).sort()).toEqual(['remove:AiDataEntryCandidates', 'remove:AiDataEntryInput'])
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeUndefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeUndefined()
    expect(f.dataSet.getView('AiTurnAgents', 'default')).toBeDefined()
    expect(f.dataSet.getView('AiTurnRequest', 'default')).toBeDefined()
    expect(f.dataSet.getView('AiTurnStatus', 'default')).toBeDefined()
    expect(f.dataSet.getView('AiTurnCancel', 'default')).toBeDefined()
  })

  it('keeps the live attachment and both temporary tables when a candidate relation blocks safe release', async () => {
    const f = await createDataSet('SPACE-A')
    const host = createHost(f.dataSet)
    const attachment = host.openSession(f.target)
    f.dataSet.addResourceRelation({
      parentTable: 'Rows', childTable: 'AiDataEntryCandidates', parentField: 'rowid', childField: 'name',
    })

    expect(() => host.releaseClean()).toThrow(/resourceRelations/)
    expect(attachment.signal.aborted).toBe(false)
    expect(host.isDirty).toBe(false)
    expect(attachment.session.targetView).toBe(f.target)
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
  })
})
