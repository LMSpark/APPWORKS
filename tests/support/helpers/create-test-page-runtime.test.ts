import {describe,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {createTestPageRuntime} from './create-test-page-runtime'

describe('fixture runtime uses the public binding contract',()=>{
 it('resolves full and legacy keys by formal model name and rejects a different space or internal alias',()=>{
  const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{internal:{modelBinding:{modelId:'MODEL',modelName:'Formal'},columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{}}}}})
  try{const runtime=createTestPageRuntime(dataSet),view=dataSet.getView('internal')!
   expect(runtime.resolveView('SPACE@Formal@default')).toBe(view)
   expect(runtime.resolveView('#SPACE@Formal@default')).toBe(view)
   expect(runtime.resolveView('Formal@default')).toBe(view)
   expect(runtime.resolveView('SPACE@internal@default')).toBeUndefined()
   expect(()=>runtime.resolveView('OTHER@Formal@default')).toThrow('invalid fixture binding')
  }finally{dataSet.destroy()}
 })
 it('keeps local static fixtures usable without inventing their explicit space identity',()=>{
  const dataSet=DataSet.fromJson({tables:{Static:{columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{rows:[{id:'one'}]}}}}})
  try{const runtime=createTestPageRuntime(dataSet)
   expect(runtime.resolveView('Static@default')).toBe(dataSet.getView('Static'))
   expect(runtime.resolveView('test-scenario@Static@default')).toBeUndefined()
  }finally{dataSet.destroy()}
 })
})
