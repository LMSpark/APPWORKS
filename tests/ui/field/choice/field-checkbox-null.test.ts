import {describe,expect,it} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {RendererForm,FieldCheckbox,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'

describe('standard checkbox explicit null display',()=>{
 it.each([false,true])('displays null as %s without filling the field and writes only explicit numeric choices',async nullChecked=>{
  const ds=SparkData.createDataSet({scenarioId:'T',dataSetName:'NullFlag',tables:{Flags:{tableName:'Flags',resourceType:'static-data',
   columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'flag',type:'number',allowDBNull:true}],
   views:{default:{commitMode:'staged',rows:[{id:'1',flag:null},{id:'2',flag:0},{id:'3',flag:1}]}}}}})
  const view=ds.getView('Flags');if(!view)throw Error('Missing view');view.setCurrentRowById('1')
  const runtime=new PageRuntime({pageId:'null-checkbox',scenarioIds:['T'],loadScenario:async()=>ds});await runtime.load()
  const wrapper=mount(defineComponent({setup(){useSparkComponent({type:'null-checkbox-host'}).sparkProvide(PAGE_RUNTIME,runtime)
   return()=>h(RendererForm,{dataViewKey:'T@Flags@default',autoColumns:false,showDataViewMeta:false},{default:()=>h(FieldCheckbox,{field:'flag',trueValue:1,falseValue:0,nullChecked})})
  }}),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
  try{
   const checkbox=()=>wrapper.getComponent({name:'ElCheckbox'})
   expect(checkbox().props('modelValue')).toBe(nullChecked);expect(view.rows[0]?.['flag']).toBeNull();expect(view.hasEditingChanges()).toBe(false)
   checkbox().vm.$emit('update:modelValue',!nullChecked);await flushPromises()
   expect(view.getEditingRow('1')?.['flag']).toBe(nullChecked?0:1)
   view.discardEditingRows(['1']);await flushPromises()
   expect(checkbox().props('modelValue')).toBe(nullChecked);expect(view.rows[0]?.['flag']).toBeNull()
   view.setCurrentRowById('2');await flushPromises();expect(checkbox().props('modelValue')).toBe(false)
   view.setCurrentRowById('3');await flushPromises();expect(checkbox().props('modelValue')).toBe(true)
  }finally{wrapper.unmount();runtime.dispose()}
 })
})
