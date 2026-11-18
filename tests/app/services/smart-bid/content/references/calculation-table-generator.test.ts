import {expect,it} from 'vitest'
import {resolveCalculationTableGenerator} from '@/services/smart-bid/content/references/calculation-table-generator'

const table={nodeId:'T',parentId:'C',index:0,type:'table',class:['deviation'],value:'',data:{header:[],rows:[]}}
const classes=[
 {name:'base',elements:['table'],generatorKey:'deviation'},
 {name:'deviation',elements:['table'],basedOn:'base',generatorKey:'deviation'},
 {name:'plain',elements:['table'],basedOn:'base'},
 {name:'chapter',elements:['chapter'],generatorKey:'deviation'},
]
it('uses only a selected table class with an explicit generator',()=>{
 expect(resolveCalculationTableGenerator(table,classes)).toBe('deviation')
 for(const name of ['plain','chapter','missing']){
  expect(()=>resolveCalculationTableGenerator({...table,class:[name]},classes)).toThrow('CONTENT_TABLE_GENERATOR_CLASS')
 }
 expect(()=>resolveCalculationTableGenerator({...table,class:['deviation','base']},classes)).toThrow('CONTENT_TABLE_GENERATOR_CLASS')
})
it('keeps ordinary table data and a generator declaration mutually exclusive',()=>{
 const ordinary={...table,data:{header:['标题'],rows:[]}}
 expect(resolveCalculationTableGenerator({...ordinary,class:['plain']},classes)).toBeNull()
 expect(()=>resolveCalculationTableGenerator(ordinary,classes)).toThrow('CONTENT_TABLE_GENERATOR_CLASS')
})
