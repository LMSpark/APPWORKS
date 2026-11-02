/**
 * @module app:lowcode/resources/structured-config/data-code/initialization-workspace
 * 职责：同一DataSet持有一次初始化资源与本地日期参数视图，组合正式打开/查询/取消/保存流程。
 * 边界：不持候选草稿、不提交设计、不绕过资源unknown与目标守卫。
 * AI用途：原生弹窗只绑定这两个视图；宿主按DataSet复用本实例。
 */
import {createCodeInitializationView,type CodeInitializationClient,type DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ensureDataSetStaticInputTable,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {getCodeInitializationPlan,type CodeInitializationPlan} from './initialization-plan'
import {resolveCodeInitializationDate,type InitializationDate} from './initialization-date'

type Options=Readonly<{dataSet:DataSet;runtime:DataSpaceRuntimeApi;client:Pick<CodeInitializationClient,'read'>;now?:()=>Date}>
export class CodeInitializationWorkspace {
  readonly inputs:DataView
  readonly view:DataView
  date:InitializationDate={visible:false,format:'',dateType:'date',value:''}
  private plan:CodeInitializationPlan|undefined
  constructor(private readonly options:Options){
    const {dataSet}=options
    ensureDataSetStaticInputTable(dataSet,'CodeInitializationInput',[{name:'inputId',primary:true},{name:'range'},{name:'date'}])
    const table=dataSet.getTable('CodeInitializationInput');if(!table)throw new Error('初始化输入视图缺失')
    if(!table.rows.length)table.addRows([{inputId:'INPUT',range:'',date:''}])
    this.inputs=table.getOrCreateView('default');this.inputs.configure({commitMode:'staged'});this.inputs.setCurrentRowById('INPUT')
    this.view=createCodeInitializationView({...options,readTarget:()=>{
      const plan=this.currentPlan(),row=this.inputs.getEditingRow('INPUT'),date=this.date.visible?row?.['date']:''
      if(typeof date!=='string'||this.date.visible&&!date)throw new Error('请选择初始化日期')
      return {codeId:plan.codeId,nodeId:plan.nodeId,date,format:plan.format,increment:plan.increment,loopColumns:plan.loopColumns}
    }})
    this.view.queryConfig={allPages:true}
  }
  private currentPlan():CodeInitializationPlan{
    const current=getCodeInitializationPlan(this.options.dataSet)
    if(this.plan?.signature!==current.signature)throw new Error('编码初始化目标已改变，请重新打开')
    return this.plan
  }
  /** 丢弃的只有已清洁的旧查询；不在打开时取消业务修改。 */
  async open():Promise<void>{
    this.view.assertResultReplacementAllowed();this.view.clearAll()
    this.plan=getCodeInitializationPlan(this.options.dataSet)
    this.date=await resolveCodeInitializationDate({dataSet:this.options.dataSet,runtime:this.options.runtime,plan:this.plan,
      ...(this.options.now?{now:this.options.now()}: {})})
    this.currentPlan();this.inputs.discardEditingRows()
    this.inputs.updateEditingValue('INPUT','range',this.plan.format);this.inputs.updateEditingValue('INPUT','date',this.date.value)
    await this.reload()
  }
  /** 日期控件默认写入前调用；先核原候选并清旧结果，再允许原生参数写入。 */
  beforeDateChange():void {this.currentPlan();this.view.assertResultReplacementAllowed();this.view.clearAll()}
  async reload():Promise<void>{this.currentPlan();await this.view.refresh();if(this.view.loadingError)throw this.view.loadingError}
  cancel():void {this.currentPlan();this.view.discardPendingChanges()}
  assertClose():void {if(this.view.hasUnconfirmedSave||this.view.hasEditingChanges()||this.view.dirtyTracking.hasPendingChanges())throw new Error('请先保存或明确取消初始化修改')}
  save(){this.currentPlan();return this.options.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId}]})}
}
