import {expect, it, vi} from 'vitest'
import {ProjectWorkspace} from '../../src/project/project-workspace'
import {createScenarioSubmissionJournal} from '../../src/scenario/scenario-submission-journal'

const baseline = JSON.stringify({scenarioId: 'S', tables: {}})
const submitted = JSON.stringify({scenarioId: 'S', tables: {Facts: {modelBinding: {modelId: 'M', modelName: 'Facts'}, views: {default: {commitMode: 'staged'}}}}})
function storage() {
  const values = new Map<string, string>()
  return {get length() {return values.size}, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value)}, removeItem: (key: string) => {values.delete(key)}}
}

it.each([true, false])('recovers the original file capture after reload without another write; applied=%s', async applied => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'tenant/user/app')
  let remote = baseline
  const write = vi.fn(async () => {
    expect(journal.read('S')).toMatchObject({text: submitted, baseline})
    if (applied) remote = submitted
    throw Error('lost response')
  })
  const create = () => new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {
    readScope: () => 'scope', readText: async () => remote, writeText: write, submissionJournal: journal,
  }})
  const first = create(), original = await first.loadScenarioViews({scenarioId: 'S'})
  original.setText(submitted)
  await expect(first.saveScenarioViews({scenarioId: 'S'})).rejects.toThrow('lost response')
  first.dispose()
  const reopened = create(), recovered = await reopened.loadScenarioViews({scenarioId: 'S'})
  expect(recovered.saveStatus).toBe('unknown')
  expect(recovered.submission).toEqual({text: submitted, baseline})
  await expect(reopened.saveScenarioViews({scenarioId: 'S'})).rejects.toThrow('核验')
  if (applied) {
    await expect(reopened.verifyScenarioViews({scenarioId: 'S'})).resolves.toBe('confirmed')
    expect(journal.read('S')).toBeNull()
  } else {
    await expect(reopened.verifyScenarioViews({scenarioId: 'S'})).rejects.toThrow('不能证明')
    expect(journal.read('S')).toMatchObject({text: submitted, baseline})
    expect(recovered.saveStatus).toBe('unknown')
  }
  expect(write).toHaveBeenCalledTimes(1)
})

it('partitions captures by authenticated owner and refuses storage failure before dispatch', async () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'tenant/user/app')
  journal.begin('S', submitted, baseline)
  expect(createScenarioSubmissionJournal(store, 'tenant/other/app').read('S')).toBeNull()
  expect(createScenarioSubmissionJournal(store, 'tenant/user/other').read('S')).toBeNull()
  const failed = createScenarioSubmissionJournal({...store, setItem: () => {throw Error('quota')}}, 'next')
  const write = vi.fn(async () => {})
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {
    readScope: () => 'scope', readText: async () => baseline, writeText: write, submissionJournal: failed,
  }})
  const file = await workspace.loadScenarioViews({scenarioId: 'S'}); file.setText(submitted)
  await expect(workspace.saveScenarioViews({scenarioId: 'S'})).rejects.toThrow('quota')
  expect(write).not.toHaveBeenCalled()
})

it('keeps an unknown capture immutable and refuses replacement or a foreign settlement', () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'owner')
  const original = journal.begin('S', submitted, baseline)
  expect(Object.isFrozen(journal.read('S'))).toBe(true)
  expect(() => journal.begin('S', baseline, baseline)).toThrow('不能覆盖')
  expect(() => journal.settle({...original, attemptId: 'another'}, 'confirmed')).toThrow('另一笔')
  expect(journal.read('S')?.attemptId).toBe(original.attemptId)
})

it('rejects corrupted records rather than assuming there is no pending write', () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'owner')
  const capture = journal.begin('S', submitted, baseline)
  store.setItem(`${JSON.stringify(['spark:scenario-submission:v1', 'owner', 'S'])}:${capture.attemptId}`, '{"scenarioId":"OTHER"}')
  expect(() => journal.read('S')).toThrow('恢复记录')
  expect(() => journal.begin('S', submitted, baseline)).toThrow('恢复记录')
})

