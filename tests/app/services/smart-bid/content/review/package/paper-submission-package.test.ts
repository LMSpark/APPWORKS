import {expect,it} from 'vitest'
import {reviewPaperSubmissionPackage} from '@/services/smart-bid/content/review/paper-submission-package'

it('checks the actual seal, version and number of copies while retaining partial observations',()=>{
 let witnessCurrent=true
 const scope={projectId:'P',packageId:'PKG',sealRef:'SEAL',selectionHash:'a'.repeat(64)}
 const members=[{position:'商务册',paperRef:'BOOK',versionRef:'V1',copies:2},
  {position:'技术册',paperRef:'TECH',versionRef:'V1',copies:1}]
 const source={frozen:{...scope,members,assertCurrent:()=>{}},packed:{...scope,packingRef:'PACK',members,assertCurrent:()=>{}},
  observed:{...scope,witnessRef:'WITNESS',complete:true,members,assertCurrent:()=>{if(!witnessCurrent)throw Error('WITNESS_STALE')}}}
 expect(reviewPaperSubmissionPackage(scope,source)).toMatchObject({membershipMatches:true,packingRef:'PACK',witnessRef:'WITNESS'})
 const observed={...source.observed,complete:false,members:[{...members[0],position:'商务册',paperRef:'BOOK',versionRef:'V2',copies:1}]}
 const partial=reviewPaperSubmissionPackage(scope,{...source,observed})
 expect(partial).toMatchObject({membershipMatches:false,members:[
  {position:'商务册',issues:['OBSERVED_VERSION_MISMATCH','COPY_COUNT_MISMATCH'],observed:{copies:1}},
  {position:'技术册',issues:['COUNT_PENDING'],observed:null},
 ]})
 expect(reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,complete:true}}).members[1]?.issues)
  .toEqual(['MEMBER_MISSING'])
 expect(()=>reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,sealRef:'OTHER'}}))
  .toThrow('PAPER_SUBMISSION_PACKAGE_SCOPE')
 witnessCurrent=false
 expect(()=>partial.assertCurrent()).toThrow('WITNESS_STALE')
})
