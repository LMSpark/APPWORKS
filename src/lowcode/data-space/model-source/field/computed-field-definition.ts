/**
 * @module app:lowcode/data-space/model-source/field/computed-field-definition
 * 职责：两类元数据宿主共用计算字段正式定义的纯内容约束。
 * 边界：不校验引用、身份权限或保存；调用方按各自领域验证ValueFun。
 */
import type {DataRow} from '@spark-appworks/spark-data'
export function buildComputedFieldDefinition(scope:Readonly<{targetId:string;modelId:string}>,row:Readonly<DataRow>):DataRow{
 for(const key of ['Name','AsName'])if(typeof row[key]!=='string'||key==='Name'&&!row[key].trim()||row[key]!==row[key].trim()
  ||/[\u0000-\u001f\u007f]/u.test(row[key])||row[key]==='_pk')throw Error('字段名称必须是非空文本，别名可留空；不能含首尾空白、控制字符或使用保留字段_pk')
 if(typeof row['description']!=='string'||row['IsOutput']!==0&&row['IsOutput']!==1)throw Error('说明或输出开关格式无效')
 if(String(row['Name']).length>100||String(row['AsName']).length>100||row['description'].length>200)throw Error('名称和规范别名不能超过100个字符，描述不能超过200个字符')
 return {dataSetId:scope.targetId,dataModelId:scope.modelId,type:'dataModel',FieldType:'计算字段',IsPKey:0,
  Name:row['Name'],AsName:row['AsName'],description:row['description'],ValueFun:row['ValueFun'],IsOutput:row['IsOutput'],
  Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}
}
