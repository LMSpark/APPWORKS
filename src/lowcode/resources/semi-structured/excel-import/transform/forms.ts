/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/forms
 * 职责：声明13类转换配置的标准JSON表单，不持有规则数据或候选副本。
 * 边界：只描述呈现；原字段保留未知成员和原生值，默认与校验分别归definition及模型保存规则。
 */
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {EXCEL_TRANSFORM_RULE_TYPES} from './definition'

/** 转换规则表单的本次声明输入，不持有业务记录。 */
export type ExcelTransformFormInput = Readonly<{
 /** 原规则类型，不推导或转换旧类型。 */
 ruleType: string
 /** 本次PageRuntime中字段候选DataView的完整键。 */
 fieldOptionsKey: string
}>
/** 按正式规则类型及本次命名选项视图描述原config_json字段。 */
export function excelTransformFormSchema(input: ExcelTransformFormInput): JsonSchemaObject {
 if(!EXCEL_TRANSFORM_RULE_TYPES.some(type=>type===input.ruleType))throw new Error('不支持的转换规则类型')
 const text=(title:string):JsonSchemaObject=>({type:'string',title})
 const choice=(title:string,values:string[]):JsonSchemaObject=>({type:'string',title,enum:values})
 const json=(title:string,description:string):JsonSchemaObject=>({title,description})
 const field=(title:string):JsonSchemaObject=>({...text(title),'x-optionDataViewKey':input.fieldOptionsKey,'x-optionAllowCreate':true})
 const fields=(title:string):JsonSchemaObject=>({type:'array',title,items:{type:'string'},'x-optionDataViewKey':input.fieldOptionsKey})
 const properties:Record<string,JsonSchemaObject>={executionScope:choice('执行方向',['PIVOT','UNPIVOT'].includes(input.ruleType)?['IMPORT','EXPORT','BOTH']:['IMPORT'])}
 const expression=json('表达式','JSON表达式：field、const或op/args；常量保持数字、布尔、null及对象原值。')
 switch(input.ruleType){
  case 'TRIM': break
  case 'REPLACE':Object.assign(properties,{search:text('查找文本'),replacement:text('替换文本'),regex:{type:'boolean',title:'按正则表达式替换'}});break
  case 'CONVERT':Object.assign(properties,{targetType:choice('目标类型',['STRING','INTEGER','DECIMAL','BOOLEAN','DATE']),pattern:text('日期格式（仅日期转换消费）')});break
  case 'EXPLODE':Object.assign(properties,{delimiterRegex:text('拆分分隔表达式'),trim:{type:'boolean',title:'去除空白'},ignoreEmpty:{type:'boolean',title:'忽略空项'},distinct:{type:'boolean',title:'去除重复项'},maxItems:{type:'integer',title:'最大拆分数量',minimum:1,maximum:1000},emptyPolicy:choice('空结果处理',['KEEP_NULL','SKIP_ROW','FAIL_ROW'])});break
  case 'LOOKUP':Object.assign(properties,{mapping:json('映射对象','对象键为输入值，值保留原生JSON类型。'),missingPolicy:choice('未匹配处理',['ERROR','KEEP_RAW','USE_NULL'])});break
  case 'COMPUTE':Object.assign(properties,{expression,writePolicy:choice('写入策略',['ALWAYS_OVERRIDE','IF_EMPTY','VERIFY_EQUAL'])});break
  case 'DEFAULT':properties['value']=json('默认值','原生JSON值；空文本写成双引号字符串。');break
  case 'OVERRIDE':Object.assign(properties,{value:json('覆盖值','原生JSON值；配置expression时以表达式结果为准，包括null。'),expression});break
  case 'VALIDATE':Object.assign(properties,{requiredFields:fields('必填字段'),expression,message:text('校验提示')});break
  case 'FILTER':properties['expression']=expression;break
  case 'DEDUPLICATE':Object.assign(properties,{fields:fields('去重字段'),duplicatePolicy:choice('重复处理',['KEEP_FIRST','ERROR'])});break
  case 'UNPIVOT':Object.assign(properties,{columns:json('拆解列','有序对象数组，每项包含sourceField与原生string/number/boolean的key。'),keyTargetField:field('键目标字段'),valueTargetField:field('值目标字段'),sourceFieldPolicy:choice('来源列处理',['REMOVE','KEEP']),nullPolicy:choice('空值处理',['SKIP','KEEP_NULL','ZERO']),maxItems:{type:'integer',title:'最大拆解数量',minimum:1,maximum:1000}});break
  case 'PIVOT':Object.assign(properties,{groupFields:fields('分组字段'),keyField:field('键字段'),valueField:field('值字段'),columns:json('输出列映射','输入键到输出字段名的对象，不转换为数组。'),unknownKeyPolicy:choice('未知键处理',['ERROR','IGNORE']),duplicateCellPolicy:choice('重复单元格处理',['ERROR','FIRST','LAST','SUM','MIN','MAX'])});break
 }
 return {type:'object',properties}
}
