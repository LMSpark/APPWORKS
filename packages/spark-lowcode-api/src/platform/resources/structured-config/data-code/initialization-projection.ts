/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/initialization-projection
 * 职责：把服务端初始化组合与原正式记录基线对应，保持语义身份及权限来源。
 * 边界：不补节点归属、不创建正式行、不持编辑草稿，不将函数结果当权限。
 * AI用途：初始化资源查询与保存回读共用同一身份校验。
 */
import type {DataRow,DataView} from '@spark-appworks/spark-data'
import type {DataSpaceQueryContext} from '../../../data-space/runtime/query/data-space-query-context.js'
import type {CodeInitializationInput} from './initialization-client.js'

export type CodeInitializationTarget=CodeInitializationInput&Readonly<{format:string;increment:number;loopColumns:readonly string[]}>
export type InitializationCandidate=Readonly<{row:DataRow;recordId:string;prefix:string}>
type Access=ReturnType<DataView['newRowFieldAccess']>
export const initializationDenied:Access={read:'invisible',write:'denied',component:'hidden',required:false,writeMode:'readonly'}
/** @param input 本次函数结果、正式查询、目标和原新增字段访问合同。 @returns 未持编辑态的不可变查询投影。 */
export function projectInitialization(input:Readonly<{target:CodeInitializationTarget;rows:ReadonlyArray<Readonly<DataRow>>;
  context:DataSpaceQueryContext;createAccess:Access}>):Readonly<{candidates:Map<string,InitializationCandidate>;access:(key:unknown,field:string)=>Access}> {
  const {target,context}=input,candidates=new Map<string,InitializationCandidate>(),ids=new Set<string>(),prefixes=new Set<string>()
  if(!target.loopColumns.length||new Set(target.loopColumns).size!==target.loopColumns.length)throw new Error('初始化循环前段无效')
  for(const item of input.rows){
    const scalar=(value:unknown):string=>{if(value===null||value===undefined)return '';if(typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return String(value);throw new Error('初始化组合字段无效')}
    const prefix=target.loopColumns.map(column=>scalar(item[column])).join(''),recordId=scalar(item['rowid'])
    const min=scalar(item['min']),max=scalar(item['max']),initial=scalar(item['InitVal'])
    if(!min||!max||`${min}-${max}`!==target.format)throw new Error('初始化区间与当前顺序号规则不一致')
    if(prefixes.has(prefix)||recordId&&ids.has(recordId))throw new Error('初始化组合或正式身份重复')
    prefixes.add(prefix);if(recordId)ids.add(recordId)
    if(recordId){
      const rows=context.rows.filter(row=>context.rowKey(row)===recordId),original=rows[0]
      if(rows.length!==1||!original||['rowid','CodeDesignID','NodeDesignId','NodeCode'].some(field=>context.fieldAccess(recordId,field).read!=='visible')
        ||original['CodeDesignID']!==target.codeId||original['NodeCode']!==prefix
        ||original['NodeDesignId']!==null&&original['NodeDesignId']!==undefined&&original['NodeDesignId']!==''&&original['NodeDesignId']!==target.nodeId)throw new Error('初始化既有记录身份或归属不匹配')
    }
    const key=JSON.stringify([target.codeId,target.nodeId,target.date,prefix])
    candidates.set(key,{recordId,prefix,row:{candidateKey:key,recordId,prefix,InitVal:initial,min,max}})
  }
  const access=(key:unknown,field:string):Access=>{
    const candidate=typeof key==='string'?candidates.get(key):undefined
    if(!candidate||!Object.hasOwn(candidate.row,field))return initializationDenied
    const original=candidate.recordId?context.fieldAccess(candidate.recordId,'Code'):input.createAccess
    // 函数给出的待用值未脱敏；正式Code不可见时不能把明文作为“已脱敏值”交给组件。
    if(field==='InitVal')return original.read==='visible'?{...original,required:true}:initializationDenied
    return {...initializationDenied,read:'visible',component:'readonly'}
  }
  for(const [key,candidate]of candidates)if(access(key,'InitVal').read!=='visible')delete candidate.row['InitVal']
  return {candidates,access}
}
