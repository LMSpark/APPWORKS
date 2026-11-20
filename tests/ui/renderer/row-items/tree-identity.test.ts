import {afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,config} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import type {DataView,DataRow} from '@spark-appworks/spark-data'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererTree,RendererTable,RendererButton,RendererToolbar,FieldText,Spark,PAGE_RUNTIME,PAGE_RUNTIME_SERVICES,useSparkComponent} from '@spark-appworks/spark-component'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
it.each(['click','currentKey','external'] as const)('selects the original version primary key through %s when the tree key is a logical node id',async selection=>{
 const stubs={...config.global.stubs};delete stubs['el-tree'];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'nodeId',type:'string'},{name:'parentId',type:'string'},{name:'label',type:'string'}],views:{default:{autoLoad:false,rows:[{id:'VERSION',nodeId:'NODE',parentId:null,label:'Original version'}],treeConfig:{idField:'nodeId',parentIdField:'parentId',textField:'label'}}}}}})
 const view=ds.getView('Rows')!,original=view.rows[0]!
 view.setCurrentRowById(null)
 const runtime=new PageRuntime({pageId:'version-tree',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'version-tree-host'});sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererTree,{dataViewKey:'SCENE@Rows@default',...(selection==='external'?{}:{nodeKey:'nodeId'}),showDataViewMeta:false,...(selection==='currentKey'?{currentKey:'NODE'}:{})})}})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry:Spark.createRegistry()})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 if(selection==='click'){await wrapper.get('.el-tree-node__content').trigger('click');await flushPromises()}
 if(selection==='external'){view.setCurrentRowById('VERSION');await flushPromises()}
 expect(view.currentRow).toBe(original)
 expect(view.getPkKey(view.currentRow!)).toBe('VERSION')
 expect(wrapper.find('.el-tree-node.is-current').exists()).toBe(true)
})
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
it.each(['replacement','newer-click','external','unmount'] as const)('rejects a late tree selection after %s',async change=>{
 const stubs={...config.global.stubs};delete stubs['el-tree'];config.global.stubs=stubs
 const rows=[{id:'VA',nodeId:'A',parentId:null,label:'Alpha'},{id:'VB',nodeId:'B',parentId:null,label:'Beta'}]
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{columns:['id','nodeId','parentId','label'].map(name=>({name,type:'string',...(name==='id'?{isPrimaryKey:true}:{})})),views:{default:{autoLoad:false,rows,treeConfig:{idField:'nodeId',parentIdField:'parentId',textField:'label'}}}}}})
 const view=ds.getView('Rows')!;view.setCurrentRowById(null)
 const runtime=new PageRuntime({pageId:'late-tree',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>{release=resolve})
 const onNodeClick=vi.fn(async(data:DataRow)=>{if(data['nodeId']==='A')await pending})
 const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'late-tree-host'});sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererTree,{dataViewKey:'SCENE@Rows@default',nodeKey:'nodeId',showDataViewMeta:false,onNodeClick})}})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry:Spark.createRegistry()})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 await wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises();expect(onNodeClick).toHaveBeenCalledOnce()
 if(change==='replacement')view.replaceRows(rows.map(row=>({...row})))
 else if(change==='newer-click'){await wrapper.findAll('.el-tree-node__content')[1]!.trigger('click');await flushPromises()}
 else if(change==='external')view.setCurrentRowById('VB')
 else {wrapper.unmount();expect(view.destroyed).toBe(false)}
 release();await flushPromises()
 expect(view.currentRow?.['id']??null).toBe(change==='replacement'||change==='unmount'?null:'VB')
})
function childRow(view:DataView):DataRow|undefined {
 let result:DataRow|undefined
 view.visitRowsDeep(row=>{if(row['label']==='Child')result=row})
 return result
}
it.each([['tree',false],['table',false],['table',true],['tree',true]] as const)('binds %s JSON parents and numeric sibling order while actions consume original version rows; nested=%s',async(kind,nested)=>{
 const stubs={...config.global.stubs};for(const name of ['el-tree','el-table','el-table-column','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name];config.global.stubs=stubs
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const records=[{id:'VB',nodeId:'B',label:'Second',payload:{parentId:'PROJECT',index:10}},
   {id:'VA',nodeId:'A',label:'First',payload:{parentId:'PROJECT',index:2}}]
 const rows=nested?records.map(row=>({...row,children:row.nodeId==='A'?[{id:'VC',nodeId:'C',label:'Child',payload:{parentId:'A',index:0}}]:[]})):records
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{resourceType:'static-data',resourceId:'member-tree',columns:[{name:'id',type:'string',isPrimaryKey:true},...['nodeId','label'].map(name=>({name,type:'string'})),{name:'payload',type:'json'}],views:{default:{autoLoad:false,rows,treeConfig:{idField:'nodeId',parentIdField:{field:'payload',path:['parentId'],format:'native'},...(nested&&kind==='tree'?{}:{orderField:{field:'payload',path:['index'],format:'native' as const}}),textField:'label',rootParentValue:'PROJECT'}}}}}})
 const view=ds.getView('Rows')!;await view.refresh();const original=view.rows[1]!
 if(nested&&kind==='tree')view.configure({sortExpression:[{field:'label',direction:'asc'}]})
 const runtime=new PageRuntime({pageId:'member-tree',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const registry=Spark.createRegistry();registry.register({type:'r-button',component:RendererButton});registry.register({type:'r-toolbar',component:RendererToolbar});registry.register({type:'r-text',component:FieldText})
 const click=vi.fn(),actions={children:[{type:'r-button',props:{label:'Run',onClick:click}}]}
 const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'member-tree-host'});sparkProvide(PAGE_RUNTIME,runtime);return()=>kind==='tree'?h(RendererTree,{dataViewKey:'SCENE@Rows@default',actions,showDataViewMeta:false}):h(RendererTable,{dataViewKey:'SCENE@Rows@default',actions,showPagination:false,showDataViewMeta:false,children:[{type:'r-text',props:{field:'label',label:'Name'}}]})}})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 const labels=kind==='tree'?wrapper.findAll('.custom-tree-node').map(item=>item.text()):wrapper.findAll('.el-table__row').filter(item=>item.isVisible()).map(item=>item.text())
 expect(labels[0]).toContain('First');expect(labels[1]).toContain('Second')
 await wrapper.findAll('button').find(item=>item.text()==='Run')!.trigger('click')
 expect(click.mock.calls[0]?.[0]).toBe(original)
 if(nested&&kind==='table'){
   await wrapper.get('.el-table__expand-icon').trigger('click');await flushPromises()
   await wrapper.findAll('.el-table__row').find(row=>row.text().includes('Child'))!.get('button').trigger('click')
   expect(click.mock.calls[1]?.[0]).toBe(childRow(view))
 }
 if(kind==='tree'){await wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises();expect(view.currentRow).toBe(original)}
})
it('rejects duplicate display keys without invoking a business click callback',async()=>{
 const stubs={...config.global.stubs};delete stubs['el-tree'];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{columns:['id','nodeId','label'].map(name=>({name,type:'string',...(name==='id'?{isPrimaryKey:true}:{})})),views:{default:{autoLoad:false,rows:[{id:'A',nodeId:'N',label:'Alpha'},{id:'B',nodeId:'N',label:'Beta'}]}}}}})
 const view=ds.getView('Rows')!;view.setCurrentRowById(null)
 const runtime=new PageRuntime({pageId:'duplicate-tree',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const onNodeClick=vi.fn(),Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'duplicate-tree-host'});sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererTree,{dataViewKey:'SCENE@Rows@default',nodeKey:'nodeId',currentKey:'N',showDataViewMeta:false,onNodeClick})}})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry:Spark.createRegistry()})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 expect(view.currentRow).toBeNull()
 await wrapper.findAll('.el-tree-node__content')[0]!.trigger('click');await flushPromises()
 expect(onNodeClick).not.toHaveBeenCalled();expect(view.currentRow).toBeNull()
 expect(wrapper.find('.el-tree-node.is-current').exists()).toBe(false)
})
it.each(['tree','table'] as const)('keeps %s projection actions tied to their original rows after same-key replacement',async kind=>{
 const stubs={...config.global.stubs}
 for(const name of ['el-table','el-table-column','el-tree','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name]
 config.global.stubs=stubs;vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{modelBinding:{modelId:'MODEL',modelName:'Rows'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'parentId',type:'string'},{name:'label',type:'string'}],views:{default:{autoLoad:false,rows:kind==='tree'?[{id:'P',label:'Parent',children:[{id:'C',parentId:'P',label:'Child'}]}]:[{id:'P',label:'Parent',parentId:null},{id:'C',parentId:'P',label:'Child'}],...(kind==='table'?{treeConfig:{idField:'id',parentIdField:'parentId',textField:'label',treeMode:'flat'}}:{})}}}}})
 const view=ds.getView('Rows')!,original=kind==='table'?view.rows[1]:childRow(view)
 const runtime=new PageRuntime({pageId:'tree-actions',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const registry=Spark.createRegistry();registry.register({type:'r-button',component:RendererButton});registry.register({type:'r-toolbar',component:RendererToolbar});registry.register({type:'r-text',component:FieldText})
 const click=vi.fn(),warn=vi.fn(),actions={children:[{type:'r-button',props:{label:'Run',onClick:click}}]}
 const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'tree-item-host'});sparkProvide(PAGE_RUNTIME,runtime);sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn,error:vi.fn()}})
  return()=>kind==='tree'?h(RendererTree,{dataViewKey:'SCENE@Rows@default',actions,showDataViewMeta:false,treeProps:{defaultExpandAll:true}})
   :h(RendererTable,{dataViewKey:'SCENE@Rows@default',actions,showDataViewMeta:false,showPagination:false,children:[{type:'r-text',props:{field:'label',label:'Name'}}]})
 }})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 if(kind==='table'){await wrapper.get('.el-table__expand-icon').trigger('click');await flushPromises()}
 const button=wrapper.findAll('button').filter(item=>item.text()==='Run').at(-1)!
 await button.trigger('click');expect(click).toHaveBeenCalledTimes(1);expect(click.mock.calls[0]?.[0]).toBe(original)
 view.replaceRows(kind==='tree'?[{id:'P',label:'Parent',children:[{id:'C',parentId:'P',label:'Replacement'}]}]:[{id:'P',label:'Parent',parentId:null},{id:'C',parentId:'P',label:'Replacement'}])
 await button.trigger('click');expect(click).toHaveBeenCalledTimes(1)
})
it.each(['id','link'] as const)('does not resolve edited display keys to another entity, tree identity=%s',async identity=>{
 const stubs={...config.global.stubs};for(const name of ['el-tree','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{resourceType:'static-data',resourceId:'mutable-tree',columns:[{name:'id',type:'string',isPrimaryKey:true},...['code','link','label','parentId'].map(name=>({name,type:'string'}))],views:{default:{autoLoad:false,rows:[{id:'A',code:'a',link:'one',label:'Alpha',parentId:null},{id:'B',code:'b',link:'two',label:'Beta',parentId:null}],sortExpression:[{field:'label',direction:'desc'}],treeConfig:{idField:identity,parentIdField:'parentId',textField:'label',treeMode:'flat'}}}}}})
 const view=ds.getView('Rows')!,original=view.rows[0]!
 const runtime=new PageRuntime({pageId:'mutable-node-key',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const registry=Spark.createRegistry();registry.register({type:'r-button',component:RendererButton});registry.register({type:'r-toolbar',component:RendererToolbar})
 const click=vi.fn(),Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'mutable-tree-host'});sparkProvide(PAGE_RUNTIME,runtime);sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}})
  return()=>h(RendererTree,{dataViewKey:'SCENE@Rows@default',nodeKey:'code',showDataViewMeta:false,actions:{children:[{type:'r-button',props:{label:'Run',onClick:click}}]}})
 }})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 view.updateEditingValue('A',identity==='id'?'code':'link',identity==='id'?'b':'two')
 view.updateEditingValue('B',identity==='id'?'code':'link',identity==='id'?'a':'one');await flushPromises()
 const node=wrapper.findAll('.custom-tree-node').find(item=>item.text().includes('Alpha'))!
 await node.get('button').trigger('click')
 if(identity==='id'){expect(click).toHaveBeenCalledTimes(1);expect(click.mock.calls[0]?.[0]).toBe(original)}
 else {
  expect(click).not.toHaveBeenCalled()
  expect(wrapper.findAll('.custom-tree-node').map(item=>item.text())).toEqual(['AlphaRun','BetaRun'])
  view.discardEditingRows();await flushPromises()
  expect(wrapper.findAll('.custom-tree-node').map(item=>item.text())).toEqual(['BetaRun','AlphaRun'])
  await wrapper.findAll('.custom-tree-node').find(item=>item.text().includes('Alpha'))!.get('button').trigger('click')
  expect(click.mock.calls[0]?.[0]).toBe(original)
 }
})

