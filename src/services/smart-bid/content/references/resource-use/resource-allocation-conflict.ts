/**
 * @module app:services/smart-bid/content/references/resource-use/resource-allocation-conflict
 * 职责：按同一资源的时段核对限额占用及排他冲突，为主管的调配决定提供依据。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Occupancy=Readonly<{start:number;end:number;units:number;exclusive:boolean}>
type RegisteredOccupancy=Occupancy&Readonly<{allocationRef:string}>

function validOccupancy(item:Occupancy){
 return Number.isSafeInteger(item.start)&&Number.isSafeInteger(item.end)&&item.start<item.end&&
  Number.isSafeInteger(item.units)&&item.units>0&&typeof item.exclusive==='boolean'
}

/** 输入为经核实的单资源完整占用快照；时段包含起点，结束时释放占用。 */
export function checkResourceAllocationConflict(input:Readonly<{
 limit:number;requested:Occupancy;occupancies:readonly RegisteredOccupancy[];assertCurrent:()=>void
}>){
 input.assertCurrent()
 const {limit,requested,occupancies}=input
 if(!Number.isSafeInteger(limit)||limit<1||!validOccupancy(requested)||
  occupancies.some(item=>!identity(item.allocationRef)||!validOccupancy(item))||
  new Set(occupancies.map(item=>item.allocationRef)).size!==occupancies.length)
  throw Error('BID_RESOURCE_ALLOCATION_SCOPE')
 const activeWindow=occupancies.filter(item=>item.start<requested.end&&item.end>requested.start)
 const boundaries=[...new Set([requested.start,...activeWindow.map(item=>Math.max(item.start,requested.start))])]
  .sort((left,right)=>left-right)
 const capacity=BigInt(limit)
 for(const start of boundaries){
  const concurrent=activeWindow.filter(item=>item.start<=start&&item.end>start)
  const exclusive=concurrent.some(item=>item.exclusive)||requested.exclusive&&concurrent.length>0
  const overLimit=concurrent.reduce((total,item)=>total+BigInt(item.units),BigInt(requested.units))>capacity
  if(exclusive||overLimit)return Object.freeze({state:'CONFLICT' as const,start,exclusive,overLimit,
   allocationRefs:Object.freeze(concurrent.map(item=>item.allocationRef).sort())})
 }
 return Object.freeze({state:'CLEAR' as const})
}
