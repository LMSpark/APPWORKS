/**
 * @module @spark-appworks/spark-component:components/fields/options/useInputParameterFunctionContext
 * 职责：值函数与过滤定义编辑器共用输入参数视图目录，消费原选项视图读取权限。
 * 边界：只组合编辑候选，不执行函数、不授予写权限，也不创建另一份业务数据。
 */
import {computed} from 'vue'
import type {DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {useFieldOptions} from './useFieldOptions'

type Input=Readonly<{inputParameterDataViewKey?:string|undefined;functionContext?:DataViewFilterFunctionContext|undefined}>
/** 精确值去重，已绑定视图的标题及禁用状态优先；未声明视图时保持原显式目录。 */
export function useInputParameterFunctionContext(props:Input){
 const options=useFieldOptions({get optionDataViewKey(){return props.inputParameterDataViewKey}})
 return computed<DataViewFilterFunctionContext>(()=>{
  if(props.inputParameterDataViewKey===undefined)return props.functionContext??{}
  type Option=NonNullable<DataViewFilterFunctionContext['inputParams']>[number]
  const inputs=new Map<Option['value'],Option>()
  for(const {value,label,disabled} of options.flatOptions.value)inputs.set(value,{value,label,...(disabled===true?{disabled:true}:{})})
  for(const option of props.functionContext?.inputParams??[])if(!inputs.has(option.value))inputs.set(option.value,option)
  return {...props.functionContext,inputParams:[...inputs.values()]}
 })
}
