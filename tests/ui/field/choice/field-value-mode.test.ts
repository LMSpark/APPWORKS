import {describe,expect,it} from 'vitest'
import {defineComponent,h,reactive} from 'vue'
import {useFieldOptions} from '../../../../packages/spark-component/src/components/fields/options/useFieldOptions'
import {mountFieldInContext} from '../../../support/helpers/mount-field-in-context'
import type {SparkOptionValueMode} from '../../../../packages/spark-component/src/components/shared-types'

function fixture(mode:SparkOptionValueMode,initial:unknown,options:unknown[]=[],separator=','){
 let helpers!:ReturnType<typeof useFieldOptions>
 const component=defineComponent({setup(){helpers=useFieldOptions({field:'choice',valueMode:mode,valueSeparator:separator,options});return()=>h('div')}})
 const wrapper=mountFieldInContext({component,type:'option-mode-test',model:reactive({choice:initial}),fieldName:'choice'})
 return{helpers,wrapper}
}
describe('explicit option storage mode',()=>{
 it('preserves native nested cascader paths without normalizing away arrays',()=>{
  const paths=[['a','b'],['c','d']],f=fixture('array',paths)
  try{expect(f.helpers.toControlValue(paths,true)).toBe(paths);expect(f.helpers.toSourceValue(paths)).toBe(paths)}finally{f.wrapper.unmount()}
 })
 it('preserves exact primitive types in native arrays even when candidate string encodings collide',()=>{
  const values=['1',false],f=fixture('array',values,[{label:'numeric',value:1},{label:'string',value:'1'},{label:'boolean',value:false},{label:'text',value:'false'}])
  try{expect(f.helpers.toControlValue(values,true)).toBe(values)}finally{f.wrapper.unmount()}
 })
 it('rejects ambiguous encoded tokens instead of selecting the first candidate',()=>{
  const f=fixture('separated-string','1',[{label:'number',value:1},{label:'text',value:'1'}])
  try{expect(()=>f.helpers.toControlValue('1',true)).toThrow('不唯一')}finally{f.wrapper.unmount()}
 })
 it('rejects an empty separator for multiple selections and non-scalar string storage',()=>{
  const f=fixture('separated-string','',[], '')
  try{expect(()=>f.helpers.toSourceValue(['a','b'])).toThrow('空分隔符');expect(f.helpers.toSourceValue(['a'])).toBe('a');expect(()=>f.helpers.toSourceValue([['a','b']])).toThrow('标量')}finally{f.wrapper.unmount()}
 })
})
