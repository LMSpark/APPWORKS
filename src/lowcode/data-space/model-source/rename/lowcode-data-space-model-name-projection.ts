/**
 * @module lowcode/data-space/model-source/rename/lowcode-data-space-model-name-projection
 * 职责：改名与正式模型fork共用注册名引用的纯投影。
 * 边界：不读写DataView、不推导权限；物理资源限定名、完整本地字段名、常量及节点参数不改。
 */
type Row=Readonly<Record<string,unknown>>
type Input=Readonly<{models:readonly Row[];fields:readonly Row[];previousName:string;nextName:string;nextModels?:readonly Row[]}>
export class LowcodeDataSpaceModelNameProjection{
 constructor(private readonly input:Input){}
 /** 不透明代码包含原名时不得猜测替换。 */
 assertOpaque(value:unknown,path:string):void{if(value!==undefined&&value!==null&&value!==''&&(typeof value!=='string'||value.includes(this.input.previousName)))throw Error(`${path}包含尚不能可靠改写的引用，请先核查；原文保留`)}
 /** 先解析完整本地字段，再按已核定注册模型身份解析限定引用。 */
 field(value:unknown,owner:unknown,preserved:readonly unknown[]=[]):string{
  const {models,fields,previousName,nextName}=this.input
  if(typeof value!=='string'||!value)throw Error('字段引用无法核验')
  const direct=fields.some(row=>row['dataModelId']===owner&&row['Name']===value),prefix=`${previousName}.`
  if(direct||preserved.includes(previousName)||!value.startsWith(prefix))return value
  const candidates=models.filter(model=>typeof model['Name']==='string'&&value.startsWith(`${model['Name']}.`))
  const exact=candidates.filter(model=>fields.some(row=>row['dataModelId']===model['rowid']&&[row['Name'],row['AsName']].includes(value.slice(String(model['Name']).length+1))))
  if(exact.length>1)throw Error(`模型字段引用不唯一：${value}`)
  const qualifier=value.slice(0,value.lastIndexOf('.')),resolved=exact[0]?.['Name']??candidates.find(model=>model['Name']===qualifier)?.['Name']
  if(resolved===undefined)throw Error(`模型字段引用无法核验：${value}`)
  if(resolved!==previousName)return value
  const next=`${nextName}.${value.slice(prefix.length)}`
  if(fields.some(row=>row['dataModelId']===owner&&row['Name']===next))throw Error(`注册名迁移目标与完整本地字段冲突：${next}`)
  const renamed=this.input.nextModels??models.map(model=>model['Name']===previousName?{...model,Name:nextName}:model)
  const matching=renamed.filter(model=>typeof model['Name']==='string'&&next.startsWith(`${model['Name']}.`)&&fields.some(row=>row['dataModelId']===model['rowid']&&[row['Name'],row['AsName']].includes(next.slice(String(model['Name']).length+1))))
  if(matching.length>1)throw Error(`模型字段迁移目标不唯一：${next}`)
  return next
 }
 /** 只变换正式值函数的注册名成员；调用方继续区分dataModel物理GetRefData。 */
 value(value:Record<string,unknown>,owner:unknown,preserved:readonly unknown[]=[]):Record<string,unknown>{
  const {models,previousName,nextName}=this.input,type=value['Type']
  if(['GetConstValue','GetInputParam','SystemData','GetUserMasterId'].includes(String(type)))return value
  if(type==='GetTableField')return{...value,Field:this.field(value['Field'],owner,preserved)}
  const key=type==='GetRefData'?'RefTableName':type==='GetGroupData'?'GroupTableName':undefined
  if(key){const result={...value},referenced=models.find(model=>model['Name']===value[key])?.['rowid']
   if(value[key]===previousName&&!preserved.includes(previousName))result[key]=nextName
   for(const property of type==='GetRefData'?['RefFieldName','FkFieldName']:['GroupField','Field'])if(value[property]!==undefined&&value[property]!=='')result[property]=this.field(value[property],property==='FkFieldName'?owner:referenced,preserved)
   return result
  }
  this.assertOpaque(JSON.stringify(value),`值函数${String(type)}`);return value
 }
}
