import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime, ProjectWorkspace, ScenarioDefinitionResource} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererButton, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {executeSaveDataSet} from '../../../packages/spark-component/src/page/actions/action-data'
import type {ActionExecutionContext, SaveDataSetAction} from '../../../packages/spark-component/src/page/actions/action-types'

async function fixture() {
  const config = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
  const tables = Object.fromEntries(Object.entries(config.tables).filter(([, table]) =>
    (table as {resourceId?: string}).resourceId?.startsWith('pagedata:')))
  config.tables.DataViewDefinition.views.other = structuredClone(config.tables.DataViewDefinition.views.default)
  let stored = JSON.stringify({scenarioId: 'TARGET', schemaVersion: 2, tables: {
    Parents: {modelBinding: {modelId: 'P', modelName: 'Parents'}, views: {default: {}, one: {pageSize: 10}, two: {pageSize: 20}}},
  }})
  let lose = false
  let gate: Promise<void> | undefined
  const writes: string[] = []
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {},
    pageFiles: {readPageFile: async () => ''},
    scenarioViews: {readScope: () => 'scope', readText: async () => stored, writeText: async (_id, text) => {
      writes.push(text); stored = text; await gate
      if (lose) {lose = false; throw new Error('lost receipt')}
    }}})
  const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: 'META', targetScenarioId: 'TARGET',
    validate: async () => undefined, assertCurrent: () => {}})
  const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'Designer', tables})
  for (const table of Object.values(dataSet.tables)) for (const view of table.viewList) {
    view.queryContext = {...view.queryContext, dataSpaceId: 'TARGET'}
    view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
  }
  const view = dataSet.getView('DataViewDefinition')!
  await view.refresh()
  const key = (name: string) => {
    const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === name)
    if (!row) throw new Error(`Missing definition ${name}`)
    const id = view.getPkKey(row)
    if (id === undefined) throw new Error(`Missing identity ${name}`)
    return id
  }
  const messages: Array<{type: string; message: string}> = []
  const pageService = {
    copyText: vi.fn(async () => {}),
    showMessage: (message: string, type = 'info') => {messages.push({message, type})},
    showConfirm: vi.fn(async () => true), showPrompt: vi.fn(async () => null),
    showAlert: vi.fn(async () => undefined), showDialog: vi.fn(async (): Promise<'cancel'> => 'cancel'),
    selectEntities: vi.fn(async () => []), browseFiles: vi.fn(async () => []), uploadFiles: vi.fn(async () => []),
    showLoading: vi.fn(), navigate: vi.fn(),
  }
  const ctx: ActionExecutionContext = {
    getDataSet: id => id === 'META' ? dataSet : null,
    resolveView: () => null, getRouter: () => null, getPageService: () => pageService,
  }
  const desc: SaveDataSetAction = {action: 'save-dataset', scenarioId: 'META',
    views: [{tableName: 'DataViewDefinition', ids: [key('one')]}], successMessage: '全部保存成功'}
  return {dataSet, view, key, desc, ctx, messages, pageService, writes,
    read: () => JSON.parse(stored), loseResponse: () => {lose = true}, gate: (value: Promise<void>) => {gate = value},
    dispose: () => {dataSet.destroy(); workspace.dispose()},
    loseFirstSave: async () => {
      view.updateEditingValue(key('one'), 'pageSize', 43); lose = true
      await expect(dataSet.saveChanges({views: desc.views!})).rejects.toThrow('lost receipt')
      expect(view.hasUnconfirmedSave).toBe(true)
    },
  }
}

