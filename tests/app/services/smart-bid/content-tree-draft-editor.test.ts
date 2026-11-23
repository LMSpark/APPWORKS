import {expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'
import {ContentTreeDraftEditor} from '@/services/smart-bid/content-tree-draft-editor'

async function fixture(writable = true, wireText = false) {
  const initialDraft={nodes: [], responseChanges: [{id: 'R'}]}
  const ds = DataSet.fromJson({scenarioId: 'DRAFTS', tables: {WorkingDraft: {modelBinding: {modelId: 'M', modelName: 'WorkingDraft'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'projectId', type: 'string'}, {name: 'draft', type: wireText?'json':'object'}],
    views: {default: {commitMode: 'staged', rows: []}}}}})
  const view = ds.getView('WorkingDraft')!, query = new DataSpaceQueryTable({scenarioId: 'DRAFTS', metaName: 'WorkingDraft'})
  let scope = 'original'
  const context = new DataSpaceQueryContext({identity: query.identity, scope, readScope: () => scope,
    snapshot: query.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: 'D', projectId: 'P', draft: wireText?JSON.stringify(initialDraft):initialDraft,
      lingma_sys_params: {r: [], e: writable ? ['draft'] : [], h: [], m: [], d: false}}], Count: 1}}})})
  view.bindQueryExecutor({executeQuery: async () => context}); await view.refresh()
  return {ds, view, editor: new ContentTreeDraftEditor(view, 'D', 'P'), invalidate: () => {scope = 'changed'}}
}

it('keeps service JSON text storage while editing the same draft contract', async () => {
  const {ds,view,editor}=await fixture(true,true), before=view.rows[0]?.['draft']
  try{
    editor.addDocument({documentId:'B',chapterId:'C',headingId:'H',title:'报价'})
    const edited=view.getEditingRow('D')?.['draft']
    expect(typeof edited).toBe('string')
    const draft=JSON.parse(String(edited))
    expect(draft.responseChanges).toEqual([{id:'R'}])
    expect(draft.nodes.map((node:{nodeId:string})=>node.nodeId)).toEqual(['B','C','H'])
    expect(view.rows[0]?.['draft']).toBe(before)
    view.discardEditingRows()
    expect(view.getEditingRow('D')?.['draft']).toBe(before)
  }finally{ds.destroy()}
})

