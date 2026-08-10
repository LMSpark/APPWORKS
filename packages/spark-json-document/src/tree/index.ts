/**
 * @module @spark-appworks/spark-json-document:tree/index
 * 职责：提供 JSON Document/schema 处理中的 index 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * tree/index.ts — 树编辑引擎公共入口
 */

// ── 类型 ──
export type {
  AutoPopulateEntry,
  FlatJsonTreeDocument,
  JsonNodeType,
  JsonTreePolicy,
  MutationResult,
  RenameNodeKeyInput,
  TreeDisplayNode,
  TreeModel,
  JsonTreeNode,
  UpdateNodeTypeInput,
} from './tree-types'

// ── 值：构建 / 导出 / 显示 ──
export {
  buildJsonTreeRows,
  buildTreeModel,
  exportJsonDocument,
  filterJsonTreeNodes,
  getNodePath,
  toDisplayRows,
} from './tree-build'

// ── 值：变更操作 ──
export {
  addChildNode,
  addSiblingNode,
  applyAutoPopulatePatches,
  deleteNode,
  renameNodeKey,
  updateNodeType,
  updateNodeValue,
} from './tree-mutation'

// ── 值：平铺往返 ──
export {
  flattenJsonDocumentForEdit,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
} from './tree-flatten'

// ── 值：公共工具 ──
export {
  ensureUniqueObjectKey,
  formatValuePreview,
  rootOf,
} from './tree-utils'
