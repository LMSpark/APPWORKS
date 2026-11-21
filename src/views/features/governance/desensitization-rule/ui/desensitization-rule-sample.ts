/** 脱敏样例只计算本次输入，不查询或保存规则。 */
export function buildRuleSample(input: Readonly<{regex: unknown; template: unknown; original: unknown; global: boolean}>): Readonly<{error?: string; sample?: string}> {
  if (typeof input.original !== 'string' || !input.original.trim()) return {error: '未输入示例原文！'}
  if (typeof input.regex !== 'string' || !input.regex) return {error: '输入正则不合法，请校验！'}
  if (typeof input.template !== 'string' || !input.template.trim()) return {error: '未输入脱敏规则模板！'}
  let pattern: RegExp
  try {pattern = new RegExp(input.regex, input.global ? 'g' : '')}
  catch {return {error: '输入正则不合法，请校验！'}}
  if (!pattern.test(input.original)) return {error: '输入原文不合法！请校验'}
  return {sample: input.original.replace(pattern, input.template)}
}
