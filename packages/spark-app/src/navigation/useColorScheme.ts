/**
 * @module @spark-appworks/spark-app:navigation/useColorScheme
 * 职责：提供应用壳层 useColorScheme 能力，围绕 PrimaryPreset、NavColorSet、NavPreset 等 5 个公开契约 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/useColorScheme。
 */
import { ref, computed, watch } from 'vue'
import { isRecord } from '@spark-appworks/spark-utils'
import { readProperty } from '@spark-appworks/spark-utils/internal'

// ── Color utilities ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = [r, g, b]
    .map(v =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return `#${hex}`
}

/** Mix two hex colors: weight=1 → all c1, weight=0 → all c2 */
function mixColor(c1: string, c2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  return rgbToHex(
    r1 * weight + r2 * (1 - weight),
    g1 * weight + g2 * (1 - weight),
    b1 * weight + b2 * (1 - weight),
  )
}

// ── Preset definitions ──

/** Primary Preset 的语义模型。 */
export type PrimaryPreset = {
    /** 显示或业务名称。 */
name: string
    /** color 字段。 */
color: string}

/** Nav Color Set 的语义模型。 */
export type NavColorSet = {
    /** header Bg 字段。 */
headerBg: string
    /** sidebar Bg 字段。 */
sidebarBg: string
    /** text Color 字段。 */
textColor: string}

/** Nav Preset 的语义模型。 */
export type NavPreset = {
    /** 显示或业务名称。 */
name: string
    /** color 字段。 */
color: string
    /** light 字段。 */
light: NavColorSet
    /** dark 字段。 */
dark: NavColorSet}

/** Style Color Set 的语义模型。 */
export type StyleColorSet = {
    /** bg 字段。 */
bg: string
    /** 当前页码。 */
page: string
    /** overlay 字段。 */
overlay: string
    /** soft 字段。 */
soft: string
    /** sunken 字段。 */
sunken: string
    /** hover 字段。 */
hover: string
    /** selected 字段。 */
selected: string
    /** text Primary 字段。 */
textPrimary: string
    /** text Regular 字段。 */
textRegular: string
    /** text Secondary 字段。 */
textSecondary: string
    /** text Placeholder 字段。 */
textPlaceholder: string
    /** border 字段。 */
border: string
    /** border Light 字段。 */
borderLight: string
    /** divider 字段。 */
divider: string
    /** chrome Border 字段。 */
chromeBorder: string
    /** control Bg 字段。 */
controlBg: string
    /** control Border 字段。 */
controlBorder: string
    /** control Border Hover 字段。 */
controlBorderHover: string
    /** shadow 字段。 */
shadow: string
    /** shadow Light 字段。 */
shadowLight: string
    /** shadow Panel 字段。 */
shadowPanel: string
    /** scrollbar Thumb 字段。 */
scrollbarThumb: string
    /** scrollbar Thumb Hover 字段。 */
scrollbarThumbHover: string}

/** Style Preset 的语义模型。 */
export type StylePreset = {
    /** 显示或业务名称。 */
name: string
    /** description 字段。 */
description: string
    /** icon 字段。 */
icon: string
    /** primary Color 字段。 */
primaryColor: string
    /** nav Index 字段。 */
navIndex: number
    /** light 字段。 */
light: StyleColorSet
    /** dark 字段。 */
dark: StyleColorSet}

export const PRIMARY_PRESETS: readonly PrimaryPreset[] = [
  { name: '默认蓝', color: '#409eff' },
  { name: '钴蓝', color: '#2f6feb' },
  { name: '极光紫', color: '#722ed1' },
  { name: '藤紫', color: '#8b5cf6' },
  { name: '翡翠绿', color: '#52c41a' },
  { name: '松石青', color: '#14b8a6' },
  { name: '中国红', color: '#f5222d' },
  { name: '玫瑰红', color: '#e11d48' },
  { name: '日落橙', color: '#fa8c16' },
  { name: '琥珀金', color: '#d97706' },
  { name: '青碧', color: '#13c2c2' },
  { name: '品红', color: '#eb2f96' },
  { name: '石墨', color: '#64748b' },
]