describe('save-dataset target completion after real source receipts', () => {
  it.each(['editing', 'staged'] as const)('reports later %s changes as pending after verifying the original submission', async state => {
    const f = await fixture()
    try {
      await f.loseFirstSave()
      f.view.updateEditingValue(f.key('one'), 'pageSize', 58)
      if (state === 'staged') await f.view.applyEditingRows([f.key('one')])
      await executeSaveDataSet(f.desc, f.ctx)
      expect(f.writes).toHaveLength(1)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(43)
      expect(f.view.getEditingRow(f.key('one'))?.['pageSize']
        ?? f.view.rows.find(row => f.view.getPkKey(row) === f.key('one'))?.['pageSize']).toBe(58)
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect(f.messages).toEqual([{type: 'warning', message: expect.stringMatching(/待保存|剩余修改/)}])
      expect(f.messages[0]?.message).not.toContain('全部保存成功')
      await executeSaveDataSet(f.desc, f.ctx)
      expect(f.writes).toHaveLength(2)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(58)
      expect(f.messages.at(-1)).toEqual({type: 'success', message: '全部保存成功'})
    } finally {f.dispose()}
  })

  it.each(['editing', 'staged'] as const)('ignores unselected rows and non-default views with %s drafts', async state => {
    const f = await fixture()
    try {
      const other = f.dataSet.getView('DataViewDefinition', 'other')!
      await other.refresh()
      await f.loseFirstSave()
      f.view.updateEditingValue(f.key('two'), 'pageSize', 63)
      other.updateEditingValue(f.key('one'), 'pageSize', 74)
      if (state === 'staged') {
        await f.view.applyEditingRows([f.key('two')]); await other.applyEditingRows([f.key('one')])
      }
      await executeSaveDataSet(f.desc, f.ctx)
      expect(f.writes).toHaveLength(1)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(43)
      expect(f.read().tables.Parents.views.two.pageSize).toBe(20)
      expect(f.view.hasEditingChanges(f.key('two')) || f.view.dirtyTracking.hasPendingChanges(f.key('two'))).toBe(true)
      expect(other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.messages).toEqual([{type: 'success', message: '全部保存成功'}])
    } finally {f.dispose()}
  })

  it('includes undispatched selected views when the save scope is the whole dataset', async () => {
    const f = await fixture()
    try {
      const layout = f.dataSet.getView('DataSpaceLayoutDefinition')!
      await layout.refresh()
      await f.loseFirstSave()
      layout.updateEditingValue('TARGET', 'modelPositions', {P: {x: 10, y: 20}})
      await executeSaveDataSet({action: 'save-dataset', scenarioId: 'META'}, f.ctx)
      expect(f.writes).toHaveLength(1)
      expect(f.read().layout).toBeUndefined()
      expect(layout.hasEditingChanges()).toBe(true)
      expect(f.messages).toEqual([{type: 'warning', message: expect.stringMatching(/待保存|剩余修改/)}])
    } finally {f.dispose()}
  })

  it('checks an explicitly named view without counting the default view draft', async () => {
    const f = await fixture()
    try {
      const other = f.dataSet.getView('DataViewDefinition', 'other')!
      await other.refresh()
      f.view.updateEditingValue(f.key('one'), 'pageSize', 63)
      other.updateEditingValue(f.key('one'), 'pageSize', 74)
      await executeSaveDataSet({...f.desc, views: [{tableName: 'DataViewDefinition', viewId: 'other', ids: [f.key('one')]}]}, f.ctx)
      expect(f.writes).toHaveLength(1)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(74)
      expect(f.view.getEditingRow(f.key('one'))?.['pageSize']).toBe(63)
      expect(f.messages).toEqual([{type: 'success', message: '全部保存成功'}])
    } finally {f.dispose()}
  })

  it('does not call unapplied target edits complete when applyEditingRows is false', async () => {
    const f = await fixture()
    try {
      f.view.updateEditingValue(f.key('one'), 'pageSize', 58)
      await executeSaveDataSet({...f.desc, applyEditingRows: false}, f.ctx)
      expect(f.writes).toHaveLength(0)
      expect(f.view.hasEditingChanges(f.key('one'))).toBe(true)
      expect(f.messages).toEqual([{type: 'warning', message: expect.stringMatching(/待保存|剩余修改/)}])
    } finally {f.dispose()}
  })

  it('retains edits made while a normal successful submission is pending', async () => {
    const f = await fixture()
    let release!: () => void
    f.gate(new Promise<void>(resolve => {release = resolve}))
    try {
      f.view.updateEditingValue(f.key('one'), 'pageSize', 43)
      const saving = executeSaveDataSet(f.desc, f.ctx)
      await vi.waitFor(() => expect(f.writes).toHaveLength(1))
      f.view.updateEditingValue(f.key('one'), 'pageSize', 58)
      release(); await saving
      expect(f.writes).toHaveLength(1)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(43)
      expect(f.view.getEditingRow(f.key('one'))?.['pageSize']).toBe(58)
      expect(f.messages).toEqual([{type: 'warning', message: expect.stringMatching(/待保存|剩余修改/)}])
    } finally {release(); f.dispose()}
  })

  it('keeps the submitted row range when caller selection changes during the wait', async () => {
    const f = await fixture()
    let release!: () => void
    f.gate(new Promise<void>(resolve => {release = resolve}))
    try {
      f.view.updateEditingValue(f.key('one'), 'pageSize', 43)
      const saving = executeSaveDataSet(f.desc, f.ctx)
      await vi.waitFor(() => expect(f.writes).toHaveLength(1))
      f.view.updateEditingValue(f.key('two'), 'pageSize', 58)
      f.desc.views![0]!.ids!.splice(0, 1, f.key('two'))
      release(); await saving
      expect(f.writes).toHaveLength(1)
      expect(f.read().tables.Parents.views.one.pageSize).toBe(43)
      expect(f.read().tables.Parents.views.two.pageSize).toBe(20)
      expect(f.view.getEditingRow(f.key('two'))?.['pageSize']).toBe(58)
      expect(f.messages).toEqual([{type: 'success', message: '全部保存成功'}])
    } finally {release(); f.dispose()}
  })

  it('keeps the real standard button available after local discard and displays source errors before recovery', async () => {
    const f = await fixture()
    const runtime = new PageRuntime({pageId: 'save-recovery', scenarioIds: ['META'], loadScenario: async () => f.dataSet})
    await runtime.load()
    const Harness = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'save-action-test'})
      sparkProvide(PAGE_SERVICE, f.pageService)
      sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(RendererButton, {action: 'save-dataset', scenarioId: 'META',
        dataViewKey: 'META@DataViewDefinition@default', views: f.desc.views, label: '保存'})
    }})
    const wrapper = mount(Harness, {global: {plugins: [Spark.createPlugin({registry: Spark.createRegistry()})]}})
    try {
      f.view.updateEditingValue(f.key('one'), 'pageSize', 43); f.loseResponse()
      await flushPromises()
      expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
      await wrapper.get('button').trigger('click'); await flushPromises()
      expect(f.messages.at(-1)).toMatchObject({type: 'error', message: expect.stringContaining('lost receipt')})
      expect(f.view.hasUnconfirmedSave).toBe(true)
      f.view.discardPendingChanges(); await flushPromises()
      expect(f.view.hasEditingChanges()).toBe(false)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
      await wrapper.get('button').trigger('click'); await flushPromises()
      expect(f.writes).toHaveLength(1)
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect(f.view.mutatingError).toBeNull()
      expect(f.messages.at(-1)).toMatchObject({type: 'warning', message: expect.stringMatching(/待保存|剩余修改/)})
    } finally {wrapper.unmount(); f.dispose()}
  })
})
