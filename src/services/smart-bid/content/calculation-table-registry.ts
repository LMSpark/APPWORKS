/**
 * @module app:services/smart-bid/content/calculation-table-registry
 * 职责：固定内置计算表生成器的键、版本和实现。
 * 边界：输入由正式来源提供；不执行远端脚本或自动替换不匹配的版本。
 */
import {ATTACHMENT_INDEX_GENERATOR,generateAttachmentIndex} from './attachment-index-generator'
import {expandCalculationTable} from './calculation-table-expansion'

const attachmentIndex=Object.freeze({...ATTACHMENT_INDEX_GENERATOR,generate:generateAttachmentIndex,
 assertCurrent(){/* 内置实现随本次应用版本固定。 */},
})

/** 注册键仅解析当前应用内固定定义，历史版本仍须由调用方明确复核。 */
export function readBuiltInCalculationGenerator(key:string){
 return key===attachmentIndex.key?attachmentIndex:undefined
}

/** 绑定注册实现与同版输入，走共用的正文 JSON 展开校验。 */
export function expandBuiltInCalculationTable(input:Omit<Parameters<typeof expandCalculationTable>[0],'generate'>&
 Readonly<{entries:unknown}>){
 const generator=readBuiltInCalculationGenerator(input.generatorKey)
 if(generator?.version!==input.generatorVersion)throw Error('CONTENT_CALCULATION_GENERATOR_VERSION')
 return expandCalculationTable({...input,generate:()=>generator.generate(input.entries)})
}
