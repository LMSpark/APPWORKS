/**
 * @module app:lowcode/resources/structured-config/workflow-definition/trigger/cron-candidate
 * 职责：将模型草稿解析为单条可预览的六段 Cron 候选，核对字段范围和日周互斥。
 * 边界：候选仅支持常用 Quartz 表达式；不解析历史字段、不负责服务时区或调度结果。
 * AI用途：在向用户展示模型生成的时间表达式前校验候选格式和语义范围。
 */
type CronField = Readonly<{
  label: string
  min: number
  max: number
  names?: readonly string[]
}>

const fields: readonly CronField[] = [
  {label: '秒', min: 0, max: 59},
  {label: '分', min: 0, max: 59},
  {label: '时', min: 0, max: 23},
  {label: '日', min: 1, max: 31},
  {label: '月', min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']},
  {label: '周', min: 1, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']},
]
const dayOfMonthIndex = 3
const dayOfWeekIndex = 5
const maxCandidateLength = 120
const partPattern = /^([0-9]{1,2}|[A-Z]{3}|\*)(?:-([0-9]{1,2}|[A-Z]{3}))?(?:\/([1-9][0-9]?))?$/
const numeric = /^\d/

function fieldValue(value: string, field: CronField): number | undefined {
  if (numeric.test(value)) {
    const number = Number(value)
    return number >= field.min && number <= field.max ? number : undefined
  }
  const index = field.names?.indexOf(value) ?? -1
  return index < 0 ? undefined : index + 1
}

function validPart(part: string, field: CronField): boolean {
  const match = partPattern.exec(part)
  if (!match?.[1]) return false
  const [, start, end, step] = match
  if (step !== undefined && (Number(step) > field.max || (start !== '*' && !numeric.test(start)))) return false
  if (start === '*') return end === undefined

  const first = fieldValue(start, field)
  if (first === undefined) return false
  if (end === undefined) return true
  if (numeric.test(start) !== numeric.test(end)) return false
  const last = fieldValue(end, field)
  return last !== undefined && last >= first
}

/**
 * 将 AI 草稿解析为可预览的单条六段 Quartz Cron 候选。
 * 支持数值、月份与星期缩写、列表、正序范围及数值步长。日与周必须恰有一项为 `?`。
 * 特殊日历符号、跨界范围及年份段超出候选范围，原手工编辑仍使用原字段。
 */
export function parseWorkflowCronCandidate(text: string): string {
  const candidate = text.trim()
  if (candidate.length > maxCandidateLength || !/^[0-9A-Za-z*?,/ \t-]+$/.test(candidate)) {
    throw Error('Cron 候选必须是单行表达式')
  }
  const segments = candidate.toUpperCase().split(/[ \t]+/)
  if (segments.length !== fields.length) throw Error('Cron 候选必须依次包含秒、分、时、日、月、周六段')
  if ((segments[dayOfMonthIndex] === '?') === (segments[dayOfWeekIndex] === '?')) {
    throw Error('Cron 候选的日与周必须恰有一项为 ?')
  }
  for (const [index, field] of fields.entries()) {
    const segment = segments[index] ?? ''
    if (segment === '?' && (index === dayOfMonthIndex || index === dayOfWeekIndex)) continue
    const parts = segment.split(',')
    if ((parts.length > 1 && segment.includes('*')) || !parts.every(part => validPart(part, field))) {
      throw Error(`Cron 候选的“${field.label}”范围或格式无效`)
    }
  }
  return segments.join(' ')
}
