import type {RequestConfig,HttpResponse} from '@spark-appworks/spark-utils'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {vi,type Mock} from 'vitest'
import {isRecord} from '@spark-appworks/spark-utils'
import catalogText from '../../../../../config/pages/structured-config/logic-view-catalog/pagedata.json?raw'
import metadataText from '../../../../../config/pages/data-platform/data-space-design/pagedata.json?raw'
import dictionaryText from '../../../../../config/pages/data-platform/data-dictionary/pagedata.json?raw'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'

/** 只替换正式定义和仓库IO边界；场景loader、assembler、PageRuntime与CRUD owner均使用真实实现。 */
export function configureLogicFixture(service:Readonly<{readSpaceDefinition:Mock;readModel:Mock;readModelBatch:Mock;readRelations:Mock;createGateways:Mock}>,http:ApiBackend,
 extras:ReturnType<typeof buildFormalModels>=[]){
 const texts:Record<string,string>={'EB720370EF06A5A656838F87E0716D6B':catalogText,'8D1AB14DD8277F3E7017CD38F77B09FD':metadataText,
  '69B79AB779DF4C12A5595DACDF3283F1':dictionaryText}
 const readText=vi.fn(async(id:string)=>{const text=texts[id];if(!text)throw Error(`Unexpected fixture scenario ${id}`);return text})
 const unexpected=()=>{throw Error('Unexpected fixture repository IO')}
 service.createGateways.mockReturnValue({scenarioViews:{readScope:()=> 'fixture-scope',readText,writeText:unexpected},tools:{readText:unexpected,writeText:unexpected},navigation:{read:unexpected,write:unexpected}})
 service.readSpaceDefinition.mockImplementation(async({dataSpaceId}:{dataSpaceId:string})=>{if(!texts[dataSpaceId])throw Error('Unexpected fixture space');return{dataSpaceId,name:'Logic fixture',raw:{}}})
 const model=(scenarioId:string,metaName:string)=>{
  const config=JSON.parse(texts[scenarioId]??'null');if(!isRecord(config)||!isRecord(config['tables']))throw Error('Missing fixture space')
  const entry=Object.values(config['tables']).find(table=>isRecord(table)&&isRecord(table['modelBinding'])&&table['modelBinding']['modelName']===metaName)
  if(!isRecord(entry)||!isRecord(entry['modelBinding']))throw Error(`Missing fixture model ${metaName}`)
  const binding=entry['modelBinding'],id=binding['modelId'];if(typeof id!=='string')throw Error('Missing fixture model identity')
  const names=new Set<string>(),computed=new Set<string>(),columns=Array.isArray(entry['columns'])?entry['columns']:[]
  const collectFields=(value:unknown):void=>{
   if(Array.isArray(value)){value.forEach(collectFields);return}
   if(!isRecord(value))return
   for(const key of ['field','idField','parentIdField','textField'])if(typeof value[key]==='string')names.add(value[key])
   Object.values(value).forEach(collectFields)
  }
  collectFields(entry['views'])
  for(const column of columns)if(isRecord(column)&&typeof column['name']==='string'){if(column['computeExpression']!==undefined)computed.add(column['name']);else names.add(column['name'])}
  if(isRecord(entry['views']))for(const view of Object.values(entry['views'])){
   if(!isRecord(view))continue
   for(const key of ['valueField','labelField'])if(typeof view[key]==='string')names.add(view[key])
   if(isRecord(view['queryConfig'])&&Array.isArray(view['queryConfig']['fields']))for(const field of view['queryConfig']['fields'])if(typeof field==='string')names.add(field)
  }
  const extra=extras.find(item=>item.metaName===metaName);extra?.fields.forEach(field=>names.add(field.name))
  const primaryKey=metaName==='_Base_ParamList'?'parid':metaName==='Base_UserInfo'?'ID':metaName==='_base_dbInfo'?'Id':'rowid';names.add(primaryKey)
  const numeric=new Set(['IsPKey','IsOutput','order','Order','ordIdx','DataLen','allowAIAdd','cascadeDel','status','flowstate'])
  const formal=buildFormalModels({[metaName]:[...names].filter(name=>!computed.has(name))})[0]!
  return{...formal,id,primaryKey,raw:{dataSetId:scenarioId},fields:formal.fields.map(field=>{
   const original=extra?.fields.find(item=>item.name===field.name),sample=http.records[metaName]?.find(row=>Object.hasOwn(row,field.name))?.[field.name]
   return{...field,...original,modelId:id,primaryKey:field.name===primaryKey,type:typeof sample==='number'||numeric.has(field.name)?'int':typeof sample==='boolean'?'boolean':original?.type??field.type}
  })}
 }
 service.readModel.mockImplementation(async({dataSpaceId,metaName}:{dataSpaceId:string;metaName:string})=>model(dataSpaceId,metaName))
 service.readModelBatch.mockImplementation(async({dataSpaceId,metaNames}:{dataSpaceId:string;metaNames:string[]})=>metaNames.map(name=>model(dataSpaceId,name)))
 service.readRelations.mockResolvedValue([])
 return{readText}
}

/** 正式CRUD仍由ApiBackend确认存储；设计文件单独维护数组和回读，不能用发出请求代替保存成功。 */
export class LogicViewHttp extends ApiBackend {
  beforeRead?: (request:RequestConfig)=>Promise<void>
  protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
    if(request.url==='/api/DataOperation/GetData')await this.beforeRead?.(request)
    return super.executeRequest(request)
  }
  posts: Array<{url: string; data: unknown}> = []
  logicDesigns: Record<string, unknown[]> = {}
  missingDesigns = new Set<string>()
  override post<T>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    this.posts.push({url, data})
    if (url.includes('ViewData/GetView')) {
      if (this.missingDesigns.has(String(config?.params?.['viewId'] ?? ''))) return Promise.resolve({Code: 1003, Message: '数据不存在', Result: null} as T)
      return Promise.resolve({Code: 200, Result: structuredClone(this.logicDesigns[String(config?.params?.['viewId'] ?? '')] ?? [])} as T)
    }
    if (url.includes('ViewData/SaveView')) {
      const payload = data as {viewId: string; data: unknown[]}
      this.logicDesigns[payload.viewId] = structuredClone(payload.data)
      return Promise.resolve({Code: 200, Result: '保存成功'} as T)
    }
    return super.post<T>(url, data, config)
  }
}
