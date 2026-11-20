import {afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,config} from '@vue/test-utils'
import {defineComponent,h,shallowReactive} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,type DataRow} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton,Spark,PAGE_RUNTIME,PAGE_RUNTIME_SERVICES,DATA_SOURCE,DATA_ROW,useSparkComponent} from '@spark-appworks/spark-component'
import {syncReactiveRow} from '../../../../packages/spark-component/src/components/containers/support/scope/row-mirror-sync'
import RendererHostScope from '../../../../packages/spark-component/src/components/containers/support/scope/RendererHostScope.vue'

const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs})
async function fixture(options:{keyless?:boolean;explicit?:boolean;local?:boolean;empty?:boolean;nested?:boolean}={}){
 const stubs={...config.global.stubs};delete stubs['el-button'];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{modelBinding:{modelId:'MODEL',modelName:'Rows'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}],views:{default:{autoLoad:false,rows:[{id:'A',name:'first'}]},other:{autoLoad:false,rows:[{id:'B',name:'other'}]}}}}})
 const view=ds.getView('Rows')!,other=ds.getView('Rows','other')!
 const nativeRow=view.rows[0]!
 if(options.keyless)view.primaryKey=''
 if(options.nested)view.replaceRows([{id:'PARENT',name:'parent',children:[nativeRow]}])
 view.setCurrentRow(nativeRow);other.setCurrentRow(other.rows[0]!)
 if(options.empty){view.rows.splice(0);view.setCurrentRow(null)}
 const mirror=shallowReactive<DataRow>({});syncReactiveRow(mirror,options.empty?null:nativeRow,options.local?{}:{sourceRow:options.empty?null:nativeRow})
 const itemRow=options.local?mirror:options.empty?undefined:nativeRow
 const runtime=new PageRuntime({pageId:'callback',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const click=vi.fn(),warn=vi.fn(),Host=defineComponent({setup(){
  const {sparkProvide}=useSparkComponent({type:'callback-host'})
  sparkProvide(PAGE_RUNTIME,runtime);if(!options.local)sparkProvide(DATA_SOURCE,view);sparkProvide(DATA_ROW,mirror)
  sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn,error:vi.fn()}})
  const button=()=>h(RendererButton,{label:'Run',onClick:click,...(options.explicit?{dataViewKey:'SCENE@Rows@other'}:{})})
  return()=>options.empty?button():h(RendererHostScope,{row:itemRow,rowItem:true},button)
 }})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin()]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 return{wrapper,view,other,mirror,click,warn,nativeRow}
}
it.each([false,true])('passes the native row rather than its render mirror, keyless=%s',async keyless=>{
 const f=await fixture({keyless});await f.wrapper.get('button').trigger('click')
 expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBe(f.view.rows[0]);expect(f.click.mock.calls[0]?.[0]).not.toBe(f.mirror)
})
it('rejects an old mirror after same-key rows replace its original source',async()=>{
 const f=await fixture();f.view.rows.splice(0,1,{id:'A',name:'replacement'});await flushPromises()
 await f.wrapper.get('button').trigger('click');expect(f.click).not.toHaveBeenCalled();expect(f.warn).toHaveBeenCalledTimes(1)
})
it('does not adopt an outer item or another view current row for an explicit other-view command',async()=>{
 const f=await fixture({explicit:true});await f.wrapper.get('button').trigger('click')
 expect(f.click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
 expect(f.click.mock.calls[0]?.[0]).not.toBe(f.other.rows[0])
})
it('keeps local row callbacks without a bound DataView',async()=>{
 const f=await fixture({local:true});await f.wrapper.get('button').trigger('click')
 expect(f.click.mock.calls[0]?.[0]).toBe(f.mirror)
})
it('does not mistake an empty layout context for a stale formal row',async()=>{
 const f=await fixture({empty:true});await f.wrapper.get('button').trigger('click')
 expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent);expect(f.warn).not.toHaveBeenCalled()
})
it('resolves an original nested row without treating another same-key object as the item',async()=>{
 const f=await fixture({nested:true});await f.wrapper.get('button').trigger('click')
 expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBe(f.nativeRow)
 f.view.replaceRows([{id:'PARENT',name:'parent',children:[{...f.nativeRow}]}]);await flushPromises()
 await f.wrapper.get('button').trigger('click');expect(f.click).toHaveBeenCalledTimes(1)
})
