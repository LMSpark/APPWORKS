/**
 * @module @spark-appworks/spark-component:page/actions/button-templates
 * 职责：提供 button templates 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * r-button 模板预设系统
 *
 * 三层解析优先级（从低到高）：
 * 1. action 自动推导的默认模板
 * 2. template 预设
 * 3. 用户显式 props（最高优先级）
 *
 * 容器可额外注入 buttonSize/text 等默认值（行操作自动 small+text）。
 */

import type { BuiltinActionName } from './index.js'

// ── 模板属性类型 ──────────────────────────────────────────────────────────

/** Button Template Props 的属性契约。 */
export type ButtonTemplateProps = {
    /** button Type 字段。 */
buttonType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    /** plain 字段。 */
plain?: boolean
    /** 展示文本。 */
text?: boolean
    /** link 字段。 */
link?: boolean
    /** round 字段。 */
round?: boolean
    /** circle 字段。 */
circle?: boolean
    /** button Size 大小。 */
buttonSize?: 'large' | 'default' | 'small'
    /** icon 字段。 */
icon?: string}

// ── 通用模板 ──────────────────────────────────────────────────────────────

/**
 * 内置样式模板注册表。
 * 键为模板名（template prop 的合法值），值为对应 el-button 属性集合。
 * 分组：语义类（主/成功/警告/危险/信息）、变体类（plain 边框）、
 *       文字/链接类、图标类（circle + icon）、Toolbar 专用（默认 size）。
 */
const BUTTON_TEMPLATES: Record<string, ButtonTemplateProps> = {
  // 语义类
  'primary':       { buttonType: 'primary' },
  'success':       { buttonType: 'success' },
  'warning':       { buttonType: 'warning' },
  'danger':        { buttonType: 'danger' },
  'info':          { buttonType: 'info' },

  // 变体类
  'primary-plain': { buttonType: 'primary', plain: true },
  'success-plain': { buttonType: 'success', plain: true },
  'warning-plain': { buttonType: 'warning', plain: true },
  'danger-plain':  { buttonType: 'danger', plain: true },
  'info-plain':    { buttonType: 'info', plain: true },

  // 文字/链接类
  'text':          { text: true },
  'link':          { link: true },

  // 图标类
  'icon-add':      { buttonType: 'primary', circle: true, icon: 'Plus' },
  'icon-delete':   { buttonType: 'danger', circle: true, icon: 'Delete' },
  'icon-refresh':  { circle: true, icon: 'Refresh' },
  'icon-edit':     { buttonType: 'primary', circle: true, icon: 'Edit' },

  // Toolbar 专用
  'toolbar-primary': { buttonType: 'primary', buttonSize: 'default' },
  'toolbar-success': { buttonType: 'success', buttonSize: 'default' },
  'toolbar-warning': { buttonType: 'warning', buttonSize: 'default' },
  'toolbar-danger':  { buttonType: 'danger', plain: true, buttonSize: 'default' },
  'toolbar-info':    { buttonType: 'info', plain: true, buttonSize: 'default' },
}

// ── action → template 自动映射 ────────────────────────────────────────────

type ActionDefaults = {
  template: string
  label: string
  icon?: string}

/**
 * BuiltinActionName → 默认样式和文案映射表。
 * 每个内置动作有对应的 template（决定按钮颜色变体）和 label（默认文案）。
 * 新增 BuiltinActionName 时必须在此处补充对应条目，否则 getActionDefaultLabel 会报错。
 */
const ACTION_TEMPLATE_MAP: Record<BuiltinActionName, ActionDefaults> = {
  'append-row':          { template: 'primary', label: '新增', icon: 'Plus' },
  'prompt-append':       { template: 'primary', label: '新增', icon: 'Plus' },
  'prompt-edit':         { template: 'success', label: '编辑', icon: 'Edit' },
  'submit-current-form': { template: 'success', label: '保存当前' },
  'save-dataset':        { template: 'success', label: '保存全部' },
  'discard-changes':     { template: 'warning', label: '取消修改' },
  'host-command':        { template: 'success', label: '执行' },
  'refresh':             { template: 'primary', label: '刷新', icon: 'Refresh' },
  'clear-rows':          { template: 'danger', label: '清空', icon: 'Delete' },
  'delete-row':          { template: 'danger', label: '删除', icon: 'Delete' },
  'delete-current':      { template: 'danger', label: '删除当前行', icon: 'Delete' },
  'delete-selected':     { template: 'danger', label: '删除选择', icon: 'Delete' },
  'patch-row':           { template: 'success', label: '更新' },
  'patch-current':       { template: 'success', label: '更新当前' },
  'patch-selected':      { template: 'success', label: '批量更新' },
  'move-row':            { template: 'warning', label: '移动' },
  'move-current':        { template: 'warning', label: '移动当前' },
  'message-row':         { template: 'info', label: '查看' },
  'message-current':     { template: 'info', label: '查看当前' },
}

