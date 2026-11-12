/**
 * @module app:views/features/application/application-function-management/ui/application-function-page-contract
 * 职责：项目蓝图页面的纯领域合同：AI 草案严格协议与提示词、节点类型映射、需求原型版本命名、当前行编辑字段判定。
 * 边界：不发请求、不写 DataView；只读取 owner 的 DataView 编辑状态。AI 草案必须先经本模块严格校验，未通过不得写入。
 * AI用途：生成或修改蓝图 AI/原型流程时，以本模块的字段集合、取值范围和提示词为唯一协议来源。
 */
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'

/** 一条经严格校验的 AI 蓝图节点草案（树下一级节点或当前节点表单回填）。 */
export type BlueprintAiDraft = Readonly<{
  navigationTitle: string
  capabilityName: string
  description: string
  kind: string
  deliveryStatus: string
}>

/** AI 草案未通过协议校验时的统一提示前缀。 */
export const BLUEPRINT_AI_REJECTED = 'AI 蓝图未通过严格协议校验，未写入后端'
/** 表单回填预览的字段标签，顺序即预览顺序。 */
export const BLUEPRINT_AI_FORM_LABELS: ReadonlyArray<readonly [keyof BlueprintAiDraft, string]> = Object.freeze([
  ['navigationTitle', '导航标题'], ['capabilityName', '能力名称'], ['kind', '节点类型'], ['deliveryStatus', '交付状态'], ['description', '能力简述'],
])

