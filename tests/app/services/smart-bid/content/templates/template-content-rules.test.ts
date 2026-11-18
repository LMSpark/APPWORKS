import {expect,it} from 'vitest'
import {resolveTemplateContentRules} from '@/services/smart-bid/content/references/template-content-rules'

const classes=[
 {name:'response',elements:['chapter'],role:'RESPONSE',deliverable:false},
 {name:'general',elements:['chapter'],role:'GENERAL'},
 {name:'child',elements:['chapter'],basedOn:'response'},
 {name:'legacy',elements:['raw'],deliverable:false},
]
it('uses only directly selected roles and deliverability',()=>{
 expect(resolveTemplateContentRules({type:'chapter',class:['response']},classes,true)).toEqual({role:'RESPONSE',deliverable:false})
 expect(resolveTemplateContentRules({type:'chapter',class:['child']},classes,true)).toEqual({role:null,deliverable:true})
 expect(()=>resolveTemplateContentRules({type:'chapter',class:['response','general']},classes,true)).toThrow('CONTENT_TEMPLATE_RULE_CLASS')
})
it('keeps legacy raw content out of deliverables',()=>{
 expect(resolveTemplateContentRules({type:'raw',class:['legacy']},classes,true)).toEqual({role:null,deliverable:false})
 expect(()=>resolveTemplateContentRules({type:'raw',class:[]},classes,true)).toThrow('CONTENT_TEMPLATE_RULE_CLASS')
 const invalid=classes.map(item=>item.name==='legacy'?{...item,deliverable:true}:item)
 expect(()=>resolveTemplateContentRules({type:'raw',class:['legacy']},invalid,true)).toThrow('CONTENT_TEMPLATE_RULE_CLASS')
})
