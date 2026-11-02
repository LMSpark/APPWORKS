import {afterEach, describe, expect, it, vi} from 'vitest'
import {computed, defineComponent, h, ref} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {Spark} from '@spark-appworks/spark-component'
import {attachStagedDesignView} from '@/lowcode/resources/repository/staged-design-file-view'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'

const wrappers: Array<ReturnType<typeof mount>> = []
const host = vi.hoisted(() => ({dirty: [] as Array<{readonly isDirty: boolean}>}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: (source: {readonly isDirty: boolean}) => host.dirty.push(source)}))
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount())})
async function setup(options: {companion?: boolean} = {}) {
  const scope = ref('A'), writes = vi.fn(), reads = vi.fn(async (id: string) => ({rowid: id, targetId: id, designJson: '[]'}))
  const http = new ApiBackend(); http.primaryKeys['Params'] = 'parid'
  http.records = {Params: [{parid: 'P1', pid: 'A', testvalue: 'original'}]}
  const owner = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  async function companion(target: string) {
    const ds = DataSet.fromJson({scenarioId: 'PARAMETERS', tables: {Params: {modelBinding: {modelId: 'PARAMS', modelName: 'Params'},
      columns: [{name: 'parid', type: 'string', isPrimaryKey: true}, {name: 'pid', type: 'string'}, {name: 'testvalue', type: 'string'}],
      views: {default: {autoLoad: false, commitMode: 'staged', filterExpression: {field: 'pid', operator: 'eq', value: target}}}}}})
    const view = ds.getView('Params')!; view.primaryKey = 'parid'; view.bindQueryExecutor(owner); await view.refresh()
    return ds
  }
  function createDataSet() {
  const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {}})
  attachStagedDesignView(dataSet, {scopeInputTable: 'Input', scopeField: 'targetId', designViewTable: 'Design',
    resourceId: 'test-design', columns: [{name: 'rowid', primary: true}, {name: 'targetId'}, {name: 'designJson'}],
    jsonFields: ['designJson'], loadRow: reads, persistRow: async row => {writes(row)}}, () => {})
  return dataSet
  }
  const dataSet = createDataSet()
  let loads = 0
  let page!: ReturnType<typeof useStagedDesignPage>
  const component = defineComponent({setup() {
    page = useStagedDesignPage({pageId: 'scope-test', scenarioId: computed(() => 'SCENE'), scopeId: computed(() => scope.value),
      scopeInputTable: 'Input', scopeField: 'targetId', designViewTable: 'Design', loadDataSets: async input => {
        const ds = loads++ === 0 ? dataSet : createDataSet()
        return options.companion ? [ds, await companion(input.scopeId)] : [ds]
      }, missingScopeMessage: 'Missing target'})
    return () => h('div')
  }})
  wrappers.push(mount(component, {global: {plugins: [Spark.createPlugin()]}}))
  await flushPromises()
  expect(page.ready.value).toBe(true)
  return {scope, page, dataSet, writes, reads, http}
}

