/**
 * @module app:views/features/application/smart-bid/authoring/model/price-sheet-reader
 * 职责：从原批准所指范围和计价版读取复算输入。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {matchApprovedPriceDetail,recalculatePriceLines} from '@/services/smart-bid/content/references/price-sheet-recalculation'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const model='PriceSheet',viewName='selectedPriceSheet'
const keys=['scopeRef','detailRef','pricingVersion'] as const
const fields=['currency','precision','rounding','lines'] as const
const error='BID_PRICE_SHEET_EVIDENCE'
type PriceLine=Parameters<typeof recalculatePriceLines>[0]['lines'][number]

function isPriceLine(value:unknown):value is PriceLine{
 return isRecord(value)&&['lineRef','quantity','unitPrice','reportedAmount','unit','sourceRef']
  .every(key=>typeof value[key]==='string')
}

/** 版本化明细作为原记录原生 JSON 读取，金额和数量字段保留十进制字符串。 */
export function priceSheetReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

export async function readRegisteredApprovedPriceDetail(
 host:Parameters<typeof readOriginalRegistrationView>[0],
 approval:Parameters<typeof matchApprovedPriceDetail>[0],
){
 const {scopeRef,detailRef,pricingVersion}=approval
 if(![scopeRef,detailRef,pricingVersion].every(identity))throw Error(error)
 const assertScope=()=>{host.assertCurrent();approval.assertCurrent()}
 const original=await readOriginalRegistrationView({...host,assertCurrent:assertScope},{model,viewName},{scopeRef,detailRef,pricingVersion})
 const {row}=original
 if(!row)return Object.freeze({state:'UNAVAILABLE' as const,assertCurrent:original.assertCurrent})
 const assertCurrent=original.captureFields(fields)
 assertCurrent()
 const {currency,precision,rounding,lines}=row
 if(!identity(currency)||typeof precision!=='number'||(rounding!=='HALF_UP'&&rounding!=='TRUNCATE')||
  !Array.isArray(lines)||!lines.every(isPriceLine))throw Error(error)
 const calculation=recalculatePriceLines({pricingVersion,currency,precision,rounding,lines,assertCurrent})
 const detail=matchApprovedPriceDetail(approval,calculation)
 return Object.freeze({state:'READ' as const,detail,calculation,assertCurrent:detail.assertCurrent})
}
