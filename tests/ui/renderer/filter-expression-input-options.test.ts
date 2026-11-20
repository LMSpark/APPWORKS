import {afterEach,describe,expect,it} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererFilterExpression,FilterExpressionEditor,useSparkComponent} from '@spark-appworks/spark-component'

const wrappers:VueWrapper[]=[],runtimes:PageRuntime[]=[]
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());runtimes.splice(0).forEach(r=>r.dispose())})
describe('filter definition input parameter view binding',()=>{
 it('consumes the exact options view, refreshes candidates and rejects a callback captured before replacement',async()=>{
  const ds=SparkData.fromJson({scenarioId:'S',tables:{
   Definitions:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'Filter',type:'json'}],views:{default:{commitMode:'staged',rows:[{id:'a',Filter:undefined}]}}},
   Inputs:{resourceType:'static-data',columns:[{name:'value',type:'string',isPrimaryKey:true},{name:'label',type:'string'}],views:{default:{valueField:'value',labelField:'label',rows:[{value:'START.code',label:'开始 · 编码'}]}}},
   OtherInputs:{resourceType:'static-data',columns:[{name:'value',type:'string',isPrimaryKey:true},{name:'label',type:'string'}],views:{default:{valueField:'value',labelField:'label',rows:[{value:'OTHER.code',label:'另一个输入目录'}]}}},
  }})
  const runtime=new PageRuntime({pageId:'input-options',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load();runtimes.push(runtime)
  const definitions=ds.getView('Definitions')!,inputs=ds.getView('Inputs')!;definitions.setCurrentRowById('a')
  const inputKey=ref('S@Inputs@default')
  const host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'input-options-test'});sparkProvide(PAGE_RUNTIME,runtime)
   return()=>h(RendererFilterExpression,{dataViewKey:'S@Definitions@default',field:'Filter',display:'inline',columns:[{name:'code',type:'string'}],
    inputParameterDataViewKey:inputKey.value,functionContext:{inputParams:[{value:'START.code',label:'旧标题'},{value:'declared',label:'声明参数'}]}})
  }})
  const wrapper=mount(host,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{SparkJsonEditor:true,JsonTreeEditor:true}}});wrappers.push(wrapper);await flushPromises()
  const editor=wrapper.getComponent(FilterExpressionEditor)
  expect(editor.props('functionContext')?.inputParams).toEqual([{value:'START.code',label:'开始 · 编码'},{value:'declared',label:'声明参数'}])
  const oldApply=editor.vm.$.vnode.props?.['onUpdate:modelValue'];expect(typeof oldApply).toBe('function')
  inputs.replaceRows([{value:'START.next',label:'开始 · 新参数'}]);await flushPromises()
  expect(wrapper.getComponent(FilterExpressionEditor).props('functionContext')?.inputParams).toContainEqual({value:'START.next',label:'开始 · 新参数'})
  if(typeof oldApply==='function')oldApply({field:'code',operator:'eq',value:'stale'})
  expect(definitions.hasEditingChanges()).toBe(false)
  const apply=wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
  if(typeof apply==='function')apply({field:'code',operator:'eq',value:{Type:'GetInputParam',ParamName:'START.next'}})
  expect(definitions.getEditingRow('a')?.['Filter']).toMatchObject({value:{Type:'GetInputParam',ParamName:'START.next'}})
  inputKey.value='S@OtherInputs@default';await flushPromises()
  expect(wrapper.getComponent(FilterExpressionEditor).props('functionContext')?.inputParams).toContainEqual({value:'OTHER.code',label:'另一个输入目录'})
  expect(wrapper.getComponent(FilterExpressionEditor).props('functionContext')?.inputParams).not.toContainEqual({value:'START.next',label:'开始 · 新参数'})
  if(typeof apply==='function')apply({field:'code',operator:'eq',value:'late after binding switch'})
  expect(definitions.getEditingRow('a')?.['Filter']).toMatchObject({value:{Type:'GetInputParam',ParamName:'START.next'}})
 })
})
