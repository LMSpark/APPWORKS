import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,type DataView,type QueryParams} from '@spark-appworks/spark-data'
import {DisplayPagination,RendererTable,FieldText,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(cleanup=>cleanup());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
async function fixture(kind:'table'|'pagination',reported=false){
 const stubs={...config.global.stubs};for(const name of ['el-table','el-table-column','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name];config.global.stubs=stubs
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Rows:{resourceType:'paged-test',resourceId:'paged-test',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}],views:{default:{pageSize:10,commitMode:'staged'}}}}})
 const view=ds.getView('Rows')!
 let next:boolean|undefined=true,gate:Promise<void>|undefined
 const execute=vi.fn(async(_view:DataView,params:QueryParams)=>{
  await gate
  return{rows:[{id:String(params.page??1),name:'current'}],total:reported?53:1,countReported:reported,...(next===undefined?{}:{nextPageAvailable:next}),
   assertIdentity:()=>undefined,rowKey:(row:Readonly<Record<string,unknown>>)=>row['id'],
   fieldAccess:()=>({read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),
   readFieldAccess:()=> 'visible' as const,addActionState:()=> 'enabled' as const,editActionState:()=> 'enabled' as const,
   deleteActionState:()=> 'enabled' as const,createChildActionState:()=> 'enabled' as const,viewActionState:()=> 'enabled' as const}
 })
 view.bindQueryExecutor({executeQuery:execute},{resource:{resourceType:'paged-test',resourceId:'paged-test'}});await view.refresh()
 const runtime=new PageRuntime({pageId:'paging',scenarioIds:['SPACE'],loadScenario:async()=>ds});await runtime.load();cleanups.push(()=>runtime.dispose())
 const registry=Spark.createRegistry();registry.register({type:'r-text',component:FieldText})
 const Host=defineComponent({setup(){useSparkComponent({type:'paging-host'}).sparkProvide(PAGE_RUNTIME,runtime);return()=>kind==='table'
  ?h(RendererTable,{dataViewKey:'SPACE@Rows@default',autoColumns:true,showDataViewMeta:false})
  :h(DisplayPagination,{dataViewKey:'SPACE@Rows@default'})}})
 const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>wrapper.unmount());await flushPromises()
 return{view,wrapper,execute,setNext:(value:boolean|undefined)=>{next=value},hold:(value:Promise<void>)=>{gate=value}}
}
it.each(['table','pagination'] as const)('%s exposes confirmed next-page navigation without invented totals or duplicate queries',async kind=>{
 const f=await fixture(kind),before=f.execute.mock.calls.length
 expect(f.wrapper.findComponent({name:'ElPagination'}).exists()).toBe(false)
 expect(f.wrapper.text()).toContain('第 1 页')
 await f.wrapper.get('[data-action="next-page"]').trigger('click');await flushPromises()
 expect(f.view.page).toBe(2);expect(f.execute).toHaveBeenCalledTimes(before+1);expect(f.wrapper.text()).toContain('第 2 页')
 await f.wrapper.get('[data-action="previous-page"]').trigger('click');await flushPromises();expect(f.view.page).toBe(1)
})
it.each(['table','pagination'] as const)('%s keeps unknown and confirmed absence distinct',async kind=>{
 const f=await fixture(kind);f.setNext(undefined);await f.view.refresh();await flushPromises()
 expect(f.wrapper.get('[data-action="next-page"]').attributes('disabled')).toBeDefined();expect(f.wrapper.text()).toContain('下一页尚未确认')
 f.setNext(false);await f.view.refresh();await flushPromises();expect(f.wrapper.get('[data-action="next-page"]').attributes('disabled')).toBeDefined();expect(f.wrapper.text()).not.toContain('下一页尚未确认')
})
it.each(['table','pagination'] as const)('%s refuses navigation while native editing is present, including direct event dispatch',async kind=>{
 const f=await fixture(kind),before=f.execute.mock.calls.length
 f.view.updateEditingValue('1','name','draft');await flushPromises()
 const next=f.wrapper.findAllComponents({name:'ElButton'}).find(button=>button.text()==='下一页')
 if(!next)throw Error('Missing next-page button')
 expect(next.props('disabled')).toBe(true);next.vm.$emit('click');await flushPromises()
 expect(f.view.page).toBe(1);expect(f.execute).toHaveBeenCalledTimes(before);expect(f.view.getEditingPatch('1')).toEqual({name:'draft'})
})
it.each(['table','pagination'] as const)('%s retains authoritative total paging and performs a single query',async kind=>{
 const f=await fixture(kind,true),before=f.execute.mock.calls.length,pager=f.wrapper.getComponent({name:'ElPagination'})
 expect(pager.props('total')).toBe(53)
 await pager.get('button.btn-next').trigger('click');await flushPromises();expect(f.view.page).toBe(2);expect(f.execute).toHaveBeenCalledTimes(before+1)
})
it.each(['table','pagination'] as const)('%s blocks repeated events while a page query is pending',async kind=>{
 const f=await fixture(kind),before=f.execute.mock.calls.length
 let release!:()=>void;f.hold(new Promise<void>(resolve=>{release=resolve}))
 const pending=f.view.setPage(2);await flushPromises()
 const next=f.wrapper.findAllComponents({name:'ElButton'}).find(button=>button.text()==='下一页')
 if(!next)throw Error('Missing next-page button')
 expect(next.props('disabled')).toBe(true);next.vm.$emit('click');await flushPromises();expect(f.execute).toHaveBeenCalledTimes(before+1)
 release();await pending;await flushPromises();expect(f.view.page).toBe(2)
})
it.each(['table','pagination'] as const)('%s changes page size through the original view exactly once',async kind=>{
 const f=await fixture(kind),before=f.execute.mock.calls.length
 f.wrapper.getComponent({name:'ElSelect'}).vm.$emit('change',20);await flushPromises()
 expect(f.view.pageSize).toBe(20);expect(f.view.page).toBe(1);expect(f.execute).toHaveBeenCalledTimes(before+1)
 expect(f.execute.mock.calls.at(-1)?.[1]).toMatchObject({page:1,pageSize:20})
})
