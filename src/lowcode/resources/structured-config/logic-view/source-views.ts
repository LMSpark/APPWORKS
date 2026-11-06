/**
 * @module app:lowcode/resources/structured-config/logic-view/source-views
 * 职责：消费本次PageRuntime已装配的正式来源命名视图。
 * 边界：不读模型定义、不增表或复制配置；行查询和来源准备沿原DataView。
 */
import type {DataSet,DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi} from '../../../lowcode-runtime'
import {LowcodeDataSpaceSourceCatalog,type PageDataSpaceModelSource} from '../../../data-space/model-source/lowcode-data-space-source-catalog'
import {LowcodeDataSpaceModelSourceReader} from '../../../data-space/model-source/lowcode-data-space-model-source-reader'
export type LogicViewSourceType='table'|'dict'|'interface'|'json'
export class LogicViewSourceViews {
 readonly #scope=lowcodeApi.readRequestScope()
 readonly #reader=new LowcodeDataSpaceModelSourceReader()
 constructor(private readonly dataSet:DataSet){this.assertCurrent()}
 assertCurrent():void{
  const current=lowcodeApi.readRequestScope()
  if(this.dataSet.destroyed||this.dataSet.scenarioId!==DATA_SPACE_DESIGN_FORM_KEY||!this.#scope.headers['X-AppId']||current.token!==this.#scope.token||current.headers['X-AppId']!==this.#scope.headers['X-AppId'])throw Error('LOGIC_SOURCE_STALE: 来源空间或应用身份已变化')
 }
 private view(name:string,id:string):Promise<DataView>{
  this.assertCurrent()
  const view=this.dataSet.getView(name,id)
  if(!view||view.dataTable?.modelBinding?.modelName!==name)throw Error('LOGIC_SOURCE_MODEL: 正式来源命名视图未装配')
  return Promise.resolve(view)
 }
  /** 来源目录供标准表格绑定，实际查询按需由当前候选DataView执行。 */
  public async candidate(type:LogicViewSourceType):Promise<DataView>{
    const view=await this.view(LowcodeDataSpaceSourceCatalog.config(type).metaName,'sourceCandidates');this.assertCurrent();return view
  }
  /** 复用已有正式详情视图，参数草稿和选中行仍由各自命名视图持有。 */
  public async details(name:string):Promise<DataView>{const view=await this.view(name,'sourceDetails');this.assertCurrent();return view}
  /** 候选确认后精确回读来源、字段与输入定义；不执行来源接口或保存节点。 */
  public async prepare(source:PageDataSpaceModelSource){
    await this.details(LowcodeDataSpaceSourceCatalog.config(source.type).metaName)
    if(source.type==='table'||source.type==='interface')await this.details('Base_TblField')
    if(source.type==='interface')await this.details('_Base_ParamList')
    this.assertCurrent();const prepared=await this.#reader.prepare(source,this.dataSet,{missingInputType:'preserve'});this.assertCurrent()
    return prepared
  }
}
