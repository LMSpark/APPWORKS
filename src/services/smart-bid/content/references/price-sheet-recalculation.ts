/**
 * @module app:services/smart-bid/content/references/price-sheet-recalculation
 * 职责：动作28按已核计价规则复算数量乘单价及分项差异。
 */
import {snapshotReferenceIdentity as identity} from './snapshot-reference-values'

type Rounding='HALF_UP'|'TRUNCATE'
type PriceLine=Readonly<{lineRef:string;quantity:string;unitPrice:string;reportedAmount:string;unit:string;sourceRef:string}>

function decimal(value:string){
 if(!/^-?\d+(?:\.\d+)?$/u.test(value))throw Error('BID_PRICE_DECIMAL')
 const [whole,fraction='']=value.split('.')
 return {integer:BigInt(whole+fraction),scale:fraction.length}
}

function scaled(integer:bigint,scale:number,rule:Readonly<{precision:number;rounding:Rounding}>){
 const {precision,rounding}=rule
 if(scale<=precision)return integer*10n**BigInt(precision-scale)
 const divisor=10n**BigInt(scale-precision)
 const remainder=integer%divisor
 const magnitude=remainder<0n?-remainder:remainder
 const adjustment=rounding==='HALF_UP'&&magnitude*2n>=divisor?(integer<0n?-1n:1n):0n
 return integer/divisor+adjustment
}

function format(integer:bigint,precision:number){
 const sign=integer<0n?'-':''
 const digits=(integer<0n?-integer:integer).toString().padStart(precision+1,'0')
 return precision===0?sign+digits:`${sign}${digits.slice(0,-precision)}.${digits.slice(-precision)}`
}

/** 同一币种的独立叶子行才可汇总。转列和费用规则由各行的计价依据确定。 */
export function recalculatePriceLines(input:Readonly<{
 pricingVersion:string;currency:string;precision:number;rounding:Rounding;lines:readonly PriceLine[];assertCurrent:()=>void
}>){
 input.assertCurrent()
 const {pricingVersion,currency,precision,rounding,lines}=input
 if(!identity(pricingVersion)||!identity(currency)||!Number.isSafeInteger(precision)||precision<0||precision>30||
  !['HALF_UP','TRUNCATE'].includes(rounding)||!lines.length||new Set(lines.map(line=>line.lineRef)).size!==lines.length)
  throw Error('BID_PRICE_RECALCULATION_SCOPE')
 let total=0n
 const results=Object.freeze(lines.map(line=>{
  const {lineRef,unit,sourceRef}=line
  if(![lineRef,unit,sourceRef].every(identity))throw Error('BID_PRICE_RECALCULATION_SCOPE')
  const quantity=decimal(line.quantity),price=decimal(line.unitPrice),reported=decimal(line.reportedAmount)
  const amount=scaled(quantity.integer*price.integer,quantity.scale+price.scale,input)
  const difference=amount*10n**BigInt(Math.max(0,reported.scale-precision))-
   reported.integer*10n**BigInt(Math.max(0,precision-reported.scale))
  total+=amount
  return Object.freeze({lineRef,unit,sourceRef,amount:format(amount,precision),
   difference:format(difference,Math.max(precision,reported.scale))})
 }))
 input.assertCurrent()
 return Object.freeze({pricingVersion,currency,total:format(total,precision),lines:results,assertCurrent:input.assertCurrent})
}

/** 用原批准所指计价版核对复算结果。明细有差异时，总额相同也不算匹配。 */
export function matchApprovedPriceDetail(
 approval:Readonly<{scopeRef:string;approvalRef:string;version:string;detailRef:string;pricingVersion:string
  value:string;unit:string;assertCurrent:()=>void}>,
 result:ReturnType<typeof recalculatePriceLines>,
){
 const assertCurrent=()=>{approval.assertCurrent();result.assertCurrent()}
 assertCurrent()
 const {scopeRef,approvalRef,version,detailRef,pricingVersion,value,unit}=approval
 if(![scopeRef,approvalRef,version,detailRef,pricingVersion,unit].every(identity)||result.pricingVersion!==pricingVersion)
  throw Error('BID_PRICE_APPROVED_DETAIL_VERSION')
 const approved=decimal(value),calculated=decimal(result.total)
 const matchesApproval=result.currency===unit&&approved.integer*10n**BigInt(calculated.scale)===
  calculated.integer*10n**BigInt(approved.scale)&&result.lines.every(line=>decimal(line.difference).integer===0n)
 return Object.freeze({scopeRef,approvalRef,version,detailRef,matchesApproval,assertCurrent})
}
