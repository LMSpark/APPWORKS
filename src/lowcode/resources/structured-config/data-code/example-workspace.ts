/**
 * @module app:lowcode/resources/structured-config/data-code/example-workspace
 * 职责：示例函数接入只读语义DataView，显式刷新后写回原主视图编辑覆盖。
 * 边界：不持第二草稿、不提交设计；失败、并发编辑、失效目标不覆盖原示例。
 */
import {RequestState,type DataRow,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {CodeExampleClient} from '@spark-appworks/spark-lowcode-api'
import {getCodeExamplePlan} from './example-plan'

type Options=Readonly<{dataSet:DataSet;client:Pick<CodeExampleClient,'read'>}>
const name='CodeExamplePreview',resource={resourceType:'code-example',resourceId:'TestGetCodeString'}
export class CodeExampleWorkspace {
  readonly view:DataView
  constructor(private readonly options:Options){
    const {dataSet,client}=options
    if(dataSet.getTable(name))throw new Error('编码示例资源已存在')
    const table=dataSet.addTable(name,[{name:'id',type:'string',isPrimaryKey:true},{name:'value',type:'string'}])
    table.resourceType=resource.resourceType;table.resourceId=resource.resourceId
    this.view=table.getOrCreateView('default');this.view.configure({autoLoad:false,queryConfig:{allPages:true,maxRows:1}})
    this.view.bindQueryExecutor({localAggregates:false,executeQuery:async()=>{
      const plan=getCodeExamplePlan(dataSet),value=await client.read(plan.input)
      const guard=()=>{if(dataSet.destroyed||this.view.destroyed||getCodeExamplePlan(dataSet).signature!==plan.signature)throw new Error('编码示例输入已改变，请重新刷新')}
      guard();const rows:DataRow[]=[{id:plan.id,value}],allowed=(key:unknown,field:string)=>{guard();return key===plan.id&&['id','value'].includes(field)}
      return{rows,total:1,resultPrimaryKey:'id',rowKey:row=>row['id'],
        assertIdentity:identity=>{guard();if(identity.scenarioId!==dataSet.scenarioId||identity.metaName!==name||identity.resource?.resourceId!==resource.resourceId)throw new Error('编码示例资源身份不匹配')},
        fieldAccess:(key,field)=>({read:allowed(key,field)?'visible':'invisible',write:'denied',component:allowed(key,field)?'readonly':'hidden',required:false,writeMode:'readonly'}),
        readFieldAccess:(row,field)=>rows.includes(row)&&allowed(row['id'],field)?'visible':'invisible',
        addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> 'hidden',createChildActionState:()=> 'hidden',viewActionState:()=> 'enabled'}
    }},{resource})
  }
  /** 生成结果仍是草稿；原主DataView负责取消及之后的设计保存。 */
  async refresh():Promise<void>{
    if([RequestState.Preparing,RequestState.Loading].includes(this.view.requestState))throw new Error('编码示例正在刷新')
    const plan=getCodeExamplePlan(this.options.dataSet)
    await this.view.refresh();if(this.view.loadingError)throw this.view.loadingError
    const current=getCodeExamplePlan(this.options.dataSet)
    if(current.signature!==plan.signature||current.previous!==plan.previous)throw new Error('编码示例输入或草稿已改变，请重新刷新')
    const row=this.view.rows[0],main=this.options.dataSet.getView('Base_CodeDesign')
    if(!main||this.view.rows.length!==1||row?.['id']!==plan.id||typeof row['value']!=='string'||this.view.fieldAccess(row,'value').read!=='visible')throw new Error('编码示例结果不可读')
    main.updateEditingValue(plan.id,'CodeExample',row['value'])
  }
}