// ── 解析入口 ──────────────────────────────────────────────────────────────

/** Resolved Button Style 的语义模型。 */
export type ResolvedButtonStyle = {
    /** button Type 字段。 */
buttonType: string
    /** button Size 大小。 */
buttonSize: string
    /** plain 字段。 */
plain: boolean
    /** 展示文本。 */
text: boolean
    /** link 字段。 */
link: boolean
    /** round 字段。 */
round: boolean
    /** circle 字段。 */
circle: boolean
    /** icon 字段。 */
icon: string | undefined
    /** 展示标签。 */
label: string | undefined}

/**
 * 解析 r-button 最终样式：action 推导 → template 覆盖 → 显式 props 覆盖。
 *
 * @param action - CRUD 动作名（可选）
 * @param template - 模板名（可选）
 * @param explicitProps - 用户在 rule.json 中显式写的 props
 */
export function resolveButtonStyle(
  action: BuiltinActionName | undefined,
  template: string | undefined,
  explicitProps: {
    buttonType?: string
    buttonSize?: string
    plain?: boolean
    text?: boolean
    link?: boolean
    round?: boolean
    circle?: boolean
    icon?: string
    label?: string
  },
): ResolvedButtonStyle {
  // Layer 0: 默认值
  const result: ResolvedButtonStyle = {
    buttonType: 'default',
    buttonSize: 'default',
    plain: false,
    text: false,
    link: false,
    round: false,
    circle: false,
    icon: undefined,
    label: undefined,
  }

  // Layer 1: action 自动推导
  const actionDefaults = action !== undefined ? ACTION_TEMPLATE_MAP[action] : undefined
  if (actionDefaults !== undefined) {
    result.label = actionDefaults.label
    if (actionDefaults.icon !== undefined) result.icon = actionDefaults.icon
    // action 的默认 template
    const actionTemplate = BUTTON_TEMPLATES[actionDefaults.template]
    if (actionTemplate !== undefined) {
      applyTemplate(result, actionTemplate)
    }
  }

  // Layer 2: 显式 template 覆盖（优先于 action 自动推导的模板）
  if (template !== undefined) {
    const templateProps = BUTTON_TEMPLATES[template]
    if (templateProps !== undefined) {
      applyTemplate(result, templateProps)
    }
  }

  // Layer 3: 用户显式 props（最高优先级）
  if (explicitProps.buttonType !== undefined) result.buttonType = explicitProps.buttonType
  if (explicitProps.buttonSize !== undefined) result.buttonSize = explicitProps.buttonSize
  if (explicitProps.plain !== undefined) result.plain = explicitProps.plain
  if (explicitProps.text !== undefined) result.text = explicitProps.text
  if (explicitProps.link !== undefined) result.link = explicitProps.link
  if (explicitProps.round !== undefined) result.round = explicitProps.round
  if (explicitProps.circle !== undefined) result.circle = explicitProps.circle
  if (explicitProps.icon !== undefined) result.icon = explicitProps.icon
  if (explicitProps.label !== undefined) result.label = explicitProps.label

  return result
}

/**
 * 将模板字段合并到 target（只写入模板中非 undefined 的字段，不清空已有值）。
 * 分离为独立函数避免 Layer 1/Layer 2 各自重复一套 if 判断。
 */
function applyTemplate(target: ResolvedButtonStyle, template: ButtonTemplateProps): void {
  if (template.buttonType !== undefined) target.buttonType = template.buttonType
  if (template.buttonSize !== undefined) target.buttonSize = template.buttonSize
  if (template.plain !== undefined) target.plain = template.plain
  if (template.text !== undefined) target.text = template.text
  if (template.link !== undefined) target.link = template.link
  if (template.round !== undefined) target.round = template.round
  if (template.circle !== undefined) target.circle = template.circle
  if (template.icon !== undefined) target.icon = template.icon
}

/**
 * 获取 action 的默认 label（容器 disabled 计算时也需要读取）。
 */
export function getActionDefaultLabel(action: BuiltinActionName): string {
  return ACTION_TEMPLATE_MAP[action].label
}

/**
 * 判断是否为已知 action 名。
 */
export function isKnownAction(action: string): action is BuiltinActionName {
  return action in ACTION_TEMPLATE_MAP
}