export const NAV_PRESETS: readonly NavPreset[] = [
  {
    name: '经典蓝',
    color: '#001529',
    light: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
    dark: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
  },
  {
    name: '雅致灰',
    color: '#304156',
    light: { headerBg: '#304156', sidebarBg: '#304156', textColor: '#ffffffd9' },
    dark: { headerBg: '#263445', sidebarBg: '#263445', textColor: '#e5eaf3d9' },
  },
  {
    name: '海洋蓝',
    color: '#003a75',
    light: { headerBg: '#003a75', sidebarBg: '#003a75', textColor: '#ffffffd9' },
    dark: { headerBg: '#002a55', sidebarBg: '#002a55', textColor: '#e5eaf3d9' },
  },
  {
    name: '幽紫',
    color: '#2f1e4e',
    light: { headerBg: '#2f1e4e', sidebarBg: '#2f1e4e', textColor: '#ffffffd9' },
    dark: { headerBg: '#231740', sidebarBg: '#231740', textColor: '#e5eaf3d9' },
  },
  {
    name: '纯白',
    color: '#ffffff',
    light: { headerBg: '#ffffff', sidebarBg: '#ffffff', textColor: '#303133' },
    dark: { headerBg: '#1d1d1d', sidebarBg: '#1d1d1d', textColor: '#e5eaf3d9' },
  },
  {
    name: '石墨黑',
    color: '#111827',
    light: { headerBg: '#111827', sidebarBg: '#0f172a', textColor: '#f8fafcd9' },
    dark: { headerBg: '#0b1120', sidebarBg: '#070b12', textColor: '#eef2ffd9' },
  },
  {
    name: '墨绿',
    color: '#064e3b',
    light: { headerBg: '#064e3b', sidebarBg: '#063f33', textColor: '#ecfdf5d9' },
    dark: { headerBg: '#042f2e', sidebarBg: '#031f1d', textColor: '#ccfbf1d9' },
  },
  {
    name: '酒红',
    color: '#7f1d1d',
    light: { headerBg: '#7f1d1d', sidebarBg: '#6f1d1b', textColor: '#fff7edd9' },
    dark: { headerBg: '#541212', sidebarBg: '#3f0d0d', textColor: '#fee2e2d9' },
  },
  {
    name: '青灰',
    color: '#134e4a',
    light: { headerBg: '#134e4a', sidebarBg: '#155e63', textColor: '#f0fdf4d9' },
    dark: { headerBg: '#083344', sidebarBg: '#0f2f3c', textColor: '#cffafed9' },
  },
  {
    name: '极简浅',
    color: '#f8fafc',
    light: { headerBg: '#f8fafc', sidebarBg: '#ffffff', textColor: '#1f2937' },
    dark: { headerBg: '#18181b', sidebarBg: '#18181b', textColor: '#f4f4f5d9' },
  },
]

const DEFAULT_LIGHT_STYLE: StyleColorSet = {
  bg: '#f5f5f5',
  page: '#ffffff',
  overlay: '#ffffff',
  soft: '#f8fafc',
  sunken: '#f2f3f5',
  hover: '#f5f7fa',
  selected: 'color-mix(in srgb, var(--el-color-primary, #409eff) 11%, #ffffff)',
  textPrimary: '#303133',
  textRegular: '#606266',
  textSecondary: '#909399',
  textPlaceholder: '#a8abb2',
  border: '#dcdfe6',
  borderLight: '#e4e7ed',
  divider: '#ebeef5',
  chromeBorder: 'rgba(0, 0, 0, 0.08)',
  controlBg: '#ffffff',
  controlBorder: '#dcdfe6',
  controlBorderHover: '#c0c4cc',
  shadow: '0 2px 12px 0 rgba(0, 0, 0, 0.1)',
  shadowLight: '0 2px 4px rgba(0, 0, 0, 0.04)',
  shadowPanel: '0 10px 28px rgba(15, 23, 42, 0.08)',
  scrollbarThumb: 'rgba(148, 163, 184, 0.45)',
  scrollbarThumbHover: 'rgba(100, 116, 139, 0.62)',
}

