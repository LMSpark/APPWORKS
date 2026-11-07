import {afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,config} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererDialog,RendererButton,Spark,PAGE_RUNTIME,PAGE_RUNTIME_SERVICES,DATA_ROW,useSparkComponent} from '@spark-appworks/spark-component'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs;vi.restoreAllMocks()})
it.each(['aggregate','nested'] as const)('keeps %s layout display values without claiming an entity row',async kind=>{
 const stubs={...config.global.stubs};delete stubs['el-button'];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'details',type:'json'}],views:{default:{autoLoad:false,rows:[{id:'A',details:{caption:'nested'}}]}}}}})
 const view=ds.getView('Rows')!;view.setCurrentRowById('A')
 if(kind==='aggregate')vi.spyOn(view,'aggregateResult','get').mockReturnValue({caption:'aggregate'})
 const runtime=new PageRuntime({pageId:'layout',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 const click=vi.fn(),warn=vi.fn()
 const Content=defineComponent({setup(){const {sparkConsume}=useSparkComponent({type:'layout-probe'});const row=sparkConsume(DATA_ROW);return()=>h('p',{'data-preview':''},String(row?.['caption']))}})
 const Host=defineComponent({setup(){
  const {sparkProvide}=useSparkComponent({type:'layout-host'});sparkProvide(PAGE_RUNTIME,runtime);sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn,error:vi.fn()}})
  return()=>h(RendererDialog,{dataViewKey:'SCENE@Rows@default',modelValue:true,title:'Preview',dataMember:kind==='aggregate'?'aggregateResult':'currentRow',...(kind==='nested'?{dataField:'details'}:{})},()=>[h(Content),h(RendererButton,{label:'Run',onClick:click})])
 }})
 const DialogStub=defineComponent({name:'ElDialog',props:['modelValue'],setup:(_,{slots})=>()=>h('div',[slots['default']?.(),slots['footer']?.()])})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin()],stubs:{ElDialog:DialogStub}}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 expect(wrapper.get('[data-preview]').text()).toBe(kind)
 await wrapper.get('button').trigger('click');expect(click).toHaveBeenCalledTimes(1);expect(click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent);expect(warn).not.toHaveBeenCalled()
})
