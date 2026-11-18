/**
 * @module app:services/smart-bid/content/references/configuration/configuration-disable-impact
 * 职责：第61项按原锁和原执行状态交接停用影响。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{kind:string;key:string;scopeId:string;versionId:string;digest:string}>
type Stop=Scope&Readonly<{releaseRef:string;stopScope:'NEW_SELECTION'|'UNEXECUTED';assertCurrent:()=>void}>
type Use=Scope&Readonly<{
 operationRef:string;lockRef:string;ownerId:string;state:'UNEXECUTED'|'EXECUTED'|'UNKNOWN'
 permission:'ALLOWED'|'DENIED'|'UNKNOWN';permissionRef:string|null;assertCurrent:()=>void
}>

/** 历史实发保留，未知查原操作；旧锁继续执行还须核当前用途。 */
export function assessConfigurationDisableImpact(stop:Stop,source:Readonly<{
 uses:readonly Use[];complete:boolean;assertCurrent:()=>void
}>){
 const uses=[...source.uses]
 const assertCurrent=()=>{stop.assertCurrent();source.assertCurrent();for(const record of uses)record.assertCurrent()}
 assertCurrent()
 const fields=['kind','key','scopeId','versionId','digest'] as const
 const seen=new Set<string>(),error='CONFIGURATION_DISABLE_IMPACT_SCOPE'
 if(![stop.kind,stop.key,stop.scopeId,stop.versionId,stop.releaseRef].every(identity)||
  !/^[a-f0-9]{64}$/u.test(stop.digest))throw Error(error)
 const items=uses.map(use=>{
  const {operationRef,lockRef,ownerId,permissionRef}=use
  if(fields.some(key=>use[key]!==stop[key])||![operationRef,lockRef,ownerId].every(identity)||seen.has(operationRef)||
   use.permission==='ALLOWED'&&!identity(permissionRef))throw Error(error)
  seen.add(operationRef)
  const action=use.state==='EXECUTED'?'PRESERVE_HISTORY':use.state==='UNKNOWN'?'CHECK_ORIGINAL':
   stop.stopScope==='UNEXECUTED'||use.permission==='DENIED'?'HOLD':
    use.permission==='UNKNOWN'?'CHECK_PERMISSION':'MAY_CONTINUE'
  return Object.freeze({operationRef,lockRef,ownerId,permissionRef,action})
 })
 assertCurrent()
 return Object.freeze({releaseRef:stop.releaseRef,assessmentComplete:source.complete,items:Object.freeze(items),assertCurrent})
}