const DEFAULT_DARK_STYLE: StyleColorSet = {
  bg: '#111213',
  page: '#171819',
  overlay: '#202225',
  soft: '#1d1f21',
  sunken: '#101112',
  hover: '#242629',
  selected: 'color-mix(in srgb, var(--el-color-primary, #409eff) 20%, #1a1b1d)',
  textPrimary: '#edf2f7',
  textRegular: '#cbd3df',
  textSecondary: '#9ca6b4',
  textPlaceholder: '#707783',
  border: '#35383d',
  borderLight: '#2a2d31',
  divider: '#303338',
  chromeBorder: 'rgba(255, 255, 255, 0.08)',
  controlBg: '#121314',
  controlBorder: '#3a3d43',
  controlBorderHover: '#565b63',
  shadow: '0 2px 12px 0 rgba(0, 0, 0, 0.4)',
  shadowLight: '0 2px 4px rgba(0, 0, 0, 0.2)',
  shadowPanel: '0 12px 32px rgba(0, 0, 0, 0.35)',
  scrollbarThumb: 'rgba(120, 127, 138, 0.46)',
  scrollbarThumbHover: 'rgba(160, 168, 180, 0.68)',
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    name: '经典',
    description: '稳重通用',
    icon: 'Monitor',
    primaryColor: '#409eff',
    navIndex: 0,
    light: DEFAULT_LIGHT_STYLE,
    dark: DEFAULT_DARK_STYLE,
  },
  {
    name: '极简',
    description: '干净留白',
    icon: 'Grid',
    primaryColor: '#2f6feb',
    navIndex: 9,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#f6f7fb',
      soft: '#f9fafb',
      sunken: '#eef1f6',
      hover: '#eef4ff',
      textPrimary: '#1f2937',
      textRegular: '#4b5563',
      textSecondary: '#6b7280',
      border: '#d8dee8',
      borderLight: '#e7ebf2',
      divider: '#edf0f5',
      shadowPanel: '0 14px 34px rgba(31, 41, 55, 0.08)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#101113',
      page: '#18191b',
      overlay: '#222326',
      soft: '#1d1f22',
      hover: '#282b30',
      textPrimary: '#f4f6fb',
      border: '#343842',
      borderLight: '#2a2d35',
    },
  },
  {
    name: '雾蓝',
    description: '冷静科技',
    icon: 'Cloudy',
    primaryColor: '#2f6feb',
    navIndex: 2,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#f4f8ff',
      soft: '#eef5ff',
      sunken: '#e7effb',
      hover: '#eaf2ff',
      selected: 'color-mix(in srgb, var(--el-color-primary, #2f6feb) 13%, #ffffff)',
      textPrimary: '#172033',
      textRegular: '#42526b',
      textSecondary: '#6b7890',
      border: '#cfdaea',
      borderLight: '#dce6f4',
      divider: '#e6edf7',
      chromeBorder: 'rgba(47, 111, 235, 0.15)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#0f141b',
      page: '#151b24',
      overlay: '#1c2430',
      soft: '#172030',
      sunken: '#0b1119',
      hover: '#202a38',
      selected: 'color-mix(in srgb, var(--el-color-primary, #2f6feb) 26%, #121b29)',
      textPrimary: '#e9f1ff',
      textRegular: '#c6d4ea',
      textSecondary: '#91a3bd',
      border: '#304057',
      borderLight: '#263347',
      divider: '#28364b',
      chromeBorder: 'rgba(147, 197, 253, 0.14)',
    },
  },
  {
    name: '森青',
    description: '清爽耐看',
    icon: 'Opportunity',
    primaryColor: '#14b8a6',
    navIndex: 6,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#f3faf8',
      soft: '#ecfdf8',
      sunken: '#e3f5ef',
      hover: '#e8f8f4',
      selected: 'color-mix(in srgb, var(--el-color-primary, #14b8a6) 13%, #ffffff)',
      textPrimary: '#16312d',
      textRegular: '#3d5f59',
      textSecondary: '#66827d',
      border: '#cae5df',
      borderLight: '#d9eee9',
      divider: '#e5f4f0',
      chromeBorder: 'rgba(20, 184, 166, 0.16)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#091412',
      page: '#101d1a',
      overlay: '#172824',
      soft: '#13231f',
      sunken: '#07100e',
      hover: '#1c302b',
      selected: 'color-mix(in srgb, var(--el-color-primary, #14b8a6) 24%, #0f1d1a)',
      textPrimary: '#e4fbf5',
      textRegular: '#b8ddd5',
      textSecondary: '#86a9a1',
      border: '#28443e',
      borderLight: '#203832',
      divider: '#254039',
      chromeBorder: 'rgba(94, 234, 212, 0.13)',
    },
  },
  {
    name: '暮紫',
    description: '高对比聚焦',
    icon: 'MoonNight',
    primaryColor: '#8b5cf6',
    navIndex: 3,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#f8f5ff',
      soft: '#f2edff',
      sunken: '#ebe3fb',
      hover: '#f0e9ff',
      selected: 'color-mix(in srgb, var(--el-color-primary, #8b5cf6) 14%, #ffffff)',
      textPrimary: '#251b3d',
      textRegular: '#514268',
      textSecondary: '#7a6e8d',
      border: '#ddd1f3',
      borderLight: '#e8def7',
      divider: '#eee8fa',
      chromeBorder: 'rgba(139, 92, 246, 0.16)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#120f1d',
      page: '#1a1628',
      overlay: '#241e34',
      soft: '#201a30',
      sunken: '#0d0a16',
      hover: '#2b2440',
      selected: 'color-mix(in srgb, var(--el-color-primary, #8b5cf6) 28%, #171225)',
      textPrimary: '#f1ecff',
      textRegular: '#d5c9ef',
      textSecondary: '#a99bc5',
      border: '#40365c',
      borderLight: '#342b4d',
      divider: '#392f54',
      chromeBorder: 'rgba(196, 181, 253, 0.13)',
    },
  },
  {
    name: '石墨',
    description: '沉稳专业',
    icon: 'Files',
    primaryColor: '#64748b',
    navIndex: 5,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#f4f5f7',
      page: '#fbfcfd',
      overlay: '#ffffff',
      soft: '#eef1f4',
      sunken: '#e7eaee',
      hover: '#edf0f4',
      selected: 'color-mix(in srgb, var(--el-color-primary, #64748b) 13%, #ffffff)',
      textPrimary: '#1f2933',
      textRegular: '#4b5563',
      textSecondary: '#737f8f',
      border: '#d1d7df',
      borderLight: '#dfe4ea',
      divider: '#e7ebf0',
      chromeBorder: 'rgba(15, 23, 42, 0.13)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#0b0f14',
      page: '#121821',
      overlay: '#1a2230',
      soft: '#161d27',
      sunken: '#070a0f',
      hover: '#202a36',
      selected: 'color-mix(in srgb, var(--el-color-primary, #64748b) 30%, #111827)',
      textPrimary: '#f3f6fa',
      textRegular: '#c7d0dc',
      textSecondary: '#8e9aaa',
      border: '#303a49',
      borderLight: '#26303d',
      divider: '#2b3543',
      chromeBorder: 'rgba(226, 232, 240, 0.1)',
    },
  },
  {
    name: '暖琥',
    description: '轻暖运营',
    icon: 'Sunrise',
    primaryColor: '#d97706',
    navIndex: 7,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#fbf7f1',
      page: '#ffffff',
      soft: '#fff4e6',
      sunken: '#f5eadb',
      hover: '#fff0d8',
      selected: 'color-mix(in srgb, var(--el-color-primary, #d97706) 13%, #ffffff)',
      textPrimary: '#3b2a1a',
      textRegular: '#6a5236',
      textSecondary: '#927b5d',
      border: '#ead5b8',
      borderLight: '#f0dfc7',
      divider: '#f5e9d8',
      chromeBorder: 'rgba(217, 119, 6, 0.16)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#17110b',
      page: '#21170e',
      overlay: '#2b2015',
      soft: '#261b11',
      sunken: '#100b07',
      hover: '#322417',
      selected: 'color-mix(in srgb, var(--el-color-primary, #d97706) 26%, #1d140c)',
      textPrimary: '#fff3e2',
      textRegular: '#e6c9a1',
      textSecondary: '#b49670',
      border: '#4b3620',
      borderLight: '#3d2c1b',
      divider: '#45321f',
      chromeBorder: 'rgba(251, 191, 36, 0.13)',
    },
  },
  {
    name: '玫红',
    description: '醒目活力',
    icon: 'MagicStick',
    primaryColor: '#e11d48',
    navIndex: 8,
    light: {
      ...DEFAULT_LIGHT_STYLE,
      bg: '#fff5f7',
      soft: '#fff0f3',
      sunken: '#fbe4ea',
      hover: '#ffe8ef',
      selected: 'color-mix(in srgb, var(--el-color-primary, #e11d48) 12%, #ffffff)',
      textPrimary: '#3d1824',
      textRegular: '#6b3f4e',
      textSecondary: '#956c79',
      border: '#f0ccd6',
      borderLight: '#f5dae2',
      divider: '#f8e6eb',
      chromeBorder: 'rgba(225, 29, 72, 0.14)',
    },
    dark: {
      ...DEFAULT_DARK_STYLE,
      bg: '#180b11',
      page: '#23111a',
      overlay: '#301824',
      soft: '#2a1420',
      sunken: '#10070b',
      hover: '#3a1d2b',
      selected: 'color-mix(in srgb, var(--el-color-primary, #e11d48) 25%, #211019)',
      textPrimary: '#fff0f4',
      textRegular: '#f0c4d0',
      textSecondary: '#bd8d9b',
      border: '#542638',
      borderLight: '#431f2e',
      divider: '#4b2434',
      chromeBorder: 'rgba(251, 113, 133, 0.13)',
    },
  },
]

