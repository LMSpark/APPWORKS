/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/rule-config
 * 职责：PDF核验规则保存前的版本、身份及分支结构检查。
 * 边界：不执行正则、数据库条件或核验引擎；正式执行仍由服务验证完整规则。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'

/** 原TEXT字段只解析不改写；不将任务协议2.0误用为规则配置版本。 */
export function validatePdfRuleConfig(text: unknown): void {
  if(typeof text!=='string')throw Error('规则配置必须是JSON文本')
  const config=parseJsonDocument(text)
  if(!isRecord(config)||config['version']!=='1.0'||!Array.isArray(config['rules'])||config['rules'].length<1||config['rules'].length>30)throw Error('规则须为version=1.0且包含1～30项rules')
  const ids=new Set<string>()
  for(const rule of config['rules']){
    if(!isRecord(rule)||typeof rule['id']!=='string'||! /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(rule['id'])||ids.has(rule['id']))throw Error('规则ID须为唯一普通标识符')
    const type=rule['type']
    if(type==='TEXT_COMPARE'){
      if(!isRecord(rule['source'])||!isRecord(rule['target'])||!isRecord(rule['compare'])||rule['compare']['operator']!=='EQUAL')throw Error('文字比较须配置source、target及EQUAL比较')
    }else if(type==='SEAL_PRESENT'){
      if(!isRecord(rule['locator'])||!isRecord(rule['expect'])||rule['expect']['sealType']!=='ORG_SEAL'||rule['expect']['minCount']!==1)throw Error('印章规则须配置区域与ORG_SEAL、minCount=1')
    }else if(type==='DB_EXISTS'){
      if(!isRecord(rule['source'])||!isRecord(rule['database']))throw Error('数据库核验须配置source与database')
    }else throw Error('不支持的PDF核验规则类型')
    const source=rule['source']
    if(isRecord(source)&&source['ruleId']!==undefined&&!ids.has(String(source['ruleId'])))throw Error('source.ruleId须引用前面的规则')
    ids.add(rule['id'])
  }
}
