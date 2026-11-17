import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {contentTreeEditorLayout} from '@/services/smart-bid/content-tree-editor-layout'
import {contentDraftSaveRule} from '@/services/smart-bid/content-draft-save-rule'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const originalStubs = {...config.global.stubs}
let wrapper: VueWrapper | undefined, runtime: PageRuntime | undefined
afterEach(() => {wrapper?.unmount(); runtime?.dispose(); config.global.stubs = originalStubs})

async function fixture(writable = true) {
  registerAllRenderers()
  const draft = {nodes: [
    {nodeId: 'B', parentId: 'P', index: 0, type: 'document', class: [], value: '', data: {}},
    {nodeId: 'C', parentId: 'B', index: 0, type: 'chapter', class: [], value: '', data: {}},
    {nodeId: 'H', parentId: 'C', index: 0, type: 'heading', class: [], value: '实施方案', data: {keep: true}},
  ], responseChanges: [{id: 'R'}]}
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {WorkingDraft: {modelBinding: {modelId: 'M', modelName: 'WorkingDraft'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'projectId', type: 'string'}, {name: 'draft', type: 'object'}],
    views: {default: {commitMode: 'staged', rows: []}}}}})
  runtime = new PageRuntime({pageId: 'content-test', scenarioIds: ['S'], loadScenario: async () => ds}); await runtime.load()
  const view = ds.getView('WorkingDraft')!, selectedPath = ref<JsonPath | null>(null), editing = ref(false)
  const query = new DataSpaceQueryTable({scenarioId: 'S', metaName: 'WorkingDraft'})
  const context = new DataSpaceQueryContext({identity: query.identity, scope: 'original', readScope: () => 'original',
    snapshot: query.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: 'D', projectId: 'P', draft,
      lingma_sys_params: {r: [], e: writable ? ['draft'] : [], h: [], m: [], d: false}}], Count: 1}}})})
  const save = vi.fn(async () => {throw Error('TEST_DISPATCH_REACHED')})
  view.dataTable!.setQuerySaveRule(contentDraftSaveRule('P'))
  view.bindQueryExecutor({executeQuery: async () => context, save}); await view.refresh()
  view.setCurrentRowById('D')
  const input = () => ({view, dataViewKey: 'S@WorkingDraft@default', draftId: 'D', projectId: 'P', selectedPath: selectedPath.value,
    onSelectedPathChange: (path: JsonPath | null) => {if (!editing.value) selectedPath.value = path},
    onEditingChange: (value: boolean) => {editing.value = value}})
  const stubs = {...originalStubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[key]
  config.global.stubs = stubs
  wrapper = mount(defineComponent({setup() {useSparkComponent({type: 'content-editor-test'}).sparkProvide(PAGE_RUNTIME, runtime!)
    return () => h(RendererForm, contentTreeEditorLayout(input()))}}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return {view, draft, selectedPath, input, wrapper, save, ds}
}

it('validates direct standard JSON edits through the original DataSet save before dispatch', async () => {
  const f = await fixture()
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click'); await flushPromises()
  const control = f.wrapper.get('input[aria-label="正文"]')
  await control.setValue('\uD800'); await control.trigger('change'); await flushPromises()
  expect(f.view.hasEditingChanges()).toBe(true)
  await expect(f.ds.saveChanges()).rejects.toThrow('INVALID_UNICODE')
  expect(f.save).not.toHaveBeenCalled()
  expect(f.view.rows[0]?.['draft']).toEqual(f.draft)
  expect(f.view.hasEditingChanges()).toBe(true)
  await control.setValue('修正正文'); await control.trigger('change'); await flushPromises()
  await expect(f.ds.saveChanges()).rejects.toThrow('TEST_DISPATCH_REACHED')
  expect(f.save).toHaveBeenCalledOnce()
})

it('rejects invalid structure or another project through the same native save rule', async () => {
  const f = await fixture()
  const invalid = {...f.draft, nodes: f.draft.nodes.map(node => node.nodeId === 'H' ? {...node, parentId: 'missing'} : node)}
  f.view.updateEditingValue('D', 'draft', invalid)
  await expect(f.ds.saveChanges()).rejects.toThrow('内容结构无效')
  expect(f.save).not.toHaveBeenCalled()
  expect(f.view.getEditingRow('D')?.['draft']).toEqual(invalid)
  f.view.discardEditingRows()
  f.view.dataTable!.setQuerySaveRule(contentDraftSaveRule('OTHER'))
  f.view.updateEditingValue('D', 'draft', {...f.draft, nodes: f.draft.nodes.map(node => node.nodeId === 'H' ? {...node, value: '修正'} : node)})
  await expect(f.ds.saveChanges()).rejects.toThrow('CONTENT_DRAFT_PROJECT')
  expect(f.save).not.toHaveBeenCalled()
  expect(f.view.rows[0]?.['draft']).toEqual(f.draft)
})

it('binds outline selection and text editing to one original draft and restores it through native cancel', async () => {
  const f = await fixture()
  const rows = f.wrapper.findAll('.el-table__body-wrapper tbody tr')
  expect(rows).toHaveLength(3)
  await rows[2]!.trigger('click'); await flushPromises()
  expect(f.selectedPath.value).toEqual([2])
  const control = f.wrapper.get('input[aria-label="正文"]')
  await control.setValue('现场实施方案'); await control.trigger('change'); await flushPromises()
  const edited = f.view.getEditingRow('D')?.['draft'] as typeof f.draft
  expect(edited.nodes[2]).toEqual({...f.draft.nodes[2], value: '现场实施方案'})
  expect(edited.responseChanges).toEqual([{id: 'R'}])
  expect(f.view.rows[0]?.['draft']).toEqual(f.draft)
  f.view.discardEditingRows(); await flushPromises()
  expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
  expect(f.selectedPath.value).toBeNull()
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click'); await flushPromises()
  expect((f.wrapper.get('input[aria-label="正文"]').element as HTMLInputElement).value).toBe('实施方案')
})

it('keeps structural nodes readonly and rejects another space, project or stale selection', async () => {
  const f = await fixture()
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[0]!.trigger('click'); await flushPromises()
  expect(f.wrapper.get('input[aria-label="正文"]').attributes('disabled')).toBeDefined()
  expect(f.view.hasEditingChanges()).toBe(false)
  expect(() => contentTreeEditorLayout({...f.input(), dataViewKey: 'OTHER@WorkingDraft@default'})).toThrow('完整数据视图')
  expect(() => contentTreeEditorLayout({...f.input(), projectId: 'OTHER'})).toThrow('不可读取')
  expect(() => contentTreeEditorLayout({...f.input(), selectedPath: [99]})).toThrow('已失效')
})

it('consumes the original query field permission for editable text nodes', async () => {
  const f = await fixture(false)
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click'); await flushPromises()
  expect(f.wrapper.get('input[aria-label="正文"]').attributes('disabled')).toBeDefined()
  expect(f.view.hasEditingChanges()).toBe(false)
  expect(f.view.rows[0]?.['draft']).toEqual(f.draft)
})
