/**
 * @module app:services/project/blueprint-navigation/blueprint-navigation-rules
 * 职责：蓝图导航属性的正式规则：保存前基线比对字段、vue:/ 导航地址规范、打开方式与子项位置候选。
 * 边界：只判定和描述 wire 值，不改写已保存值；未识别的历史值作为显式候选保留，避免选择框静默丢值。
 * AI用途：导航配置页签、owner 基线守卫与子树核验共用此规则，不另写一份地址或候选判断。
 */

/** 保存前须与正式记录一致的导航属性（rowid 作为身份单独核对）。 */
export const BLUEPRINT_NAVIGATION_GUARD_FIELDS = Object.freeze([
  'FunName', 'FunOrderValue', 'NavigationImageWxz', 'NavigationUrl', 'MobileUrl', 'IsShowAtNav', 'IsShowChildItem',
  'BeginGroup', 'NavigationType', 'NavigationShowType', 'ChildItemLocation', 'HorizontalAlignment',
] as const)

/** 选择框候选；value 与正式字段 wire 类型一致。 */
export type BlueprintNavigationOption = Readonly<{value: string | number; label: string}>

const OPEN_MODE_LABELS = Object.freeze([['4', '子系统'], ['3', '当前窗口'], ['2', '新窗口'], ['1', '对话框'], ['0', '嵌入']] as const)
const PLACEMENT_LABELS = Object.freeze([
  ['Top', '顶部'], ['Left', '左侧'], ['Right', '右侧'], ['Parent', '继承父级'], ['Tabs', '页签'], ['Popup', '弹出窗口'],
] as const)

/**
 * 校验导航地址：空值表示模块节点未挂接；非空值必须是规范的 `vue:/...` 资源路径（可带查询串或锚点）。
 * @returns 空串表示通过，否则为中文原因。
 */
export function blueprintNavigationTargetError(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return '导航地址必须是文本'
  const target = value.trim()
  if (!target) return ''
  if (target !== value) return '导航地址不能包含首尾空白'
  if (!target.startsWith('vue:/')) return '导航地址必须是正式开发工具生成的 vue:/... 资源'
  const path = target.slice('vue:'.length).split(/[?#]/u, 1)[0] ?? ''
  if (path === '/') return '导航地址不能只有根路径'
  if (/[A-Z]/u.test(path)) return '导航地址路径必须为小写'
  if (path.includes('\\')) return '导航地址不能包含反斜杠'
  if (path.includes('//')) return '导航地址不能包含连续斜杠'
  if (path.endsWith('/')) return '导航地址不能以斜杠结尾'
  if (path.endsWith('.vue')) return '导航地址不能以 .vue 结尾'
  return ''
}

function withCurrent(options: BlueprintNavigationOption[], current: unknown): BlueprintNavigationOption[] {
  if (current === undefined || current === null || current === '') return options
  if (options.some(option => String(option.value) === String(current))) return options
  const value = typeof current === 'number' ? current : String(current)
  return [...options, {value, label: `未识别的已保存值：${String(current)}`}]
}

/** 打开方式（NavigationType）候选；numeric 表示正式列为数值类型。 */
export function blueprintOpenModeOptions(numeric: boolean, current: unknown): BlueprintNavigationOption[] {
  return withCurrent(OPEN_MODE_LABELS.map(([value, label]) => ({value: numeric ? Number(value) : value, label})), current)
}

/** 子项位置（ChildItemLocation）候选；大小写不同的历史值标注为对应位置，但保留原值。 */
export function blueprintChildPlacementOptions(current: unknown): BlueprintNavigationOption[] {
  const options: BlueprintNavigationOption[] = PLACEMENT_LABELS.map(([value, label]) => ({value, label}))
  if (typeof current === 'string' && current && !options.some(option => option.value === current)) {
    const alias = PLACEMENT_LABELS.find(([value]) => value.toLowerCase() === current.trim().toLowerCase())
    if (alias) return [...options, {value: current, label: `${alias[1]}（已保存为 ${current}）`}]
  }
  return withCurrent(options, current)
}
