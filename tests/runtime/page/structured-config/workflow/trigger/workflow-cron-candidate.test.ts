import {describe, expect, it} from 'vitest'
import {parseWorkflowCronCandidate} from '@/platform-adapters/resources/structured-config/workflow-definition/trigger/cron-candidate'

describe('工作流 Cron 候选', () => {
  it.each([
    ['0 0 9 * * ?', '0 0 9 * * ?'],
    ['  0\t*/5   * * * ?\n', '0 */5 * * * ?'],
    ['0 0 9 ? jan,jun mon-fri', '0 0 9 ? JAN,JUN MON-FRI'],
    ['0 0/15 8-18 1,15 1-12 ?', '0 0/15 8-18 1,15 1-12 ?'],
    ['0 0 8 ? * 1,7', '0 0 8 ? * 1,7'],
  ])('接受单条常用 Quartz 表达式 %s', (text, expected) => {
    expect(parseWorkflowCronCandidate(text)).toBe(expected)
  })

  it.each([
    '',
    '0 9 * * ?',
    '0 0 9 * * ? 2027',
    '0 0 9 * * ?\n0 0 10 * * ?',
    '"0 0 9 * * ?"',
    '`0 0 9 * * ?`',
    '每天 0 0 9 * * ?',
    '60 0 9 * * ?',
    '0 60 9 * * ?',
    '0 0 24 * * ?',
    '0 0 9 32 * ?',
    '0 0 9 * 0 ?',
    '0 0 9 ? * 0',
    '0 0 9 ? * 8',
    '0 0 9 ? * FRIDAY',
    '0 0 9 ? * FRI-MON',
    '0 0 9 ? * MON-FRI/2',
    '0 */0 9 * * ?',
    '0 */60 9 * * ?',
    '0 1,,3 9 * * ?',
    '0 *,30 9 * * ?',
    '0 0 9 * * *',
    '0 0 9 ? * ?',
    '0 0 9 L * ?',
    '0 0 9 ? * MON#2',
  ])('拒绝有歧义或超出支持语法的输入 %j', text => {
    expect(() => parseWorkflowCronCandidate(text)).toThrow(/Cron/)
  })
})