it('preserves a racing tab capture and stops the current attempt before dispatch', async () => {
  const store = storage(), prefix = `${JSON.stringify(['spark:scenario-submission:v1', 'owner', 'S'])}:`
  let inject = true
  const journal = createScenarioSubmissionJournal({get length() {return store.length}, key: store.key, getItem: store.getItem, removeItem: store.removeItem,
    setItem: (key, value) => {
      store.setItem(key, value)
      if (inject) {
        inject = false
        store.setItem(`${prefix}other-tab`, JSON.stringify({attemptId: 'other-tab', scenarioId: 'S', text: submitted, baseline, state: 'unknown'}))
      }
    }}, 'owner')
  const write = vi.fn(async () => {})
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {
    readScope: () => 'scope', readText: async () => baseline, writeText: write, submissionJournal: journal,
  }})
  const file = await workspace.loadScenarioViews({scenarioId: 'S'}); file.setText(submitted)
  await expect(workspace.saveScenarioViews({scenarioId: 'S'})).rejects.toThrow('未派发')
  expect(write).not.toHaveBeenCalled()
  expect(store.length).toBe(2)
  expect(journal.read('S')?.attemptId).toBe('other-tab')
})

it('rejects multiple unresolved captures and non-string audit states without discarding records', () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'owner')
  const prefix = `${JSON.stringify(['spark:scenario-submission:v1', 'owner', 'S'])}:`
  for (const id of ['one', 'two']) store.setItem(`${prefix}${id}`, JSON.stringify({attemptId: id, scenarioId: 'S', text: submitted, baseline, state: 'unknown'}))
  expect(() => journal.read('S')).toThrow('多笔')
  expect(() => journal.settle({attemptId: 'one', scenarioId: 'S', text: submitted, baseline}, 'confirmed')).toThrow('另一笔')
  store.setItem(`${prefix}two`, JSON.stringify({attemptId: 'two', scenarioId: 'S', text: submitted, baseline, state: ['unknown']}))
  expect(() => journal.read('S')).toThrow('恢复记录')
  expect(store.length).toBe(2)
})

it('bounds completed audits and releases their texts while preserving every unknown capture', () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'owner')
  const unknown = journal.begin('UNKNOWN', JSON.stringify({scenarioId: 'UNKNOWN', tables: {}}), null)
  for (let i = 0; i < 35; i++) journal.settle(journal.begin('S', submitted, baseline), 'confirmed')
  expect(store.length).toBe(21)
  expect(journal.read('UNKNOWN')).toEqual(unknown)
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)!
    if (key.startsWith('["spark:scenario-submission-audit:')) {
      expect(JSON.parse(store.getItem(key)!)).not.toHaveProperty('text')
      expect(JSON.parse(store.getItem(key)!)).not.toHaveProperty('baseline')
    }
  }
})

it('clears the recovered marker before a later normal live-owner submission', async () => {
  const store = storage(), journal = createScenarioSubmissionJournal(store, 'owner')
  journal.begin('S', submitted, baseline)
  let remote = submitted
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {
    readScope: () => 'scope', readText: async () => remote, submissionJournal: journal,
    writeText: async () => {throw Error('next response lost')},
  }})
  const file = await workspace.loadScenarioViews({scenarioId: 'S'})
  await workspace.verifyScenarioViews({scenarioId: 'S'})
  expect(workspace.isScenarioSubmissionRecovered('S')).toBe(false)
  file.setText(baseline)
  await expect(workspace.saveScenarioViews({scenarioId: 'S'})).rejects.toThrow('next response lost')
  remote = submitted
  await expect(workspace.verifyScenarioViews({scenarioId: 'S'})).rejects.toThrow('不能证明')
  expect(journal.read('S')).toMatchObject({text:baseline,baseline:submitted})
  expect(file.saveStatus).toBe('unknown')
  remote=baseline
  await expect(workspace.verifyScenarioViews({scenarioId:'S'})).resolves.toBe('confirmed')
  expect(journal.read('S')).toBeNull()
})
