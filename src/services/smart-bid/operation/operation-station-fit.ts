/** @module app:services/smart-bid/operation/operation-station-fit
 * 职责：以正式工位规则核对工序有效分类。
 * 边界：规则解释及发布目录由调用方提供。
 */
import {readOperationRouteCandidate,type OperationDataValue,type OperationRouteCandidate} from './operation-route-candidate'
import {previewOperationRoute} from './operation-route-preview'

/** 逐项以有效分类匹配所选工位。未通过时拒绝整个候选。 */
export function checkOperationStationFits(candidate:unknown,match:(stationRef:string,classes:readonly string[])=>boolean):void {
 assertStationFits(readOperationRouteCandidate(candidate),match)
}

/** 工艺输出入口先核目录成员，再核工位适配；返回同一份已校验候选。 */
export function readComposedOperationRouteCandidate(
 value:unknown,
 catalog:Readonly<{stationRefs:readonly string[];routeRefs:readonly OperationDataValue[]}>|undefined,
 match:(stationRef:string,classes:readonly string[])=>boolean,
):OperationRouteCandidate {
 if(catalog===undefined)throw Error('OPERATION_ROUTE_CATALOG_REQUIRED')
 const candidate=readOperationRouteCandidate(value,catalog)
 assertStationFits(candidate,match)
 return candidate
}

function assertStationFits({nodes}:OperationRouteCandidate,match:(stationRef:string,classes:readonly string[])=>boolean):void {
 const byId=new Map(nodes.map(node=>[node.id,node]))
 for(const task of previewOperationRoute({nodes}).taskClasses){
  const node=byId.get(task.taskId)
  if(node?.type!=='task'||match(node.data.stationRef,task.classes)!==true){
   throw Error(`OPERATION_ROUTE_STATION_FIT: ${task.taskId}`)
  }
 }
}
