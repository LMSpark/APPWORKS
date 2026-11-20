import {expect,it} from 'vitest'
import {hashCalculationInputs} from '@/services/smart-bid/content/calculation/calculation-inputs-hash'

const table={nodeId:'A',generatorVersion:'deviation/1',formInstructionRefs:[{id:'form',version:2}],
 requirementVersions:[{id:'req',version:1}],confirmedResponses:[{id:'response',coverage:['req'],selected:true,exceptions:[]}],
 factVersions:[{factId:'PRICE',version:2}],resourceVersions:[{id:'resource',version:1}]}

it('retains response confirmation and original instruction version in the calculation hash',async()=>{
 const hash=(record:typeof table)=>hashCalculationInputs({expectedNodeIds:['A'],tables:[record]})
 const original=await hash(table)
 expect(original.calculationInputsHash).toMatch(/^[0-9a-f]{64}$/)
 const changed=await hash({...table,confirmedResponses:[{...table.confirmedResponses[0]!,selected:false}]})
 expect(changed.tables[0]?.inputHash).not.toBe(original.tables[0]?.inputHash)
 expect((await hash({...table,formInstructionRefs:[{id:'form',version:3}]})).calculationInputsHash).not.toBe(original.calculationInputsHash)
})

it('orders tables by exact node identity and requires one result per selected table',async()=>{
 const other={...table,nodeId:'B'}
 const first=await hashCalculationInputs({expectedNodeIds:['B','A'],tables:[other,table]})
 expect(await hashCalculationInputs({expectedNodeIds:['A','B'],tables:[table,other]})).toEqual(first)
 await expect(hashCalculationInputs({expectedNodeIds:['A','B'],tables:[table]})).rejects.toThrow('CONTENT_CALCULATION_INPUT_SCOPE')
 await expect(hashCalculationInputs({expectedNodeIds:['A','B'],tables:[table,table]})).rejects.toThrow('CONTENT_CALCULATION_INPUT_SCOPE')
})
