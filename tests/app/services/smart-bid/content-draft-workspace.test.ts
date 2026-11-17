import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import ContentDraftWorkspace from '@/views/features/application/smart-bid/authoring/ui/content-draft-workspace.vue'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const originalStubs = {...config.global.stubs}
let wrapper: VueWrapper | undefined, runtime: PageRuntime | undefined
afterEach(() => {wrapper?.unmount(); runtime?.dispose(); config.global.stubs = originalStubs})
async function fixture(author = 'U', loaded = true) {
 registerAllRenderers()
 const draft = {nodes: [
  {nodeId:'B',parentId:'P',index:0,type:'document',class:[],value:'',data:{}},
  {nodeId:'C',parentId:'B',index:0,type:'chapter',class:[],value:'',data:{}},
  {nodeId:'H',parentId:'C',index:0,type:'heading',class:[],value:'原文',data:{}},
 ],responseChanges:[]}
 const ds = DataSet.fromJson({scenarioId:'S',tables:{WorkingDraft:{modelBinding:{modelId:'M',modelName:'WorkingDraft'},
  columns:[{name:'draftId',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],
  views:{personalDraft:{commitMode:'staged',rows:[]},default:{rows:[]}}}}})
 runtime = new PageRuntime({pageId:'workspace-test',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load()
 const view = ds.getView('WorkingDraft','personalDraft')!
 const query = new DataSpaceQueryTable({scenarioId:'S',metaName:'WorkingDraft'})
 const context = new DataSpaceQueryContext({identity:query.identity,scope:'original',readScope:()=> 'original',snapshot:query.applyResult({Result:{primaryKeyField:'draftId',
  data:{Count:2,Items:['D','OTHER'].map(draftId=>({draftId,projectId:'P',userId:author,draft:structuredClone(draft),lingma_sys_params:{r:[],e:['draft'],h:[],m:[],d:false}}))}}})})
 const save = vi.fn(async()=>{throw Error('UNEXPECTED_REMOTE_WRITE')})
 view.bindQueryExecutor({executeQuery:async()=>context,save});if(loaded)await view.refresh()
 const assertCurrent = vi.fn()
 const stubs={...originalStubs};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 wrapper=mount(ContentDraftWorkspace,{attachTo:document.body,props:{runtime,dataViewKey:'S@WorkingDraft@personalDraft',draftId:'D',projectId:'P',actorUserId:'U',assertCurrent},
  global:{plugins:[ElementPlus,Spark.createPlugin()]}});await flushPromises()
 return {ds,view,draft,save,assertCurrent,wrapper}
}
it('edits the original view and cancels only this draft while remote saving remains unavailable',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const input=f.wrapper.get('input[aria-label="正文"]');await input.setValue('本地改稿');await input.trigger('change');await flushPromises()
 expect(f.view.hasEditingChanges('D')).toBe(true)
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([true])
 f.view.updateEditingValue('OTHER','draft',{...f.draft,responseChanges:[{id:'keep'}]})
 await expect(f.ds.saveChanges()).rejects.toThrow('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')
 expect(f.save).not.toHaveBeenCalled()
 expect(f.wrapper.text()).toContain('远端保存待建')
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.view.hasEditingChanges('D')).toBe(false)
 expect(f.view.hasEditingChanges('OTHER')).toBe(true)
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([false])
})
it('does not render another author’s draft or mutate its view',async()=>{
 const f=await fixture('OTHER_AUTHOR')
 expect(f.wrapper.find('input[aria-label="正文"]').exists()).toBe(false)
 expect(f.wrapper.text()).toContain('当前作者的项目草稿不可读取')
 expect(f.view.hasEditingChanges()).toBe(false)
 expect(f.save).not.toHaveBeenCalled()
})
it('withdraws the editor after scope invalidation and preserves the original local edits',async()=>{
 const f=await fixture()
 f.view.updateEditingValue('D','draft',{...f.draft,responseChanges:[{id:'local'}]});await flushPromises()
 f.assertCurrent.mockImplementation(()=>{throw Error('会话已切换')})
 f.view.events.emit('requestStateChanged',f.view.requestState);await flushPromises()
 expect(f.wrapper.text()).toContain('会话已切换')
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(0)
 expect(f.view.hasEditingChanges('D')).toBe(true)
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([true])
 expect(f.save).not.toHaveBeenCalled()
})
it('rejects the existing text callback after host invalidation before any view event is emitted',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const input=f.wrapper.get('input[aria-label="正文"]')
 const before=structuredClone(f.view.getEditingRow('D')?.['draft'])
 f.assertCurrent.mockImplementation(()=>{throw Error('会话已切换')})
 await input.setValue('失效后的正文');await input.trigger('change');await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(before)
 expect(f.view.hasEditingChanges('D')).toBe(false)
 expect(f.wrapper.text()).toContain('会话已切换')
 expect(f.save).not.toHaveBeenCalled()
})
it('rejects a local binding without borrowing the only loaded space',async()=>{
 const f=await fixture()
 await f.wrapper.setProps({dataViewKey:'WorkingDraft@personalDraft'});await flushPromises()
 expect(f.wrapper.text()).toContain('必须绑定完整WorkingDraft视图')
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(0)
 expect(f.view.hasEditingChanges()).toBe(false)
})
it('recovers when the original view finishes its first query after the workspace mounts',async()=>{
 const f=await fixture('U',false)
 expect(f.wrapper.text()).toContain('当前作者的项目草稿不可读取')
 await f.view.refresh();await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(3)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 expect(f.wrapper.get('input[aria-label="正文"]').element).toBeDefined()
 expect(f.save).not.toHaveBeenCalled()
})
it('reports pending changes for a clean target switch within the same original view',async()=>{
 const f=await fixture()
 await f.wrapper.setProps({draftId:'OTHER'});await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr'),f.wrapper.text()).toHaveLength(3)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const input=f.wrapper.get('input[aria-label="正文"]')
 await input.setValue('第二份草稿');await input.trigger('change');await flushPromises()
 expect(f.view.hasEditingChanges('OTHER')).toBe(true)
 expect(f.view.hasEditingChanges('D')).toBe(false)
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([true])
})
