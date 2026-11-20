/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/validation
 * 职责：在正式规则模型保存时验证13类规则的纯结构，不查询依赖或执行行转换。
 * 边界：不修改JSON、不猜字段、不编译Java正则或日期格式；跨记录引用归独立的精确保存校验。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataTableQuerySaveRuleInput} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {EXCEL_TRANSFORM_RULE_TYPES,EXCEL_TRANSFORM_ERROR_POLICIES,excelTransformEnumValue} from './definition'
import {visitExcelTransformExpression} from './expression'
function object(value:unknown,path:string):Record<string,unknown>{if(!isRecord(value))throw new Error(`${path}必须是对象`);return value}
function text(value:unknown,path:string):string{if(typeof value!=='string'||!value.trim())throw new Error(`${path}不能为空`);return value}
function choice(value:unknown,allowed:readonly string[],path:string):string{const normalized=excelTransformEnumValue(value);if(!allowed.includes(normalized))throw new Error(`${path}不是支持的选项`);return normalized}
function names(value:unknown,path:string,required=true):string[]{if(!Array.isArray(value)||required&&!value.length)throw new Error(`${path}必须是字段数组`);const list=value.map((v,i)=>text(v,`${path}[${i}]`));if(new Set(list).size!==list.length)throw new Error(`${path}不能重复`);return list}
function json(value:unknown,path:string):unknown{if(typeof value!=='string'||!value.trim())throw new Error(`${path}必须是正式JSON文本`);try{return parseJsonDocument(value)}catch{throw new Error(`${path}不是有效JSON对象文本`)}}
/** 同步校验本次规则的配置及正式字段类型；原文本与未知扩展保持原样，失败在首轮派发前拒绝。 */
export function validateExcelTransformRule(input:DataTableQuerySaveRuleInput):undefined{
 const row=input.values,changed=new Set(input.changedFields),created=input.created
 if((created||changed.has('sort_order'))&&row['sort_order']!==null&&(!Number.isSafeInteger(row['sort_order'])||Number(row['sort_order'])< -2147483648||Number(row['sort_order'])>2147483647))throw new Error('sort_order必须是正式整数')
 if((created||changed.has('enabled'))&&row['enabled']!==null&&row['enabled']!==0&&row['enabled']!==1)throw new Error('enabled必须是0或1')
 if((created||changed.has('on_error'))&&row['on_error']!==null)choice(row['on_error'],EXCEL_TRANSFORM_ERROR_POLICIES,'on_error')
 const full=created||['rule_type','source_field','target_field','condition_json','config_json'].some(field=>changed.has(field))||changed.has('enabled')&&(row['enabled']===1||row['enabled']===null)
 if(!full)return undefined
 const type=choice(row['rule_type'],EXCEL_TRANSFORM_RULE_TYPES,'rule_type')
 if(row['config_json']===null)throw new Error('config_json须显式设置有效对象后才能启用')
 const rawConfig=row['config_json'],config=typeof rawConfig==='string'&&!rawConfig.trim()?{}:object(json(rawConfig,'config_json'),'config_json'),has=(key:string)=>Object.hasOwn(config,key)
 const scope=choice(config['executionScope']??'IMPORT',['IMPORT','EXPORT','BOTH'],'executionScope')
 if(scope!=='IMPORT'&&!['PIVOT','UNPIVOT'].includes(String(type)))throw new Error(`${String(type)}只能用于IMPORT`)
 for(const key of ['source_field','target_field'])if(row[key]!==undefined&&row[key]!==null&&typeof row[key]!=='string')throw new Error(`${key}必须是文本`)
 if(['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP'].includes(String(type)))text(row['source_field'],'source_field')
 if(['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP','COMPUTE','DEFAULT','OVERRIDE'].includes(String(type)))text(row['target_field'],'target_field')
 const condition=row['condition_json']
 if(condition!==undefined&&condition!==null&&condition!==''){
  if(typeof condition!=='string')throw new Error('condition_json必须是文本')
  if(condition.trim()){
   if(['PIVOT','DEDUPLICATE'].includes(String(type)))throw new Error(`${String(type)}不支持condition_json`)
   visitExcelTransformExpression({value:json(condition,'condition_json'),path:'condition_json',objectRoot:true})
  }
 }
 const option=(key:string,allowed:readonly string[])=>has(key)?choice(config[key],allowed,key):undefined
 const expression=(required:boolean,allowNull=false)=>{if(!has('expression')){if(required)throw new Error('缺少expression');return}if(config['expression']===null&&!allowNull)throw new Error('expression不能是空节点，请显式使用const');visitExcelTransformExpression({value:config['expression'],path:'config_json.expression'})}
 if(type==='REPLACE'){if(typeof config['search']!=='string'||!config['search'].length)throw new Error('search不能为空');if(has('replacement')&&typeof config['replacement']!=='string')throw new Error('replacement必须是文本');if(has('regex')&&typeof config['regex']!=='boolean')throw new Error('regex必须是布尔值')}
 if(type==='CONVERT'){const target=option('targetType',['STRING','INTEGER','DECIMAL','BOOLEAN','DATE'])??'STRING';if(target==='DATE'&&has('pattern'))text(config['pattern'],'pattern')}
 if(type==='EXPLODE'||type==='UNPIVOT'){
  if(has('maxItems')&&(!Number.isInteger(config['maxItems'])||Number(config['maxItems'])<1||Number(config['maxItems'])>1000))throw new Error('maxItems必须在1到1000之间')
 }
 if(type==='EXPLODE'){
  if(has('delimiterRegex')&&typeof config['delimiterRegex']!=='string')throw new Error('delimiterRegex必须是原生文本')
  for(const key of ['trim','ignoreEmpty','distinct'])if(has(key)&&typeof config[key]!=='boolean')throw new Error(`${key}必须是布尔值`)
  option('emptyPolicy',['KEEP_NULL','SKIP_ROW','FAIL_ROW'])
 }
 if(type==='LOOKUP'){if(!Object.keys(object(config['mapping'],'mapping')).length)throw new Error('mapping至少需要一项');option('missingPolicy',['ERROR','KEEP_RAW','USE_NULL'])}
 if(type==='COMPUTE'){expression(true);option('writePolicy',['ALWAYS_OVERRIDE','IF_EMPTY','VERIFY_EQUAL'])}
 if(type==='OVERRIDE')expression(false,true)
 if(type==='VALIDATE'){
  const required=has('requiredFields')?names(config['requiredFields'],'requiredFields',false):[]
  if(!required.length&&!has('expression'))throw new Error('VALIDATE需要字段或expression')
  expression(false);if(has('message')&&typeof config['message']!=='string')throw new Error('message必须是文本')
 }
 if(type==='FILTER')expression(true)
 if(type==='DEDUPLICATE'){names(config['fields'],'fields');option('duplicatePolicy',['KEEP_FIRST','ERROR'])}
 if(type==='UNPIVOT'){
  const columns=config['columns'];if(!Array.isArray(columns)||!columns.length||columns.length>Number(config['maxItems']??50)||columns.length>1000)throw new Error('columns为空或超过maxItems')
  const source=columns.map((v,i)=>{const c=object(v,`columns[${i}]`),key=c['key'];if(!['string','number','boolean'].includes(typeof key))throw new Error('columns.key必须保留原生标量');return text(c['sourceField'],'columns.sourceField').toLowerCase()})
  if(new Set(source).size!==source.length)throw new Error('columns.sourceField不能重复')
  const key=text(config['keyTargetField'],'keyTargetField').toLowerCase(),value=text(config['valueTargetField'],'valueTargetField').toLowerCase()
  if(key===value||source.includes(key)||source.includes(value))throw new Error('UNPIVOT目标不能覆盖来源或相同目标')
  option('sourceFieldPolicy',['REMOVE','KEEP']);option('nullPolicy',['SKIP','KEEP_NULL','ZERO'])
 }
 if(type==='PIVOT'){
  const groupNames=names(config['groupFields'],'groupFields').map(v=>v.trim());if(new Set(groupNames).size!==groupNames.length)throw new Error('groupFields不能重复');const groups=groupNames.map(v=>v.toLowerCase());text(config['keyField'],'keyField');text(config['valueField'],'valueField')
  const columns=object(config['columns'],'columns');if(Object.keys(columns).some(key=>!key.trim()))throw new Error('columns输入键不能为空');const targets=Object.values(columns).map(v=>text(v,'columns目标').trim().toLowerCase())
  if(!targets.length||new Set(targets).size!==targets.length||targets.some(v=>groups.includes(v)))throw new Error('PIVOT输出为空、重复或覆盖分组字段')
  option('unknownKeyPolicy',['ERROR','IGNORE']);option('duplicateCellPolicy',['ERROR','FIRST','LAST','SUM','MIN','MAX'])
 }
 return undefined
}
