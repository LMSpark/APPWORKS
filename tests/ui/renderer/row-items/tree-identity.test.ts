import {afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,config} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import type {DataView,DataRow} from '@spark-appworks/spark-data'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererTree,RendererTable,RendererButton,RendererToolbar,FieldText,Spark,PAGE_RUNTIME,PAGE_RUNTIME_SERVICES,useSparkComponent} from '@spark-appworks/spark-component'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
function childRow(view:DataView):DataRow|undefined {
 let result:DataRow|undefined
 view.visitRowsDeep(row=>{if(row['label']==='Child')result=row})
 return result
}
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