function getFallbackStylePreset(): StylePreset {
  const first = STYLE_PRESETS[0]
  if (first === undefined) {
    throw new Error('STYLE_PRESETS must contain at least one preset.')
  }
  return first
}

const FALLBACK_STYLE = getFallbackStylePreset()

// ── Singleton state ──

const STORAGE_KEY = 'spark-color-scheme'

type SchemeState = {
  primaryColor: string
  navIndex: number
  styleIndex: number}

function normalizeScopeKey(scopeKey: string | null | undefined): string | null {
  if (typeof scopeKey !== 'string') return null
  const trimmed = scopeKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getScopedStorageKey(scopeKey: string | null): string {
  return scopeKey === null ? STORAGE_KEY : `${STORAGE_KEY}:${scopeKey}`
}

function getDefaultState(): SchemeState {
  return { primaryColor: '#409eff', navIndex: 0, styleIndex: 0 }
}

function normalizeState(raw: unknown): SchemeState | null {
  if (!isRecord(raw)) return null
  const primaryColor = readProperty(raw, 'primaryColor')
  const navIndex = readProperty(raw, 'navIndex')
  const styleIndex = readProperty(raw, 'styleIndex')
  return {
    primaryColor: typeof primaryColor === 'string' ? primaryColor : '#409eff',
    navIndex: typeof navIndex === 'number' && Number.isFinite(navIndex) ? navIndex : 0,
    styleIndex: typeof styleIndex === 'number' && Number.isFinite(styleIndex) ? styleIndex : 0,
  }
}

function readStateFromStorage(storageKey: string): SchemeState | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      return normalizeState(JSON.parse(raw))
    }
  } catch {
    // ignore
  }
  return null
}

