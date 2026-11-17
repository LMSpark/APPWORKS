import {afterEach,expect,it} from 'vitest'
import {config,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import {RendererButton} from '@spark-appworks/spark-component'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
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
async function fixture(mode='populated'){
 registerAllRenderers()
 const f=await createCandidateReadFixture(mode),binding=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
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
 const old=f.wrapper.findComponent(RendererButton).props('onClick')!
 await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises()
 const calls=f.query.mock.calls.length
 await old();await flushPromises()
 expect(f.query).toHaveBeenCalledTimes(calls)
 expect(f.wrapper.text()).not.toContain('固定事实原记录')
})
it.each(['selection','unmount'])('withdraws a late fact read after %s changes',async mode=>{
 const f=await fixture('fact')
 await f.wrapper.findAll('.el-tree-node__content')[2]!.trigger('click');await flushPromises()
 let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve}),execute=f.query.getMockImplementation()!
 f.query.mockImplementationOnce(async view=>{await gate;return execute(view)})
 const old=f.wrapper.findComponent(RendererButton).props('onClick')!,pending=old()
 await flushPromises()
 if(mode==='selection')await f.wrapper.findAll('.el-tree-node__content')[0]!.trigger('click')
 else f.wrapper.unmount()
 release();await pending;await flushPromises()
 if(mode==='selection')expect(f.wrapper.text()).not.toContain('固定事实原记录')
 expect(f.ds.getView('FactVersion','selectedFactVersion')!.rows).toHaveLength(0)
 expect(f.save).not.toHaveBeenCalled()
})
