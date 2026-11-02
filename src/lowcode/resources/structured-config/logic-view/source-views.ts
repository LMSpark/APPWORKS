/**
 * @module app:lowcode/resources/structured-config/logic-view/source-views
 * 职责：在本次元数据DataSet按需加入正式来源表和辅助命名视图。
 * 边界：只装配结构，候选与字段读取由原DataView和来源准备器承担；不替换参数视图、不保存设计。
 */
import type {DataSet,DataTable,DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import sourceTemplate from '../../../../../config/pages/data-platform/data-space-design/pagedata.json?raw'
import {lowcodeApi,lowcodeHttp} from '../../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../../data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceSourceCatalog,type PageDataSpaceModelSource} from '../../../data-space/model-source/lowcode-data-space-source-catalog'
import {LowcodeDataSpaceModelSourceReader} from '../../../data-space/model-source/lowcode-data-space-model-source-reader'

export type LogicViewSourceType='table'|'dict'|'interface'|'json'
const template=new ScenarioViewConfig(DATA_SPACE_DESIGN_FORM_KEY,sourceTemplate)
function record(value:unknown,label:string):Record<string,unknown>{if(!isRecord(value))throw new Error(`来源配置${label}缺失`);return value}

export class LogicViewSourceViews {
  readonly #scope=lowcodeApi.readRequestScope()
  readonly #reader=new LowcodeDataSpaceModelSourceReader()
  readonly #loads=new Map<string,Promise<DataTable>>()
  public constructor(private readonly dataSet:DataSet){this.assertCurrent()}
  public assertCurrent():void {
    const current=lowcodeApi.readRequestScope()
    if(this.dataSet.destroyed||this.dataSet.scenarioId!==DATA_SPACE_DESIGN_FORM_KEY||!this.#scope.headers['X-AppId']
      ||current.token!==this.#scope.token||current.headers['X-AppId']!==this.#scope.headers['X-AppId'])throw new Error('LOGIC_SOURCE_STALE: 来源空间或应用身份已变化')
  }
  private tableTemplate(name:string):Record<string,unknown>{return record(record(template.toJSON()['tables'],'tables')[name],name)}
  private ensureTable(name:string):Promise<DataTable> {
    this.assertCurrent()
    const existing=this.dataSet.getTable(name)
    if(existing){if(existing.modelBinding?.modelName!==name)throw new Error('LOGIC_SOURCE_MODEL: 来源模型绑定不一致');return Promise.resolve(existing)}
    const pending=this.#loads.get(name);if(pending)return pending
    const loading=this.loadTable(name).finally(()=>this.#loads.delete(name));this.#loads.set(name,loading);return loading
  }
  private async loadTable(name:string):Promise<DataTable> {
    const scenarioId=DATA_SPACE_DESIGN_FORM_KEY
    const model=await lowcodeApi.dataSpace.design.readModel({designScenarioId:scenarioId,dataSpaceId:scenarioId,metaName:name,assertCurrent:()=>this.assertCurrent()})
    this.assertCurrent()
    if(model.metaName!==name)throw new Error('LOGIC_SOURCE_MODEL: 未返回所需正式模型')
    const config=new ScenarioViewConfig(scenarioId,JSON.stringify({scenarioId,resourceRelations:[],viewCascades:[],tables:{[name]:{
      ...this.tableTemplate(name),modelBinding:{modelId:model.id,modelName:model.metaName},
    }}}))
    const assembled=new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime,lowcodeHttp).assemble({config,
      space:{dataSpaceId:scenarioId,name:this.dataSet.dataSetName},models:[model],relations:[]}).dataSet
    let attached:DataTable|undefined
    try {
      this.assertCurrent()
      const definition=assembled.getTable(name);if(!definition)throw new Error('LOGIC_SOURCE_MODEL: 装配未产生来源表')
      attached=this.dataSet.addTableFromJson(definition.toJson())
      attached.forEachView(view=>lowcodeApi.dataSpace.runtime.bindModelView(view,model))
      return attached
    }catch(cause){if(attached&&this.dataSet.getTable(name)===attached)this.dataSet.removeTable(name);throw cause}
    finally{assembled.destroy()}
  }
  private async view(name:string,id:string):Promise<DataView> {
    const table=await this.ensureTable(name);this.assertCurrent()
    const existing=table.getView(id);if(existing)return existing
    const definition=record(record(this.tableTemplate(name)['views'],`${name}.views`)[id],`${name}.${id}`)
    const original=table.getView('default');if(!original)throw new Error('LOGIC_SOURCE_MODEL: 来源缺少原查询视图')
    const view=original.createQueryView(id)
    try {view.configure({...definition,autoLoad:false,queryContext:{},onRequestComplete:''});view.filterExpression=undefined;return view}
    catch(cause){table.destroyView(id);throw cause}
  }
  /** 来源目录供标准表格绑定，实际查询按需由当前候选DataView执行。 */
  public async candidate(type:LogicViewSourceType):Promise<DataView>{
    const view=await this.view(LowcodeDataSpaceSourceCatalog.config(type).metaName,'sourceCandidates')
    view.configure({selectionDelimiter:'',autoSelectFirst:false,autoCurrentFirst:false});return view
  }
  /** 已有正式表只新增独立辅助视图，复用原查询owner，不继承参数草稿或选中行。 */
  public details(name:string):Promise<DataView>{return this.view(name,'sourceDetails')}
  /** 候选确认后精确回读来源、字段与输入定义；不执行来源接口或保存节点。 */
  public async prepare(source:PageDataSpaceModelSource){
    await this.details(LowcodeDataSpaceSourceCatalog.config(source.type).metaName)
    if(source.type==='table'||source.type==='interface')await this.details('Base_TblField')
    if(source.type==='interface')await this.details('_Base_ParamList')
    this.assertCurrent();const prepared=await this.#reader.prepare(source,this.dataSet,{missingInputType:'preserve'});this.assertCurrent()
    return prepared
  }
}
