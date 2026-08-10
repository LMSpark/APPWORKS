/**
 * @module @spark-appworks/spark-json-document:tree/tree-types
 * 职责：提供 JSON Document/schema 处理中的 tree types 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-types.ts — 树模型类型定义
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonPath, JsonValue, JsonObject } from '../core'

// ── 节点类型枚举 ───────────────────────────────────────────────

/** Json Node Type 的语义模型。 */
export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

// ── 树节点（纯模型，6 字段）─────────────────────────────────

/** Tree Node 的语义模型。 */
export type JsonTreeNode = {
  /** 节点 UUID */
  readonly id: string
  /** 父节点 ID；根节点为 null */
  readonly parentId: string | null
  /** 在父容器中的键 (string) 或索引 (number) */
  readonly segment: string | number
  /** 节点类型 */
  readonly type: JsonNodeType
  /** 叶子节点的原始值 */
  readonly value: string | number | boolean | null
  /** 同级排序权重（parentId 相同的节点按此排序） */
  readonly order: number
}

// ── 显示行（toDisplayRows 输出）──────────────────────────────

/** Tree Display Node 的语义模型。 */
export type TreeDisplayNode = JsonTreeNode & {
  /** 嵌套深度（根 = 0） */
  readonly depth: number
  /** 从根到此节点的路径 */
  readonly path: JsonPath
  /** 直接子节点数量 */
  readonly childCount: number
  /** 键是否可重命名 */
  readonly keyEditable: boolean
  /** 类型是否可切换 */
  readonly typeEditable: boolean
  /** 是否可删除 */
  readonly deletable: boolean
}

// ── 树模型 ────────────────────────────────────────────────────

/** Tree Model 的语义模型。 */
export type TreeModel = ReadonlyMap<string, JsonTreeNode>

// ── Mutation 结果 ─────────────────────────────────────────────

/** Mutation Result 的返回结果。 */
export type MutationResult = {
  /** 变更后的新树模型 */
  readonly model: TreeModel
  /** 操作后应聚焦的节点 ID */
  readonly focusId: string
  /** 操作后应展开的节点 ID（null 表示无需展开） */
  readonly expandId: string | null
}

// ── 变更输入类型 ──────────────────────────────────────────────

/** Rename Node Key Input 的输入数据。 */
export type RenameNodeKeyInput = Readonly<{
  /** 待操作的目标树模型；函数返回新的不可变模型，不修改原实例。 */
  model: TreeModel
  /** 目标节点的 UUID。 */
  uid: string
  /** 重命名后的新键名。 */
  nextKeyInput: string
  /** 变更策略约束；可覆盖 canEditKey、isProtected 等默认行为。 */
  policy?: Partial<JsonTreePolicy>
}>

/** Update Node Type Input 的输入数据。 */
export type UpdateNodeTypeInput = Readonly<{
  /** 待操作的目标树模型；函数返回新的不可变模型，不修改原实例。 */
  model: TreeModel
  /** 目标节点的 UUID。 */
  uid: string
  /** 要切换到的目标类型；类型转换会按规则重置 value。 */
  nextType: JsonNodeType
  /** 变更策略约束；可覆盖 canEditType、isProtected 等默认行为。 */
  policy?: Partial<JsonTreePolicy>
}>

// ── 策略接口 ─────────────────────────────────────────────────

/** Json Tree Policy 的语义模型。 */
export type JsonTreePolicy = {
  /** 根节点显示标签。默认 '$' */
  rootLabel?: string
  /** 该路径是否受保护（不可删除）。默认全部可删除 */
  isProtected?(path: JsonPath): boolean
  /** 该路径的键是否可重命名。默认：对象属性可改，数组索引不可改 */
  canEditKey?(path: JsonPath): boolean
  /** 该路径的类型是否可切换。默认：除根节点外均可 */
  canEditType?(path: JsonPath): boolean
  /** 为目标对象建议新子键名 */
  suggestChildKey?(target: JsonObject, parentPath: JsonPath): string
  /** 为数组添加子项时的默认值 */
  createDefaultArrayItem?(parentPath: JsonPath): JsonValue
  /** 为对象添加子项时的默认值 */
  createDefaultObjectValue?(parentPath: JsonPath, key: string): JsonValue
  /** 返回该路径的可选值列表（用于下拉选择，优先级低于 Schema enum） */
  getValueOptions?(path: JsonPath): string[] | undefined
  /** 返回该路径的带标签下拉选项。优先级最高：getValueLabels > Schema enum > getValueOptions */
  getValueLabels?(path: JsonPath): Array<{ label: string; value: string }> | undefined
  /** 值变更后需要自动填充到文档的补丁。返回的条目中已有的键不会被覆盖 */
  getAutoPopulate?(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined
}

/**
 * 自动填充条目：在 targetPath 指向的对象上合并 entries 键值对。
 * - 若 targetPath 处不是 object，跳过
 * - 若某 key 已存在且新旧值都是 object，递归一层合并（仅补缺）
 * - 若某 key 已存在且不都是 object，跳过（不覆盖）
 */
export type AutoPopulateEntry = {
    /** target Path 路径。 */
targetPath: JsonPath
    /** entries 字段。 */
entries: Record<string, JsonValue>
}

// ── 平铺文档类型 ──────────────────────────────────────────────

/** Flat Json Tree Document 的语义模型。 */
export type FlatJsonTreeDocument = {
    /** root Type 字段。 */
readonly rootType: 'object' | 'array'
    /** 行数据集合。 */
readonly rows: JsonTreeNode[]
}
