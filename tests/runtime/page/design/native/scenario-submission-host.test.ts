import {expect, it} from 'vitest'
import {createScenarioSubmissionJournal} from '@spark-appworks/spark-project-model'
import {dataSpacePageFixture} from './data-space-page.fixture'

it('forwards original submission verification through a freshly opened metadata host without replaying storage', async () => {
  const stored = new Map<string, string>()
  const journal = createScenarioSubmissionJournal({get length() {return stored.size}, key: index => [...stored.keys()][index] ?? null,
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => {stored.set(key, value)}, removeItem: key => {stored.delete(key)}}, 'tenant/user/app')
  const f = dataSpacePageFixture({submissionJournal: journal})
  try {
    const first = await f.open('A'), original = first.metadataDataSet.getView('DataViewDefinition', 'default')!
    await original.refresh()
    const row = original.rows.find(item => item['tableName'] === 'OrdersAlias'), id = row && original.getPkKey(row)
    if (id === undefined) throw Error('Missing original view definition')
    original.updateEditingValue(id, 'pageSize', 23); f.loseNextFileResponse()
    await expect(first.metadataDataSet.saveChanges({views: [original]})).rejects.toThrow('file response')
    expect(journal.read('A')).not.toBeNull(); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A'), view = reopened.metadataDataSet.getView('DataViewDefinition', 'default')!
    await view.refresh()
    expect(view.hasUnconfirmedSave).toBe(false)
    expect((await view.verifySourceWriteAttempt()).state).toBe('confirmed')
    expect(journal.read('A')).toBeNull(); expect(f.fileWrites).toHaveLength(1)
    expect(reopened.viewState?.saveStatus).toBe('idle')
  } finally {f.dispose()}
})
