/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/definition
 * 职责：描述正式Excel转换规则及新建时的类型专属配置，不查询或保存数据。
 * 边界：默认仅用于显式新建/切型，普通编辑保留原字段及未知扩展；不转换旧值。
 */
/** 正式服务支持的13类规则。 */
export const EXCEL_TRANSFORM_RULE_TYPES = ['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP','COMPUTE','DEFAULT','OVERRIDE','VALIDATE','FILTER','DEDUPLICATE','UNPIVOT','PIVOT'] as const
/** 正式规则类型，不含兼容别名。 */
export type ExcelTransformRuleType = typeof EXCEL_TRANSFORM_RULE_TYPES[number]
/** 会改变行结构的规则，父配置不能使用。 */
export const EXCEL_TRANSFORM_ROW_SHAPES = ['EXPLODE','FILTER','DEDUPLICATE','UNPIVOT','PIVOT'] as const
/** 预览错误策略；正式导入仍按服务端整体回滚，不能由此推导逐行继续。 */
export const EXCEL_TRANSFORM_ERROR_POLICIES = ['FAIL_ROW','SKIP_ROW','KEEP_RAW','USE_NULL'] as const
/** 为显式新建或切换类型创建独立配置；待填项由同模型保存规则校验，不猜业务字段。 */
export function createExcelTransformConfig(type: string): Record<string, unknown> {
 let config: Record<string, unknown>
 switch(type){
  case 'TRIM': config={}; break
  case 'REPLACE': config={search:'',replacement:'',regex:false};break
  case 'CONVERT': config={targetType:'STRING'};break
  case 'EXPLODE': config={delimiterRegex:'[,，;；、\\n]+',trim:true,ignoreEmpty:true,distinct:true,maxItems:50,emptyPolicy:'KEEP_NULL'};break
  case 'LOOKUP': config={mapping:{},missingPolicy:'ERROR'};break
  case 'COMPUTE': config={expression:{op:'MULTIPLY',args:[{field:''},{field:''}]},writePolicy:'ALWAYS_OVERRIDE'};break
  case 'DEFAULT': case 'OVERRIDE': config={value:''};break
  case 'VALIDATE': config={requiredFields:[]};break
  case 'FILTER': config={expression:{op:'GT',args:[{field:''},{const:0}]}};break
  case 'DEDUPLICATE': config={fields:[],duplicatePolicy:'KEEP_FIRST'};break
  case 'UNPIVOT': config={columns:[{sourceField:'',key:''}],keyTargetField:'',valueTargetField:'',sourceFieldPolicy:'REMOVE',nullPolicy:'SKIP',maxItems:12};break
  case 'PIVOT': config={groupFields:[],keyField:'',valueField:'',columns:{},unknownKeyPolicy:'ERROR',duplicateCellPolicy:'ERROR'};break
  default: throw new Error('不支持的转换规则类型')
 }
 return {executionScope:'IMPORT',...config}
}
