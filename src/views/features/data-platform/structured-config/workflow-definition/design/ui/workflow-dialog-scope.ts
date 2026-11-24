import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/platform-adapters/lowcode-runtime'

type WorkflowDialogScopeInput=Readonly<{
  dataSet:DataSet
  workflowId:string
  nodeId:string
  getDataSet:()=>DataSet
  getWorkflowId:()=>string
  getNodeId:()=>string
  isActive:()=>boolean
  isOpen?:()=>boolean
  isEligible?:()=>boolean
  assertExtra?:()=>void
  message:string
}>

/** Capture one mounted workflow-dialog target and request scope for its SPARK Data command. */
export function captureWorkflowDialogScope(input:WorkflowDialogScopeInput):()=>void{
  const scope=lowcodeApi.readRequestScope()
  return ()=>{
    const current=lowcodeApi.readRequestScope()
    if(!input.isActive()||input.isOpen?.()===false||input.isEligible?.()===false
      ||input.getDataSet()!==input.dataSet||input.getWorkflowId()!==input.workflowId||input.getNodeId()!==input.nodeId
      ||current.token!==scope.token||current.headers['X-AppId']!==scope.headers['X-AppId']){
      throw Error(input.message)
    }
    input.assertExtra?.()
  }
}
