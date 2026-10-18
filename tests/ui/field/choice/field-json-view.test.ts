import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldJson, PAGE_RUNTIME, JsonTreeEditor, useSparkComponent} from '@spark-appworks/spark-component'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose())})
async function fixture() {
  let fail = false
  const spaces = ['A', 'B'].map(scenarioId => SparkData.fromJson({scenarioId, dataSetName: scenarioId, tables: {
    Internal: {modelBinding: {modelId: scenarioId, modelName: 'Model'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'public', type: 'json'},
      {name: 'secret', type: 'string'}, {name: 'masked', type: 'string'},
    ], views: {default: {}}},
  }}))
  for (const ds of spaces) {
    const view = ds.getView('Internal')!, table = new DataSpaceQueryTable({scenarioId: ds.scenarioId!, metaName: 'Model'})
    view.bindQueryExecutor({executeQuery: async () => {
      if (fail) throw new Error('query unavailable')
      return new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
      snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: ds.scenarioId, public: {ok: false},
        secret: 'HIDDEN', masked: 'RAW', extra: 'UNDECLARED', lingma_sys_key: 'PRIVATE', lingma_sys_params: {h: ['secret'], m: ['masked'], e: []}}], Count: 7}}})})
    }})
    await view.loadFromServer()
  }
  const runtime = new PageRuntime({pageId: 'json-view', scenarioIds: ['A', 'B'], loadScenario: async id => spaces.find(ds => ds.scenarioId === id)!})
  await runtime.load(); runtimes.push(runtime)
  const key = ref('A@Model@default'), info = ref(false)
  const wrapper = mount(defineComponent({setup() {
    useSparkComponent({type: 'json-view-test'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(FieldJson, {dataViewKey: key.value, dataMember: 'rows', includeQueryInfo: info.value})
  }}), {global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true}}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, key, info, view: spaces[0]!.getView('Internal')!, second: spaces[1]!.getView('Internal')!, setFailure: (value: boolean) => {fail = value}}
}
describe('JSON consumes a DataView result', () => {
  it('projects current read permissions and returns detached data without private or undeclared members', async () => {
    const f = await fixture(), snapshot = f.view.readSnapshot()
    expect(snapshot.rows).toEqual([{id: 'A', public: {ok: false}, masked: '••••'}])
    expect(snapshot.total).toBe(7)
    expect(JSON.stringify(snapshot)).not.toMatch(/HIDDEN|RAW|PRIVATE|UNDECLARED|lingma_sys/)
    ;(snapshot.rows[0]!['public'] as Record<string, unknown>)['ok'] = true
    expect(f.view.rows[0]!['public']).toEqual({ok: false})
  })
  it('switches rows/full presentation and full space binding without querying or writing', async () => {
    const f = await fixture(), editor = () => f.wrapper.getComponent(JsonTreeEditor)
    expect(editor().props('readOnly')).toBe(true)
    expect(JSON.parse(editor().props('modelValue')!)).toEqual([{id: 'A', public: {ok: false}, masked: '••••'}])
    f.info.value = true; await flushPromises()
    expect(JSON.parse(editor().props('modelValue')!)).toMatchObject({total: 7, page: 1, rows: [{id: 'A'}]})
    const old = editor(); f.key.value = 'B@Model@default'; await flushPromises()
    expect(JSON.parse(editor().props('modelValue')!).rows[0].id).toBe('B')
    old.vm.$emit('update:modelValue', '[{"id":"WRONG"}]'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false); expect(f.second.hasEditingChanges()).toBe(false)
  })
  it('removes stale results when inputs invalidate a query and rejects a snapshot until refreshed', async () => {
    const f = await fixture()
    f.view.queryConfig = {outputType: 'Table'}; await flushPromises()
    expect(() => f.view.readSnapshot()).toThrow(/有效查询结果/)
    expect(f.wrapper.findComponent(JsonTreeEditor).exists()).toBe(false)
    await f.view.refresh(); await flushPromises()
    expect(f.wrapper.findComponent(JsonTreeEditor).exists()).toBe(true)
  })
  it('hides the previous JSON after a failed refresh and restores it only after successful retry', async () => {
    const f = await fixture(); f.setFailure(true)
    await f.view.refresh(); await flushPromises()
    expect(f.view.loadingError?.message).toContain('query unavailable')
    expect(() => f.view.readSnapshot()).toThrow(/有效查询结果/)
    expect(f.wrapper.findComponent(JsonTreeEditor).exists()).toBe(false)
    f.setFailure(false); await f.view.refresh(); await flushPromises()
    expect(f.wrapper.findComponent(JsonTreeEditor).exists()).toBe(true)
  })
})

