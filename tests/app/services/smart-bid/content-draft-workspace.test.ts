import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import ContentDraftWorkspace from '@/views/features/application/smart-bid/authoring/ui/content-draft-workspace.vue'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const originalStubs = {...config.global.stubs}
let wrapper: VueWrapper | undefined, runtime: PageRuntime | undefined
afterEach(() => {wrapper?.unmount(); runtime?.dispose(); config.global.stubs = originalStubs})
async function fixture(author = 'U', loaded = true, empty = false) {
 registerAllRenderers()
 const draft = {nodes: empty ? [] : [
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
it('builds books, chapters and paragraphs through the original draft then cancels all local structure changes',async()=>{
 const f=await fixture('U',true,true)
 const button=(label:string)=>f.wrapper.findAll('button').find(item=>item.text()===label)!
 await button('新增逻辑册').trigger('click');await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(3)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
 await button('新增段落').trigger('click');await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(4)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[0]!.trigger('click');await flushPromises()
 await button('新增章节').trigger('click');await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(6)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[4]!.trigger('click');await flushPromises()
 await button('删除所选子树').trigger('click');await flushPromises()
 expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(4)
 expect(f.view.rows[0]?.['draft']).toEqual(f.draft);expect(f.view.hasEditingChanges('D')).toBe(true)
 expect(f.save).not.toHaveBeenCalled()
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
 expect(f.view.hasEditingChanges()).toBe(false)
})
it('authors list items, nested lists, quotes and a unique book table of contents through standard actions',async()=>{
 const f=await fixture(),button=(label:string)=>{
  const target=f.wrapper.findAll('button').find(item=>item.text()===label)
  expect(target,`Missing action: ${label}`).toBeDefined();return target!
 }
 const nodes=()=> (f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{nodeId:string;parentId:string;index:number;type:string;class:string[]}>}).nodes
 const select=async(nodeId:string)=>{
  const index=nodes().findIndex(node=>node.nodeId===nodeId)
  expect(index).toBeGreaterThanOrEqual(0)
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[index]!.trigger('click');await flushPromises()
 }
 await select('C');await button('新增编号列表').trigger('click');await flushPromises()
 const list=nodes().find(node=>node.type==='list')!
 expect(list).toMatchObject({parentId:'C',index:1,class:['ordered']})
 await select(list.nodeId);await button('新增列表项').trigger('click');await flushPromises()
 expect(nodes().filter(node=>node.parentId===list.nodeId).map(node=>node.index)).toEqual([0,1])
 const item=nodes().find(node=>node.parentId===list.nodeId)!
 await select(item.nodeId);await button('新增项目符号列表').trigger('click');await flushPromises()
 expect(nodes().find(node=>node.type==='list'&&node.parentId===item.nodeId)).toMatchObject({class:[]})
 await select(item.nodeId);await button('新增段落').trigger('click');await flushPromises()
 expect(nodes().filter(node=>node.parentId===item.nodeId&&node.type==='paragraph')).toHaveLength(2)
 const itemParagraph=nodes().filter(node=>node.parentId===item.nodeId&&node.type==='paragraph').at(-1)!
 await select(itemParagraph.nodeId)
 const itemText=f.wrapper.get('input[aria-label="正文"]')
 await itemText.setValue('保留原件与出处');await itemText.trigger('change');await flushPromises()
 expect((f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{nodeId:string;value:string}>}).nodes.find(node=>node.nodeId===itemParagraph.nodeId)?.value).toBe('保留原件与出处')
 await select('C');await button('新增引文').trigger('click');await flushPromises()
 const quote=nodes().find(node=>node.type==='quote')!
 expect(nodes().filter(node=>node.parentId===quote.nodeId)).toHaveLength(1)
 await select(quote.nodeId);await button('新增段落').trigger('click');await flushPromises()
 expect(nodes().filter(node=>node.parentId===quote.nodeId&&node.type==='paragraph')).toHaveLength(2)
 const quoteParagraph=nodes().filter(node=>node.parentId===quote.nodeId&&node.type==='paragraph').at(-1)!
 await select(quoteParagraph.nodeId)
 const quoteText=f.wrapper.get('input[aria-label="正文"]')
 await quoteText.setValue('原文中的适用范围');await quoteText.trigger('change');await flushPromises()
 expect((f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{nodeId:string;value:string}>}).nodes.find(node=>node.nodeId===quoteParagraph.nodeId)?.value).toBe('原文中的适用范围')
 await select('B');await button('新增目录').trigger('click');await flushPromises()
 expect(nodes()[1]).toMatchObject({type:'toc',parentId:'B',index:0})
 expect(nodes().find(node=>node.nodeId==='C')?.index).toBe(1)
 await select('B');expect(button('新增目录').attributes('disabled')).toBeDefined()
 expect(f.view.rows[0]?.['draft']).toEqual(f.draft);expect(f.save).not.toHaveBeenCalled()
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft);expect(f.view.hasEditingChanges()).toBe(false)
})
it.each(['host','query'])('rejects an old structure callback after %s invalidation',async mode=>{
 const f=await fixture(),before=structuredClone(f.view.getEditingRow('D')?.['draft'])
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='新增逻辑册')?.props('onClick')
 expect(typeof callback).toBe('function')
 if(mode==='host')f.assertCurrent.mockImplementation(()=>{throw Error('会话已切换')})
 else await f.view.refresh()
 if(typeof callback==='function')callback()
 await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(before);expect(f.view.hasEditingChanges()).toBe(false)
 expect(f.wrapper.text()).toContain(mode==='host'?'会话已切换':'草稿内容已更新，请重新选择后操作')
 expect(f.save).not.toHaveBeenCalled()
})
it('protects unconfirmed text against structure operations and cancels its local input',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='新增逻辑册')?.props('onClick')
 const input=f.wrapper.get<HTMLInputElement>('input[aria-label="正文"]')
 input.element.value='尚未确认的输入';await input.trigger('input');await flushPromises()
 const add=f.wrapper.findAll('button').find(button=>button.text()==='新增逻辑册')!
 expect(add.element.hasAttribute('disabled')).toBe(true)
 if(typeof callback==='function')callback()
 await flushPromises()
 expect(f.wrapper.text()).toContain('请先确认或取消当前文字输入')
 expect(f.view.hasEditingChanges('D')).toBe(false)
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.wrapper.find('input[aria-label="正文"]').exists()).toBe(false)
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft);expect(f.save).not.toHaveBeenCalled()
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([false])
})
it('leaves the original draft unchanged when deleting its only chapter would invalidate the book',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
 const remove=f.wrapper.findAll('button').find(button=>button.text()==='删除所选子树')!
 await remove.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('内容结构无效')
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
 expect(f.view.hasEditingChanges()).toBe(false);expect(f.save).not.toHaveBeenCalled()
})
it('rejects an old structure callback after the workspace unmounts while its runtime remains live',async()=>{
 const f=await fixture(),before=structuredClone(f.view.getEditingRow('D')?.['draft'])
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='新增逻辑册')?.props('onClick')
 expect(typeof callback).toBe('function');f.wrapper.unmount();wrapper=undefined
 if(typeof callback==='function')callback()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(before);expect(f.view.hasEditingChanges()).toBe(false)
})
it('invalidates the captured JSON field write guard when the workspace unmounts',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const callback:unknown=f.wrapper.findAllComponents({name:'FieldJson'}).find(field=>field.props('mode')==='form')?.props('onChange')
 expect(typeof callback).toBe('function');f.wrapper.unmount();wrapper=undefined
 if(typeof callback==='function')expect(()=>callback()).toThrow('正文工作区已关闭')
 expect(f.view.hasEditingChanges()).toBe(false)
})
it('does not let a closed workspace cancel edits retained in the original live view',async()=>{
 const f=await fixture()
 f.view.updateEditingValue('D','draft',{...f.draft,responseChanges:[{id:'keep'}]});await flushPromises()
 const before=structuredClone(f.view.getEditingRow('D')?.['draft'])
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='取消本次草稿编辑')?.props('onClick')
 expect(typeof callback).toBe('function');f.wrapper.unmount();wrapper=undefined
 if(typeof callback==='function')callback()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(before);expect(f.view.hasEditingChanges('D')).toBe(true)
})
it('moves paragraphs within sibling bounds and preserves the mandatory heading and stable identities',async()=>{
 const f=await fixture(),button=(label:string)=>f.wrapper.findAll('button').find(item=>item.text()===label)!
 for(let count=0;count<2;count++){
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
  await button('新增段落').trigger('click');await flushPromises()
 }
 const nodes=()=> (f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{nodeId:string;index:number}>}).nodes
 const original=nodes().map(node=>node.nodeId)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[4]!.trigger('click');await flushPromises()
 await button('上移').trigger('click');await flushPromises()
 expect(nodes().map(node=>node.nodeId)).toEqual([...original.slice(0,3),original[4],original[3]])
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[3]!.trigger('click');await flushPromises()
 await button('下移').trigger('click');await flushPromises()
 expect(nodes().map(node=>node.nodeId)).toEqual(original)
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 expect(button('上移').element.hasAttribute('disabled')).toBe(true)
 expect(button('下移').element.hasAttribute('disabled')).toBe(true)
 expect(nodes()[2]?.index).toBe(0);expect(f.save).not.toHaveBeenCalled()
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
})
it('rejects a captured node command after the user selects another node in the same draft',async()=>{
 const f=await fixture(),before=structuredClone(f.view.getEditingRow('D')?.['draft'])
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='新增段落')?.props('onClick')
 expect(typeof callback).toBe('function')
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[0]!.trigger('click');await flushPromises()
 if(typeof callback==='function')callback()
 await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(before)
 expect(f.view.hasEditingChanges()).toBe(false);expect(f.save).not.toHaveBeenCalled()
 expect(f.wrapper.text()).toContain('所选内容已变化，请重新选择后操作')
})
it('preserves newer local ordering when an older selected-node delete callback is invoked',async()=>{
 const f=await fixture()
 for(let count=0;count<2;count++){
  await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
  await f.wrapper.findAll('button').find(button=>button.text()==='新增段落')!.trigger('click');await flushPromises()
 }
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[4]!.trigger('click');await flushPromises()
 const callback:unknown=f.wrapper.findAllComponents({name:'RendererButton'}).find(button=>button.props('label')==='删除所选子树')?.props('onClick')
 expect(typeof callback).toBe('function')
 const changed=structuredClone(f.view.getEditingRow('D')?.['draft']) as typeof f.draft
 const first=changed.nodes[3]!,second=changed.nodes[4]!
 first.index=2;second.index=1;changed.nodes.splice(3,2,second,first)
 f.view.updateEditingValue('D','draft',changed);await flushPromises()
 if(typeof callback==='function')callback()
 await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(changed)
 expect(f.wrapper.text()).toMatch(/内容(?:位置)?已变化/u)
 expect(f.save).not.toHaveBeenCalled()
})
it('edits semantic classes and structured fact references in the original selected node',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const text=f.wrapper.get('input[aria-label="正文"]')
 await text.setValue('我方报价{{总价}}元');await text.trigger('change');await flushPromises()
 const classes=f.wrapper.get('textarea[aria-label="内容分类"]')
 await classes.setValue('["投标函"]');await classes.trigger('change');await flushPromises()
 const select=f.wrapper.find('[data-json-member="data"] [data-json-member="总价"] .el-select')
 expect(select.exists()).toBe(true)
 const choice=f.wrapper.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='引用类型')!
 choice.vm.$emit('update:modelValue','fact');await flushPromises()
 const fact=f.wrapper.get('input[aria-label="事实标识"]')
 await fact.setValue('FACT_PRICE_REFERENCE');await fact.trigger('change');await flushPromises()
 const draft=f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{value:string;class:string[];data:unknown}>}
 expect(draft.nodes[2]).toMatchObject({value:'我方报价{{总价}}元',class:['投标函'],data:{总价:{type:'fact',factId:'FACT_PRICE_REFERENCE'}}})
 expect(f.view.rows[0]?.['draft']).toEqual(f.draft);expect(f.save).not.toHaveBeenCalled()
 await f.wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(f.view.getEditingRow('D')?.['draft']).toEqual(f.draft)
})
it('retains zero, false and unconfirmed text across reference type changes and explicitly removes unused bindings',async()=>{
 const f=await fixture()
 await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
 const body=()=>f.wrapper.get<HTMLInputElement>('input[aria-label="正文"]')
 const choose=async(name:string,type:string)=>{
  const region=f.wrapper.get(`[data-json-member="data"] [data-json-member="${name}"]`)
  region.findAllComponents(ElSelect).find((item:VueWrapper<InstanceType<typeof ElSelect>>)=>item.props('ariaLabel')==='引用类型')!.vm.$emit('update:modelValue',type)
  await flushPromises()
 }
 await body().setValue('确认{{是否}}，报价{{金额}}元');await body().trigger('change');await flushPromises()
 await choose('是否','bool')
 const bool=f.wrapper.get('[data-json-member="data"] [data-json-member="是否"]').findAllComponents(ElSelect)
  .find((item:VueWrapper<InstanceType<typeof ElSelect>>)=>item.props('ariaLabel')==='布尔值')!
 bool.vm.$emit('update:modelValue',false);await flushPromises()
 await choose('金额','number')
 const number=f.wrapper.findAll('input[aria-label="规范数值"]').at(-1)!
 await number.setValue('0.00');await number.trigger('change');await flushPromises()
 const unit=f.wrapper.findAll('input[aria-label="单位"]').at(-1)!
 await unit.setValue('元');await unit.trigger('change');await flushPromises()
 const current=()=> (f.view.getEditingRow('D')?.['draft'] as {nodes:Array<{value:string;data:Record<string,unknown>}>}).nodes[2]!
 expect(current().data).toEqual({是否:{type:'bool',bool:false},金额:{type:'number',number:'0.00',unit:'元'}})
 body().element.value='未确认：确认{{是否}}，报价{{金额}}元';await body().trigger('input');await flushPromises()
 await choose('是否','fact')
 expect(body().element.value).toBe('未确认：确认{{是否}}，报价{{金额}}元')
 expect(current().value).toBe('确认{{是否}}，报价{{金额}}元')
 expect(f.wrapper.emitted('pending')?.at(-1)).toEqual([true])
 await choose('是否','bool')
 await body().trigger('change');await flushPromises()
 await body().setValue('只报{{金额}}元');await body().trigger('change');await flushPromises()
 expect(current().data['是否']).toEqual({type:'bool',bool:false})
 await f.wrapper.get('button[aria-label="移除 是否"]').trigger('click');await flushPromises()
 expect(current().data).toEqual({金额:{type:'number',number:'0.00',unit:'元'}})
 expect(f.save).not.toHaveBeenCalled()
})
