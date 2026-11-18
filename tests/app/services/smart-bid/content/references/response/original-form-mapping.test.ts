import {expect,it} from 'vitest'
import {findChangedOriginalFormFields,mapOriginalForm} from '@/services/smart-bid/content/references/response/original-form-mapping'

const cell={cellRef:'CELL',rowRef:'1',columnRef:'PRICE',meaningRef:'GROSS',fillerRef:'BIDDER',unit:'CNY',displayRef:'DECIMAL'}
const original={projectId:'P',formRef:'FORM',formVersion:'V1',cells:[cell],assertCurrent:()=>{}}
const input={projectId:'P',formRef:'FORM',formVersion:'V1',fillerRef:'BIDDER',
 mappings:[{fieldRef:'PRICE',cellRef:'CELL',meaningRef:'GROSS'}]}

it('rejects reuse for the wrong filler or version and flags changed meaning at an unchanged coordinate',()=>{
 const before=mapOriginalForm(original,input)
 expect(before.mappings[0]?.cell).toMatchObject({rowRef:'1',columnRef:'PRICE',unit:'CNY',displayRef:'DECIMAL'})
 expect(()=>mapOriginalForm(original,{...input,fillerRef:'OTHER'})).toThrow('BID_ORIGINAL_FORM_MAPPING')
 const updated={...original,formVersion:'V2',cells:[{...cell,meaningRef:'NET'}]}
 expect(()=>mapOriginalForm(updated,input)).toThrow('BID_ORIGINAL_FORM_SCOPE')
 expect(()=>mapOriginalForm(updated,{...input,formVersion:'V2'})).toThrow('BID_ORIGINAL_FORM_MAPPING')
 const after=mapOriginalForm(updated,{...input,formVersion:'V2',mappings:[{...input.mappings[0]!,meaningRef:'NET'}]})
 expect(findChangedOriginalFormFields(before,after)).toEqual(['PRICE'])
})
