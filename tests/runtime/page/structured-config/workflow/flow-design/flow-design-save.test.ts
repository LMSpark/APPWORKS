import {describe,expect,it} from 'vitest'
import {fixture,storage} from './flow-design-data.fixture'
import {saveFlowDesignInfo,addFlowDesignNode,removeFlowDesignGraphSelection,stageFlowDesignGraph,cancelFlowDesignChanges,prepareFlowDesignViews,WorkflowFlowModelManager} from '@/lowcode/resources/system/workflow/manage'

describe('flow design saves through its original data workspace',()=>{
 it('saves a model through its bound DataView without committing another workspace draft',async()=>{
  const {ds,http,nodes}=await fixture()
  const model=ds.getView('WFM_FLOW_MODLE')!
  model.updateEditingValue('FM-1','TITLE','Model edit');nodes.updateEditingValue('N1','TITLE','Unrelated node draft')
  await new WorkflowFlowModelManager(model).saveCurrent()
  expect(http.records['WFM_FLOW_MODLE']![0]!['TITLE']).toBe('Model edit')
  expect(http.records['WFM_FLOW_NODE']![0]!['TITLE']).toBe('Start')
  expect(nodes.getEditingRow('N1')?.['TITLE']).toBe('Unrelated node draft')
 })
 it('loads only the selected flow and stages node creation until explicit save',async()=>{
  const {runtime,ds,http,nodes}=await fixture(true)
  expect(ds.getView('WFM_FLOW_MODLE')!.rows.map(row=>row['rowid'])).toEqual(['FM-1'])
  expect(nodes.rows.map(row=>row['rowid'])).toEqual(['N1'])
  const created=await addFlowDesignNode({runtime,flowModelId:'FM-1',layoutOverride:{}})
  expect(http.saves).toHaveLength(0);expect(nodes.dirtyTracking.isPendingCreate(created.nodeId)).toBe(true)
  nodes.discardPendingChanges([created.nodeId]);expect(nodes.rows.map(row=>row['rowid'])).toEqual(['N1'])
 })
 it('tracks graph deletion so cancelling restores the original formal node',async()=>{
  const {runtime,http,nodes}=await fixture()
  await removeFlowDesignGraphSelection({runtime,flowModelId:'FM-1',selection:{kind:'node',id:'N1'},layoutOverride:{}})
  expect(nodes.dirtyTracking.isPendingDelete('N1')).toBe(true)
  nodes.discardPendingChanges();expect(nodes.rows.map(row=>row['rowid'])).toEqual(['N1']);expect(http.saves).toHaveLength(0)
 })
 it('saves the last form deletion once and preserves unrelated workspace edits',async()=>{
  const {runtime,ds,http,nodes,forms}=await fixture()
  const apps=ds.getView('Base_AppSystemList')!;await apps.refresh();apps.updateEditingValue('APP','AppDesc','Unrelated draft')
  nodes.updateEditingValue('N1','TITLE','Changed');await forms.removeRow('WF1')
  await saveFlowDesignInfo({runtime,flowModelId:'FM-1'})
  expect(http.records['WFM_WORKFORM']).toEqual([])
  expect(http.records['WFM_FLOW_NODE']![0]!['TITLE']).toBe('Changed')
  expect(http.records['Base_AppSystemList']![0]!['AppDesc']).toBe('Original')
  expect(apps.getEditingRow('APP')?.['AppDesc']).toBe('Unrelated draft')
  expect(storage.posts).toEqual([])
  expect(JSON.parse(storage.text)).toMatchObject({viewport:{zoom:2},nodes:[{id:'N1',custom:'preserve'}]})
 })
 it('does not save a form workspace that was freshly queried for a different flow',async()=>{
  const {runtime,http,forms}=await fixture()
  http.records['WFM_WORKFORM']!.push({rowid:'WF2',FlowID:'FM-2',FORMID:'OTHER',FormName:'Other'})
  forms.queryContext={...forms.queryContext,FLOWID:'FM-2'};await forms.refresh();forms.updateEditingValue('WF2','FormName','Other draft')
  await expect(saveFlowDesignInfo({runtime,flowModelId:'FM-1'})).rejects.toThrow()
  expect(http.saves).toHaveLength(0);expect(http.records['WFM_WORKFORM']![1]!['FormName']).toBe('Other')
 })
 it('checks every original query before discarding any workspace draft',async()=>{
  const {runtime,ds,forms}=await fixture()
  await stageFlowDesignGraph({runtime,flowModelId:'FM-1',layoutOverride:{nodePositions:{N1:{x:50,y:60}}}})
  forms.updateEditingValue('WF1','FormName','Draft');forms.queryContext={...forms.queryContext,FLOWID:'FM-2'}
  expect(()=>cancelFlowDesignChanges({runtime,flowModelId:'FM-1'})).toThrow()
  expect(ds.getView('FlowDesignDocument','document-FM-1')!.hasEditingChanges()).toBe(true)
 })
 it('does not copy an unreadable node title into the design file during another field edit',async()=>{
  const {runtime,http,nodes}=await fixture(false,false)
  http.records['WFM_FLOW_NODE']![0]!['TITLE']='Hidden title';http.hiddenFields['WFM_FLOW_NODE']=['TITLE']
  await prepareFlowDesignViews(runtime,'FM-1');nodes.updateEditingValue('N1','MEMO','Updated')
  await saveFlowDesignInfo({runtime,flowModelId:'FM-1'})
  expect(storage.text).not.toContain('Hidden title');expect(http.records['WFM_FLOW_NODE']![0]!['TITLE']).toBe('Hidden title')
 })
 it('keeps same-file derived views in the same draft and adoption boundary',async()=>{
  const {runtime,ds}=await fixture()
  await stageFlowDesignGraph({runtime,flowModelId:'FM-1',layoutOverride:{nodePositions:{N1:{x:50,y:60}}}})
  const document=ds.getView('FlowDesignDocument','document-FM-1')!,other=document.createQueryView('second-document')
  await other.refresh();const snapshot=await other.previewSource()
  await expect(other.adoptSource(snapshot)).rejects.toThrow()
  expect(document.hasEditingChanges()).toBe(true)
 })
 it('verifies the original unknown file write without uploading again',async()=>{
  const {runtime,ds}=await fixture();ds.getView('WFM_FLOW_NODE')!.updateEditingValue('N1','TITLE','Changed')
  storage.loseReceipt=true
  await expect(saveFlowDesignInfo({runtime,flowModelId:'FM-1'})).rejects.toThrow()
  expect(storage.writes).toBe(1)
  ds.getView('WFM_FLOW_NODE')!.updateEditingValue('N1','TITLE','Later')
  const recovered=await saveFlowDesignInfo({runtime,flowModelId:'FM-1'})
  expect(recovered.complete).toBe(false)
  expect(storage.writes).toBe(1);expect(storage.posts).toEqual([])
  const saved=await saveFlowDesignInfo({runtime,flowModelId:'FM-1'});expect(saved.complete).toBe(true);expect(storage.writes).toBe(2)
 })
})
