import {expect,it} from 'vitest'
import {readEffectiveFactDependencies} from '@/views/features/application/smart-bid/authoring/model/hashes/effective-fact-reader'
import {createCandidateReadFixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

const scope={baselineId:'B',stageRef:{id:'ST',version:'1'},usedFactIds:['PRICE']}
it('batches only exact fixed keys and versions and loses its proof on baseline refresh',async()=>{
 const f=await createCandidateReadFixture('populated')
 try{
  const result=await readEffectiveFactDependencies(f.host,scope)
  expect(result.factDependencyHash).toMatch(/^[a-f0-9]{64}$/u)
  expect(result.displayHashes.map(item=>item.factId)).toEqual(['PRICE'])
  const query=f.query.mock.calls.find(([view])=>view.viewId==='effectiveFactVersions')
  expect(query?.[0].filterExpression).toMatchObject({logic:'or',filters:[{logic:'and',filters:[
   {field:'key',operator:'eq',value:'PRICE'},{field:'version',operator:'eq',value:2},
  ]}]})
  expect(f.query).toHaveBeenCalledTimes(2)
  result.assertCurrent()
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('skips the facts query when the supplied scope has no used facts',async()=>{
 const f=await createCandidateReadFixture()
 try{
  const result=await readEffectiveFactDependencies(f.host,{...scope,usedFactIds:[]})
  expect(result.displayHashes).toEqual([])
  expect(f.query).toHaveBeenCalledTimes(1)
 }finally{f.ds.destroy()}
})
