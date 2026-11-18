/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/response-script-host
 * 职责：在同一页10运行实例提供报价与担保读取。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {createApprovedPriceScriptHost} from './approved-price-script-host'
import {createBidSecurityScriptHost} from './bid-security-script-host'

type Scope=Parameters<typeof createApprovedPriceScriptHost>[1]&Parameters<typeof createBidSecurityScriptHost>[1]
type Sources=Readonly<{
 readPriceEvidence:Parameters<typeof createApprovedPriceScriptHost>[2]
 readSecurityReceipts:Parameters<typeof createBidSecurityScriptHost>[2]
}>

/** 两个入口共用宿主固定的编制范围。 */
export function createBidResponseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Scope,sources:Sources,
){
 const price=createApprovedPriceScriptHost(runtime,scope,sources.readPriceEvidence)
 const security=createBidSecurityScriptHost(runtime,scope,sources.readSecurityReceipts)
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name==='bid.response.readSecurity')return security.invoke(name,input,signal)
  return price.invoke(name,input,signal)
 }}
}
