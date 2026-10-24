import {DataSet, type DataColumn, type DataView} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it, vi} from 'vitest'

type Row = Record<string, unknown>
type QueuedResponse = Readonly<{kind: 'value'; value: unknown}> | Readonly<{kind: 'async'; run: () => Promise<unknown>}>

class AiEntryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: QueuedResponse[] = []

  constructor() { super({retry: 2, retryDelay: 0}) }

  respond(value: unknown): void { this.responses.push({kind: 'value', value}) }
  respondAsync(run: () => Promise<unknown>): void { this.responses.push({kind: 'async', run}) }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected request ${config.method} ${config.url}`)
    const body = response.kind === 'async' ? await response.run() : response.value
    const data = typeof body === 'object' && body !== null && 'Code' in body ? body : {Code: 200, Result: body}
    return {data, status: 200, statusText: 'OK', headers: {}}
  }
}

const itemColumns: DataColumn[] = [
  {name: 'id', type: 'string', isPrimaryKey: true},
  {name: 'name', type: 'varchar', label: '名称', allowAIAdd: true},
  {name: 'candidateKey', type: 'string', allowAIAdd: true},
  {name: 'amount', type: 'number', allowAIAdd: true},
  {name: 'count', type: 'integer', required: true, allowAIAdd: true},
  {name: 'manualRequired', type: 'string', required: true},
]

function createAdapter(expectedTarget: DataView) {
  let appendCalls = 0
  let failAppendAt: number | undefined
  return {
    setFailAppendAt(index: number): void { failAppendAt = index },
    readContext(targetView: DataView) {
      if (targetView !== expectedTarget) throw new Error('adapter target mismatch')
      return {modelName: targetView.tableName}
    },
    validateBatch(targetView: DataView, _rows: readonly Row[]): void {
      if (targetView !== expectedTarget) throw new Error('adapter target mismatch')
    },
    async appendBatch(targetView: DataView, rows: readonly Row[]): Promise<void> {
      if (targetView !== expectedTarget) throw new Error('adapter target mismatch')
      for (const row of rows) {
        appendCalls++
        if (failAppendAt === appendCalls) throw new Error('simulated append failure')
        await targetView.addRow(row)
      }
    },
    appendCount(): number { return appendCalls },
  }
}

async function createSession(options: {
  commitMode?: 'staged' | 'immediate'
  useAdapter?: boolean
  model?: Readonly<{tableName: string; modelId: string; columns: DataColumn[]}>
} = {}) {
  const {AiDataEntrySession} = await import('./ai-data-entry-session')
  const {AiTurnResource} = await import('../ai-turn-resource')
  const model = options.model ?? {tableName: 'Items', modelId: 'MODEL-ITEMS', columns: itemColumns}
  const dataSet = DataSet.fromJson({scenarioId: 'AI-ENTRY-SESSION', tables: {[model.tableName]: {
    tableName: model.tableName, modelBinding: {modelId: model.modelId, modelName: model.tableName},
    columns: model.columns.map(column => ({...column})),
    views: {default: {commitMode: options.commitMode ?? 'staged'}, alternate: {commitMode: 'staged'}},
  }}})
  const targetView = dataSet.getView(model.tableName, 'default')
  if (targetView === undefined) throw new Error('AI entry target DataView fixture was not created')
  let valid = true
  const guard = () => { if (!valid) throw new Error('AI entry scope expired') }
  const http = new AiEntryHttp()
  const turnResource = new AiTurnResource({dataSet, http, guard})
  const readonlyFields = new Set<string>()
  const targetSaveBatches: Row[][] = []
  const bindTargetQuery = async (view: DataView) => {
    view.bindQueryExecutor({executeQuery: async (_view, _params) => ({
      rows: [{id: 'existing', name: 'existing'}], total: 1,
      assertIdentity: identity => {
        if (identity.scenarioId !== 'AI-ENTRY-SESSION' || identity.metaName !== model.tableName) throw new Error('target identity mismatch')
      },
      rowKey: row => row['id'],
      prepareNewRow: row => ({...row, id: `draft-${crypto.randomUUID()}`}),
      isFieldReadOnly: field => readonlyFields.has(field),
      fieldAccess: () => ({read: 'visible', write: 'allowed', required: false, component: 'editable', writeMode: 'editable'}),
      readFieldAccess: () => 'visible',
      addActionState: available => available ? 'enabled' : 'disabled',
      editActionState: () => 'enabled', deleteActionState: () => 'enabled',
      createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
    }), save: async command => command.changes.map(change => {
      const added = change.changes.added ?? []
      targetSaveBatches.push(added.map(row => ({...row})))
      return {
        metaName: change.identity.metaName,
        added,
        changed: change.changes.changed ?? [],
        deleted: change.changes.deleted ?? [],
        changedFields: (change.changes.changed ?? []).map(() => []),
        context: change.context,
      }
    })})
    await view.loadFromServer()
  }
  if (targetView.commitMode === 'staged') await bindTargetQuery(targetView)
  const adapter = createAdapter(targetView)
  const session = new AiDataEntrySession({dataSet, targetView, turnResource, agentId: 'AGENT-ENTRY',
    ...(options.useAdapter ? {adapter} : {})})
  const selector = (view: {tableName: string; viewId: string}) => ({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {dataSet, targetView, turnResource, session, adapter, http, guard, targetSaveBatches, invalidate: () => {valid = false}, selector,
    bindTargetQuery, readonlyFields, AiDataEntrySession}
}

async function enterPrompt(session: {input: DataView}, businessPrompt: string): Promise<void> {
  const input = session.input.currentRow
  if (input === null) throw new Error('Stable input currentRow was not initialized')
  const key = input[session.input.primaryKey]
  if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Stable input primary key was missing')
  session.input.updateEditingValue(key, 'businessPrompt', businessPrompt)
  expect(session.input.getEditingRow(key)?.['businessPrompt']).toBe(businessPrompt)
}

function enqueueSuccessfulStart(http: AiEntryHttp, turnId: string, draft: string, status = 'COMPLETED'): void {
  http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
  http.respond({conversationId: `CONV-${turnId}`, turnId, status: 'QUEUED', acceptedAt: null})
  http.respond({id: turnId, conversationId: `CONV-${turnId}`, agentId: 'AGENT-ENTRY', status,
    assistantDraft: draft, errorCode: null, errorMessage: null})
}

async function startAndRefresh(f: Awaited<ReturnType<typeof createSession>>, turnId: string, draft: string): Promise<void> {
  await enterPrompt(f.session, '按当前字段生成')
  enqueueSuccessfulStart(f.http, turnId, draft)
  await f.session.start()
  await f.session.refresh()
}

describe('AiDataEntrySession native DataSet contract', () => {
  it('requires staged target mode and does not rewrite an immediate target configuration', async () => {
    const {AiDataEntrySession} = await import('./ai-data-entry-session')
    const {AiTurnResource} = await import('../ai-turn-resource')
    const dataSet = DataSet.fromJson({scenarioId: 'AI-ENTRY-IMMEDIATE', tables: {Items: {
      tableName: 'Items', columns: itemColumns, views: {default: {commitMode: 'immediate'}},
    }}})
    const targetView = dataSet.getView('Items', 'default')
    if (targetView === undefined) throw new Error('Immediate target fixture was not created')
    const http = new AiEntryHttp()
    const turnResource = new AiTurnResource({dataSet, http, guard: () => undefined})
    const adapter = createAdapter(targetView)
    try {
      expect(() => new AiDataEntrySession({dataSet, targetView, turnResource, agentId: 'AGENT-ENTRY', adapter})).toThrow()
      expect(targetView.commitMode).toBe('immediate')
      expect(dataSet.getTable('AiDataEntryInput')).toBeUndefined()
      expect(dataSet.getTable('AiDataEntryCandidates')).toBeUndefined()
      expect(http.requests).toHaveLength(0)
    } finally { dataSet.destroy() }
  })

  it('uses the current input DataView prompt and refreshes the exact configured Agent before creating a turn', async () => {
    const f = await createSession()
    const save = vi.spyOn(f.dataSet, 'saveChanges')
    try {
      await enterPrompt(f.session, '新增一个名称为候选物料、数量为4的条目')
      expect(f.session.canStart).toBe(true)
      expect(f.session.pending).toBe(true)
      expect(f.session.blocksWorkspace).toBe(false)
      enqueueSuccessfulStart(f.http, 'TURN-1', '{"entries":[{"name":"候选物料","candidateKey":"CK-1","amount":4,"count":2}]}')
      await f.session.start()

      expect(f.session.targetView).toBe(f.targetView)
      expect(f.session.input.currentRow?.[f.session.input.primaryKey]).toBe('input')
      expect(f.session.input).toBe(f.dataSet.getView(f.session.input.tableName, f.session.input.viewId))
      expect(f.session.candidates).toBe(f.dataSet.getView(f.session.candidates.tableName, f.session.candidates.viewId))
      expect(f.http.requests.map(request => [request.method, request.url])).toEqual([
        ['GET', '/api/ai/v1/agents'], ['POST', '/api/ai/v1/turns'],
      ])
      expect(f.session.status).toBeUndefined()
      expect(f.session.blocksWorkspace).toBe(true)
      expect(f.session.canStart).toBe(false)
      expect(f.session.canRefresh).toBe(true)
      expect(f.session.canCancel).toBe(true)
      expect(f.session.shouldAutoRefresh).toBe(true)
      const inputRow = f.session.input.currentRow
      if (inputRow === null) throw new Error('Input row was missing after start')
      expect(f.session.input.fieldAccess(inputRow, 'businessPrompt').read).toBe('visible')
      expect(f.session.input.fieldAccess(inputRow, 'businessPrompt').write).toBe('allowed')
      const inputId = f.session.input.getPkKey(inputRow)
      if (typeof inputId !== 'string' && typeof inputId !== 'number') throw new Error('Input key was missing after start')
      expect(f.session.input.getEditingRow(inputId)?.['businessPrompt']).toBe('新增一个名称为候选物料、数量为4的条目')
      const requestBody = f.http.requests[1]?.data
      if (typeof requestBody !== 'object' || requestBody === null || !('message' in requestBody)) throw new Error('No turn message')
      const message = String(requestBody['message'])
      expect(message).toContain('新增一个名称为候选物料、数量为4的条目')
      expect(message).toContain('allowedFields')
      expect(message).toContain('name')
      expect(message).toContain('amount')
      expect(message).not.toContain('systemPrompt')
      expect(message).not.toContain('manualRequired')
      expect(save).toHaveBeenCalledTimes(1)

      await f.session.refresh()
      expect(f.session.status).toBe('COMPLETED')
      expect(f.session.candidates.rows).toHaveLength(1)
      expect(f.session.candidates.fieldAccess(f.session.candidates.rows[0]!, 'name').write).toBe('denied')
      expect(f.session.pending).toBe(true)
      expect(f.session.blocksWorkspace).toBe(false)
      expect(f.session.canConfirm).toBe(true)
      expect(f.session.shouldAutoRefresh).toBe(false)
      await f.session.confirm()
      expect(f.session.candidates.rows).toEqual([])
      expect(f.session.input.hasEditingChanges()).toBe(false)
      expect(f.targetView.rows).toContainEqual(expect.objectContaining({name: '候选物料', candidateKey: 'CK-1', amount: 4, count: 2}))
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(save).toHaveBeenCalledTimes(1)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)

      const draftRow = f.targetView.rows.find(row => row['name'] === '候选物料')
      if (draftRow === undefined) throw new Error('Confirmed draft row was not found')
      expect(draftRow).not.toHaveProperty('manualRequired')
      await expect(f.dataSet.saveChanges(f.selector(f.targetView))).rejects.toThrow(/manualRequired/)
      expect(f.targetSaveBatches).toHaveLength(0)
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(true)
      const draftId = draftRow[f.targetView.primaryKey]
      if (typeof draftId !== 'string' && typeof draftId !== 'number') throw new Error('Draft row primary key was missing')
      expect(f.targetView.updateRowById(draftId, {manualRequired: '手工补齐'})).toBe(true)
      await f.dataSet.saveChanges(f.selector(f.targetView))
      expect(f.targetSaveBatches).toHaveLength(1)
      expect(f.targetSaveBatches[0]).toContainEqual(expect.objectContaining({manualRequired: '手工补齐'}))
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('notifies subscribed hosts from native DataView and session state changes until unsubscribed', async () => {
    const f = await createSession()
    try {
      const listener = vi.fn()
      const unsubscribe = f.session.subscribe(listener)
      await enterPrompt(f.session, 'generate')
      expect(listener).toHaveBeenCalled()
      const callsBeforeStart = listener.mock.calls.length
      enqueueSuccessfulStart(f.http, 'TURN-SUBSCRIBE', '{"entries":[]}')
      await f.session.start()
      expect(listener.mock.calls.length).toBeGreaterThan(callsBeforeStart)
      unsubscribe()
      const callsBeforeEdit = listener.mock.calls.length
      await enterPrompt(f.session, 'updated prompt')
      expect(listener.mock.calls).toHaveLength(callsBeforeEdit)
    } finally { f.dataSet.destroy() }
  })

  it('refuses to create a turn when exact Agent catalog readback is missing the configured ID', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      f.http.respond([{id: 'ANOTHER-AGENT', agentName: 'other', description: null}])
      await expect(f.session.start()).rejects.toThrow()
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({method: 'GET', url: '/api/ai/v1/agents'})
      expect(f.http.requests.some(request => request.method === 'POST')).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('allows explicit discard after a definite create refusal and permits a fresh start without replaying the rejected POST', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'first attempt')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respond({Code: 1004, Message: 'Agent unavailable'})
      await expect(f.session.start()).rejects.toThrow()
      expect(f.turnResource.requests.hasUnconfirmedSave).toBe(false)
      expect(f.turnResource.requests.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)

      await f.session.discard()
      expect(f.turnResource.requests.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.session.input.hasEditingChanges()).toBe(false)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)

      await enterPrompt(f.session, 'second attempt')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respond({conversationId: 'CONV-RETRY', turnId: 'TURN-RETRY', status: 'QUEUED', acceptedAt: null})
      await f.session.start()
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(2)
      expect(f.turnResource.requests.hasUnconfirmedSave).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('keeps status reads and permits an explicit retry of the same cancel command after definite refusal', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respond({conversationId: 'CONV-CANCEL-REFUSED', turnId: 'TURN-CANCEL-REFUSED', status: 'QUEUED', acceptedAt: null})
      await f.session.start()

      f.http.respond({id: 'TURN-CANCEL-REFUSED', conversationId: 'CONV-CANCEL-REFUSED', agentId: 'AGENT-ENTRY', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.session.status).toBe('RUNNING')

      f.http.respond({Code: 1004, Message: 'Cancellation refused'})
      const appendCancellationRow = vi.spyOn(f.turnResource.cancellations, 'addRow')
      await expect(f.session.cancel()).rejects.toThrow()
      expect(f.turnResource.cancellations.hasUnconfirmedSave).toBe(false)
      expect(f.turnResource.cancellations.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      const pendingOperationIds = [...f.turnResource.cancellations.dirtyTracking.pendingCreateIds]
      expect(pendingOperationIds).toHaveLength(1)
      const operationId = pendingOperationIds[0]
      if (typeof operationId !== 'string') throw new Error('Expected the failed cancel command operationId')
      expect(f.turnResource.cancellations.rows).toContainEqual(expect.objectContaining({operationId, turnId: 'TURN-CANCEL-REFUSED'}))
      expect(f.session.canCancel).toBe(true)

      f.http.respond({id: 'TURN-CANCEL-REFUSED', conversationId: 'CONV-CANCEL-REFUSED', agentId: 'AGENT-ENTRY', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.session.status).toBe('RUNNING')
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)

      f.http.respond(true)
      await f.session.cancel()
      expect(f.turnResource.cancellations.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.turnResource.cancellations.rows.filter(row => row['turnId'] === 'TURN-CANCEL-REFUSED')).toHaveLength(1)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(2)
      expect(appendCancellationRow).toHaveBeenCalledTimes(1)
      expect(f.turnResource.cancellations.rows).toContainEqual(expect.objectContaining({operationId, turnId: 'TURN-CANCEL-REFUSED'}))

      f.http.respond({id: 'TURN-CANCEL-REFUSED', conversationId: 'CONV-CANCEL-REFUSED', agentId: 'AGENT-ENTRY', status: 'CANCELLING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.session.status).toBe('CANCELLING')
      await expect(f.session.discard()).rejects.toThrow(/活动AI轮次/)

      f.http.respond({id: 'TURN-CANCEL-REFUSED', conversationId: 'CONV-CANCEL-REFUSED', agentId: 'AGENT-ENTRY', status: 'COMPLETED',
        assistantDraft: '{"entries":[]}', errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.session.status).toBe('COMPLETED')
      await f.session.discard()
      expect(f.turnResource.cancellations.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(2)
    } finally { f.dataSet.destroy() }
  })

  it('allows terminal status readback before discarding a definite cancel refusal without retrying it', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respond({conversationId: 'CONV-CANCEL-TERMINAL', turnId: 'TURN-CANCEL-TERMINAL', status: 'QUEUED', acceptedAt: null})
      await f.session.start()
      f.http.respond({id: 'TURN-CANCEL-TERMINAL', conversationId: 'CONV-CANCEL-TERMINAL', agentId: 'AGENT-ENTRY', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      f.http.respond({Code: 1004, Message: 'Cancellation refused'})
      await expect(f.session.cancel()).rejects.toThrow()
      expect(f.turnResource.cancellations.hasUnconfirmedSave).toBe(false)

      f.http.respond({id: 'TURN-CANCEL-TERMINAL', conversationId: 'CONV-CANCEL-TERMINAL', agentId: 'AGENT-ENTRY', status: 'COMPLETED',
        assistantDraft: '{"entries":[]}', errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.session.status).toBe('COMPLETED')
      await f.session.discard()
      expect(f.turnResource.cancellations.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('preflights nested relation references before removing either session table', async () => {
    const f = await createSession()
    try {
      f.dataSet.addTable('RelatedItems', [{name: 'id', type: 'string', isPrimaryKey: true}])
      f.dataSet.addResourceRelation({parentTable: 'Items', childTable: 'RelatedItems', filterExpression: {
        field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'AiDataEntryCandidates',
          RefFieldName: 'name', FkFieldName: 'id'},
      }})

      expect(() => f.session.dispose()).toThrow(/resourceRelations/)
      expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
      expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
      expect(f.dataSet.getView('AiDataEntryInput')).toBe(f.session.input)
      expect(f.dataSet.getView('AiDataEntryCandidates')).toBe(f.session.candidates)
      expect(f.session.input.destroyed).toBe(false)
      expect(f.session.candidates.destroyed).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['array envelope', '[{"name":"invalid"}]'],
    ['extra key', '{"entries":[{"name":"valid","count":1,"unexpected":"reject"}]}'],
    ['non-finite number', '{"entries":[{"name":"valid","count":1,"amount":1e999}]}'],
    ['fractional integer', '{"entries":[{"name":"valid","count":1.5}]}'],
    ['missing AI-required field', '{"entries":[{"name":"valid"}]}'],
    ['empty envelope', '{"entries":[]}'],
    ['more than 200 rows', JSON.stringify({entries: Array.from({length: 201}, () => ({name: 'x', count: 1}))})],
    ['over 200 KB', JSON.stringify({entries: [{name: 'x'.repeat(201 * 1024), count: 1}]})],
  ])('rejects or withholds candidates for %s during refresh, before confirm', async (_label, draft) => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      enqueueSuccessfulStart(f.http, 'TURN-BAD', draft)
      await f.session.start()
      if (_label === 'empty envelope') {
        await f.session.refresh()
        expect(f.session.candidates.rows).toEqual([])
        await expect(f.session.confirm()).rejects.toThrow()
      } else {
        await expect(f.session.refresh()).rejects.toThrow()
        expect(f.session.candidates.rows).toEqual([])
      }
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('preflights every entry before the first target add when a later entry has an extra field', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      enqueueSuccessfulStart(f.http, 'TURN-BATCH', '{"entries":[{"name":"valid","count":1},{"name":"invalid","count":2,"extra":true}]}')
      await f.session.start()
      const addRow = vi.spyOn(f.targetView, 'addRow')
      await expect(f.session.refresh()).rejects.toThrow()
      expect(addRow).not.toHaveBeenCalled()
      expect(f.session.candidates.rows).toEqual([])
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['Items', 'MODEL-ITEMS', itemColumns, '{"entries":[{"name":"bolt","amount":2,"count":1}]}', ['name', 'amount', 'count']],
    ['Vendors', 'MODEL-VENDORS', [
      {name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'vendorCode', type: 'string', allowAIAdd: true},
      {name: 'region', type: 'string', allowAIAdd: true},
    ], '{"entries":[{"vendorCode":"V-1","region":"North"}]}', ['vendorCode', 'region']],
  ])('reuses the same field/session contract for unrelated model %s', async (tableName, modelId, columns, draft, allowedNames) => {
    const f = await createSession({model: {tableName, modelId, columns}})
    try {
      await enterPrompt(f.session, '按本模型录入')
      enqueueSuccessfulStart(f.http, 'TURN-MODEL', draft)
      await f.session.start()
      const message = String(f.http.requests[1]?.data && typeof f.http.requests[1]?.data === 'object'
        && 'message' in f.http.requests[1].data ? f.http.requests[1].data['message'] : '')
      for (const field of allowedNames) expect(message).toContain(field)
      expect(message).not.toContain(tableName === 'Items' ? 'vendorCode' : 'manualRequired')
      await f.session.refresh()
      await f.session.confirm()
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('rechecks schema flags, field write permission and query identity before confirmation', async () => {
    for (const change of ['allowAIAdd', 'permission', 'queryContext']) {
      const f = await createSession()
      try {
        await startAndRefresh(f, `TURN-${change}`, '{"entries":[{"name":"stale","count":1}]}')
        if (change === 'allowAIAdd') {
          const name = f.targetView.columns.find(column => column.name === 'name')
          if (name === undefined) throw new Error('Expected formal name column')
          name.allowAIAdd = false
        } else if (change === 'permission') f.readonlyFields.add('name')
        else f.targetView.queryContext = {scope: 'changed-before-confirm'}
        await expect(f.session.confirm()).rejects.toThrow()
        expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(false)
      } finally { f.dataSet.destroy() }
    }
  })

  it('continues formal status reads after target schema changes but withholds stale candidates', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      enqueueSuccessfulStart(f.http, 'TURN-STALE-TARGET', '{"entries":[{"name":"stale","count":1}]}')
      await f.session.start()
      const name = f.targetView.columns.find(column => column.name === 'name')
      if (name === undefined) throw new Error('Expected formal name column')
      name.allowAIAdd = false
      await f.session.refresh()
      expect(f.session.status).toBe('COMPLETED')
      expect(f.session.candidates.rows).toEqual([])
      expect(f.session.canConfirm).toBe(false)
      expect(f.session.confirmationError).toMatch(/目标字段|权限|查询/)
      expect(f.session.pending).toBe(true)
      expect(f.session.blocksWorkspace).toBe(false)
      expect(f.http.requests.filter(request => request.method === 'GET' && String(request.url).includes('/turns/'))).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('does not fingerprint unrelated local rows as schema and does not reuse a temporary primary-key name', async () => {
    const f = await createSession()
    try {
      await startAndRefresh(f, 'TURN-ROWS', '{"entries":[{"name":"candidate","count":1}]}')
      expect(f.session.pending).toBe(true)
      expect(f.session.blocksWorkspace).toBe(false)
      const tempKeys = f.session.candidates.columns.filter(column => column.isPrimaryKey).map(column => column.name)
      expect(tempKeys.length).toBeGreaterThan(0)
      expect(tempKeys.some(key => f.targetView.columns.some(column => column.name === key))).toBe(false)
      f.targetView.updateEditingValue('existing', 'name', 'local unrelated edit')
      await f.session.confirm()
      expect(f.targetView.rows).toContainEqual(expect.objectContaining({name: 'candidate', count: 1}))
      expect(f.targetView.getEditingRow('existing')).toMatchObject({id: 'existing', name: 'local unrelated edit'})
      expect(f.targetView.rows).toContainEqual(expect.objectContaining({id: 'existing', name: 'existing'}))
    } finally { f.dataSet.destroy() }
  })

  it('marks a batch consumed before append and never re-adds partial drafts after append failure', async () => {
    const f = await createSession({useAdapter: true})
    try {
      await startAndRefresh(f, 'TURN-PARTIAL', '{"entries":[{"name":"first","count":1},{"name":"second","count":2}]}')
      f.adapter.setFailAppendAt(2)
      const addRow = vi.spyOn(f.targetView, 'addRow')
      await expect(f.session.confirm()).rejects.toThrow(/partial|append|加入/i)
      expect(f.targetView.rows).toContainEqual(expect.objectContaining({name: 'first'}))
      expect(f.adapter.appendCount()).toBe(2)
      await expect(f.session.confirm()).rejects.toThrow()
      expect(f.adapter.appendCount()).toBe(2)
      expect(addRow).toHaveBeenCalledTimes(1)
      expect(f.targetView.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('reopens safely on a second target while preserving the same four turn views and removing only session tables', async () => {
    const f = await createSession()
    try {
      const turns = [f.turnResource.agents, f.turnResource.requests, f.turnResource.turns, f.turnResource.cancellations]
      const inputTable = f.session.input.tableName
      const candidatesTable = f.session.candidates.tableName
      await f.session.discard()
      f.session.dispose()
      expect(f.dataSet.getTable(inputTable)).toBeUndefined()
      expect(f.dataSet.getTable(candidatesTable)).toBeUndefined()
      expect([f.dataSet.getView('AiTurnAgents'), f.dataSet.getView('AiTurnRequest'),
        f.dataSet.getView('AiTurnStatus'), f.dataSet.getView('AiTurnCancel')]).toEqual(turns)

      const secondTarget = f.dataSet.getView('Items', 'alternate')
      if (secondTarget === undefined) throw new Error('Second target view was not created')
      await f.bindTargetQuery(secondTarget)
      const adapter = createAdapter(secondTarget)
      const reopened = new f.AiDataEntrySession({dataSet: f.dataSet, targetView: secondTarget,
        turnResource: f.turnResource, agentId: 'AGENT-ENTRY', adapter})
      expect(reopened.targetView).toBe(secondTarget)
      expect(f.dataSet.getTable(inputTable)).toBeDefined()
      expect(f.dataSet.getTable(candidatesTable)).toBeDefined()
      expect([f.dataSet.getView('AiTurnAgents'), f.dataSet.getView('AiTurnRequest'),
        f.dataSet.getView('AiTurnStatus'), f.dataSet.getView('AiTurnCancel')]).toEqual(turns)
    } finally { f.dataSet.destroy() }
  })

  it('retains turn owner and unknown capture when an in-flight start loses scope', async () => {
    const f = await createSession()
    let release: ((value: unknown) => void) | undefined
    try {
      await enterPrompt(f.session, 'generate')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respondAsync(() => new Promise(resolve => { release = resolve }))
      const start = f.session.start()
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(2))
      f.invalidate()
      const complete = release
      if (complete === undefined) throw new Error('Expected a pending turn create response')
      complete({conversationId: 'CONV-STALE', turnId: 'TURN-STALE', status: 'QUEUED', acceptedAt: null})
      await expect(start).rejects.toThrow()
      expect(f.turnResource.requests.hasUnconfirmedSave).toBe(true)
      await expect(f.session.discard()).rejects.toThrow(/待核验/)
      expect(() => f.session.dispose()).toThrow()
      const postCount = f.http.requests.filter(request => request.method === 'POST').length
      await expect(f.session.refresh()).rejects.toThrow()
      expect(f.turnResource.requests.hasUnconfirmedSave).toBe(true)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
      await expect(f.session.start()).rejects.toThrow()
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
      expect(f.dataSet.getTable('AiTurnRequest')).toBeDefined()
      expect(f.dataSet.getTable('AiTurnCancel')).toBeDefined()
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('keeps a cancellation unknown busy and does not POST it again during retry or disposal', async () => {
    const f = await createSession()
    try {
      await enterPrompt(f.session, 'generate')
      f.http.respond([{id: 'AGENT-ENTRY', agentName: '通用录入', description: null}])
      f.http.respond({conversationId: 'CONV-CANCEL', turnId: 'TURN-CANCEL', status: 'RUNNING', acceptedAt: null})
      await f.session.start()
      f.http.respond({id: 'TURN-CANCEL', conversationId: 'CONV-CANCEL', agentId: 'AGENT-ENTRY', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(() => f.session.dispose()).toThrow()
      f.http.respondAsync(async () => { throw new Error('connection lost after cancel dispatch') })
      await expect(f.session.cancel()).rejects.toThrow()
      expect(f.turnResource.cancellations.hasUnconfirmedSave).toBe(true)
      await expect(f.session.discard()).rejects.toThrow(/待核验/)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      const postCount = f.http.requests.filter(request => request.method === 'POST').length
      await expect(f.session.cancel()).rejects.toThrow()
      expect(() => f.session.dispose()).toThrow()
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      f.http.respond({id: 'TURN-CANCEL', conversationId: 'CONV-CANCEL', agentId: 'AGENT-ENTRY', status: 'CANCELLING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      f.http.respond({id: 'TURN-CANCEL', conversationId: 'CONV-CANCEL', agentId: 'AGENT-ENTRY', status: 'CANCELLING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.session.refresh()
      expect(f.turnResource.cancellations.hasUnconfirmedSave).toBe(false)
      expect(f.session.status).toBe('CANCELLING')
      expect(f.session.canCancel).toBe(false)
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })
})
