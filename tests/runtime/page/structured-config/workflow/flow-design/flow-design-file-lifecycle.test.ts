import {describe,expect,it} from 'vitest'
import {fixture,storage} from './flow-design-data.fixture'
import {lowcodeApi} from '@/platform-adapters/lowcode-runtime'
import {cancelFlowDesignChanges,prepareFlowDesignViews,stageFlowDesignGraph,saveFlowDesignInfo} from '@/platform-adapters/resources/system/workflow/manage'

describe('flow document deletion through its original file DataView',()=>{
 it('creates a missing design file, reads it again, cancels edits and removes it through the original view',async()=>{
  const {runtime,ds,http}=await fixture(false,false);storage.exists=false
  await prepareFlowDesignViews(runtime,'FM-1')
  const document=ds.getView('FlowDesignDocument','document-FM-1')!
  expect(document.rows).toHaveLength(0)
  await stageFlowDesignGraph({runtime,flowModelId:'FM-1',layoutOverride:{nodePositions:{N1:{x:10,y:20}}}})
  expect(storage.writes).toBe(0)
  expect((await saveFlowDesignInfo({runtime,flowModelId:'FM-1'})).complete).toBe(true)
  expect(storage.exists).toBe(true);expect(storage.writes).toBe(1)
  const reopened=document.createQueryView('reopen-design-file');await reopened.refresh()
  expect(reopened.loadingError).toBeNull();expect(reopened.rows[0]?.['content']).toBe(storage.text)
  expect(JSON.parse(storage.text)).toMatchObject({nodes:[{id:'N1',x:10,y:20}]})
  await stageFlowDesignGraph({runtime,flowModelId:'FM-1',layoutOverride:{nodePositions:{N1:{x:30,y:40}}}})
  cancelFlowDesignChanges({runtime,flowModelId:'FM-1'})
  expect(document.hasEditingChanges()).toBe(false);expect(storage.writes).toBe(1)
  await document.removeRow(document.getPkKey(document.rows[0]!)!)
  expect((await ds.saveChanges({views:[{tableName:document.tableName,viewId:document.viewId}]})).success).toBe(true)
  expect(storage.exists).toBe(false);expect(storage.removes).toBe(1);expect(http.saves).toEqual([])
 })

 it('cancels a staged deletion without IO and submits only the exact file while retaining database drafts',async()=>{
  const {ds,nodes,http}=await fixture(),document=ds.getView('FlowDesignDocument','document-FM-1')!
  const key=document.getPkKey(document.rows[0]!)!,scope={views:[{tableName:document.tableName,viewId:document.viewId}]}
  expect(document.deleteActionState(document.rows[0]!)).toBe('enabled')
  await document.removeRow(key);document.discardPendingChanges()
  expect(document.rows).toHaveLength(1);expect(storage.removes).toBe(0)
  nodes.updateEditingValue('N1','TITLE','Unrelated node draft')
  await document.removeRow(key)
  expect(storage.removes).toBe(0)
  expect((await ds.saveChanges(scope)).success).toBe(true)
  expect(storage.removes).toBe(1);expect(storage.exists).toBe(false)
  expect(lowcodeApi.design.removeFile).toHaveBeenCalledWith({appType:'designfile',customPath:'SysForm',fileName:'FM-1EJ2.json'})
  expect(http.saves).toEqual([]);expect(nodes.getEditingRow('N1')?.['TITLE']).toBe('Unrelated node draft')
  expect(storage.writes).toBe(0);expect(document.rows).toHaveLength(0)
 })

 it('denies file deletion when the original model allows editing but denies deletion',async()=>{
  const {runtime,ds,http}=await fixture(false,false)
  http.denyDelete.add('WFM_FLOW_MODLE');await prepareFlowDesignViews(runtime,'FM-1')
  const model=ds.getView('WFM_FLOW_MODLE','fileTarget')!,document=ds.getView('FlowDesignDocument','document-FM-1')!
  expect(model.editActionState(model.rows[0]!)).toBe('enabled')
  expect(document.deleteActionState(document.rows[0]!)).toBe('disabled')
  await document.removeRow(document.getPkKey(document.rows[0]!)!)
  await expect(ds.saveChanges({views:[{tableName:document.tableName,viewId:document.viewId}]})).rejects.toThrow('FILE_RESOURCE_READ_ONLY')
  expect(storage.removes).toBe(0);expect(storage.exists).toBe(true)
 })

 it('retains a lost deletion receipt and verifies the original removal without replay',async()=>{
  const {runtime,ds}=await fixture(),document=ds.getView('FlowDesignDocument','document-FM-1')!
  const scope={views:[{tableName:document.tableName,viewId:document.viewId}]}
  await document.removeRow(document.getPkKey(document.rows[0]!)!);storage.loseDeleteReceipt=true
  await expect(ds.saveChanges(scope)).rejects.toThrow('lost delete receipt')
  expect(document.hasUnconfirmedSave).toBe(true);expect(storage.removes).toBe(1)
  expect(()=>cancelFlowDesignChanges({runtime,flowModelId:'FM-1'})).toThrow()
  expect((await ds.saveChanges(scope)).success).toBe(true)
  expect(document.hasUnconfirmedSave).toBe(false);expect(storage.removes).toBe(1)
  expect(document.rows).toHaveLength(0)
 })

 it('rejects deletion after the original model target query changes',async()=>{
  const {ds}=await fixture(),document=ds.getView('FlowDesignDocument','document-FM-1')!
  await document.removeRow(document.getPkKey(document.rows[0]!)!)
  ds.getView('WFM_FLOW_MODLE','fileTarget')!.queryContext={rowid:'FM-2'}
  await expect(ds.saveChanges({views:[{tableName:document.tableName,viewId:document.viewId}]})).rejects.toThrow('FLOW_DESIGN_TARGET')
  expect(storage.removes).toBe(0);expect(storage.exists).toBe(true)
 })
})