it('keeps keyless nested children tied to native objects without inventing primary keys',async()=>{
 const stubs={...config.global.stubs}
 for(const name of ['el-table','el-table-column','el-tree','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name]
 config.global.stubs=stubs;vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{modelBinding:{modelId:'MODEL',modelName:'Rows'},columns:[{name:'code',type:'string'},{name:'parentId',type:'string'},{name:'label',type:'string'}],views:{default:{autoLoad:false,rows:[{code:'P',label:'Parent',children:[{code:'C',parentId:'P',label:'Child'}]}],sortExpression:[{field:'label',direction:'asc'}]}}}}})
 const view=ds.getView('Rows')!,original=childRow(view)
 view.primaryKey=''
 const runtime=new PageRuntime({pageId:'tree-actions',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const registry=Spark.createRegistry();registry.register({type:'r-button',component:RendererButton});registry.register({type:'r-toolbar',component:RendererToolbar});registry.register({type:'r-text',component:FieldText})
 const click=vi.fn(),warn=vi.fn(),actions={children:[{type:'r-button',props:{label:'Run',onClick:click}}]}
 const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'tree-item-host'});sparkProvide(PAGE_RUNTIME,runtime);sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn,error:vi.fn()}})
  return()=>h(RendererTree,{nodeKey:'code',dataViewKey:'SCENE@Rows@default',actions,showDataViewMeta:false,treeProps:{defaultExpandAll:true}})
 }})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 const button=wrapper.findAll('button').filter(item=>item.text()==='Run').at(-1)!
 await button.trigger('click');expect(click).toHaveBeenCalledTimes(1);expect(click.mock.calls[0]?.[0]).toBe(original)
 expect(view.primaryKey).toBe('')
 view.replaceRows([{code:'P',label:'Parent',children:[{code:'C',parentId:'P',label:'Replacement'}]}])
 await button.trigger('click');expect(click).toHaveBeenCalledTimes(1)
})
