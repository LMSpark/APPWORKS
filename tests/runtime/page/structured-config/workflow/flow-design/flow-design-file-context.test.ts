import {describe,expect,it} from 'vitest'
import {fixture} from './flow-design-data.fixture'
import {prepareFlowDesignViews,resolveFlowDesignFileContext} from '@/platform-adapters/resources/system/workflow/manage'
describe('formal flow design file context',()=>{
 it('uses SysForm only from a confirmed empty sysid and rejects an external model copy',async()=>{
  const {runtime}=await fixture()
  expect(await resolveFlowDesignFileContext({runtime,flowModelId:'FM-1'})).toEqual({customPath:'SysForm',applicationId:''})
  await expect(resolveFlowDesignFileContext({runtime,flowModelId:'FM-1',modelRow:{rowid:'FM-1',sysid:''}})).rejects.toThrow('外部模型行')
 })
 it('resolves the original navigation once and does not reload it during ordinary save preparation',async()=>{
  const {runtime,http}=await fixture(false,false)
  http.records['WFM_FLOW_MODLE']![0]!['sysid']='APP';http.records['Base_NavigationInfo']=[{rowid:'APP',folderName:'AppWorksForms'}]
  await prepareFlowDesignViews(runtime,'FM-1')
  const reads=http.reads.filter(read=>read.table==='Base_NavigationInfo').length
  expect(await resolveFlowDesignFileContext({runtime,flowModelId:'FM-1'})).toEqual({customPath:'AppWorksForms',applicationId:'APP'})
  expect(http.reads.filter(read=>read.table==='Base_NavigationInfo')).toHaveLength(reads)
 })
 it('rejects an unreadable navigation directory instead of writing to SysForm',async()=>{
  const {runtime,http}=await fixture(false,false)
  http.records['WFM_FLOW_MODLE']![0]!['sysid']='APP';http.records['Base_NavigationInfo']=[{rowid:'APP',folderName:'Private'}]
  http.hiddenFields['Base_NavigationInfo']=['folderName']
  await expect(prepareFlowDesignViews(runtime,'FM-1')).rejects.toThrow('目录不可读')
 })
})