it('inserts an ordinary JSON table with fixed fact references and cancels through the original draft',async()=>{
 const f=await fixture()
 try{
  f.editor.addDocument({documentId:'B',chapterId:'C',headingId:'H',title:'报价'})
  f.editor.addTable('C',{nodeId:'T',header:['项目','金额'],rows:[[{value:'总价',data:{}},{value:'{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}]]})
  const draft=f.view.getEditingRow('D')!['draft'] as {nodes:Array<{nodeId:string;value:string;data:unknown}>}
  expect(draft.nodes.find(node=>node.nodeId==='T')).toMatchObject({value:'',data:{header:['项目','金额'],rows:[[{value:'总价',data:{}},{value:'{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}]]}})
  expect(f.view.rows[0]!['draft']).toEqual({nodes:[],responseChanges:[{id:'R'}]})
  f.view.discardEditingRows();expect(f.view.getEditingRow('D')!['draft']).toEqual({nodes:[],responseChanges:[{id:'R'}]})
 }finally{f.ds.destroy()}
})
it.each([
 {header:[],rows:[]},
 {header:['列','列'],rows:[]},
 {header:['列'],rows:[[]]},
 {header:['列'],rows:[[{value:'{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}]]},
 {header:['列'],rows:[[{value:'词句',data:{}}],[{value:'{{列}}',data:{列:{type:'fact',factId:'PRICE'}}}]]},
])('rejects invalid ordinary table data before any editing write %j',async data=>{
 const f=await fixture()
 try{
  f.editor.addDocument({documentId:'B',chapterId:'C',headingId:'H',title:'报价'})
  const before=structuredClone(f.view.getEditingRow('D')!['draft'])
  expect(()=>f.editor.addTable('C',{nodeId:'T',...data})).toThrow()
  expect(f.view.getEditingRow('D')!['draft']).toEqual(before)
 }finally{f.ds.destroy()}
})
it('replaces table content atomically while keeping its identity, position and other draft content',async()=>{
 const f=await fixture()
 try{
  f.editor.addDocument({documentId:'B',chapterId:'C',headingId:'H',title:'报价'})
  f.editor.addTable('C',{nodeId:'T',header:['说明'],rows:[[{value:'原词句',data:{}}]]})
  f.editor.updateTable('T',{header:['金额'],rows:[[{value:'{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}]]})
  const draft=f.view.getEditingRow('D')!['draft'] as {nodes:unknown[];responseChanges:unknown[]}
  expect(draft.nodes).toContainEqual({nodeId:'T',parentId:'C',index:1,type:'table',class:[],value:'',data:{header:['金额'],rows:[[{value:'{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}]]}})
  expect(draft.responseChanges).toEqual([{id:'R'}])
  const before=structuredClone(draft)
  expect(()=>f.editor.updateTable('T',{header:['金额'],rows:[[]]})).toThrow()
  expect(()=>f.editor.updateTable('H',{header:['说明'],rows:[]})).toThrow()
  expect(f.view.getEditingRow('D')!['draft']).toEqual(before)
 }finally{f.ds.destroy()}
})

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

it('rejects normalized identity aliases without changing the native draft or its order', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addParagraph('C', {nodeId: '\u00e9', value: '保留的正文'})
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    expect(() => editor.addParagraph('C', {nodeId: 'e\u0301', value: '不得写入'}, 1)).toThrow('NODE_ID:e\u0301')
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

it('authors nested semantic lists with stable item and paragraph identities in the original draft', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addList('C', {listId: 'L', itemId: 'I', paragraphId: 'N', value: '核对来件', ordered: true})
    editor.addListItem('L', {itemId: 'I2', paragraphId: 'N2', value: '记录出处'}, 0)
    editor.addList('I', {listId: 'SUB', itemId: 'SUB_I', paragraphId: 'SUB_N', value: '保留原版'})
    const draft = view.getEditingRow('D')?.['draft'] as {nodes: Array<Record<string, unknown>>; responseChanges: unknown[]}
    expect(draft.nodes.map(node => [node['nodeId'], node['parentId'], node['index'], node['type']])).toEqual([
      ['B', 'P', 0, 'document'], ['C', 'B', 0, 'chapter'], ['H', 'C', 0, 'heading'], ['L', 'C', 1, 'list'],
      ['I2', 'L', 0, 'item'], ['N2', 'I2', 0, 'paragraph'], ['I', 'L', 1, 'item'], ['N', 'I', 0, 'paragraph'],
      ['SUB', 'I', 1, 'list'], ['SUB_I', 'SUB', 0, 'item'], ['SUB_N', 'SUB_I', 0, 'paragraph'],
    ])
    expect(draft.nodes.find(node => node['nodeId'] === 'L')).toMatchObject({class: ['ordered'], value: '', data: {}})
    expect(draft.nodes.find(node => node['nodeId'] === 'SUB')).toMatchObject({class: [], value: '', data: {}})
    expect(draft.responseChanges).toEqual([{id: 'R'}])
    expect(view.rows[0]?.['draft']).toEqual({nodes: [], responseChanges: [{id: 'R'}]})
    view.discardEditingRows(); expect(view.hasEditingChanges()).toBe(false)
  } finally {ds.destroy()}
})

it('creates an explicit quote paragraph and a derived table of contents at the book beginning', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addQuote('C', {quoteId: 'Q', paragraphId: 'QN', value: '原文规定 {{期限}}', data: {期限: {type: 'fact', factId: 'PERIOD'}}})
    editor.addTableOfContents('B', 'TOC')
    const draft = view.getEditingRow('D')?.['draft'] as {nodes: Array<Record<string, unknown>>}
    expect(draft.nodes.map(node => node['nodeId'])).toEqual(['B', 'TOC', 'C', 'H', 'Q', 'QN'])
    expect(draft.nodes[1]).toEqual({nodeId: 'TOC', parentId: 'B', index: 0, type: 'toc', class: [], value: '', data: {}})
    expect(draft.nodes[2]?.['index']).toBe(1)
    expect(draft.nodes[5]).toMatchObject({parentId: 'Q', type: 'paragraph', value: '原文规定 {{期限}}', data: {期限: {type: 'fact', factId: 'PERIOD'}}})
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    expect(() => editor.addTableOfContents('B', 'TOC2')).toThrow('DOCUMENT:B')
    expect(view.getEditingRow('D')?.['draft']).toEqual(before)
  } finally {ds.destroy()}
})

it('rejects malformed new containers atomically instead of leaving an empty list or an orphan child', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    for (const invalid of [
      () => editor.addList('B', {listId: 'L', itemId: 'I', paragraphId: 'N', value: ''}),
      () => editor.addList('C', {listId: 'L', itemId: 'L', paragraphId: 'N', value: ''}),
      () => editor.addListItem('C', {itemId: 'I', paragraphId: 'N', value: ''}),
      () => editor.addQuote('C', {quoteId: 'Q', paragraphId: 'H', value: ''}),
      () => editor.addTableOfContents('C', 'TOC'),
    ]) {
      expect(invalid).toThrow()
      expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    }
  } finally {ds.destroy()}
})

it('preserves the last list item and quote paragraph until their whole container is removed', async () => {
  const {ds, view, editor} = await fixture()
  try {
    editor.addDocument({documentId: 'B', chapterId: 'C', headingId: 'H', title: '实施方案'})
    editor.addList('C', {listId: 'L', itemId: 'I', paragraphId: 'N', value: '列表原文'})
    editor.addQuote('C', {quoteId: 'Q', paragraphId: 'QN', value: '引文'})
    const before = structuredClone(view.getEditingRow('D')?.['draft'])
    for (const id of ['I', 'N', 'QN']) {
      expect(() => editor.remove(id)).toThrow('EMPTY_CONTAINER:')
      expect(view.getEditingRow('D')?.['draft']).toEqual(before)
    }
    editor.remove('L'); editor.remove('Q')
    expect((view.getEditingRow('D')?.['draft'] as {nodes: Array<{nodeId: string}>}).nodes.map(node => node.nodeId)).toEqual(['B', 'C', 'H'])
  } finally {ds.destroy()}
})

it.each(['permission', 'scope', 'project'])('blocks all new container actions after %s changes', async mode => {
  const {ds, view, editor, invalidate} = await fixture(mode !== 'permission')
  try {
    if (mode === 'scope') invalidate()
    const target = mode === 'project' ? new ContentTreeDraftEditor(view, 'D', 'OTHER') : editor
    for (const action of [
      () => target.addList('C', {listId: 'L', itemId: 'I', paragraphId: 'N', value: ''}),
      () => target.addListItem('L', {itemId: 'I', paragraphId: 'N', value: ''}),
      () => target.addQuote('C', {quoteId: 'Q', paragraphId: 'N', value: ''}),
      () => target.addTableOfContents('B', 'TOC'),
    ]) {
      expect(action).toThrow()
      expect(view.hasEditingChanges()).toBe(false)
    }
  } finally {ds.destroy()}
})
