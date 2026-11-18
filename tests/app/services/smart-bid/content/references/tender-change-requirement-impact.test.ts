import {expect,it,vi} from 'vitest'
import {traceTenderChangeChapterPins} from '@/services/smart-bid/content/references/tender-change-requirement-impact'

it('uses the exact prior pin, keeps unmatched references pending, and lists new obligations separately',()=>{
 const assertChange=vi.fn(),assertRevision=vi.fn()
 const result=traceTenderChangeChapterPins({assertCurrent:assertChange,changes:[
  {previous:{lineageId:'A',version:'1'},current:{lineageId:'A',version:'2'}},
  {previous:{lineageId:'B',version:'1'},current:null},
  {previous:null,current:{lineageId:'C',version:'1'}},
 ]},{assertCurrent:assertRevision,revisionId:'ORIGINAL',pins:[
  {chapterId:'ACTUAL',lineageId:'A',version:'1'},
  {chapterId:'OTHER',lineageId:'A',version:'2'},
  {chapterId:'UNRELATED_VERSION',lineageId:'B',version:'2'},
 ]})
 expect(result.revisionId).toBe('ORIGINAL')
 expect(result.items.map(({state,actualPins})=>[state,actualPins.map(pin=>pin.chapterId)])).toEqual([
  ['PIN_CONFIRMED',['ACTUAL']],['REFERENCE_UNVERIFIED',[]],['NEW_OBLIGATION',[]],
 ])
 assertRevision.mockImplementation(()=>{throw Error('REVISION_STALE')})
 expect(result.assertCurrent).toThrow('REVISION_STALE')
 expect(assertChange).toHaveBeenCalledTimes(3)
})
