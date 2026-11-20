import {expect,it} from 'vitest'
import {validatePdfRuleConfig} from '@/lowcode/resources/semi-structured/pdf-inspect/rule-config'
const valid={version:'1.0',rules:[{id:'title',type:'TEXT_COMPARE',source:{locator:{type:'KEYWORD',keywords:['名称'],relativePosition:'RIGHT'}},target:{type:'CONSTANT',value:'样例'},compare:{operator:'EQUAL'}}]}
it('accepts the service rule envelope without changing the source text',()=>{expect(()=>validatePdfRuleConfig(JSON.stringify(valid))).not.toThrow()})
it.each(['[]','{}','{"version":"2.0","rules":[]}',JSON.stringify({...valid,rules:[valid.rules[0],valid.rules[0]]})])('rejects an invalid envelope %s',text=>{expect(()=>validatePdfRuleConfig(text)).toThrow()})
