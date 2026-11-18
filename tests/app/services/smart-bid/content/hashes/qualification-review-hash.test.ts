import {expect,it} from 'vitest'
import {hashQualificationReviews} from '@/services/smart-bid/content/hashes/qualification-review-hash'

const review={id:'Q',conclusion:'CONFIRMED',materials:[{version:'M1',hash:'a'.repeat(64)}]}
const other={...review,id:'OTHER'}

it('binds selected records and keeps unrelated qualification evidence out of scope',async()=>{
 const original=await hashQualificationReviews([review,other],['Q'])
 expect(await hashQualificationReviews([{...other,conclusion:'PENDING'},review],['Q'])).toBe(original)
 expect(await hashQualificationReviews([{...review,materials:[{...review.materials[0],version:'M2'}]},other],['Q'])).not.toBe(original)
 expect(await hashQualificationReviews([review,other],['OTHER','Q'])).toBe(await hashQualificationReviews([other,review],['Q','OTHER']))
})

it('fails missing or ambiguous fixed qualification identities',async()=>{
 await expect(hashQualificationReviews([review],['missing'])).rejects.toThrow('CONTENT_QUALIFICATION_SCOPE')
 await expect(hashQualificationReviews([review,review],['Q'])).rejects.toThrow('CONTENT_QUALIFICATION_MODEL')
})