const DRAFT_KEYS = 'capabilityName,deliveryStatus,description,kind,navigationTitle'
const CAPABILITY_NAME = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/
const KIND_TO_CON_TYPE: Readonly<Record<string, string>> = Object.freeze({
  module: 'Model', page: 'Navitem', embedded: 'embedded', service: 'service', content: 'content',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseObject(text: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(text.trim())
  } catch (cause) {
    throw new Error('AI 输出不是单个 JSON 对象', {cause})
  }
  if (!isRecord(value)) throw new Error('AI 输出必须是 JSON 对象')
  return value
}

function readText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${label}必须是字符串`)
  const text = value.trim()
  if (!text || text.length > max) throw new Error(`${label}长度必须为 1 到 ${max}`)
  return text
}

function readDraft(value: unknown, label: string): BlueprintAiDraft {
  if (!isRecord(value)) throw new Error(`${label}必须是 JSON 对象`)
  if (Object.keys(value).sort().join(',') !== DRAFT_KEYS) {
    throw new Error(`${label}字段必须精确为 navigationTitle、capabilityName、description、kind、deliveryStatus`)
  }
  const capabilityName = readText(value['capabilityName'], `${label}能力标识`, 128)
  if (!CAPABILITY_NAME.test(capabilityName)) throw new Error(`${label}能力标识无效`)
  const kind = readText(value['kind'], `${label}节点类型`, 16)
  if (!Object.hasOwn(KIND_TO_CON_TYPE, kind)) throw new Error(`${label}节点类型无效`)
  if (value['deliveryStatus'] !== 'plan') throw new Error(`${label}交付状态必须为 plan`)
  return {
    navigationTitle: readText(value['navigationTitle'], `${label}导航标题`, 120),
    capabilityName,
    description: readText(value['description'], `${label}能力简述`, 2000),
    kind,
    deliveryStatus: 'plan',
  }
}

/**
 * 严格解析“下一级节点”草案：输出必须是 {"rows":[...]}，1 到 50 项，能力标识不重复。
 * @throws 任一字段、取值或结构不符合协议。
 */
export function parseBlueprintAiRows(text: string): BlueprintAiDraft[] {
  const value = parseObject(text)
  if (Object.keys(value).join(',') !== 'rows') throw new Error('AI 输出只能包含 rows 字段')
  const rows = value['rows']
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50) throw new Error('AI 蓝图必须包含 1 到 50 个节点')
  const names = new Set<string>()
  return rows.map((item, index) => {
    const draft = readDraft(item, `第 ${index + 1} 个节点`)
    if (names.has(draft.capabilityName)) throw new Error(`AI 蓝图能力标识重复：${draft.capabilityName}`)
    names.add(draft.capabilityName)
    return draft
  })
}

/** 严格解析当前节点表单回填草案：输出必须是单个五字段对象。 */
export function parseBlueprintAiForm(text: string): BlueprintAiDraft {
  return readDraft(parseObject(text), '回填内容')
}

/** AI 节点类型 → Base_NavigationInfo.conType；未知类型返回空串。 */
export function blueprintAiKindToConType(kind: string): string {
  return KIND_TO_CON_TYPE[kind] ?? ''
}

/** Base_NavigationInfo.conType → AI 节点类型；未知取值返回空串。 */
export function blueprintConTypeToAiKind(conType: string): string {
  return Object.entries(KIND_TO_CON_TYPE).find(([, code]) => code === conType)?.[0] ?? ''
}

/** 草案映射为 owner 新增/回填可覆盖的内容字段。 */
export function blueprintAiDraftFields(draft: BlueprintAiDraft): Readonly<Record<string, string>> {
  return {FunName: draft.navigationTitle, name: draft.capabilityName, memo: draft.description,
    status: draft.deliveryStatus, conType: blueprintAiKindToConType(draft.kind)}
}

const OUTPUT_RULES = [
  '只输出一个 JSON 对象，不得输出 Markdown 代码块、解释文字或其他内容。',
  '节点字段必须精确为 navigationTitle、capabilityName、description、kind、deliveryStatus。',
  'kind 只能是 module、page、embedded、service、content 之一；capabilityName 必须是以字母开头的稳定 ASCII 标识符；deliveryStatus 固定为 plan。',
]

/** 下一级节点策划提示词：只策划写入位置的直接下一级。 */
export function buildBlueprintTreeAiPrompt(input: Readonly<{applicationLabel: string; parentLabel: string; requirement: string}>): string {
  const requirement = input.requirement.trim()
  if (!requirement) throw new Error('APPWorks 需求内容不能为空')
  return [
    '你是 APPWorks 分级蓝图策划器。本次只策划当前位置的直接下一级节点，不跨级生成整棵树。',
    `当前应用：${input.applicationLabel.trim() || '未命名应用'}`,
    `写入位置：${input.parentLabel.trim() || '应用根节点'}`,
    '输出格式：{"rows":[节点, ...]}，包含 1 到 50 个节点。',
    ...OUTPUT_RULES,
    'module 的 description 必须说明模块边界；page/embedded 的 description 必须包含页面目标、主要数据、关键动作和验收概要。',
    '如果返回 module，它的子级必须在后续选中该模块后再单独策划。',
    '用户需求：',
    requirement,
  ].join('\n')
}

/** 当前节点基本信息回填提示词；current 为当前表单（含未保存编辑）值。 */
export function buildBlueprintFormAiPrompt(input: Readonly<{applicationLabel: string; nodeLabel: string; current: BlueprintAiDraft}>): string {
  return [
    '你正在为项目蓝图节点的基本信息表单生成回填数据。',
    `当前应用系统：${input.applicationLabel.trim() || '未知应用'}`,
    `当前节点：${input.nodeLabel.trim() || '未知节点'}`,
    '输出格式：单个节点对象。',
    ...OUTPUT_RULES,
    '当前表单值如下：',
    JSON.stringify(input.current, null, 2),
  ].join('\n')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 需求原型版本名：`用户[yyyy-MM-dd HH:mm:ss] 描述`；无用户名时省略前缀用户。 */
export function buildPrototypeVersionName(input: Readonly<{userName: string; description: string; now: Date}>): string {
  const {now} = input
  const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `${input.userName.trim()}[${time}] ${input.description.trim()}`
}

/** 当前行仅编辑覆盖（未暂存、无待核验命令）中的字段；存在其他待处理状态时返回 undefined。 */
export function blueprintEditingFields(owner: BlueprintWorkspaceDataView): readonly string[] | undefined {
  const row = owner.view.currentRow
  if (!row) return owner.dirty ? undefined : []
  const key = owner.view.getPkKey(row)
  if (key === undefined || owner.hasPendingBlueprintCommand || owner.view.dirtyTracking.hasPendingChanges(key)) return undefined
  const fields = Object.keys(owner.view.getEditingPatch(key) ?? {})
  const othersDirty = owner.view.rows.some(candidate => {
    const id = owner.view.getPkKey(candidate)
    return candidate !== row && id !== undefined && (owner.view.hasEditingChanges(id) || owner.view.dirtyTracking.hasPendingChanges(id))
  })
  return othersDirty ? undefined : fields
}

/** 当前行含编辑覆盖的字段文本；无当前行或字段不可读时返回空串。 */
export function readBlueprintCurrentText(owner: BlueprintWorkspaceDataView, field: string): string {
  const row = owner.view.currentRow
  if (!row || owner.view.fieldAccess(row, field).read !== 'visible') return ''
  const key = owner.view.getPkKey(row)
  const value = (key === undefined ? row : owner.view.getEditingRow(key) ?? row)[field]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
