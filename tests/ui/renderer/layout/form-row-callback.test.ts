import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h,inject} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,type DataRow} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererForm,RendererButton,FieldText,Spark,PAGE_RUNTIME,PAGE_RUNTIME_SERVICES,DATA_ROW,useSparkComponent} from '@spark-appworks/spark-component'
import {resolveReactiveRow} from '../../../../packages/spark-component/src/components/containers/support/scope/row-mirror-sync'
import {FIELD_ROW_CONTEXT} from '../../../../packages/spark-component/src/components/fields/context/row/fieldRowContext'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs})
async function fixture(pinned=false,empty=false){
 const stubs={...config.global.stubs};delete stubs['el-button'];config.global.stubs=stubs
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{Rows:{modelBinding:{modelId:'MODEL',modelName:'Rows'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}],views:{default:{autoLoad:false,rows:[{id:'A',name:'first'},{id:'B',name:'other'}]}}}}})
 const view=ds.getView('Rows')!
 view.bindQueryExecutor({executeQuery:async()=>({rows:[{id:'A',name:'first'},{id:'B',name:'other'}],total:2,resultPrimaryKey:'id',assertIdentity:()=>undefined,rowKey:row=>row['id'],
  fieldAccess:()=>({read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),readFieldAccess:()=> 'visible' as const,
  addActionState:()=> 'enabled',editActionState:()=> 'enabled',deleteActionState:()=> 'enabled',createChildActionState:()=> 'enabled',viewActionState:()=> 'enabled'})})
 await view.refresh();if(empty)view.setCurrentRow(null);else view.setCurrentRowById(pinned?'B':'A')
 const runtime=new PageRuntime({pageId:'callback',scenarioIds:['SCENE'],loadScenario:async()=>ds});await runtime.load()
 let sourceRow:()=>DataRow|null=()=>null,fieldRow:()=>DataRow|null|undefined=()=>undefined
 const Probe=defineComponent({setup(){
  const context=inject(FIELD_ROW_CONTEXT,undefined),{sparkConsume}=useSparkComponent({type:'form-row-probe'}),mirror=sparkConsume(DATA_ROW)
  sourceRow=()=>resolveReactiveRow(mirror);fieldRow=()=>context?.row(view)
  return()=>null
 }})
 const click=vi.fn(),submit=vi.fn(),Host=defineComponent({setup(){
  const {sparkProvide}=useSparkComponent({type:'form-probe'})
  sparkProvide(PAGE_RUNTIME,runtime);sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}})
  return()=>h(RendererForm,{dataViewKey:'SCENE@Rows@default',autoColumns:false,showDataViewMeta:false,onSubmit:submit,...(pinned?{contextRowId:'A'}:{})},()=>[h(FieldText,{field:'name',label:'Name',prefixIcon:'User'}),h(Probe),h(RendererButton,{label:'Accept',onClick:click})])
 }})
 const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin()]}});cleanups.push(()=>runtime.dispose(),()=>wrapper.unmount());await flushPromises()
 return{wrapper,view,click,submit,sourceRow:()=>sourceRow(),fieldRow:()=>fieldRow()}
}
it('emits submit for Enter in a text input but not while composing or on buttons, and shows the prefix icon',async()=>{
 const f=await fixture(),input=f.wrapper.get('input')
 expect(f.wrapper.find('.el-input__prefix .el-icon').exists()).toBe(true)
 await input.trigger('keydown',{key:'Enter'});expect(f.submit).toHaveBeenCalledTimes(1)
 await input.trigger('keydown',{key:'Enter',isComposing:true});expect(f.submit).toHaveBeenCalledTimes(1)
 await f.wrapper.get('button').trigger('keydown',{key:'Enter'});expect(f.submit).toHaveBeenCalledTimes(1)
 expect(f.view.hasEditingChanges()).toBe(false)
})
it.each([false,true])('keeps edited display values and native field identity while ordinary commands receive events, pinned=%s',async pinned=>{
 const f=await fixture(pinned),original=f.view.rows[0]!
 f.view.updateEditingValue('A','name','draft');await flushPromises()
 expect(f.wrapper.get('input').element).toHaveProperty('value','draft')
 expect(f.sourceRow()).toBe(original)
 if(pinned)expect(f.fieldRow()).toBe(original)
 await f.wrapper.get('button').trigger('click');expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
})
it('keeps invalid pinned fields unavailable without blocking independent command events',async()=>{
 const f=await fixture(true);f.view.replaceRows([{id:'A',name:'replacement'},{id:'B',name:'other'}]);await flushPromises()
 expect(f.fieldRow()).toBeNull();expect(f.sourceRow()).not.toBe(f.view.rows[0])
 await f.wrapper.get('button').trigger('click');expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
})
it('keeps no-row commands available through nested empty form hosts',async()=>{
 const f=await fixture(false,true);await f.wrapper.get('button').trigger('click')
 expect(f.click).toHaveBeenCalledTimes(1);expect(f.click.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
})

it('keeps the new native source when applying an unchanged visible draft',async()=>{
 const f=await fixture(),original=f.view.rows[0]!
 f.view.updateEditingValue('A','name','draft');await flushPromises()
 expect(f.wrapper.get('input').element).toHaveProperty('value','draft')
 const applied=await f.view.applyEditingRows(['A']);expect(applied.success).toBe(true);await flushPromises()
 expect(f.view.rows[0]).not.toBe(original)
 expect(f.sourceRow()).toBe(f.view.rows[0])
 expect(f.wrapper.get('input').element).toHaveProperty('value','draft')
})