function writeStateToStorage(storageKey: string, state: SchemeState): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

let _storageScope: string | null = null

function loadState(): SchemeState {
  const scopedKey = getScopedStorageKey(_storageScope)
  const scopedState = readStateFromStorage(scopedKey)
  if (scopedState !== null) return scopedState
  return getDefaultState()
}

function persistState(): void {
  writeStateToStorage(getScopedStorageKey(_storageScope), _state.value)
}

const FALLBACK_NAV: NavPreset = {
  name: '经典蓝',
  color: '#001529',
  light: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
  dark: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
}

const _state = ref<SchemeState>(loadState())
let _initialized = false

// ── Apply helpers ──

function applyPrimaryColor(color: string, isDark: boolean) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const mixBase = isDark ? '#141414' : '#ffffff'

  el.style.setProperty('--el-color-primary', color)
  for (const level of [3, 5, 7, 8, 9]) {
    el.style.setProperty(
      `--el-color-primary-light-${level}`,
      mixColor(color, mixBase, 1 - level / 10),
    )
  }
  el.style.setProperty('--el-color-primary-dark-2', mixColor(color, '#000000', 0.8))
}

function applyStylePreset(preset: StylePreset, isDark: boolean) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const colors = isDark ? preset.dark : preset.light

  el.style.setProperty('--spark-bg', colors.bg)
  el.style.setProperty('--spark-bg-page', colors.page)
  el.style.setProperty('--spark-bg-overlay', colors.overlay)
  el.style.setProperty('--spark-bg-soft', colors.soft)
  el.style.setProperty('--spark-bg-sunken', colors.sunken)
  el.style.setProperty('--spark-bg-hover', colors.hover)
  el.style.setProperty('--spark-bg-selected', colors.selected)
  el.style.setProperty('--spark-text-primary', colors.textPrimary)
  el.style.setProperty('--spark-text-regular', colors.textRegular)
  el.style.setProperty('--spark-text-secondary', colors.textSecondary)
  el.style.setProperty('--spark-text-placeholder', colors.textPlaceholder)
  el.style.setProperty('--spark-border-color', colors.border)
  el.style.setProperty('--spark-border-light', colors.borderLight)
  el.style.setProperty('--spark-divider-color', colors.divider)
  el.style.setProperty('--spark-chrome-border', colors.chromeBorder)
  el.style.setProperty('--spark-control-bg', colors.controlBg)
  el.style.setProperty('--spark-control-border', colors.controlBorder)
  el.style.setProperty('--spark-control-border-hover', colors.controlBorderHover)
  el.style.setProperty('--spark-shadow', colors.shadow)
  el.style.setProperty('--spark-shadow-light', colors.shadowLight)
  el.style.setProperty('--spark-shadow-panel', colors.shadowPanel)
  el.style.setProperty('--spark-scrollbar-thumb', colors.scrollbarThumb)
  el.style.setProperty('--spark-scrollbar-thumb-hover', colors.scrollbarThumbHover)
}

