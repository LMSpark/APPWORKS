import {describe,expect,it} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldJson,RendererForm,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {excelDesignRuntime,EXCEL_DESIGN} from '../../excel-import-design.fixture'
import {excelTransformFormSchema} from '@/lowcode/resources/semi-structured/excel-import/transform/forms'

describe('Excel transform configuration form binding',()=>{
 it('writes native mapping values to the fixed original rule and cancels without touching another draft',async()=>{
  const original='{"executionScope":"IMPORT","mapping":{"old":0},"missingPolicy":"ERROR","extension":false}'
  const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'订单'}],Base_ImportData_Field:[],
   Base_Import_Transform_Rule:[{id:'R1',scheme_id:'E1',config_id:'C1',rule_type:'LOOKUP',source_field:'code',target_field:'code',enabled:1,sort_order:10,config_json:original},
    {id:'R2',scheme_id:'E1',config_id:'C1',rule_type:'TRIM',source_field:'code',target_field:'code',enabled:1,sort_order:20,config_json:'{}'}]})
  const key=buildDataViewKey('Base_Import_Transform_Rule','default',EXCEL_DESIGN)
  const schema=excelTransformFormSchema({ruleType:'LOOKUP',fieldOptionsKey:buildDataViewKey('Base_ImportData_Field','foreignKeyFields',EXCEL_DESIGN)})
  f.rules.setCurrentRowById('R1')
  const checkpoint=f.rules.createEditingCheckpoint('R1',['config_json'])
  const wrapper=mount(defineComponent({setup(){
   useSparkComponent({type:'transform-form-test-host'}).sparkProvide(PAGE_RUNTIME,f.runtime)
   return()=>h(RendererForm,{dataViewKey:key,contextRowId:'R1',autoColumns:false,showDataViewMeta:false},{default:()=>h(FieldJson,{field:'config_json',mode:'form',schema})})
  }}),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
  try{
   f.rules.setCurrentRowById('R2');f.rules.updateEditingValue('R2','rule_name','other draft');await flushPromises()
   const mapping=wrapper.get('[data-json-member="mapping"] textarea')
   await mapping.setValue('{"zero":0,"false":false,"empty":"","null":null}')
   await mapping.trigger('change');await flushPromises()
   expect(JSON.parse(String(f.rules.getEditingRow('R1')?.['config_json']))).toEqual({executionScope:'IMPORT',mapping:{zero:0,false:false,empty:'',null:null},missingPolicy:'ERROR',extension:false})
   expect(f.rules.getEditingRow('R2')?.['rule_name']).toBe('other draft')
   expect(f.http.saves).toEqual([])
   checkpoint.restore();await flushPromises()
   expect(f.rules.hasEditingChanges('R1')).toBe(false)
   expect(f.rules.getEditingRow('R2')?.['rule_name']).toBe('other draft')
   expect(wrapper.get('[data-json-member="mapping"] textarea').element).toHaveProperty('value','{"old":0}')
  }finally{checkpoint.release();wrapper.unmount();f.runtime.dispose()}
 })
})