describe('staged design current target', () => {
  it('saves the companion view independently without including an edited design file', async () => {
    const {page, writes, http} = await setup({companion: true})
    const view = page.runtime.value!.getDataSet('PARAMETERS')!.getView('Params')!
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Unsaved"}]'); await flushPromises()
    view.updateEditingValue('P1', 'testvalue', 'Changed')
    await page.saveChanges({viewKey: 'PARAMETERS@Params@default'})
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]?.table).toBe('Params')
    expect(writes).not.toHaveBeenCalled()
    expect(page.designView.value?.rows[0]?.['designJson']).toContain('Unsaved')
    expect(page.designView.value?.dirtyTracking.hasPendingChanges()).toBe(true)
  })
  it('retains companion drafts under their original target when the route changes', async () => {
    const {page, scope} = await setup({companion: true})
    const ds = page.runtime.value!.getDataSet('PARAMETERS')!, view = ds.getView('Params')!
    view.updateEditingValue('P1', 'testvalue', 'Pending')
    scope.value = 'B'; await flushPromises()
    expect(page.ready.value).toBe(false)
    expect(ds.destroyed).toBe(false)
    expect(host.dirty.at(-1)?.isDirty).toBe(true)
    scope.value = 'A'; await flushPromises()
    expect(page.ready.value).toBe(true)
    expect(view.getEditingPatch('P1')).toEqual({testvalue: 'Pending'})
  })
  it('retains an unknown companion save and verifies through its original owner', async () => {
    const {page, scope, http} = await setup({companion: true})
    const view = page.runtime.value!.getDataSet('PARAMETERS')!.getView('Params')!
    view.updateEditingValue('P1', 'testvalue', 'Accepted'); http.failAfterWrite = true
    await page.saveChanges({viewKey: 'PARAMETERS@Params@default'})
    expect(view.hasUnconfirmedSave).toBe(true)
    scope.value = 'B'; await flushPromises(); expect(page.ready.value).toBe(false)
    scope.value = 'A'; await flushPromises()
    await page.saveChanges({viewKey: 'PARAMETERS@Params@default'})
    expect(http.saves).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(false)
  })
  it('explicitly discards the current draft and rereads without writing', async () => {
    const {page, writes, reads} = await setup()
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    await page.refreshDesign({discardChanges: true})
    expect(page.ready.value).toBe(true)
    expect(page.designView.value?.rows[0]?.['designJson']).toBe('[]')
    expect(reads).toHaveBeenCalledTimes(2)
    expect(writes).not.toHaveBeenCalled()
    expect(host.dirty.at(-1)?.isDirty).toBe(false)
  })
  it('never discards an unconfirmed original save', async () => {
    const {page, writes, reads} = await setup()
    writes.mockImplementationOnce(() => {throw new Error('Unknown save result')})
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    await page.saveChanges()
    expect(page.designView.value?.hasUnconfirmedSave).toBe(true)
    await page.refreshDesign({discardChanges: true})
    expect(page.ready.value).toBe(true)
    expect(page.designView.value?.hasUnconfirmedSave).toBe(true)
    expect(page.designView.value?.rows[0]?.['designJson']).toContain('Edited')
    expect(reads).toHaveBeenCalledTimes(1)
    expect(writes).toHaveBeenCalledTimes(1)
  })
  it('never discards the original draft using a different route target', async () => {
    const {page, scope, dataSet, reads} = await setup()
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    scope.value = 'B'; await flushPromises()
    await page.refreshDesign({discardChanges: true})
    expect(dataSet.getTable('Input')?.rows[0]?.['targetId']).toBe('A')
    expect(reads).toHaveBeenCalledTimes(1)
    scope.value = 'A'; await flushPromises()
    expect(page.designView.value?.rows[0]?.['designJson']).toContain('Edited')
  })
  it('keeps the current draft visible when an ordinary refresh is rejected', async () => {
    const {page} = await setup()
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    await page.refreshDesign()
    expect(page.ready.value).toBe(true)
    expect(page.designView.value?.rows[0]?.['designJson']).toContain('Edited')
  })
  it('exposes the actual pending draft to the host close guard', async () => {
    const {page} = await setup()
    expect(host.dirty.at(-1)?.isDirty).toBe(false)
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    expect(host.dirty.at(-1)?.isDirty).toBe(true)
  })
  it('hides the old editor when the route target is cleared', async () => {
    const {scope, page} = await setup()
    scope.value = ''; await flushPromises()
    expect(page.ready.value).toBe(false)
    expect(page.designView.value).toBeUndefined()
    expect(page.error.value).toBe('Missing target')
  })
  it('cannot save the old draft through an empty route target', async () => {
    const {scope, page, writes} = await setup()
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    scope.value = ''; await flushPromises()
    await page.saveChanges()
    expect(writes).not.toHaveBeenCalled()
  })
  it('does not relabel the original pending draft as a different target', async () => {
    const {scope, page, dataSet, reads} = await setup()
    page.updateDesignField(page.designView.value, 'designJson', '[{"Name":"Edited"}]'); await flushPromises()
    scope.value = 'B'; await flushPromises()
    expect(dataSet.getTable('Input')?.rows[0]?.['targetId']).toBe('A')
    expect(reads.mock.calls.map(call => call[0])).toEqual(['A'])
    expect(page.ready.value).toBe(false)
    scope.value = 'A'; await flushPromises()
    expect(page.ready.value).toBe(true)
    expect(page.designView.value?.rows[0]?.['designJson']).toContain('Edited')
  })
  it('rejects editing the old row while the next target is still loading', async () => {
    const {scope, page, reads} = await setup(), oldView = page.designView.value
    let finish!: (row: {rowid: string; targetId: string; designJson: string}) => void
    reads.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    scope.value = 'B'; await flushPromises()
    page.updateDesignField(oldView, 'designJson', '[{"Name":"Stale"}]'); await flushPromises()
    finish({rowid: 'B', targetId: 'B', designJson: '[]'}); await flushPromises()
    expect(page.designView.value?.rows[0]?.['designJson']).toBe('[]')
    expect(page.error.value).not.toBe('')
  })
  it('ignores a late failure from a previous target after the current target loaded', async () => {
    const {scope, page, reads} = await setup()
    let fail!: (error: Error) => void
    reads.mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject}))
    scope.value = 'B'; await flushPromises()
    scope.value = 'C'; await flushPromises()
    fail(new Error('late B failure')); await flushPromises()
    expect(page.ready.value).toBe(true)
    expect(page.loading.value).toBe(false)
    expect(page.error.value).toBe('')
    expect(page.designView.value?.rows[0]?.['targetId']).toBe('C')
  })
})
