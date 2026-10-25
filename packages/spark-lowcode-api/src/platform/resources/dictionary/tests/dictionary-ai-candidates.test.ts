import {DataView} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it, vi} from 'vitest'
import {AiTurnResource} from '../../../../realtime/ai-turn-resource'
import {DictionaryHttp, fixture} from './dictionary-workspace.fixture'

class DictionaryAiHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: unknown[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const result = this.responses.shift()
    if (result === undefined) throw new Error(`Unexpected request ${config.method} ${config.url}`)
    const value = typeof result === 'function' ? await (result as () => Promise<unknown>)() : result
    return {data: {Code: 200, Result: value}, status: 200, statusText: 'OK', headers: {}}
  }
}

async function fixtureWithAi(dictionaryType = '0', options: {columnOverrides?: Readonly<Record<string, Readonly<Record<string, unknown>>>>; masked?: string[]} = {}) {
  const dictionary = fixture(new DictionaryHttp(), false, 'SCENE', [], {}, options.columnOverrides)
  dictionary.http.records['_Base_DictType']![0]!['dictionaryType'] = dictionaryType
  dictionary.http.masked = options.masked ?? []
  await dictionary.workspace.load()
  const http = new DictionaryAiHttp()
  const aiTurns = new AiTurnResource({dataSet: dictionary.dataSet, http, guard: () => {
    if (dictionary.dataSet.destroyed) throw new Error('AI turn DataSet is destroyed')
  }})
  const {DictionaryAiCandidates} = await import('../dictionary-ai-candidates')
  const candidates = new DictionaryAiCandidates({dataSet: dictionary.dataSet, workspace: dictionary.workspace,
    aiTurns, agentId: 'agent-metadata-admin'})
  candidates.input.updateEditingValue('requirements', 'requirements', '根据已保存字段生成候选条目')
  return {...dictionary, aiHttp: http, aiTurns, candidates}
}

