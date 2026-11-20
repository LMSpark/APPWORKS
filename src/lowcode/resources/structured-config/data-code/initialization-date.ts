/**
 * @module app:lowcode/resources/structured-config/data-code/initialization-date
 * 职责：按当前规则及获准读取的父编码解析初始化日期输入。
 * 边界：专用命名视图只查询，不改原规则选择视图，不猜缺失的日期格式。
 * AI用途：初始化弹窗打开时调用，依赖同一正式运行owner。
 */
import {DataViewFilter,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {getCodeInitializationPlan,readInitializationNodes,type CodeInitializationPlan,type InitializationNode} from './initialization-plan'

export type InitializationDate=Readonly<{visible:boolean;format:string;valueFormat:string;dateType:'year'|'month'|'date';value:string}>
type Options=Readonly<{dataSet:DataSet;runtime:DataSpaceRuntimeApi;plan:CodeInitializationPlan;now?:Date}>
function dateInput(raw:string,now:Date):InitializationDate {
  const format=raw.replace(/yyyy/g,'YYYY').replace(/yy/g,'YY').replace(/dd/g,'DD')
  if(!format||/[A-Za-z]/.test(format.replace(/YYYY|YY|MM|DD/g,'')))throw new Error('初始化日期格式尚无法确认')
  const values:Record<string,string>={YYYY:String(now.getFullYear()),YY:String(now.getFullYear()).slice(-2),MM:String(now.getMonth()+1).padStart(2,'0'),DD:String(now.getDate()).padStart(2,'0')}
  const dateType=format.includes('DD')?'date':format.includes('MM')?'month':'year'
  // 实服DateUtil按分隔符解析日期；紧凑显示值会被误读为整年，不能直接作为请求值。
  const valueFormat=dateType==='date'?'YYYY-MM-DD':dateType==='month'?'YYYY-MM':'YYYY'
  return {visible:true,format,valueFormat,dateType,value:valueFormat.replace(/YYYY|MM|DD/g,token=>values[token]??'')}
}
/** @param options 当前已核设计、原查询owner及日期时钟。 @returns 可绑定标准日期字段的输入合同。 */
export async function resolveCodeInitializationDate(options:Options):Promise<InitializationDate>{
  const {dataSet,runtime,plan}=options,path=new Set<string>(),resolved=new Set<string>()
  const guard=()=>{if(getCodeInitializationPlan(dataSet).signature!==plan.signature)throw new Error('编码初始化日期目标已改变')}
  const source=(tableName:string):DataView=>{
    const base=dataSet.getView(tableName);if(!base?.dataTable)throw new Error('初始化父编码视图缺失')
    const existing=base.dataTable.getView('initializationDateSource');if(existing)return existing
    const view=base.dataTable.getOrCreateView('initializationDateSource');view.primaryKey=base.primaryKey
    view.configure({autoLoad:false,queryConfig:{...base.queryConfig,allPages:true},fieldProjection:base.fieldProjection})
    view.bindQueryExecutor({localAggregates:false,executeQuery:(current,params)=>runtime.executeQuery(current,params)})
    return view
  }
  const find=async(codeId:string,nodes:readonly InitializationNode[]):Promise<string>=>{
    guard();if(path.has(codeId))throw new Error('父编码存在循环引用');if(resolved.has(codeId))return ''
    path.add(codeId)
    try{
      const direct=nodes.find(node=>node.label.includes('时间字符串'))
      if(direct){const pattern=direct.rule['DateFormat'];if(typeof pattern!=='string'||!pattern.trim())throw new Error('时间字符串缺少可执行日期格式');return pattern.trim()}
      for(const node of nodes.filter(candidate=>candidate.label==='父编码串')){
        const parentId=node.rule['RefCodeId'];if(typeof parentId!=='string'||!parentId.trim())throw new Error('父编码引用身份缺失')
        if(path.has(parentId))throw new Error('父编码存在循环引用')
        if(resolved.has(parentId))continue
        const main=source('Base_CodeDesign')
        main.filterExpression=DataViewFilter.group({logic:'and',filters:[{field:'rowid',operator:'eq',value:parentId},{field:'AppID',operator:'eq',value:plan.applicationId}]}).toJSON()
        await main.refresh();guard();if(main.loadingError)throw main.loadingError
        const parent=main.rows[0]
        if(main.rows.length!==1||!parent||main.fieldAccess(parent,'rowid').read!=='visible'||main.getPkKey(parent)!==parentId||main.fieldAccess(parent,'AppID').read!=='visible'||parent['AppID']!==plan.applicationId)throw new Error('未找到当前应用获准读取的父编码')
        const children=source('Base_CodeNodeDesign');children.filterExpression=DataViewFilter.condition({field:'CodeDesignID',operator:'eq',value:parentId}).toJSON()
        await children.refresh();guard();if(children.loadingError)throw children.loadingError
        if(children.rows.some(row=>children.fieldAccess(row,'CodeDesignID').read!=='visible'||row['CodeDesignID']!==parentId))throw new Error('父编码节点归属不一致')
        const pattern=await find(parentId,readInitializationNodes(children));if(pattern)return pattern
      }
      resolved.add(codeId);return ''
    }finally{path.delete(codeId)}
  }
  const pattern=await find(plan.codeId,plan.nodes);guard()
  return pattern?dateInput(pattern,options.now??new Date()):{visible:false,format:'',valueFormat:'',dateType:'date',value:''}
}
