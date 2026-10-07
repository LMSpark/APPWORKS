import { describe, expect, it } from 'vitest'
import { ScenarioViewFile } from '@spark-appworks/spark-project-model'
describe('scenario design contract',()=>{
 it('retains independent named views and explicit cascades without editable resource columns',()=>{const text=JSON.stringify({scenarioId:'s',tables:{Orders:{modelBinding:{modelId:'model',modelName:'OrdersModel'},views:{default:{},list:{pageSize:20}}}},viewCascades:[]});const file=new ScenarioViewFile('s',text);expect(file.value.toJSON()).toEqual(JSON.parse(text));expect(()=>file.setText(JSON.stringify({scenarioId:'s',tables:{Orders:{columns:[],modelBinding:{modelId:'model',modelName:'OrdersModel'},views:{default:{}}}}}))).toThrow('columns');expect(file.getText()).toBe(text)})
})