describe('DictionaryAiCandidates native DataSet workflow', () => {
  it('keeps generated preview separate and stages confirmed rows through the original entries view', async () => {
    const f = await fixtureWithAi()
    try {
      f.workspace.entries.updateEditingValue('E1', 'exVal_4', '已有条目草稿')
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.candidates.candidates).toBeInstanceOf(DataView)

      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify([{val: 'AI-1', txt: '建议条目', exVal_1: '#abc', exVal_2: '类别', exVal_3: null, exVal_4: '扩展'}]),
        errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toMatchObject([{val: 'AI-1', txt: '建议条目', exVal_4: '扩展'}])
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)

      await f.candidates.confirm()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(1)
      expect(f.workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('已有条目草稿')
      await f.candidates.confirm()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(1)
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(1)
      expect(f.aiTurns.requests.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.candidates.candidates.rows).toHaveLength(0)
      await f.workspace.saveData()
      expect(f.aiHttp.requests).toHaveLength(3)
      expect(f.http.saves).toHaveLength(1)
      expect(f.http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    } finally { f.dataSet.destroy() }
  })

  it('does not turn a QUEUED or RUNNING acknowledgement into a candidate preview', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: '[{"val":"not-final","txt":"仍在生成"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['invalid json', '{'],
    ['unsupported operation tags', '[[AI_OperateRecord_Start]]create row[[AI_OperateRecord_End]]'],
    ['identity properties', '[{"rowid":"forged","val":"x","txt":"X"}]'],
    ['ordering properties', '[{"ordIdx":1,"val":"x","txt":"X"}]'],
    ['unknown aliases', '[{"value":"x","label":"X"}]'],
    ['nested objects', '[{"val":{"value":"x"},"txt":"X"}]'],
    ['non-finite numeric codes', '[{"val":1e999,"txt":"X"}]'],
  ])('rejects %s as an all-or-none parse failure', async (_reason, assistantDraft) => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft, errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it('keeps only the first normalized duplicate code and preserves empty extension text', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify([{val: ' Blue ', txt: '首条', exVal_1: ''}, {val: 'blue', txt: '重复'}]),
        errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toMatchObject([{val: 'Blue', txt: '首条', exVal_1: ''}])
      expect(f.candidates.duplicateCount).toBe(1)
    } finally { f.dataSet.destroy() }
  })

  it('retains numeric dictionary codes as numbers and skips codes already loaded in entries', async () => {
    const f = await fixtureWithAi('1', {columnOverrides: {val: {type: 'number'}}})
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify([{val: 12.5, txt: '数值编码'}, {val: '00', txt: '已存在编码'}]),
        errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toMatchObject([{val: 12.5, txt: '数值编码'}])
      expect(f.candidates.duplicateCount).toBe(1)
      await f.candidates.confirm()
      const id = [...f.workspace.entries.dirtyTracking.pendingCreateIds][0]
      expect(f.workspace.entries.getEditingRow(id!)?.['val']).toBe(12.5)
    } finally { f.dataSet.destroy() }
  })

  it('enforces the candidate preview output cap without partially publishing rows', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify(Array.from({length: 201}, (_item, index) => ({val: `V${index}`, txt: `条目${index}`}))),
        errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow(/200/)
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })
  it('rejects a response larger than 200 KB without publishing a partial preview', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify([{val: 'AI-1', txt: 'x'.repeat(200 * 1024)}]), errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow(/200 KB/)
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })
  it.each(['agentId', 'conversationId'])('rejects completed turn identity mismatch in %s', async field => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: field === 'conversationId' ? 'C2' : 'C1',
        agentId: field === 'agentId' ? 'other-agent' : 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"错误来源"}]', errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it.each(['agentId', 'conversationId'])('invalidates an existing preview when a later completed GET mismatches %s', async field => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"有效预览"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toHaveLength(1)

      f.aiHttp.responses.push({id: 'T1', conversationId: field === 'conversationId' ? 'C2' : 'C1',
        agentId: field === 'agentId' ? 'other-agent' : 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-2","txt":"身份不匹配"}]', errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow()
      await expect(f.candidates.confirm()).rejects.toThrow()
      expect(f.candidates.canConfirm).toBe(false)
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it.each(['GET failure', 'unknown status'])('does not confirm an old preview after a later %s', async kind => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"有效预览"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      if (kind === 'GET failure') f.aiHttp.responses.push(async () => {throw new Error('turn query failed')})
      else f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'UNKNOWN',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow()
      await expect(f.candidates.confirm()).rejects.toThrow()
      expect(f.candidates.canConfirm).toBe(false)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it('omits a masked dictionary name from the AI prompt', async () => {
    const f = await fixtureWithAi('0', {masked: ['TypeName']})
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      const prompt = String((f.aiHttp.requests.find(request => request.method === 'POST')?.data as {message?: unknown})?.message)
      expect(prompt).not.toContain('••••')
      expect(prompt).not.toContain('配色')
      expect(prompt).toContain('字典名称不可读')
    } finally { f.dataSet.destroy() }
  })

  it('normalizes AI numeric codes to the formal string column before preview, stage, and save', async () => {
    const f = await fixtureWithAi('0', {columnOverrides: {val: {type: 'string'}}})
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":12.5,"txt":"数值候选"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toMatchObject([{val: '12.5'}])
      await f.candidates.confirm()
      const id = [...f.workspace.entries.dirtyTracking.pendingCreateIds][0]
      expect(f.workspace.entries.getEditingRow(id!)?.['val']).toBe('12.5')
      await f.workspace.saveData()
      expect(f.http.records['_Base_DictData']?.find(row => row['val'] === '12.5')).toMatchObject({val: '12.5', txt: '数值候选'})
      expect(f.http.records['_Base_DictData']?.some(row => row['val'] === '12.5')).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('validates the actual value type of direct append input against formal string and number columns', async () => {
    const stringFixture = await fixtureWithAi('0', {columnOverrides: {val: {type: 'string'}}})
    const numberFixture = await fixtureWithAi('1', {columnOverrides: {val: {type: 'number'}}})
    try {
      await expect(stringFixture.workspace.appendEntries([{val: 12.5, txt: '数值不应通过字符串列'}])).rejects.toThrow(/文本|字符串/)
      expect(stringFixture.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      await numberFixture.workspace.appendEntries([{val: 12.5, txt: '有效数字'}])
      const id = [...numberFixture.workspace.entries.dirtyTracking.pendingCreateIds][0]
      expect(numberFixture.workspace.entries.getEditingRow(id!)?.['val']).toBe(12.5)
      await numberFixture.workspace.load(true)
      expect(numberFixture.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(numberFixture.workspace.entries.rows).toHaveLength(1)
    } finally { stringFixture.dataSet.destroy(); numberFixture.dataSet.destroy() }
  })

  it('rejects a number in a formal number column when the actual staged value violates its validator', async () => {
    const f = await fixtureWithAi('1', {columnOverrides: {val: {type: 'number'}}})
    try {
      const append = f.workspace.appendEntries as (values: readonly Readonly<Record<string, unknown>>[]) => Promise<void>
      await expect(append.call(f.workspace, [{val: '12.5', txt: '文本不应伪装为数字'}])).rejects.toThrow(/数字|number/i)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      await f.workspace.load(true)
      expect(f.workspace.entries.rows).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('retains an unknown create capture, refuses retry, and never repeats the POST', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push(async () => { throw new Error('network lost after dispatch') })
      await expect(f.candidates.start()).rejects.toThrow()
      expect(f.aiTurns.requests.hasUnconfirmedSave).toBe(true)
      const postCount = f.aiHttp.requests.filter(request => request.method === 'POST').length
      await expect(f.candidates.start()).rejects.toThrow()
      await expect(f.candidates.refresh()).rejects.toThrow()
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
      expect(f.aiTurns.requests.hasUnconfirmedSave).toBe(true)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it('rejects an invalid later candidate as a whole without touching existing entry drafts', async () => {
    const f = await fixtureWithAi()
    try {
      f.workspace.entries.updateEditingValue('E1', 'exVal_4', '保留原草稿')
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: JSON.stringify([{val: 'AI-1', txt: '有效候选'}, {val: '', txt: '无效候选'}]),
        errorCode: null, errorMessage: null})
      await expect(f.candidates.refresh()).rejects.toThrow()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('保留原草稿')
      expect(f.http.saves).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })
  it('rechecks existing normalized codes immediately before confirmation', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"候选"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      f.workspace.entries.updateEditingValue('E1', 'val', ' ai-1 ')
      await expect(f.candidates.confirm()).rejects.toThrow()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.workspace.entries.getEditingRow('E1')?.['val']).toBe(' ai-1 ')
      expect(f.candidates.candidates.rows).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })
  it('refuses confirmation after a fresh query makes loaded entry codes unreadable', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"候选"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      f.http.hidden = ['val']
      await f.workspace.entries.refresh()
      await expect(f.candidates.confirm()).rejects.toThrow(/编码不可读|不可读/)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.candidates.candidates.rows).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('uses the original entries cancellation and never treats a create ACK as completed candidates', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'RUNNING', acceptedAt: null})
      await f.candidates.start()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      f.aiHttp.responses.push(true)
      await f.candidates.cancel()
      expect(f.aiTurns.cancellations.rows[0]).toMatchObject({turnId: 'T1', requested: true})
      expect(f.aiTurns.cancellations.rows[0]?.['observedStatus']).toBeNull()
      f.candidates.discard()
      expect(f.candidates.pending).toBe(true)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      await expect(f.candidates.start()).rejects.toThrow()
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(2)
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'CANCELLED',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.aiTurns.turns.rows[0]?.['status']).toBe('CANCELLED')
      expect(f.http.saves).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })

  it.each(['FAILED', 'CANCELLED', 'WAITING_APPROVAL', 'WAITING_ATTACHMENT'])('does not publish candidates from %s turns', async status => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status,
        assistantDraft: '[{"val":"AI-1","txt":"不得发布"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('verifies an unknown cancel through the known turn id and never resends cancel', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiHttp.responses.push(async () => { throw new Error('cancel ACK lost') })
      await expect(f.candidates.cancel()).rejects.toThrow()
      expect(f.aiTurns.cancellations.hasUnconfirmedSave).toBe(true)
      expect(f.candidates.shouldAutoRefresh).toBe(false)
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'CANCELLED',
        assistantDraft: null, errorCode: null, errorMessage: null})
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'CANCELLED',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.aiHttp.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      expect(f.aiHttp.requests.filter(request => request.method === 'GET' && String(request.url).includes('/turns/')).length).toBeGreaterThanOrEqual(1)
      expect(f.aiTurns.cancellations.hasUnconfirmedSave).toBe(false)
      expect(f.candidates.candidates.rows).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })

  it('does not accept tool-waiting turns as candidates or submit client tool results', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'WAITING_CLIENT_TOOL',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toHaveLength(0)
      expect(f.aiHttp.requests.some(request => String(request.url).includes('client-result'))).toBe(false)
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('does not auto-refresh an unknown create or retry it on a timer', async () => {
    vi.useFakeTimers()
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push(async () => { throw new Error('lost ACK') })
      await expect(f.candidates.start()).rejects.toThrow()
      const postCount = f.aiHttp.requests.filter(request => request.method === 'POST').length
      await vi.advanceTimersByTimeAsync(15000)
      expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(postCount)
      expect(f.aiTurns.requests.hasUnconfirmedSave).toBe(true)
    } finally { f.dataSet.destroy(); vi.useRealTimers() }
  })

  it('invalidates candidates after the source definition changes without discarding entry drafts', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"建议条目"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      expect(f.candidates.candidates.rows).toHaveLength(1)
      f.workspace.entries.updateEditingValue('E1', 'exVal_4', '业务草稿')
      f.workspace.definition.updateEditingValue('D1', 'TypeName', '新标题草稿')
      expect(f.candidates.canConfirm).toBe(false)
      expect(f.candidates.confirmationError).toContain('字典来源已变化')
      expect(f.candidates.confirmationError).not.toMatch(/\(\d+\/\d+\)/)
      await expect(f.candidates.confirm()).rejects.toThrow()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('业务草稿')
      expect(f.candidates.candidates.rows).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })

  it('reports source invalidation and consumption independently after confirmation', async () => {
    const f = await fixtureWithAi()
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.candidates.start()
      f.aiTurns.turns.queryContext = {turnId: 'T1'}
      f.aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[{"val":"AI-1","txt":"建议条目"}]', errorCode: null, errorMessage: null})
      await f.candidates.refresh()
      await f.candidates.confirm()

      f.workspace.definition.updateEditingValue('D1', 'TypeName', '变更后的来源')

      expect(f.candidates.confirmationError).toContain('字典来源已变化')
      expect(f.candidates.confirmationError).toContain('已确认或已消费')
      expect(f.candidates.canConfirm).toBe(false)
      expect(f.candidates.candidates.rows).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })

  it('drops a delayed response after disposal and leaves the originating entries untouched', async () => {
    const f = await fixtureWithAi()
    let release!: (value: unknown) => void
    try {
      f.aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      f.aiHttp.responses.push(() => new Promise(resolve => {release = resolve}))
      const start = f.candidates.start()
      await vi.waitFor(() => expect(f.aiHttp.requests.filter(request => request.method === 'POST')).toHaveLength(1))
      f.candidates.dispose()
      release({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await expect(start).rejects.toThrow()
      expect(f.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(f.candidates.candidates.rows).toHaveLength(0)
    } finally { f.dataSet.destroy() }
  })
})
