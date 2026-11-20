/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayIcon/display-icon-name
 * 职责：把配置或导航记录中的图标名解析为 Element Plus 图标名，承接历史导航数据中的旧图标类名。
 * 边界：只做名称解析，不渲染、不注册图标。
 */
import * as ElIcons from '@element-plus/icons-vue'

const LEGACY_ICON_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'DataBase': 'Coin',
  'FolderOpen': 'FolderOpened',
  'e-data-validation': 'DataBoard',
  'e-date-occurring': 'Calendar',
  'e-folder-open': 'FolderOpened',
  'e-hyperlink-copy': 'Link',
  'e-layers': 'Coin',
  'e-paste-match-destination': 'RefreshLeft',
  'e-pentagon': 'DataBoard',
  'layui-icon-app': 'Grid',
  'layui-icon-component': 'Cpu',
  'layui-icon-fonts-code': 'Tickets',
  'layui-icon-group': 'UserFilled',
  'layui-icon-ie': 'Coin',
  'layui-icon-note': 'Collection',
  'layui-icon-senior': 'Lock',
  'layui-icon-table': 'Grid',
  'layui-icon-tabs': 'Operation',
  'layui-icon-templeate-1': 'Files',
  'layui-icon-template': 'Files',
  'layui-icon-template-1': 'Files',
  'layui-icon-transfer': 'Switch',
  'layui-icon-vercode': 'Lock',
  'layui-icon-windows': 'Monitor',
})

/** 解析结果：icon 为可渲染的图标名；text 为无对应图标时直接显示的文本（如 emoji）。 */
export type DisplayIconName = Readonly<{icon?: string; text?: string}>

/** 依次取直接图标名、旧类名别名、显式 fallback；旧类名无对应时退到 Document，其余非标识符名称按文本显示。 */
export function resolveDisplayIconName(name: string | undefined, fallback: string | undefined): DisplayIconName {
  const raw = name?.trim()
  if (!raw) return fallback?.trim() && hasIcon(fallback.trim()) ? {icon: fallback.trim()} : {}
  const tokens = raw.split(/\s+/).filter(token => token !== 'e-icons')
  const direct = tokens.find(hasIcon)
  if (direct) return {icon: direct}
  const alias = tokens.map(token => LEGACY_ICON_ALIASES[token]).find(Boolean)
  if (alias) return {icon: alias}
  const explicit = fallback?.trim()
  if (explicit && hasIcon(explicit)) return {icon: explicit}
  if (raw.includes(' ') || /^(?:e-|layui-icon)/.test(raw)) return {icon: 'Document'}
  return /^[A-Za-z][\w-]*$/.test(raw) ? {} : {text: raw}
}

function hasIcon(name: string): boolean {
  return Object.hasOwn(ElIcons, name)
}
