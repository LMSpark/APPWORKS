import {expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {ContentTreeDraftEditor} from '@/services/smart-bid/content-tree-draft-editor'

async function fixture(writable = true) {
  const ds = DataSet.fromJson({scenarioId: 'DRAFTS', tables: {WorkingDraft: {modelBinding: {modelId: 'M', modelName: 'WorkingDraft'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'projectId', type: 'string'}, {name: 'draft', type: 'object'}],
    views: {default: {commitMode: 'staged', rows: []}}}}})
  const view = ds.getView('WorkingDraft')!, query = new DataSpaceQueryTable({scenarioId: 'DRAFTS', metaName: 'WorkingDraft'})
  let scope = 'original'
  const context = new DataSpaceQueryContext({identity: query.identity, scope, readScope: () => scope,
    snapshot: query.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: 'D', projectId: 'P', draft: {nodes: [], responseChanges: [{id: 'R'}]},
      lingma_sys_params: {r: [], e: writable ? ['draft'] : [], h: [], m: [], d: false}}], Count: 1}}})})
  view.bindQueryExecutor({executeQuery: async () => context}); await view.refresh()
  return {ds, view, editor: new ContentTreeDraftEditor(view, 'D', 'P'), invalidate: () => {scope = 'changed'}}
}

it('rejects noncanonical payloads before changing native draft editing state', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addParagraph('C', {nodeId: 'N', value: '原正文', data: {amount: '1200.00'}})
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    for (const data of [{amount: 1200}, {'é': true, 'e\u0301': false}, {date: new Date()}, {missing: undefined}]) {
      expect(() => editor.updateText('N', '不得部分写入', data)).toThrow()
      expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    }
    expect(() => editor.updateText('N', '\uD800')).toThrow('INVALID_UNICODE')
    expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle
    expect(() => editor.addParagraph('C', {nodeId: 'bad', value: '', data: cycle})).toThrow('CYCLIC_PAYLOAD')
    expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    const sparse = Object.assign(new Array<unknown>(2), {1: false, extra: true})
    expect(() => editor.addParagraph('C', {nodeId: 'sparse', value: '', data: {items: sparse}})).toThrow('NON_JSON_ARRAY')
    expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    expect(view.rows[0]?.['draft']).toEqual({nodes: [], responseChanges: [{id: 'R'}]})
  } finally {ds.destroy()}
})

it('edits logical books and paragraphs in the original DataView and cancels with native editing state', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addParagraph('C', {nodeId: 'N', value: '现场执行'})
    expect(view.rows[0]?.['draft']).toEqual({nodes: [], responseChanges: [{id: 'R'}]})
    const draft = view.getEditingRow('D')?.['draft'] as {nodes: Array<{nodeId: string; value: string}>; responseChanges: unknown[]}
    expect(draft.nodes.map(node => node.nodeId)).toEqual(['B', 'C', 'H', 'N'])
    expect(draft.responseChanges).toEqual([{id: 'R'}])
    editor.updateText('N', '核对原始依据', {})
    expect((view.getEditingRow('D')?.['draft'] as typeof draft).nodes.find(node => node.nodeId === 'N')?.value).toBe('核对原始依据')
    view.discardEditingRows()
    expect(view.getEditingRow('D')?.['draft']).toEqual({nodes: [], responseChanges: [{id: 'R'}]})
  } finally {ds.destroy()}
})

it('moves subtrees and rejects invalid structure without partially changing the draft', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '一'})
    editor.addChapter('B', {chapterId: 'C2', headingId: 'H2', title: '二'})
    editor.addParagraph('C', {nodeId: 'N', value: '正文'})
    editor.addParagraph('C', {nodeId: 'N2', value: '第二段'})
    editor.move('N2', 'C', 1)
    expect((view.getEditingRow('D')?.['draft'] as {nodes: Array<{nodeId: string}>}).nodes.map(node => node.nodeId))
      .toEqual(['B', 'C', 'H', 'N2', 'N', 'C2', 'H2'])
    editor.remove('N2')
    editor.move('N', 'C2', 1)
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    expect(() => editor.move('C2', 'C2', 1)).toThrow()
    expect(() => editor.remove('H2')).toThrow()
    expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    editor.remove('C2')
    expect((view.getEditingRow('D')?.['draft'] as {nodes: Array<{nodeId: string}>}).nodes.map(node => node.nodeId)).toEqual(['B', 'C', 'H'])
  } finally {ds.destroy()}
})

it.each(['permission', 'scope', 'project'])('rejects %s changes through the original view', async mode => {
  const {ds, view, editor, invalidate} = await fixture(mode !== 'permission')
  try {
    if (mode === 'scope') invalidate()
    const target = mode === 'project' ? new ContentTreeDraftEditor(view, 'D', 'OTHER') : editor
    expect(() => target.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '拒绝'})).toThrow()
    expect(view.hasEditingChanges()).toBe(false)
  } finally {ds.destroy()}
})
