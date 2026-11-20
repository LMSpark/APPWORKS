/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/code-sequence-range
 * 职责：校验待用顺序值并转换为正式Code的前驱，遵循本行格式与增量。
 * 边界：不查询、不聚合、不保存；null表示尚无已用值，不把最小值减成无效字母。
 * AI用途：初始化语义资源提交InitVal时使用，禁止固定减1或浮点转换长整数。
 */
export class CodeSequenceRange {
  private readonly kind: 'decimal'|'hex'|'letter'|'letters'
  private readonly first: string
  private readonly last: string
  private readonly minimum: bigint
  private readonly maximum: bigint
  private readonly padded: boolean
  private readonly step: bigint
  constructor(format:string,increment:number) {
    const parts=format.split('-'),first=parts[0],last=parts[1]
    if(parts.length!==2||!first||!last||!Number.isSafeInteger(increment)||increment===0)throw new Error('顺序号格式或增量无效')
    this.first=first;this.last=last;this.step=BigInt(increment)
    this.kind=/^\d+$/.test(first)&&/^\d+$/.test(last)?'decimal'
      :/^[\da-f]+$/i.test(first)&&/^[\da-f]+$/i.test(last)?'hex'
      :/^[a-z]$/i.test(first)&&/^[a-z]$/i.test(last)?'letter'
      :/^[a-z]+$/i.test(first)&&/^[a-z]+$/i.test(last)&&first.length===last.length?'letters':this.unsupported()
    if(this.kind==='letters'&&increment<0)throw new Error('多位字母顺序号不支持负增量')
    this.padded=first.startsWith('0')&&(this.kind==='hex'||this.kind==='decimal'&&first.length===last.length)
    this.minimum=this.ordinal(first);this.maximum=this.ordinal(last)
    if(this.minimum>this.maximum)throw new Error('顺序号区间起止无效')
  }
  /** @param desired 待使用的规范顺序号。 @returns 已用前驱；最小值以null保留尚未使用的语义。 */
  previous(desired:string):string|null {
    const value=this.ordinal(desired)
    if(value<this.minimum||value>this.maximum||this.format(value)!==desired)throw new Error('待使用顺序号超出范围或格式不一致')
    if(value===this.minimum)return null
    const previous=value-this.step
    if(previous<0n)throw new Error('该待用值没有可表达的顺序号前驱')
    const result=this.format(previous)
    if(this.ordinal(result)+this.step!==value)throw new Error('顺序号前驱不可逆')
    return result
  }
  private unsupported():never {throw new Error('顺序号区间格式尚不能确认转换')}
  private ordinal(value:string):bigint {
    if(this.kind==='decimal') {if(!/^\d+$/.test(value))return this.unsupported();return BigInt(value)}
    if(this.kind==='hex') {if(!/^[\da-f]+$/i.test(value))return this.unsupported();return BigInt(`0x${value}`)}
    if(this.kind==='letter') {if(value.length!==1)return this.unsupported();return BigInt(value.charCodeAt(0))}
    if(!/^[a-z]+$/i.test(value)||value.length!==this.first.length
      ||[...value].some((char,index)=>/[A-Z]/.test(char)!==/[A-Z]/.test(this.first[index]??'')))return this.unsupported()
    return [...value.toUpperCase()].reduce((result,char)=>result*26n+BigInt(char.charCodeAt(0)-65),0n)
  }
  private format(value:bigint):string {
    if(this.kind==='decimal'||this.kind==='hex') {
      const text=value.toString(this.kind==='hex'?16:10).toUpperCase()
      return this.padded?text.padStart(this.last.length,'0'):text
    }
    if(this.kind==='letter')return String.fromCharCode(Number(value))
    let remaining=value,text=''
    for(let places=this.first.length;places>0;places--){const base=/[A-Z]/.test(this.first[places-1]??'')?65:97;text=String.fromCharCode(base+Number(remaining%26n))+text;remaining/=26n}
    if(remaining!==0n)return this.unsupported()
    return text
  }
}