function applyNavColors(preset: NavPreset, isDark: boolean) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const colors = isDark ? preset.dark : preset.light
  el.style.setProperty('--spark-header-bg', colors.headerBg)
  el.style.setProperty('--spark-header-text', colors.textColor)
  el.style.setProperty('--spark-sidebar-bg', colors.sidebarBg)
  el.style.setProperty('--spark-sidebar-text', colors.textColor)
}

function getIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function applyAll() {
  if (typeof document === 'undefined') return
  const isDark = getIsDark()
  applyStylePreset(STYLE_PRESETS[_state.value.styleIndex] ?? FALLBACK_STYLE, isDark)
  applyPrimaryColor(_state.value.primaryColor, isDark)
  applyNavColors(NAV_PRESETS[_state.value.navIndex] ?? FALLBACK_NAV, isDark)
}

export function setColorSchemeStorageScope(scopeKey: string | null): void {
  const nextScope = normalizeScopeKey(scopeKey)
  if (nextScope === _storageScope) return
  _storageScope = nextScope
  _state.value = loadState()
  persistState()
  applyAll()
}

// ── Composable ──

export function useColorScheme() {
  if (!_initialized) {
    _initialized = true
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return createColorSchemeApi()
    }
    const isDark = ref(getIsDark())
    const observer = new MutationObserver(() => {
      isDark.value = getIsDark()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    watch(isDark, () => applyAll())
    applyAll()
  }

  return createColorSchemeApi()
}

function createColorSchemeApi() {
  function setPrimaryColor(color: string) {
    _state.value = { ..._state.value, primaryColor: color }
    persistState()
    applyPrimaryColor(color, getIsDark())
  }

  function setNavPreset(index: number) {
    _state.value = { ..._state.value, navIndex: index }
    persistState()
    applyNavColors(NAV_PRESETS[index] ?? FALLBACK_NAV, getIsDark())
  }

  function setStylePreset(index: number) {
    const preset = STYLE_PRESETS[index] ?? FALLBACK_STYLE
    _state.value = {
      ..._state.value,
      styleIndex: STYLE_PRESETS[index] === undefined ? 0 : index,
      primaryColor: preset.primaryColor,
      navIndex: preset.navIndex,
    }
    persistState()
    applyAll()
  }

  return {
    stylePresetIndex: computed(() => _state.value.styleIndex),
    currentStylePreset: computed((): StylePreset => STYLE_PRESETS[_state.value.styleIndex] ?? FALLBACK_STYLE),
    primaryColor: computed(() => _state.value.primaryColor),
    navPresetIndex: computed(() => _state.value.navIndex),
    currentNavPreset: computed((): NavPreset => NAV_PRESETS[_state.value.navIndex] ?? FALLBACK_NAV),
    setStylePreset,
    setPrimaryColor,
    setNavPreset,
  }
}
