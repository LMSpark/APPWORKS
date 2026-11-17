import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import {RendererButton} from '@spark-appworks/spark-component'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
import {previewScopedRevisionChanges} from '@/services/smart-bid/content/content-scoped-preview'
import ContentCandidateWorkspace from '@/views/features/application/smart-bid/authoring/ui/content-candidate-workspace.vue'
import {createCandidateReadFixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

let wrapper:VueWrapper|undefined,runtime:PageRuntime|undefined
const originalStubs={...config.global.stubs}
function treeLevels(target:VueWrapper):number[]{
 return target.findAll('.el-tree-node').map(node=>{
  let depth=1
  for(let parent=node.element.parentElement?.closest('.el-tree-node')??null;parent;parent=parent.parentElement?.closest('.el-tree-node')??null)depth++
  return depth
 })
}
afterEach(()=>{wrapper?.unmount();runtime?.dispose();config.global.stubs=originalStubs})
async function fixture(mode='populated',options?:Parameters<typeof createCandidateReadFixture>[1]){
 registerAllRenderers()
 const f=await createCandidateReadFixture(mode,options),binding=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:options?.threeVersions?'V2':null})
 runtime=new PageRuntime({pageId:'candidate-workspace',scenarioIds:['S'],loadScenario:async()=>f.ds});await runtime.load()
 const stubs={...originalStubs};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 wrapper=mount(ContentCandidateWorkspace,{attachTo:document.body,props:{runtime,binding},global:{plugins:[ElementPlus,VXETable,Spark.createPlugin()]}})
 await flushPromises()
 return {...f,binding,wrapper,runtime}
}
it('renders the candidate hierarchy through original standard fields without edits or extra queries',async()=>{
 const f=await fixture()
 expect(f.wrapper.text()).toContain('候选内容');expect(f.wrapper.text()).toContain('待比对与预演')
 expect(f.wrapper.findAll('.el-tree-node')).toHaveLength(3)
 expect(treeLevels(f.wrapper)).toEqual([1,2,3])
 expect(f.wrapper.text()).toContain('标题')
 expect(f.query).toHaveBeenCalledTimes(4);expect(f.runtime.isDirty).toBe(false);expect(f.save).not.toHaveBeenCalled()
 expect(f.wrapper.findAll('button').some(button=>button.text().includes('采用'))).toBe(false)
})
it('withdraws candidate content when any original query proof is replaced',async()=>{
 const f=await fixture()
 await f.ds.getView('ContentProject','selectedProject')!.refresh();await flushPromises()
 expect(f.wrapper.findAll('.el-tree-node')).toHaveLength(0)
 expect(f.wrapper.text()).toContain('候选读取已失效，请重新读取')
 expect(f.save).not.toHaveBeenCalled()
})
it('keeps an empty candidate explicit without inventing documents or querying node rows',async()=>{
 const f=await fixture('normal')
 expect(f.wrapper.text()).toContain('本候选尚无正文节点')
 expect(f.wrapper.findAll('.el-tree-node')).toHaveLength(0)
 expect(f.query).toHaveBeenCalledTimes(3);expect(f.runtime.isDirty).toBe(false)
})
it('refuses a different runtime even if it contains matching model names',async()=>{
 const f=await fixture(),other=await createCandidateReadFixture('populated')
 const foreign=new PageRuntime({pageId:'foreign',scenarioIds:['S'],loadScenario:async()=>other.ds});await foreign.load()
 try{
  await f.wrapper.setProps({runtime:foreign});await flushPromises()
  expect(f.wrapper.findAll('.el-tree-node')).toHaveLength(0)
  expect(f.wrapper.text()).toContain('候选运行实例不匹配')
 }finally{foreign.dispose()}
})
it('follows the original selected row and displays the whole node payload read-only',async()=>{
 const f=await fixture(),view=f.ds.getView('ContentNodeVersion','snapshotMembers')!
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 expect(view.currentRow?.['nodeId']).toBe('H')
 expect(view.currentRow?.['id']).toBe('ROW_H')
 expect(f.wrapper.text()).toContain('节点详情');expect(f.wrapper.text()).toContain('父节点')
 expect(f.wrapper.text()).toContain('同级顺序');expect(f.wrapper.text()).toContain('节点分类');expect(f.wrapper.text()).toContain('节点数据')
 const jsonValues=f.wrapper.findAllComponents({name:'JsonTreeEditor'}).map(editor=>JSON.parse(String(editor.props('modelValue'))))
 expect(jsonValues).toContainEqual({value:['candidate-heading']})
 expect(jsonValues).toContainEqual({value:{册名:{type:'xref',nodeId:'D',show:'title'}}})
 expect(f.wrapper.findAll('input[aria-label="原稿正文"],input[aria-label="父节点"]')).toHaveLength(0)
 expect(f.query).toHaveBeenCalledTimes(4);expect(f.runtime.isDirty).toBe(false);expect(f.save).not.toHaveBeenCalled()
 f.binding.assertCurrent()
})
it('uses sibling index rather than nodeId or server row order and preserves original version-row selection',async()=>{
 const f=await fixture('sibling-tree'),contents=f.wrapper.findAll('.el-tree-node__content')
 expect(treeLevels(f.wrapper)).toEqual([1,2,3,3,3])
 expect(contents[3]?.text()).toContain('第一段');expect(contents[4]?.text()).toContain('第二段')
 const view=f.ds.getView('ContentNodeVersion','snapshotMembers')!
 expect(view.rows.map(row=>row['nodeId'])).toEqual(['A','C','D','H','Z'])
 await contents[4]!.trigger('click');await flushPromises()
 expect(view.currentRow?.['id']).toBe('ROW_A');expect(view.currentRow?.['nodeId']).toBe('A')
 expect(f.runtime.isDirty).toBe(false);expect(f.save).not.toHaveBeenCalled();f.binding.assertCurrent()
})
it('reads a selected node fact from its fixed baseline and binds the original fact row read-only',async()=>{
 const f=await fixture('fact')
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 const button=f.wrapper.findAll('button').find(item=>item.text()==='读取事实：报价')
 expect(button).toBeDefined();await button!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('固定事实原记录');expect(f.wrapper.text()).toContain('本次用途许可待核')
 const values=f.wrapper.findAllComponents({name:'JsonTreeEditor'}).map(editor=>JSON.parse(String(editor.props('modelValue'))))
 expect(values).toContainEqual({value:'0.00'})
 expect(f.wrapper.findAll('input').some(input=>(input.element as HTMLInputElement).value==='PRICE')).toBe(true)
 expect(f.ds.getView('FactVersion','selectedFactVersion')!.queryContext).toMatchObject({key:'PRICE',version:2})
 expect(f.runtime.isDirty).toBe(false);expect(f.save).not.toHaveBeenCalled()
 await f.ds.getView('Baseline','selectedBaseline')!.refresh();await flushPromises()
 expect(f.wrapper.text()).not.toContain('固定事实原记录')
})
it('does not execute an old fact button after selecting a node with no such reference',async()=>{
 const f=await fixture('fact')
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 const old=f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='读取事实：报价')!.props('onClick')!
 await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises()
 const calls=f.query.mock.calls.length
 await old();await flushPromises()
 expect(f.query).toHaveBeenCalledTimes(calls)
 expect(f.wrapper.text()).not.toContain('固定事实原记录')
})
it('opens the fixed requirement of the selected chapter in its original read-only view',async()=>{
 const f=await fixture('fixed-pin')
 await f.wrapper.findAll('.el-tree-node__content')[1]!.trigger('click');await flushPromises()
 const button=f.wrapper.findAll('button').find(item=>item.text()==='读取要求：L / R2')
 expect(button).toBeDefined();await button!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('固定要求原记录')
 expect(f.ds.getView('Requirement','selectedRequirement')!.queryContext).toMatchObject({lineageId:'L',version:'R2'})
 expect(f.wrapper.findAll('input').some(input=>input.element.value==='原文')).toBe(true)
 expect(f.wrapper.text()).toContain('核定招标来源')
 expect(f.wrapper.findAll('input').some(input=>input.element.value==='002')).toBe(true)
 await f.ds.getView('TenderRecord','selectedTenderRecord')!.refresh();await flushPromises()
 expect(f.wrapper.text()).not.toContain('核定招标来源')
 expect(f.wrapper.text()).not.toContain('固定要求原记录')
 await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).not.toContain('固定要求原记录')
 expect(f.save).not.toHaveBeenCalled()
})
it('keeps a source rejection on the chapter it belongs to and leaves the candidate open',async()=>{
 const f=await fixture('fixed-pin',{tenderConfirmStatus:'REJECTED'})
 const nodes=f.wrapper.findAll('.el-tree-node__content')
 await nodes[1]!.trigger('click');await flushPromises()
 const button=f.wrapper.findAll('button').find(item=>item.text()==='读取要求：L / R2')!
 await button.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('固定版本的招标来源无法读取或未通过核定')
 expect(f.wrapper.text()).not.toContain('固定要求原记录')
 expect(f.wrapper.text()).not.toContain('核定招标来源')
 expect(f.wrapper.findAll('.el-tree-node')).toHaveLength(3)
 await nodes[0]!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).not.toContain('要求读取失败')
 expect(f.save).not.toHaveBeenCalled()
})
it.each(['selection','reselection','unmount'])('withdraws a late fact read after %s changes',async mode=>{
 const f=await fixture('fact')
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve}),execute=f.query.getMockImplementation()!
 f.query.mockImplementationOnce(async view=>{await gate;return execute(view)})
 const old=f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='读取事实：报价')!.props('onClick')!,pending=old()
 await flushPromises()
 if(mode!=='unmount')await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click')
 else f.wrapper.unmount()
 if(mode==='reselection')await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click')
 release();await pending;await flushPromises()
 if(mode!=='unmount'){
  expect(f.wrapper.text()).not.toContain('固定事实原记录')
  expect(f.wrapper.text()).not.toContain('事实读取失败')
 }
 expect(f.ds.getView('FactVersion','selectedFactVersion')!.rows).toHaveLength(0)
 expect(f.save).not.toHaveBeenCalled()
})
it('runs the three-version comparison from the candidate workspace and withdraws it on refresh',async()=>{
 const f=await fixture('populated')
 const button=f.wrapper.findAll('button').find(item=>item.text()==='比对三版')
 expect(button).toBeDefined()
 await button!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('三版比对结果')
 expect(f.wrapper.text()).toContain('3 个新增节点待确认')
 expect(f.wrapper.text()).toContain('新增节点：C、D、H')
 const staleConfirm=f.wrapper.findAllComponents(RendererButton)
  .find(item=>item.props('label')==='确认这些新增节点并重新比对')!.props('onClick')!
 await button!.trigger('click');await flushPromises()
 await staleConfirm();await flushPromises()
 expect(f.wrapper.text()).toContain('3 个新增节点待确认')
 const confirm=f.wrapper.findAll('button').find(item=>item.text()==='确认这些新增节点并重新比对')
 expect(confirm).toBeDefined();await confirm!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('3 个新增节点已确认用于本次比对')
 expect(f.wrapper.text()).not.toContain('3 个新增节点待确认')
 await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh();await flushPromises()
 expect(f.wrapper.text()).not.toContain('三版比对结果')
 expect(f.save).not.toHaveBeenCalled()
})
it('shows the reference owner and exact scope issue when comparing a candidate deletion',async()=>{
 const f=await fixture('populated')
 const payloads=f.ds.getView('ContentNodeVersion','snapshotMembers')!.rows.map(row=>row['payload'])
 const node=(nodeId:string,index:number)=>({nodeId,parentId:'C',index,type:'paragraph',class:[],value:'正文',data:{}})
 const source=node('source',1),target=node('target',2)
 const basis=[...payloads,source,target]
 const current=[...payloads,{...source,value:'见{{后文}}',data:{后文:{type:'page',nodeId:'target'}}},target]
 const candidates=[...payloads,source]
 const manifest=f.ds.getView('RevisionSnapshot','selectedSnapshot')!.rows[0]?.['manifest']
 const result=previewScopedRevisionChanges({projectId:'P',basis,current,candidate:candidates,declaredAddedNodeIds:[],
  targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'NODE',nodeId:'H',extent:'NODE'}]}},{basis:manifest,current:manifest,candidate:manifest})
 await f.wrapper.setProps({binding:{...f.binding,previewScope:async()=>({...result,assertCurrent:f.binding.assertCurrent})}})
 const button=f.wrapper.findAll('button').find(item=>item.text()==='比对三版')!
 await button.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('待删节点 target 仍被引用：source')
 expect(f.wrapper.text()).toContain('节点 target 超出候选范围')
 expect(f.save).not.toHaveBeenCalled()
})
it('opens matching node text from both fixed views and closes it when the head view refreshes',async()=>{
 const headingText='标题\n{{册名}}'
 const f=await fixture('populated',{threeVersions:true,headingText})
 await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises()
 expect(f.wrapper.findAll('button').some(item=>item.text()==='对照当前稿原文')).toBe(false)
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 const button=f.wrapper.findAll('button').find(item=>item.text()==='对照当前稿原文')
 expect(button).toBeDefined();await button!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).toContain('当前稿原文')
 await vi.waitFor(()=>expect(f.wrapper.text()).toContain('候选稿原文'))
 expect(f.wrapper.findAll('textarea').map(input=>input.element.value)).toEqual([headingText,headingText])
 const [source,target]=f.wrapper.findAll('textarea')
 source!.element.setSelectionRange(0,1);await source!.trigger('select')
 target!.element.setSelectionRange(0,2);await target!.trigger('select')
 const replace=f.wrapper.findAll('button').find(item=>item.text()==='预演替换选中片段')
 expect(replace).toBeDefined();await replace!.trigger('click')
 await vi.waitFor(()=>expect(f.wrapper.text()).toContain('改后正文'))
 expect(f.wrapper.text()).toContain('改前正文标题\n{{册名}}')
 expect(f.wrapper.text()).toContain('标\n{{册名}}')
 const remove=f.wrapper.findAll('button').find(item=>item.text()==='预演删除当前稿选区')!
 await remove.trigger('click')
 await vi.waitFor(()=>expect(f.wrapper.text()).toContain('改后正文\n{{册名}}'))
 target!.element.setSelectionRange(2,2);await target!.trigger('click')
 const insert=f.wrapper.findAll('button').find(item=>item.text()==='预演插入选中片段')
 expect(insert).toBeDefined();await insert!.trigger('click')
 await vi.waitFor(()=>expect(f.wrapper.text()).toContain('标题标\n{{册名}}'))
 await f.wrapper.findAll('.el-tree-node__content')[1]!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).not.toContain('候选稿原文')
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 expect(f.wrapper.text()).not.toContain('候选稿原文')
 await f.wrapper.findAll('button').find(item=>item.text()==='对照当前稿原文')!.trigger('click');await flushPromises()
 await vi.waitFor(()=>expect(f.wrapper.text()).toContain('候选稿原文'))
 await f.ds.getView('ContentNodeVersion','headSnapshotMembers')!.refresh();await flushPromises()
 expect(f.wrapper.text()).not.toContain('候选稿原文')
 expect(f.save).not.toHaveBeenCalled()
})
