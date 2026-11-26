import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,type DataView,type QueryParams} from '@spark-appworks/spark-data'
import {DisplayPagination,RendererTable,FieldText,Spark,SparkComponentRenderer,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(cleanup=>cleanup());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
async function fixture(kind:'table'|'pagination',reported=false,useCrud=false){
 const stubs={...config.global.stubs};for(const name of ['el-table','el-table-column','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name];config.global.stubs=stubs
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Rows:{resourceType:'paged-test',resourceId:'paged-test',...(useCrud?{api:{list:{url:'/api/test'}}}:{}),columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}],views:{default:{pageSize:10,commitMode:'staged'}}}}})
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
 const list=useCrud?vi.spyOn(view.crudService!,'list').mockResolvedValue({success:true,data:{rows:[{id:'1',name:'confirmed'}],total:1}}):undefined
 if(!useCrud)view.bindQueryExecutor({executeQuery:execute},{resource:{resourceType:'paged-test',resourceId:'paged-test'}})
 await view.refresh()
 const runtime=new PageRuntime({pageId:'paging',scenarioIds:['SPACE'],loadScenario:async()=>ds});await runtime.load();cleanups.push(()=>runtime.dispose())
 const registry=Spark.createRegistry();registry.register({type:'r-text',component:FieldText});registry.register({type:'r-table',component:RendererTable})
 const disabled=ref(false)
 const Host=defineComponent({setup(){useSparkComponent({type:'paging-host'}).sparkProvide(PAGE_RUNTIME,runtime);return()=>kind==='table'
  ?h(SparkComponentRenderer,{config:{type:'r-table',props:{dataViewKey:'SPACE@Rows@default',autoColumns:true,showDataViewMeta:false,disabled:disabled.value}}})
  :h(DisplayPagination,{dataViewKey:'SPACE@Rows@default'})}})
 const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>wrapper.unmount());await flushPromises()
 return{view,wrapper,execute,disabled,list,setNext:(value:boolean|undefined)=>{next=value},hold:(value:Promise<void>)=>{gate=value}}
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

it('honors standard table disablement for explicit failed-query retry',async()=>{
 const f=await fixture('table'),before=f.execute.mock.calls.length
 f.execute.mockRejectedValueOnce(Error('first read refused'))
 await f.view.setPage(2);await flushPromises()
 expect(f.wrapper.text()).toContain('first read refused')
 f.disabled.value=true;await flushPromises()
 const locked=f.wrapper.findAllComponents({name:'ElButton'}).find(button=>button.text()==='重试读取')
 if(!locked)throw Error('Missing retry button')
 expect(locked.props('disabled')).toBe(true)
 locked.vm.$emit('click');await flushPromises()
 expect(f.execute).toHaveBeenCalledTimes(before+1)
 f.disabled.value=false;await flushPromises()
 await f.wrapper.findAll('button').find(button=>button.text()==='重试读取')!.trigger('click');await flushPromises()
 expect(f.execute).toHaveBeenCalledTimes(before+2)
 expect(f.execute.mock.calls.at(-1)?.[1]).toMatchObject({page:2})
 expect(f.wrapper.text()).not.toContain('first read refused')
})
it('allows retry when a CRUD failure records no loading exception',async()=>{
 const f=await fixture('table',true,true)
 if(!f.list)throw Error('Missing DataView CRUD source')
 f.list.mockResolvedValueOnce({success:false,message:'source refusal'})
 await f.view.refresh();await flushPromises()
 expect(f.view.loadingError).toBeNull()
 expect(f.wrapper.text()).toContain('读取失败')
 const retry=f.wrapper.findAll('button').find(button=>button.text()==='重试读取')
 expect(retry?.exists()).toBe(true)
 await retry!.trigger('click');await flushPromises()
 expect(f.list).toHaveBeenCalledTimes(3)
 expect(f.view.rows).toMatchObject([{id:'1',name:'confirmed'}])
 expect(f.wrapper.text()).not.toContain('读取失败')
})
